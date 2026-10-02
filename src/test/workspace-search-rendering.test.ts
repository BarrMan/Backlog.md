import { describe, expect, it } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { buildWorkspaceEntries } from "../ui/workspace/model.ts";
import { workspaceRows } from "../ui/workspace/reconciliation.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const expectPath = Bun.which("expect");
const tmuxPath = Bun.which("tmux");
const interactive =
	process.env.RUN_INTERACTIVE_TUI_TESTS === "1" && expectPath && tmuxPath && process.platform !== "win32"
		? it
		: it.skip;

function escapedExpectCommand(command: string[]): string {
	return command
		.map((argument) => `{${argument.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}")}}`)
		.join(" ");
}

async function waitFor(predicate: () => Promise<boolean>, diagnostics: () => Promise<string>): Promise<void> {
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		if (await predicate()) return;
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	throw new Error(`Timed out waiting for workspace rendering.\n${await diagnostics()}`);
}

function timeoutSignal(ms: number, onTimeout: () => void): Promise<never> {
	const signal = AbortSignal.timeout(ms);
	return new Promise((_, reject) => {
		signal.addEventListener("abort", () => {
			onTimeout();
			reject(new Error("Timed out waiting for interactive workspace client."));
		});
	});
}

describe("workspace footer search rendering", () => {
	interactive(
		"removes stale Done rows after a one-character footer query",
		async () => {
			const directory = createUniqueTestDir("workspace-search-rendering");
			const bin = join(directory, "bin");
			const socket = `backlog-workspace-search-${crypto.randomUUID().slice(0, 8)}`;
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
			const tmux = async (...args: string[]) => {
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
			const requestClientKey = async (
				key: "footer-search" | "first-character" | "query" | "clear" | "enter" | "escape" | "q",
			) => {
				await writeFile(stepPath, key);
				await waitFor(
					async () =>
						(await Bun.file(acknowledgementPath)
							.text()
							.catch(() => "")) === key,
					async () =>
						`acknowledgement=${await Bun.file(acknowledgementPath)
							.text()
							.catch(() => "(none)")}`,
				);
			};
			const requestRapidInput = async (key: "rapid-edit" | "rapid-clear") => {
				await writeFile(stepPath, key);
				await waitFor(
					async () =>
						(
							await Bun.file(acknowledgementPath)
								.text()
								.catch(() => "")
						).startsWith(`${key}:`),
					async () =>
						`acknowledgement=${await Bun.file(acknowledgementPath)
							.text()
							.catch(() => "(none)")}`,
				);
				return Number((await Bun.file(acknowledgementPath).text()).slice(key.length + 1));
			};

			let client: ReturnType<typeof Bun.spawn> | undefined;
			try {
				await mkdir(bin, { recursive: true });
				await writeFile(join(bin, "tmux"), `#!/bin/sh\nexec ${tmuxPath as string} -f /dev/null -L ${socket} "$@"\n`);
				await chmod(join(bin, "tmux"), 0o755);
				await $`git init -b main`.cwd(directory).quiet();
				const core = new Core(directory);
				await initializeTestProject(core, "Workspace search rendering");
				await core.createTaskFromInput({ title: "Open task", status: "To Do" }, false);
				const { task } = await core.createTaskFromInput({ title: "Completed task", status: "Done" }, false);
				await core.createTaskFromInput({ title: "Second native task", status: "To Do" }, false);
				const initialRows = workspaceRows(
					buildWorkspaceEntries([task], ["To Do", "In Progress", "Done"], "All", new Set()),
				);
				expect(initialRows.filter((row) => row.includes("Done")).length).toBe(1);
				expect(initialRows.filter((row) => row.includes("Done") && row.includes("(1)")).length).toBe(1);
				expect(initialRows).toContain("  {bold}TASK-2{/bold} - Completed task");

				const script = join(directory, "workspace.expect");
				await writeFile(
					script,
					`#!/usr/bin/expect -f
set timeout 12
log_user 0
set env(COLUMNS) 120
set env(LINES) 40
set stty_init {rows 40 columns 120 -ixon}
match_max 65536
spawn ${escapedExpectCommand([...getTestCliCommand(), "workspace"])}
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
   if {$key eq "footer-search"} { send -- "/" }
   if {$key eq "first-character"} { send -- "S" }
   if {$key eq "query"} { send -- "x" }
   if {$key eq "clear"} { send -- "\\177" }
   if {$key eq "rapid-edit"} { send -- "Second native\\033\\[D\\177\\033\\[3~ve\\033\\[H\\033\\[F" }
   if {$key eq "rapid-clear"} { send -- "\\033\\[H\\033\\[3~\\033\\[3~\\033\\[3~\\033\\[3~\\033\\[3~\\033\\[3~\\033\\[3~\\033\\[3~\\033\\[3~\\033\\[3~\\033\\[3~\\033\\[3~\\033\\[3~" }
   if {$key eq "enter"} { send -- "\\r" }
   if {$key eq "escape"} { send -- "\\033" }
   if {$key eq "q"} { send -- "q" }
   set acknowledgement [open $env(BACKLOG_TEST_ACKNOWLEDGEMENT) w]
   if {$key eq "rapid-edit" || $key eq "rapid-clear"} {
     puts -nonewline $acknowledgement "$key:[clock milliseconds]"
   } else {
     puts -nonewline $acknowledgement $key
   }
     close $acknowledgement
     if {$key eq "q"} { expect { eof {} timeout { exit 92 } }; exit 0 }
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
				const runningClient = Bun.spawn([expectPath as string, "-f", script], {
					cwd: directory,
					env: environment,
					stdout: "ignore",
					stderr: "pipe",
				});
				client = runningClient;
				await waitFor(
					async () =>
						(await Bun.file(acknowledgementPath)
							.text()
							.catch(() => "")) === "ready" || runningClient.exitCode !== null,
					async () => `client exitCode=${runningClient.exitCode ?? "(running)"}`,
				);
				if (runningClient.exitCode !== null)
					throw new Error(`Interactive client exited with ${runningClient.exitCode}.`);
				const host = (await requireTmux("list-sessions", "-F", "#{session_name}"))
					.split("\n")
					.find((name) => name.startsWith("backlog-workspace-"));
				if (!host) throw new Error("workspace session was not created");
				const taskPane = await requireTmux("show-options", "-qv", "-t", host, "@backlog_workspace_tasks_pane");
				const captureTaskPane = async () => (await tmux("capture-pane", "-p", "-t", taskPane)).stdout;
				const workspaceFooterEditing = async () =>
					(await tmux("show-options", "-qv", "-t", host, "@backlog_workspace_view_state")).stdout.includes(
						'"footerEditing":true',
					);
				const taskPaneFocused = async () =>
					(await requireTmux("list-panes", "-t", `${host}:Workspace`, "-F", "#{pane_id} #{pane_active}"))
						.split("\n")
						.includes(`${taskPane} 1`);
				const doneHeadings = (output: string) => output.match(/-\s+Done \(\d+\)/g)?.length ?? 0;
				await waitFor(async () => (await captureTaskPane()).includes("Open task"), captureTaskPane);

				await requestClientKey("footer-search");
				await waitFor(workspaceFooterEditing, captureTaskPane);
				const footerPane = await requireTmux("show-options", "-qv", "-t", host, "@backlog_workspace_footer_pane");
				const editDeliveredAt = await requestRapidInput("rapid-edit");
				await waitFor(async () => {
					const output = await captureTaskPane();
					return (
						output.includes("Second native task") && !output.includes("Open task") && !output.includes("Completed task")
					);
				}, captureTaskPane);
				const editLatencyMs = Date.now() - editDeliveredAt;
				console.log(`rapid footer edit filter latency: ${editLatencyMs}ms`);
				expect(editLatencyMs).toBeLessThan(1_000);
				expect((await tmux("capture-pane", "-p", "-t", footerPane)).stdout).toContain(" / Second native");
				expect(await requireTmux("display-message", "-p", "-t", footerPane, "#{cursor_x}")).toBe("16");

				const clearDeliveredAt = await requestRapidInput("rapid-clear");
				await waitFor(async () => {
					const output = await captureTaskPane();
					return (
						output.includes("Second native task") && output.includes("Open task") && output.includes("Completed task")
					);
				}, captureTaskPane);
				const clearLatencyMs = Date.now() - clearDeliveredAt;
				console.log(`rapid footer clear filter latency: ${clearLatencyMs}ms`);
				expect(clearLatencyMs).toBeLessThan(1_000);
				expect(await requireTmux("display-message", "-p", "-t", footerPane, "#{cursor_x}")).toBe("3");
				await requestClientKey("enter");
				await waitFor(async () => !(await workspaceFooterEditing()) && (await taskPaneFocused()), captureTaskPane);
				const normalHints = await tmux("capture-pane", "-p", "-t", footerPane);
				expect(normalHints.stdout).toContain("[N] New");
				expect(normalHints.stdout).toContain("[Shift+B] Board");
				expect(normalHints.stdout).toContain("[Q] Close");

				await requestClientKey("footer-search");
				await waitFor(workspaceFooterEditing, captureTaskPane);
				await requestRapidInput("rapid-edit");
				await waitFor(async () => (await captureTaskPane()).includes("Second native task"), captureTaskPane);
				await writeFile(stepPath, "escape");
				await waitFor(
					async () =>
						(await Bun.file(acknowledgementPath)
							.text()
							.catch(() => "")) === "escape",
					async () =>
						`acknowledgement=${await Bun.file(acknowledgementPath)
							.text()
							.catch(() => "(none)")}`,
				);
				await waitFor(
					async () =>
						!(await workspaceFooterEditing()) &&
						(await taskPaneFocused()) &&
						(await captureTaskPane()).includes("Open task"),
					captureTaskPane,
				);
				expect((await tmux("capture-pane", "-p", "-t", footerPane)).stdout).toContain("[N] New");
				await requestClientKey("footer-search");
				await waitFor(workspaceFooterEditing, captureTaskPane);
				await requestClientKey("first-character");
				await waitFor(
					async () =>
						(await tmux("capture-pane", "-p", "-t", footerPane)).stdout.includes(" / S") &&
						(await requireTmux("display-message", "-p", "-t", footerPane, "#{cursor_x}")) === "4",
					async () => (await tmux("capture-pane", "-p", "-t", footerPane)).stdout,
				);
				await writeFile(stepPath, "escape");
				await waitFor(
					async () =>
						(await Bun.file(acknowledgementPath)
							.text()
							.catch(() => "")) === "escape",
					async () =>
						`acknowledgement=${await Bun.file(acknowledgementPath)
							.text()
							.catch(() => "(none)")}`,
				);
				await waitFor(async () => !(await workspaceFooterEditing()) && (await taskPaneFocused()), captureTaskPane);
				await requestClientKey("footer-search");
				await waitFor(workspaceFooterEditing, captureTaskPane);
				await requestRapidInput("rapid-edit");
				await requestClientKey("enter");
				await waitFor(async () => !(await workspaceFooterEditing()) && (await taskPaneFocused()), captureTaskPane);
				await requestClientKey("footer-search");
				await waitFor(workspaceFooterEditing, captureTaskPane);
				await requestRapidInput("rapid-clear");
				await requestClientKey("first-character");
				await requireTmux("resize-window", "-t", `${host}:Workspace`, "-x", "140", "-y", "40");
				await waitFor(
					async () =>
						(await workspaceFooterEditing()) &&
						(await tmux("capture-pane", "-p", "-t", footerPane)).stdout.includes(" / S"),
					async () => (await tmux("capture-pane", "-p", "-t", footerPane)).stdout,
				);
				await requestClientKey("escape");
				await waitFor(
					async () =>
						!(await workspaceFooterEditing()) &&
						(await taskPaneFocused()) &&
						(await tmux("capture-pane", "-p", "-t", footerPane)).stdout.includes("Search: Second native"),
					captureTaskPane,
				);
				await requestClientKey("footer-search");
				await waitFor(workspaceFooterEditing, captureTaskPane);
				await requestRapidInput("rapid-clear");
				await requestClientKey("enter");
				await waitFor(async () => !(await workspaceFooterEditing()) && (await taskPaneFocused()), captureTaskPane);
				await requestClientKey("footer-search");
				await waitFor(workspaceFooterEditing, captureTaskPane);
				await requestClientKey("query");
				await waitFor(async () => {
					const output = await captureTaskPane();
					return (
						doneHeadings(output) === 1 &&
						output.includes("Done (0)") &&
						!output.includes("Completed task") &&
						!output.includes("Open task")
					);
				}, captureTaskPane);

				await requestClientKey("clear");
				await waitFor(async () => {
					const output = await captureTaskPane();
					return (
						doneHeadings(output) === 1 &&
						output.includes("Done (1)") &&
						output.includes("Completed task") &&
						output.includes("Open task")
					);
				}, captureTaskPane);
				for (let cycle = 0; cycle < 2; cycle += 1) {
					await requestClientKey("query");
					await waitFor(async () => {
						const output = await captureTaskPane();
						return doneHeadings(output) === 1 && output.includes("Done (0)") && !output.includes("Completed task");
					}, captureTaskPane);
					await requestClientKey("clear");
					await waitFor(async () => {
						const output = await captureTaskPane();
						return doneHeadings(output) === 1 && output.includes("Done (1)") && output.includes("Completed task");
					}, captureTaskPane);
				}
				await requireTmux("resize-window", "-t", `${host}:Workspace`, "-x", "100", "-y", "30");
				await waitFor(
					async () =>
						doneHeadings(await captureTaskPane()) === 1 &&
						(await captureTaskPane()).match(/-\s+Done \(1\)/g)?.length === 1,
					captureTaskPane,
				);

				await requestClientKey("enter");
				await waitFor(
					async () => !(await workspaceFooterEditing()) && (await taskPaneFocused()),
					async () =>
						`footerEditing=${await workspaceFooterEditing()}\ntaskPaneFocused=${await taskPaneFocused()}\n${await captureTaskPane()}`,
				);
				await requestClientKey("q");
				const exitCode = await Promise.race([
					runningClient.exited,
					timeoutSignal(15_000, () => runningClient.kill()).catch(() => -1),
				]);
				if (exitCode !== 0) {
					const stderr = runningClient.stderr ? await new Response(runningClient.stderr).text() : "";
					throw new Error(`Interactive client exited with ${exitCode}.\n${stderr}`);
				}
			} finally {
				if (client?.exitCode === null) {
					client.kill();
					await Promise.race([client.exited, timeoutSignal(1_000, () => {})]).catch(() => undefined);
				}
				await tmux("kill-server");
				await safeCleanup(directory);
			}
		},
		30_000,
	);
});
