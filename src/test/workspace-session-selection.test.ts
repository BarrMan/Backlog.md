import { expect, it } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { upsertAgentConfiguration } from "../agent-workspace/config.ts";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";
import { killTmuxServer, uniqueTmuxSocket } from "./tmux-test-server.ts";

const tmuxPath = Bun.which("tmux");
const expectPath = Bun.which("expect");
const interactive = process.env.RUN_INTERACTIVE_TUI_TESTS === "1" && tmuxPath && expectPath ? it : it.skip;

interactive(
	"Space → s opens stopped session output after handoff in the native Workspace",
	async () => {
		const root = createUniqueTestDir("workspace-session-selection");
		const bin = join(root, "bin");
		const socket = uniqueTmuxSocket("session-picker");
		const env = {
			...process.env,
			PATH: `${bin}:${process.env.PATH}`,
			TMUX: "",
			TERM: "xterm-256color",
			BACKLOG_CWD: root,
		};
		let client: ReturnType<typeof Bun.spawn> | undefined;
		const command = async (args: string[]) => {
			const child = Bun.spawn(args, { cwd: root, env, stdout: "pipe", stderr: "pipe" });
			const [output, error, code] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			if (code !== 0) throw new Error(`${args.slice(0, 3).join(" ")}: ${error}`);
			return output.trim();
		};
		const tmux = (...args: string[]) => command([join(bin, "tmux"), ...args]);
		const cli = (...args: string[]) => command([...getTestCliCommand(), ...args]);
		const waitFor = async (label: string, check: () => Promise<boolean>) => {
			const deadline = Date.now() + 10_000;
			while (Date.now() < deadline) {
				if (await check()) return;
				await new Promise<void>((resolve) => setImmediate(resolve));
			}
			throw new Error(`Timed out waiting for ${label}`);
		};
		try {
			await mkdir(bin, { recursive: true });
			await writeFile(join(bin, "tmux"), `#!/bin/sh\nexec ${tmuxPath} -f /dev/null -L ${socket} "$@"\n`);
			await chmod(join(bin, "tmux"), 0o755);
			await command(["git", "init", "-b", "main"]);
			const core = new Core(root);
			await initializeTestProject(core, "Session picker");
			const { task } = await core.createTaskFromInput(
				{ title: "Session selection task", description: "Next: verify continuity." },
				false,
			);
			const agent = join(bin, "agent");
			await writeFile(agent, '#!/bin/sh\nprintf "Saved output from %s\\n" "$BACKLOG_SESSION_ID"\nexec sleep 300\n');
			await chmod(agent, 0o755);
			await upsertAgentConfiguration(core, "project", {
				selectedPreset: "test",
				presets: { test: { command: `${agent} {prompt}`, env: {}, prepare: "", worktree: false, bootstrap: "prompt" } },
			});
			const first = JSON.parse(await cli("agent-session", "start", task.id));
			await waitFor("saved output", async () => (await cli("agent-session", "output", task.id)).includes(first.id));
			await cli("agent-session", "handoff", task.id);
			await waitFor(
				"replacement",
				async () => JSON.parse(await cli("agent-session", "list", task.id)).handoff?.status === "completed",
			);
			const state = JSON.parse(await cli("agent-session", "list", task.id));
			expect(state.sessions).toHaveLength(2);
			expect(state.sessions[0].status).toBe("handed-off");
			expect(state.activeSessionId).toBe(state.sessions[1].id);
			expect((await core.loadTaskById(task.id))?.description).toBe("Next: verify continuity.");
			expect(
				(await tmux("list-panes", "-a", "-F", "#{@backlog_task}:#{@backlog_role}:#{pane_dead}")).split("\n"),
			).toContain(`${task.id}:live-preview:0`);

			const script = join(root, "client.expect");
			const launch = [...getTestCliCommand(), "workspace"]
				.map((arg) => `{${arg.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}")}}`)
				.join(" ");
			await writeFile(
				script,
				`set timeout 30\nlog_user 0\nset stty_init {rows 40 columns 120 -ixon}\nspawn ${launch}\nexpect { eof {} timeout { exit 91 } }\n`,
			);
			client = Bun.spawn([expectPath as string, script], { cwd: root, env, stdout: "ignore", stderr: "pipe" });
			let workspace = "";
			await waitFor("Workspace host", async () => {
				workspace =
					(await tmux("list-sessions", "-F", "#{session_name}"))
						.split("\n")
						.find((name) => name.startsWith("backlog-workspace-")) ?? "";
				return Boolean(workspace);
			});
			let tasks = "";
			let details = "";
			let footer = "";
			await waitFor("Workspace panes", async () => {
				tasks = await tmux("show-options", "-qv", "-t", workspace, "@backlog_workspace_tasks_pane");
				details = await tmux("show-options", "-qv", "-t", workspace, "@backlog_workspace_details_pane");
				footer = await tmux("show-options", "-qv", "-t", workspace, "@backlog_workspace_footer_pane");
				return Boolean(tasks && details && footer);
			});
			const capture = (pane: string) => tmux("capture-pane", "-p", "-t", pane);
			await waitFor("task rows", async () => (await capture(tasks)).includes(task.title));
			await tmux("send-keys", "-t", tasks, "Space");
			await waitFor(
				"focused details",
				async () => (await tmux("display-message", "-p", "-t", details, "#{pane_active}")) === "1",
			);
			await tmux("send-keys", "-t", details, "s");
			await waitFor(
				"session picker",
				async () => (await capture(details)).includes("handed-off") && (await capture(details)).includes("running"),
			);
			await tmux("send-keys", "-t", details, "Up", "Enter");
			await waitFor("old session output", async () =>
				(await capture(details)).includes(`Saved output from ${first.id}`),
			);
			await waitFor("output footer", async () => (await capture(footer)).includes("Sessions"));
			// A background task refresh must not replace the historical output with task details.
			const refreshDeadline = Date.now() + 2200;
			await waitFor("background refresh interval", async () => Date.now() >= refreshDeadline);
			expect(await capture(details)).toContain(`Saved output from ${first.id}`);
			await tmux("send-keys", "-t", details, "Escape");
			await waitFor("picker return", async () => (await capture(details)).includes("Session history"));
			await tmux("send-keys", "-t", details, "Escape");
			await waitFor("details return", async () => (await capture(details)).includes(task.title));
			await tmux("send-keys", "-t", details, "Escape");
			await waitFor(
				"task focus return",
				async () => (await tmux("display-message", "-p", "-t", tasks, "#{pane_active}")) === "1",
			);
			const panes = await tmux("list-panes", "-a", "-F", "#{pane_dead}");
			expect(panes.split("\n")).not.toContain("1");
			await tmux("send-keys", "-t", tasks, "q");
			expect(await client.exited).toBe(0);
		} finally {
			client?.kill();
			await killTmuxServer(socket);
			await safeCleanup(root);
		}
	},
	60_000,
);
