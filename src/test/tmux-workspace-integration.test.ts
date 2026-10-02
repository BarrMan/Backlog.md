import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Server } from "libtmux";
import { upsertAgentConfiguration } from "../agent-workspace/config.ts";
import { TmuxWorkspace } from "../agent-workspace/tmux-workspace.ts";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand, runTestCli } from "./test-cli.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const tmuxPath = Bun.which("tmux");
const expectPath = Bun.which("expect");
const integration = tmuxPath && expectPath && process.platform !== "win32" ? it : it.skip;
const paths: string[] = [];

afterEach(async () => {
	for (const path of paths.splice(0)) await safeCleanup(path);
});

type TmuxResult = { exitCode: number; stdout: string; stderr: string };

function escapedExpectCommand(command: string[]): string {
	return command
		.map((argument) => `{${argument.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}")}}`)
		.join(" ");
}

async function waitFor(
	predicate: () => Promise<boolean>,
	label: string,
	diagnostics: () => Promise<string>,
): Promise<void> {
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		if (await predicate()) return;
		await Bun.sleep(25);
	}
	throw new Error(`Timed out waiting for ${label}.\n${await diagnostics()}`);
}

describe("workspace native tmux integration", () => {
	integration("recovers startup after the process that acquired a real tmux bootstrap lock is killed", async () => {
		const directory = createUniqueTestDir("tmux-workspace-stale-bootstrap");
		paths.push(directory);
		await mkdir(directory, { recursive: true });
		const socket = `backlog-stale-bootstrap-${crypto.randomUUID().slice(0, 8)}`;
		const server = new Server({
			tmuxBin: tmuxPath as string,
			socketName: socket,
			configFile: "/dev/null",
			environment: { ...process.env, TMUX: "" },
		});
		const workspace = new TmuxWorkspace(directory, server);
		const readyPath = join(directory, "stale-bootstrap-ready");
		const owner = Bun.spawn([
			"sh",
			"-c",
			'"$1" -f /dev/null -L "$2" wait-for -L "$3"; : > "$4"; kill -STOP $$; sleep 60',
			"sh",
			tmuxPath as string,
			socket,
			`${workspace.sessionName}-bootstrap`,
			readyPath,
		]);
		try {
			await waitFor(
				async () => await Bun.file(readyPath).exists(),
				"stale bootstrap lock acquisition",
				async () => "tmux wait-for lock owner did not become ready",
			);
			expect(owner.exitCode).toBeNull();
			owner.kill("SIGKILL");
			await owner.exited;

			await workspace.showWorkspace();
			expect(await server.hasSession(workspace.sessionName)).toBe(true);
		} finally {
			if (owner.exitCode === null) owner.kill("SIGKILL");
			await server.cmd("kill-server").catch(() => {});
		}
	});

	integration(
		"keeps native application windows and agent identity through real tmux clients",
		async () => {
			const directory = createUniqueTestDir("tmux-workspace-integration");
			paths.push(directory);
			const bin = join(directory, "bin");
			const socket = `backlog-integration-${crypto.randomUUID().slice(0, 8)}`;
			const stepPath = join(directory, "client-step");
			const acknowledgementPath = join(directory, "client-acknowledgement");
			const environment = {
				...process.env,
				PATH: `${bin}:${process.env.PATH}`,
				TMUX: "",
				TERM: "xterm-256color",
				BACKLOG_TEST_STEP: stepPath,
				BACKLOG_TEST_ACKNOWLEDGEMENT: acknowledgementPath,
			};
			const tmux = async (...args: string[]): Promise<TmuxResult> => {
				const child = Bun.spawn([join(bin, "tmux"), ...args], {
					cwd: directory,
					env: environment,
					stdout: "pipe",
					stderr: "pipe",
				});
				return {
					exitCode: await child.exited,
					stdout: await new Response(child.stdout).text(),
					stderr: await new Response(child.stderr).text(),
				};
			};
			const requireTmux = async (...args: string[]) => {
				const result = await tmux(...args);
				if (result.exitCode !== 0) throw new Error(`tmux ${args.join(" ")} failed:\n${result.stderr}`);
				return result.stdout.trim();
			};
			const panes = async (target: string) =>
				(await requireTmux("list-panes", "-t", target, "-F", "#{pane_id}:#{pane_pid}:#{pane_dead}")).split("\n");
			const selectedPane = async (target: string) => {
				const listed = await requireTmux("list-panes", "-t", target, "-F", "#{pane_id}:#{pane_active}");
				return listed
					.split("\n")
					.find((pane) => pane.endsWith(":1"))
					?.slice(0, -2);
			};
			const requestClientKey = async (key: string) => {
				await writeFile(stepPath, key);
				await waitFor(
					async () =>
						(await Bun.file(acknowledgementPath)
							.text()
							.catch(() => "")) === key,
					`client key ${key}`,
					async () =>
						`acknowledgement=${await Bun.file(acknowledgementPath)
							.text()
							.catch(() => "(none)")}`,
				);
			};
			const startClient = async (insideTmux = false, columns = 120, rows = 40) => {
				await Promise.all([rm(acknowledgementPath, { force: true }), rm(stepPath, { force: true })]);
				const script = join(directory, `workspace-${crypto.randomUUID()}.expect`);
				const entry = insideTmux
					? [
							join(bin, "tmux"),
							"new-session",
							"-x",
							String(columns),
							"-y",
							String(rows),
							"-s",
							`caller-${crypto.randomUUID().slice(0, 8)}`,
							"exec",
							...getTestCliCommand(),
							"workspace",
						]
					: [...getTestCliCommand(), "workspace"];
				await writeFile(
					script,
					`#!/usr/bin/expect -f
set timeout 12
log_user 0
set env(COLUMNS) ${columns}
set env(LINES) ${rows}
set stty_init {rows ${rows} columns ${columns} -ixon}
match_max 65536
spawn ${escapedExpectCommand(entry)}
expect { -re {Tasks} {} timeout { exit 91 } }
set acknowledgement [open $env(BACKLOG_TEST_ACKNOWLEDGEMENT) w]
puts -nonewline $acknowledgement ready
close $acknowledgement
while {1} {
  if {[file exists $env(BACKLOG_TEST_STEP)]} {
    set file [open $env(BACKLOG_TEST_STEP) r]
    set key [string trim [read $file]]
    close $file
    file delete $env(BACKLOG_TEST_STEP)
    if {$key eq "enter"} { send -- "\\r" }
	if {$key eq "handoff"} { send -- "B" }
    if {$key eq "board"} { send -- "\\0020" }
    if {$key eq "workspace"} { send -- "\\0021" }
    if {$key eq "ctrl-q"} { send -- "\\021" }
    if {$key eq "tab"} { send -- "\\t" }
    if {$key eq "fresh-input"} { send -- "fresh-after-return\\r" }
    if {$key eq "agent-native-keys"} { send -- "/\\t\\r" }
    if {$key eq "footer-search"} { send -- "/" }
    if {$key eq "footer-character"} { send -- "S" }
    if {$key eq "footer-long"} { send -- "earch query" }
    if {$key eq "footer-backspace"} { send -- "\\177" }
    if {$key eq "footer-second"} { send -- "Second native" }
    if {$key eq "footer-first"} { send -- "First native" }
    if {$key eq "footer-clear"} { send -- "\\177\\177\\177\\177\\177\\177\\177\\177\\177\\177\\177\\177\\177\\177\\177\\177" }
    if {$key eq "footer-submit"} { send -- "\\r" }
    if {$key eq "footer-cancel"} { send -- "\\033" }
    if {$key eq "q"} { send -- "q" }
    if {$key eq "detach"} { send -- "\\002d" }
    set acknowledgement [open $env(BACKLOG_TEST_ACKNOWLEDGEMENT) w]
    puts -nonewline $acknowledgement $key
    close $acknowledgement
    if {$key eq "q" || $key eq "detach"} { expect { eof {} timeout { exit 92 } }; exit 0 }
  }
  # Consume up to 64 pending redraw chunks before processing the next scripted input.
  set drained 0
  expect -timeout 0 {
    -re {(?s:.)+} {
      incr drained
      if {$drained < 64} { exp_continue }
    }
    timeout {}
  }
  after 25
}
`,
				);
				const client = Bun.spawn([expectPath as string, "-f", script], {
					cwd: directory,
					env: environment,
					// Expect continuously reads the PTY; discard its transcript so repeated renders cannot back up the harness.
					stdout: "ignore",
					stderr: "pipe",
				});
				await waitFor(
					async () =>
						(await Bun.file(acknowledgementPath)
							.text()
							.catch(() => "")) === "ready" || client.exitCode !== null,
					"attached workspace client",
					async () => await new Response(client.stderr).text(),
				);
				if (client.exitCode !== null) {
					throw new Error(
						`workspace client exited before becoming ready (${client.exitCode}):\n${await new Response(client.stderr).text()}`,
					);
				}
				return client;
			};

			try {
				await mkdir(bin, { recursive: true });
				await writeFile(join(bin, "tmux"), `#!/bin/sh\nexec ${tmuxPath as string} -f /dev/null -L ${socket} "$@"\n`);
				await chmod(join(bin, "tmux"), 0o755);
				await requireTmux("new-session", "-d", "-s", "environment-seed", "exec sleep 120");
				await requireTmux("set-environment", "-g", "BACKLOG_CWD", "/nonexistent");
				await writeFile(
					join(bin, "fake-agent"),
					"#!/usr/bin/env bash\necho FAKE_AGENT_READY:$BACKLOG_TASK_ID\ni=0\nwhile :; do\n  ((i += 1))\n  printf 'FAKE_AGENT_HEARTBEAT:%s\\n' \"$i\"\n  if IFS= read -r -t 1 line; then printf 'FAKE_AGENT_INPUT:%q\\n' \"$line\"; fi\ndone\n",
				);
				await chmod(join(bin, "fake-agent"), 0o755);
				await $`git init -b main`.cwd(directory).quiet();
				const core = new Core(directory);
				await initializeTestProject(core, "Tmux integration");
				const { task: first } = await core.createTaskFromInput(
					{ title: "First native task", description: "FIRST_TASK_HANDOFF_SELECTED", status: "To Do" },
					false,
				);
				await core.createTaskFromInput({ title: "Second native task", status: "To Do" }, false);
				await core.createTaskFromInput({ title: "Done native task", status: "Done" }, false);
				await upsertAgentConfiguration(core, "project", {
					selectedPreset: "fake",
					presets: {
						fake: {
							command: `${join(bin, "fake-agent")} {prompt}`,
							env: {},
							prepare: "",
							worktree: false,
							bootstrap: "prompt",
						},
					},
				});
				const client = await startClient(false, 120, 40);
				const workspaceSession = (await requireTmux("list-sessions", "-F", "#{session_name}"))
					.split("\n")
					.find((name) => name.startsWith("backlog-workspace-"));
				expect(workspaceSession).toBeDefined();
				const host = workspaceSession as string;
				const workspaceFooterEditing = async () =>
					(await tmux("show-options", "-qv", "-t", host, "@backlog_workspace_view_state")).stdout.includes(
						'"footerEditing":true',
					);
				expect(
					(await requireTmux("list-windows", "-t", host, "-F", "#{window_name}:#{window_panes}")).split("\n"),
				).toEqual(expect.arrayContaining(["Board:1", "Workspace:5"]));
				const workspacePanes = await panes(`${host}:Workspace`);
				expect(workspacePanes).toHaveLength(5);
				const [navigationId, taskId, detailsId, displayId, footerId] = await Promise.all(
					[
						"@backlog_workspace_nav_pane",
						"@backlog_workspace_tasks_pane",
						"@backlog_workspace_details_pane",
						"@backlog_workspace_display_pane",
						"@backlog_workspace_footer_pane",
					].map((option) => requireTmux("show-options", "-qv", "-t", host, option)),
				);
				if (!navigationId || !taskId || !detailsId || !displayId || !footerId)
					throw new Error("workspace panes were not registered");
				const geometry = (
					await requireTmux(
						"list-panes",
						"-t",
						`${host}:Workspace`,
						"-F",
						"#{pane_id}:#{pane_left}:#{pane_top}:#{pane_width}:#{pane_height}",
					)
				).split("\n");
				const bounds = (id: string) =>
					geometry
						.find((pane) => pane.startsWith(`${id}:`))
						?.split(":")
						.map(Number);
				const requiredBounds = (value: number[] | undefined): [number, number, number, number, number] => {
					if (value?.length !== 5) throw new Error("workspace pane geometry is unavailable");
					return value as [number, number, number, number, number];
				};
				const navBounds = bounds(navigationId);
				const taskBounds = bounds(taskId);
				const detailsBounds = bounds(detailsId);
				const displayBounds = bounds(displayId);
				const footerBounds = bounds(footerId);
				expect(navBounds).toBeDefined();
				expect(taskBounds).toBeDefined();
				expect(detailsBounds).toBeDefined();
				expect(displayBounds).toBeDefined();
				expect(footerBounds).toBeDefined();
				const nav = requiredBounds(navBounds);
				const task = requiredBounds(taskBounds);
				const details = requiredBounds(detailsBounds);
				const display = requiredBounds(displayBounds);
				const footer = requiredBounds(footerBounds);
				const capturePane = async (pane: string) => (await tmux("capture-pane", "-p", "-t", pane)).stdout;
				const footerCursor = async (pane: string) =>
					Number(await requireTmux("display-message", "-p", "-t", pane, "#{cursor_x}"));
				const workspaceSearch = async () =>
					(await tmux("show-options", "-qv", "-t", host, "@backlog_workspace_view_state")).stdout.match(
						/"search":"([^"]*)"/,
					)?.[1];
				const expectedWorkspaceFooterHintLines = (width: number, search = "") => {
					const segments = [
						"[↑↓] Task",
						"[/] Search",
						"[Space] Details",
						"[→] Focus details",
						"[Tab] Agent",
						"[Enter] Start/Show",
						"[N] New",
						"[Shift+B] Board",
						"[Q] Close",
						...(search ? [`Search: ${search}`] : []),
					];
					const availableWidth = width - 1;
					let splitAt = 1;
					let firstLine = ` ${segments[0]}`;
					for (let index = 1; index < segments.length; index += 1) {
						const candidate = ` ${segments.slice(0, index + 1).join(" | ")}`;
						if (candidate.length > availableWidth) break;
						splitAt = index + 1;
						firstLine = candidate;
					}
					const secondLine = ` ${segments.slice(splitAt).join(" | ")}`;
					return secondLine.trim() ? [firstLine, secondLine] : [firstLine];
				};
				const expectWorkspaceFooterHints = async (width: number, search = "") => {
					const footerLines = (await capturePane(footerId))
						.split("\n")
						.filter((line) => line.includes("[") || line.includes("Search:"));
					const expectedLines = expectedWorkspaceFooterHintLines(width, search);
					expect(footerLines).toEqual(expectedLines);
					expect(footerLines.join("\n")).toContain("[N] New");
					expect(footerLines.join("\n")).toContain("[Shift+B] Board");
					expect(footerLines.join("\n")).toContain("[Q] Close");
					for (const line of footerLines) expect(line.length).toBeLessThanOrEqual(width - 1);
					expect(await requireTmux("display-message", "-p", "-t", footerId, "#{pane_width}")).toBe(String(width));
				};
				const clearFooter = async (pane: string) => {
					await requestClientKey("footer-clear");
					await waitFor(
						async () => (await footerCursor(pane)) === 3,
						"footer cleared cursor",
						() => capturePane(pane),
					);
				};
				const expectFooterSearch = async (pane: string, surface: string) => {
					expect(await capturePane(pane)).toContain("Search");
					await requestClientKey("footer-search");
					await waitFor(
						async () => (await capturePane(pane)).includes(" /"),
						`${surface} footer prompt`,
						() => capturePane(pane),
					);
					if (surface === "Workspace")
						await waitFor(
							async () => (await selectedPane(`${host}:Workspace`)) === pane && (await workspaceFooterEditing()),
							"Workspace footer input focus",
							() => capturePane(pane),
						);
					await requestClientKey("footer-character");
					await waitFor(
						async () => (await capturePane(pane)).includes(" / S") && (await footerCursor(pane)) === 4,
						`${surface} footer first character and cursor`,
						() => capturePane(pane),
					);
					await requestClientKey("footer-long");
					await waitFor(
						async () => (await capturePane(pane)).includes(" / Search query") && (await footerCursor(pane)) === 15,
						`${surface} footer long query and cursor`,
						() => capturePane(pane),
					);
					await requestClientKey("footer-backspace");
					await waitFor(
						async () => (await capturePane(pane)).includes(" / Search quer") && (await footerCursor(pane)) === 14,
						`${surface} footer backspace and cursor`,
						() => capturePane(pane),
					);
					await clearFooter(pane);
					await waitFor(
						async () => (await capturePane(pane)).includes(" /") && (await footerCursor(pane)) === 3,
						`${surface} footer cleared query and cursor`,
						() => capturePane(pane),
					);
					if (surface === "Workspace")
						await waitFor(
							async () => (await workspaceSearch()) === "",
							"Workspace cleared footer search state",
							async () => `search=${await workspaceSearch()}`,
						);
					await requestClientKey("footer-submit");
					await waitFor(
						async () => (await capturePane(pane)).includes("Search"),
						`${surface} footer hints after Enter`,
						() => capturePane(pane),
					);
					if (surface === "Workspace") {
						await waitFor(
							async () => (await selectedPane(`${host}:Workspace`)) === taskId && !(await workspaceFooterEditing()),
							"Workspace task focus after footer Enter",
							() => capturePane(pane),
						);
						return;
					}
					await requestClientKey("footer-search");
					await requestClientKey("footer-character");
					await waitFor(
						async () => (await capturePane(pane)).includes(" / S") && (await footerCursor(pane)) === 4,
						`${surface} footer cancellation query and cursor`,
						() => capturePane(pane),
					);
					await requestClientKey("footer-cancel");
					await waitFor(
						async () => (await capturePane(pane)).includes("Search"),
						`${surface} footer hints after Escape`,
						() => capturePane(pane),
					);
					await requestClientKey("footer-search");
					await clearFooter(pane);
					await waitFor(
						async () => (await capturePane(pane)).includes(" /") && (await footerCursor(pane)) === 3,
						`${surface} footer cleanup query and cursor`,
						() => capturePane(pane),
					);
					await requestClientKey("footer-submit");
				};
				expect(nav[1]).toBe(0);
				expect(nav[2]).toBe(0);
				expect(nav[3]).toBeGreaterThan(task[3]);
				expect(task[1]).toBe(0);
				expect(task[2]).toBe(nav[2] + nav[4] + 1);
				expect(details[1]).toBeGreaterThan(0);
				expect(details[2]).toBe(task[2]);
				expect(display[1]).toBe(details[1]);
				expect(display[2]).toBeGreaterThan(details[2]);
				expect(footer[1]).toBe(0);
				expect(footer[3]).toBe(nav[3]);
				expect(footer[2]).toBe(Math.max(task[2] + task[4], display[2] + display[4]) + 1);
				expect((await tmux("capture-pane", "-p", "-t", navigationId)).stdout).toContain("Filters");
				await requireTmux("resize-pane", "-t", taskId, "-x", "50");
				await waitFor(
					async () => {
						const resized = await requireTmux(
							"list-panes",
							"-t",
							`${host}:Workspace`,
							"-F",
							"#{pane_id}:#{pane_width}:#{pane_height}",
						);
						return (
							resized.includes(`${taskId}:50:`) &&
							(await tmux("capture-pane", "-p", "-t", navigationId)).stdout.includes("Filters")
						);
					},
					"Workspace resize",
					async () =>
						await requireTmux("list-panes", "-t", `${host}:Workspace`, "-F", "#{pane_id}:#{pane_width}:#{pane_height}"),
				);

				await requestClientKey("board");
				await waitFor(
					async () => (await requireTmux("display-message", "-p", "-t", host, "#{window_name}")) === "Board",
					"Board window focus before handoff",
					async () => await requireTmux("list-windows", "-t", host, "-F", "#{window_name}:#{window_active}"),
				);
				const boardPane = await selectedPane(`${host}:Board`);
				if (!boardPane) throw new Error("Board pane was not selected");
				await expectFooterSearch(boardPane, "Board");
				await requestClientKey("handoff");
				await waitFor(
					async () => {
						const [mailbox, ui, details] = await Promise.all([
							tmux("show-options", "-qv", "-t", host, "@backlog_workspace_task_request"),
							tmux("capture-pane", "-p", "-t", taskId),
							tmux("capture-pane", "-p", "-t", detailsId),
						]);
						return (
							!mailbox.stdout.trim() &&
							ui.stdout.includes("First native task") &&
							!ui.stdout.includes("Filters") &&
							!ui.stdout.includes("FIRST_TASK_HANDOFF_SELECTED") &&
							details.stdout.includes("FIRST_TASK_HANDOFF_SELECTED")
						);
					},
					"Board handoff mailbox consumption and Workspace selected task",
					async () =>
						`${await requireTmux("list-windows", "-t", host, "-F", "#{window_name}:#{window_active}")}\nmailbox=${
							(await tmux("show-options", "-qv", "-t", host, "@backlog_workspace_task_request")).stdout
						}\n${(await tmux("capture-pane", "-p", "-t", navigationId)).stdout}`,
				);
				await waitFor(
					async () =>
						(await requireTmux("display-message", "-p", "-t", host, "#{window_name}")) === "Workspace" &&
						(await selectedPane(`${host}:Workspace`)) === taskId,
					"Workspace window focus after Board handoff",
					async () => await requireTmux("list-windows", "-t", host, "-F", "#{window_name}:#{window_active}"),
				);
				expect((await capturePane(taskId)).match(/-\s+Done \(\d+\)/g)).toHaveLength(1);
				await expectFooterSearch(footerId, "Workspace");
				await requestClientKey("footer-search");
				await waitFor(
					async () => (await selectedPane(`${host}:Workspace`)) === footerId && (await workspaceFooterEditing()),
					"footer search focus",
					async () => await requireTmux("display-message", "-p", "-t", `${host}:Workspace`, "#{pane_id}"),
				);
				await requestClientKey("footer-second");
				await waitFor(
					async () => {
						const output = await tmux("capture-pane", "-p", "-t", taskId);
						return output.stdout.includes("Second native task") && !output.stdout.includes("First native task");
					},
					"live Workspace search filtering",
					async () => (await tmux("capture-pane", "-p", "-t", taskId)).stdout,
				);
				await requestClientKey("footer-submit");
				await waitFor(
					async () =>
						(await selectedPane(`${host}:Workspace`)) === taskId &&
						(await tmux("capture-pane", "-p", "-t", taskId)).stdout.includes("Second native task"),
					"committed Workspace search task focus",
					async () => await requireTmux("display-message", "-p", "-t", `${host}:Workspace`, "#{pane_id}"),
				);
				await requestClientKey("footer-search");
				await waitFor(
					async () => (await selectedPane(`${host}:Workspace`)) === footerId && (await workspaceFooterEditing()),
					"footer search focus for cancellation",
					async () => await requireTmux("display-message", "-p", "-t", `${host}:Workspace`, "#{pane_id}"),
				);
				await clearFooter(footerId);
				await waitFor(
					async () => (await workspaceSearch()) === "",
					"cleared Workspace search state before replacement",
					async () => `search=${await workspaceSearch()}`,
				);
				await waitFor(
					async () => {
						const output = await tmux("capture-pane", "-p", "-t", taskId);
						return output.stdout.includes("First native task") && output.stdout.includes("Second native task");
					},
					"cleared Workspace search before replacement",
					async () => (await tmux("capture-pane", "-p", "-t", taskId)).stdout,
				);
				await requestClientKey("footer-first");
				await waitFor(
					async () => {
						const output = await tmux("capture-pane", "-p", "-t", taskId);
						return output.stdout.includes("First native task") && !output.stdout.includes("Second native task");
					},
					"replacement Workspace search filtering",
					async () => (await tmux("capture-pane", "-p", "-t", taskId)).stdout,
				);
				await requestClientKey("footer-cancel");
				await waitFor(
					async () => {
						const output = await tmux("capture-pane", "-p", "-t", taskId);
						return (
							(await selectedPane(`${host}:Workspace`)) === taskId &&
							output.stdout.includes("Second native task") &&
							!output.stdout.includes("First native task") &&
							(await capturePane(footerId)).includes("Search")
						);
					},
					"Workspace search cancellation restore",
					async () => (await tmux("capture-pane", "-p", "-t", taskId)).stdout,
				);
				await requestClientKey("footer-search");
				await waitFor(
					async () => (await selectedPane(`${host}:Workspace`)) === footerId && (await workspaceFooterEditing()),
					"footer search focus for clearing",
					async () => await requireTmux("display-message", "-p", "-t", `${host}:Workspace`, "#{pane_id}"),
				);
				await clearFooter(footerId);
				await waitFor(
					async () => (await workspaceSearch()) === "",
					"cleared Workspace search state before empty submit",
					async () => `search=${await workspaceSearch()}`,
				);
				await waitFor(
					async () => {
						const output = await tmux("capture-pane", "-p", "-t", taskId);
						return output.stdout.includes("First native task") && output.stdout.includes("Second native task");
					},
					"empty Workspace search clear",
					async () => (await tmux("capture-pane", "-p", "-t", taskId)).stdout,
				);
				await requestClientKey("footer-submit");
				await waitFor(
					async () => (await selectedPane(`${host}:Workspace`)) === taskId,
					"task focus after empty Workspace search",
					async () => await requireTmux("display-message", "-p", "-t", `${host}:Workspace`, "#{pane_id}"),
				);
				await requestClientKey("footer-search");
				await waitFor(
					async () => (await selectedPane(`${host}:Workspace`)) === footerId && (await workspaceFooterEditing()),
					"footer search focus before agent selection",
					async () => await requireTmux("display-message", "-p", "-t", `${host}:Workspace`, "#{pane_id}"),
				);
				await requestClientKey("footer-first");
				await waitFor(
					async () => (await tmux("capture-pane", "-p", "-t", taskId)).stdout.includes("First native task"),
					"first task search before agent selection",
					async () => (await tmux("capture-pane", "-p", "-t", taskId)).stdout,
				);
				await requestClientKey("footer-submit");
				await waitFor(
					async () => (await selectedPane(`${host}:Workspace`)) === taskId,
					"first task focus before agent selection",
					async () => await requireTmux("display-message", "-p", "-t", `${host}:Workspace`, "#{pane_id}"),
				);

				await requestClientKey("enter");
				const agentMarker = `FAKE_AGENT_READY:${first.id}`;
				const agentPane = async () => {
					const ids = (await requireTmux("list-panes", "-a", "-F", "#{pane_id}")).split("\n");
					for (const id of ids)
						if ((await tmux("capture-pane", "-p", "-t", id)).stdout.includes(agentMarker)) return id;
					return undefined;
				};
				await waitFor(
					async () => Boolean(await agentPane()),
					"agent start marker",
					async () => await requireTmux("list-panes", "-a", "-F", "#{pane_id}:#{pane_current_command}"),
				);
				const agent = (await agentPane()) as string;
				const agentPid = await requireTmux("display-message", "-p", "-t", agent, "#{pane_pid}");
				const routingDiagnostics = async () => {
					const [window, selected, active, ui, agentOutput] = await Promise.all([
						requireTmux("display-message", "-p", "-t", host, "#{window_name}"),
						selectedPane(`${host}:Workspace`),
						tmux("show-options", "-qv", "-t", host, "@backlog_workspace_active"),
						tmux("capture-pane", "-p", "-t", navigationId),
						tmux("capture-pane", "-p", "-t", agent),
					]);
					return `window=${window}\nselected=${selected}\nhost-active=${active.stdout.trim() || "(none)"}\nUI:\n${ui.stdout}\nAgent:\n${agentOutput.stdout}`;
				};
				await waitFor(
					async () =>
						(await requireTmux("display-message", "-p", "-t", `${host}:Workspace`, "#{window_zoomed_flag}")) === "1",
					"native agent fullscreen zoom",
					async () => (await panes(`${host}:Workspace`)).join("\n"),
				);

				await requestClientKey("ctrl-q");
				await waitFor(
					async () => {
						const [zoomed, selected] = await Promise.all([
							requireTmux("display-message", "-p", "-t", `${host}:Workspace`, "#{window_zoomed_flag}"),
							selectedPane(`${host}:Workspace`),
						]);
						return zoomed === "0" && selected === taskId;
					},
					"native fullscreen return with Workspace task list selected",
					routingDiagnostics,
				);
				expect((await panes(`${host}:Workspace`)).join("\n")).toContain(agent);
				expect(await requireTmux("display-message", "-p", "-t", agent, "#{pane_pid}")).toBe(agentPid);
				await requestClientKey("tab");
				await waitFor(
					async () => (await selectedPane(`${host}:Workspace`)) === agent,
					"inline agent focus after Tab",
					routingDiagnostics,
				);
				await requestClientKey("fresh-input");
				await waitFor(
					async () =>
						(await tmux("capture-pane", "-p", "-t", agent)).stdout.includes("FAKE_AGENT_INPUT:fresh-after-return"),
					"fresh focused agent output",
					routingDiagnostics,
				);
				await requestClientKey("agent-native-keys");
				await waitFor(
					async () => (await tmux("capture-pane", "-p", "-t", agent)).stdout.includes("FAKE_AGENT_INPUT:$'/\\t'"),
					"native slash, Tab, and Enter agent input",
					routingDiagnostics,
				);
				await requestClientKey("ctrl-q");
				await waitFor(
					async () =>
						(await requireTmux("display-message", "-p", "-t", `${host}:Workspace`, "#{window_zoomed_flag}")) === "0" &&
						(await selectedPane(`${host}:Workspace`)) === taskId,
					"return to Workspace task list before footer search",
					routingDiagnostics,
				);
				await requireTmux("resize-window", "-t", `${host}:Workspace`, "-x", "100", "-y", "30");
				const narrowWidth = await requireTmux("display-message", "-p", "-t", navigationId, "#{pane_width}");
				expect(narrowWidth).toBe("100");
				await waitFor(
					async () => {
						try {
							await expectWorkspaceFooterHints(100, "First native");
							return true;
						} catch {
							return false;
						}
					},
					"narrow Workspace footer shortcut rows",
					() => capturePane(footerId),
				);
				await requestClientKey("footer-search");
				await waitFor(
					async () => (await selectedPane(`${host}:Workspace`)) === footerId && (await workspaceFooterEditing()),
					"narrow Workspace footer search focus",
					() => capturePane(footerId),
				);
				await clearFooter(footerId);
				await waitFor(
					async () => (await workspaceSearch()) === "" && (await footerCursor(footerId)) === 3,
					"cleared narrow Workspace footer editing query",
					() => capturePane(footerId),
				);
				await requestClientKey("footer-character");
				await waitFor(
					async () =>
						(await workspaceSearch()) === "S" &&
						(await capturePane(footerId)).includes(" / S") &&
						(await footerCursor(footerId)) === 4,
					"narrow Workspace footer editing query",
					() => capturePane(footerId),
				);
				await requireTmux("resize-window", "-t", `${host}:Workspace`, "-x", "140", "-y", "50");
				await waitFor(
					async () => {
						try {
							return (
								(await selectedPane(`${host}:Workspace`)) === footerId &&
								(await workspaceFooterEditing()) &&
								(await workspaceSearch()) === "S" &&
								(await capturePane(footerId)).includes(" / S") &&
								(await footerCursor(footerId)) === 4
							);
						} catch {
							return false;
						}
					},
					"wide Workspace footer editing query after resize",
					() => capturePane(footerId),
				);
				await requestClientKey("footer-cancel");
				await waitFor(
					async () => {
						try {
							await expectWorkspaceFooterHints(140, "First native");
							const output = await capturePane(taskId);
							return (
								(await workspaceSearch()) === "First native" &&
								(await selectedPane(`${host}:Workspace`)) === taskId &&
								output.includes("First native task") &&
								!output.includes("Second native task")
							);
						} catch {
							return false;
						}
					},
					"wide Workspace footer shortcut rows after cancellation",
					async () => {
						const [paneState, sharedState, footerScreen, selected, taskScreen] = await Promise.all([
							requireTmux(
								"list-panes",
								"-t",
								`${host}:Workspace`,
								"-F",
								"#{pane_id}:dead=#{pane_dead}:active=#{pane_active}",
							),
							tmux("show-options", "-qv", "-t", host, "@backlog_workspace_view_state").then((result) => result.stdout),
							capturePane(footerId),
							selectedPane(`${host}:Workspace`),
							capturePane(taskId),
						]);
						return `pane_dead=${paneState}\nshared_state=${sharedState}\nselected_pane=${selected}\nfooter_screen=${footerScreen}\ntask_screen=${taskScreen}`;
					},
				);
				await requestClientKey("footer-search");
				await waitFor(
					async () => (await selectedPane(`${host}:Workspace`)) === footerId && (await workspaceFooterEditing()),
					"wide Workspace footer search focus for clearing",
					() => capturePane(footerId),
				);
				await clearFooter(footerId);
				await requestClientKey("footer-submit");
				await waitFor(
					async () => (await selectedPane(`${host}:Workspace`)) === taskId && (await workspaceSearch()) === "",
					"cleared Workspace search after resize",
					() => capturePane(footerId),
				);
				await waitFor(
					async () => {
						try {
							await expectWorkspaceFooterHints(140);
							return true;
						} catch {
							return false;
						}
					},
					"wide single-row Workspace footer shortcuts after clearing search",
					() => capturePane(footerId),
				);

				await requestClientKey("board");
				await waitFor(
					async () => (await requireTmux("display-message", "-p", "-t", host, "#{window_name}")) === "Board",
					"Board window focus before detach",
					async () => await requireTmux("list-windows", "-t", host, "-F", "#{window_name}:#{window_active}"),
				);
				await requestClientKey("q");
				expect(await client.exited).toBe(0);
				expect((await panes(`${host}:Workspace`))[0]).toStartWith(`${navigationId}:`);
				expect(await requireTmux("display-message", "-p", "-t", agent, "#{pane_pid}")).toBe(agentPid);

				await startClient(false, 140, 50);
				expect((await requireTmux("list-windows", "-t", host, "-F", "#{window_name}")).split("\n")).toEqual([
					"Board",
					"Workspace",
				]);
				expect((await panes(`${host}:Workspace`)).join("\n")).toContain(agent);
				const wideGeometry = (
					await requireTmux(
						"list-panes",
						"-t",
						`${host}:Workspace`,
						"-F",
						"#{pane_id}:#{pane_left}:#{pane_top}:#{pane_width}:#{pane_height}",
					)
				).split("\n");
				const wideBounds = (id: string) =>
					wideGeometry
						.find((pane) => pane.startsWith(`${id}:`))
						?.split(":")
						.map(Number);
				const wideNav = requiredBounds(wideBounds(navigationId));
				const wideFooter = requiredBounds(wideBounds(footerId));
				expect(wideNav[3]).toBe(140);
				expect(wideFooter[3]).toBe(140);
				expect(wideFooter[2]).toBeGreaterThan(wideNav[2]);
				expect(await requireTmux("display-message", "-p", "-t", agent, "#{pane_pid}")).toBe(agentPid);
				const stopped = await runTestCli(["agent-session", "stop", first.id], { cwd: directory, env: environment });
				expect(stopped.exitCode).toBe(0);
				expect((await panes(`${host}:Workspace`))[0]).toStartWith(`${navigationId}:`);
			} finally {
				await tmux("kill-server");
			}
		},
		60_000,
	);
});
