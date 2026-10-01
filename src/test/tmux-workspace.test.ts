import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isTmuxWorkspace, TmuxWorkspace, type TmuxWorkspaceRunner } from "../agent-workspace/tmux-workspace.ts";

class RecordingRunner implements TmuxWorkspaceRunner {
	readonly calls: string[][] = [];
	readonly options = new Map<string, string>();
	clients = "";
	#nextPane = 3;
	async run(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		this.calls.push(args);
		if (args[1] === "new-session") return { exitCode: 0, stdout: "@1|%1\n", stderr: "" };
		if (args[1] === "new-window") return { exitCode: 0, stdout: "@2|%2\n", stderr: "" };
		if (args[1] === "split-window") return { exitCode: 0, stdout: `%${this.#nextPane++}\n`, stderr: "" };
		if (args[1] === "has-session") return { exitCode: this.options.has("session") ? 0 : 1, stdout: "", stderr: "" };
		if (args[1] === "show-options") {
			const value = this.options.get(args.at(-1) as string);
			return { exitCode: value ? 0 : 1, stdout: value ? `${value}\n` : "", stderr: "" };
		}
		if (args[1] === "set-option") {
			this.options.set("session", "yes");
			if (!args.includes("-qu")) this.options.set(args.at(-2) as string, args.at(-1) as string);
			else this.options.delete(args.at(-1) as string);
		}
		if (args[1] === "display-message") {
			const target = args[args.indexOf("-t") + 1];
			const format = args.at(-1);
			if (format === "#{pane_id}")
				return { exitCode: 0, stdout: target?.startsWith("%") ? `${target}\n` : "%9\n", stderr: "" };
			return { exitCode: 0, stdout: "0\n", stderr: "" };
		}
		if (args[1] === "list-clients") return { exitCode: 0, stdout: this.clients, stderr: "" };
		return { exitCode: 0, stdout: "", stderr: "" };
	}
}

describe("TmuxWorkspace", () => {
	it("creates only an owned Board/Workspace host with a scoped Ctrl+Q table", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showBoard();
		const commands = runner.calls.map((args) => args.join(" "));
		expect(
			commands.some((command) =>
				command.includes(
					`new-session -d -x 120 -y 40 -P -F #{window_id}|#{pane_id} -s ${workspace.sessionName} -c ${workspace.rootPath}`,
				),
			),
		).toBe(true);
		expect(commands).toContain("tmux rename-window -t @1 Board");
		expect(
			commands.some((command) =>
				command.includes(
					`new-window -d -P -F #{window_id}|#{pane_id} -t ${workspace.sessionName} -c ${workspace.rootPath}`,
				),
			),
		).toBe(true);
		expect(commands).toContain("tmux split-window -v -d -p 1 -P -F #{pane_id} -t %2 exec sleep 2147483647");
		expect(commands).toContain("tmux split-window -v -d -p 90 -P -F #{pane_id} -t %2 exec sleep 2147483647");
		expect(commands).toContain("tmux split-window -h -d -p 58 -P -F #{pane_id} -t %4 exec sleep 2147483647");
		expect(commands).toContain("tmux split-window -v -d -p 56 -P -F #{pane_id} -t %5 exec sleep 2147483647");
		expect(commands).toContain("tmux resize-pane -t %2 -y 3");
		expect(commands).toContain("tmux resize-pane -t %3 -y 1");
		expect(commands.some((command) => command.includes("bind-key -T backlog-workspace-"))).toBe(true);
		expect(commands.some((command) => command.includes("bind-key -T root"))).toBe(false);
	});

	it("preserves the configured tmux prefix in its scoped key table", async () => {
		const runner = new RecordingRunner();
		runner.options.set("prefix", "C-a");
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showBoard();
		expect(runner.calls).toContainEqual([
			"tmux",
			"bind-key",
			"-T",
			`backlog-workspace-${workspace.sessionName.split("-").at(-1)}`,
			"C-a",
			"switch-client",
			"-T",
			"prefix",
		]);
	});

	it("returns the displayed agent to its backing slot before showing another agent", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showAgent("%42");
		await workspace.showAgent("%43");
		const swaps = runner.calls.filter((args) => args[1] === "swap-pane");
		expect(swaps).toEqual([
			["tmux", "swap-pane", "-s", "%42", "-t", "%6"],
			["tmux", "swap-pane", "-s", "%42", "-t", "%6"],
			["tmux", "swap-pane", "-s", "%43", "-t", "%6"],
		]);
	});

	it("focuses tasks and resizes measured header and footer without repeated tmux resizes", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.calls.length = 0;
		await workspace.focusTasks();
		await workspace.resizeNavigation(4);
		await workspace.resizeNavigation(4);
		await workspace.resizeFooter(2);
		expect(runner.calls).toContainEqual(["tmux", "select-pane", "-t", "%4"]);
		expect(runner.calls.filter((args) => args[1] === "resize-pane")).toEqual([
			["tmux", "resize-pane", "-t", "%2", "-y", "4"],
			["tmux", "resize-pane", "-t", "%3", "-y", "2"],
		]);
	});

	it("consumes the task mailbox without an unconditional delete", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace("BACK-723");
		expect(await workspace.takeTaskRequest()).toBe("BACK-723");
		const consume = runner.calls.find((args) => args[1] === "if-shell");
		expect(consume).toContain("#{==:#{@backlog_workspace_task_request},BACK-723}");
	});

	it("accepts task requests containing dots", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace("BACK-723.1");
		expect(await workspace.takeTaskRequest()).toBe("BACK-723.1");
	});

	it("rebuilds an owned host missing native workspace panes", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.options.delete("@backlog_workspace_tasks_pane");
		runner.calls.length = 0;
		await workspace.showWorkspace();
		expect(runner.calls).toContainEqual(["tmux", "kill-window", "-t", "@2"]);
		expect(runner.calls.filter((args) => args[1] === "split-window")).toHaveLength(4);
	});

	it("detaches the client from either owned UI pane", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showBoard();
		for (const pane of ["%1", "%2"]) {
			runner.calls.length = 0;
			runner.clients = `/dev/ttys001|${pane}\n`;
			await workspace.detach();
			expect(runner.calls).toContainEqual(["tmux", "detach-client", "-t", "/dev/ttys001"]);
		}
	});

	it("recognizes only a non-empty workspace environment marker", () => {
		const original = process.env.BACKLOG_TMUX_WORKSPACE;
		try {
			delete process.env.BACKLOG_TMUX_WORKSPACE;
			expect(isTmuxWorkspace()).toBe(false);
			process.env.BACKLOG_TMUX_WORKSPACE = "  owned-session  ";
			expect(isTmuxWorkspace()).toBe(true);
		} finally {
			if (original === undefined) delete process.env.BACKLOG_TMUX_WORKSPACE;
			else process.env.BACKLOG_TMUX_WORKSPACE = original;
		}
	});
});

const tmuxPath = Bun.which("tmux");
const realTmux = tmuxPath && process.platform !== "win32" ? it : it.skip;
const paths: string[] = [];

afterEach(async () => {
	for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true });
});

describe("TmuxWorkspace real tmux", () => {
	realTmux(
		"creates Board and Workspace windows on an isolated server",
		async () => {
			const directory = await mkdtemp(join(tmpdir(), "backlog-tmux-workspace-"));
			paths.push(directory);
			const socket = `backlog-workspace-${crypto.randomUUID().slice(0, 8)}`;
			const runner: TmuxWorkspaceRunner = {
				async run(args, options) {
					const child = Bun.spawn([tmuxPath as string, "-L", socket, "-f", "/dev/null", ...args.slice(1)], {
						cwd: options?.cwd,
						env: { ...process.env, TMUX: "" },
						stdout: "pipe",
						stderr: "pipe",
					});
					return {
						exitCode: await child.exited,
						stdout: await new Response(child.stdout).text(),
						stderr: await new Response(child.stderr).text(),
					};
				},
			};
			const workspace = new TmuxWorkspace(await realpath(directory), runner);
			try {
				await workspace.showWorkspace();
				const listed = await runner.run(["tmux", "list-windows", "-t", workspace.sessionName, "-F", "#{window_name}"]);
				expect(listed.exitCode).toBe(0);
				expect(listed.stdout.split("\n")).toEqual(expect.arrayContaining(["Board", "Workspace"]));
			} finally {
				await runner.run(["tmux", "kill-server"]);
			}
		},
		10_000,
	);

	realTmux(
		"keeps presentation non-focusing, returns agents through stable slots, and recovers a dead display pane",
		async () => {
			const directory = await mkdtemp(join(tmpdir(), "backlog-tmux-workspace-"));
			paths.push(directory);
			const socket = `backlog-workspace-${crypto.randomUUID().slice(0, 8)}`;
			const runner: TmuxWorkspaceRunner = {
				async run(args, options) {
					const child = Bun.spawn([tmuxPath as string, "-L", socket, "-f", "/dev/null", ...args.slice(1)], {
						cwd: options?.cwd,
						env: { ...process.env, TMUX: "" },
						stdout: "pipe",
						stderr: "pipe",
					});
					return {
						exitCode: await child.exited,
						stdout: await new Response(child.stdout).text(),
						stderr: await new Response(child.stderr).text(),
					};
				},
			};
			const host = new TmuxWorkspace(await realpath(directory), runner);
			try {
				await host.showBoard();
				const agent = async (name: string) =>
					(
						await runner.run(["tmux", "new-session", "-d", "-P", "-F", "#{pane_id}", "-s", name, placeholderCommand])
					).stdout.trim();
				const placeholderCommand = "exec sleep 60";
				const a = await agent("agent-a");
				const b = await agent("agent-b");
				await host.showAgent(a);
				await host.showAgent(a);
				const current = await runner.run(["tmux", "display-message", "-p", "-t", host.sessionName, "#{window_name}"]);
				expect(current.stdout.trim()).toBe("Board");
				await host.showWorkspace();
				await host.focusAgent(true);
				await host.focusAgent(false);
				const selected = await runner.run(["tmux", "display-message", "-p", "-t", host.sessionName, "#{pane_id}"]);
				expect(selected.stdout.trim()).toBe(a);
				await host.showAgent(b);
				await host.showAgent(a);
				await runner.run(["tmux", "kill-pane", "-t", a]);
				await host.showAgent(null);
				const display = await runner.run([
					"tmux",
					"show-options",
					"-qv",
					"-t",
					host.sessionName,
					"@backlog_workspace_display_pane",
				]);
				expect(display.stdout.trim()).toStartWith("%");
				const secondDirectory = await mkdtemp(join(tmpdir(), "backlog-tmux-workspace-"));
				paths.push(secondDirectory);
				const second = new TmuxWorkspace(await realpath(secondDirectory), runner);
				await second.showBoard();
				const c = await agent("agent-c");
				await host.showAgent(c);
				const secondCurrent = await runner.run([
					"tmux",
					"display-message",
					"-p",
					"-t",
					second.sessionName,
					"#{window_name}",
				]);
				expect(secondCurrent.stdout.trim()).toBe("Board");
			} finally {
				await runner.run(["tmux", "kill-server"]);
			}
		},
		10_000,
	);
});
