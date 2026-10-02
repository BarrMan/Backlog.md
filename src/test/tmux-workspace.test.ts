import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isTmuxWorkspace, TmuxWorkspace, type TmuxWorkspaceRunner } from "../agent-workspace/tmux-workspace.ts";

class RecordingRunner implements TmuxWorkspaceRunner {
	readonly calls: string[][] = [];
	readonly options = new Map<string, string>();
	readonly paneHeights = new Map<string, number>();
	readonly paneWidths = new Map<string, number>();
	readonly deadPanes = new Set<string>();
	readonly missingPanes = new Set<string>();
	readonly paneMetadata = new Map<string, Record<string, string>>();
	clients = "";
	#nextPane = 3;
	#locks = new Set<string>();
	#waiters = new Map<string, (() => void)[]>();
	#signals = new Set<string>();
	async run(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		this.calls.push(args);
		if (args[1] === "wait-for") {
			for (let index = 2; index < args.length; ) {
				const option = args[index] ?? "";
				const hasOption = option.startsWith("-");
				const name = args[index + (hasOption ? 1 : 0)] as string;
				if (option === "-S") {
					const waiter = this.#waiters.get(name)?.shift();
					if (waiter) waiter();
					else this.#signals.add(name);
				} else if (option === "-L") {
					if (this.#locks.has(name))
						await new Promise<void>((resolve) => {
							const waiters = this.#waiters.get(name) ?? [];
							waiters.push(resolve);
							this.#waiters.set(name, waiters);
						});
					else this.#locks.add(name);
				} else if (option === "-U") {
					const waiter = this.#waiters.get(name)?.shift();
					if (waiter) waiter();
					else this.#locks.delete(name);
				} else if (this.#signals.delete(name)) {
					// Signals sent before a wait are retained by tmux.
				} else
					await new Promise<void>((resolve) => {
						const waiters = this.#waiters.get(name) ?? [];
						waiters.push(resolve);
						this.#waiters.set(name, waiters);
					});
				index += hasOption ? 2 : 1;
				if (args[index] === ";") index += 2;
			}
			return { exitCode: 0, stdout: "", stderr: "" };
		}
		if (args[1] === "new-session") return { exitCode: 0, stdout: "@1|%1\n", stderr: "" };
		if (args[1] === "new-window") return { exitCode: 0, stdout: "@2|%2\n", stderr: "" };
		if (args[1] === "list-windows") return { exitCode: 0, stdout: "@1\n@2\n", stderr: "" };
		if (args[1] === "split-window") return { exitCode: 0, stdout: `%${this.#nextPane++}\n`, stderr: "" };
		if (args[1] === "has-session") return { exitCode: this.options.has("session") ? 0 : 1, stdout: "", stderr: "" };
		if (args[1] === "list-panes") {
			const rows = [...this.paneMetadata.entries()].map(([pane, metadata]) =>
				[
					pane,
					this.deadPanes.has(pane) ? "1" : "0",
					metadata["@backlog_root"] ?? "",
					metadata["@backlog_task"] ?? "",
					metadata["@backlog_session"] ?? "",
					metadata["@backlog_role"] ?? "",
				].join("\t"),
			);
			return { exitCode: 0, stdout: `${rows.join("\n")}\n`, stderr: "" };
		}
		if (args[1] === "show-options") {
			const value = this.options.get(args.at(-1) as string);
			return { exitCode: value ? 0 : 1, stdout: value ? `${value}\n` : "", stderr: "" };
		}
		if (args[1] === "set-option") {
			this.options.set("session", "yes");
			if (args.includes("-p")) {
				const pane = args[args.indexOf("-t") + 1] ?? "";
				const metadata = this.paneMetadata.get(pane) ?? {};
				metadata[args.at(-2) as string] = args.at(-1) as string;
				this.paneMetadata.set(pane, metadata);
			} else if (!args.includes("-qu")) this.options.set(args.at(-2) as string, args.at(-1) as string);
			else this.options.delete(args.at(-1) as string);
		}
		if (args[1] === "display-message") {
			const target = args[args.indexOf("-t") + 1];
			const format = args.at(-1);
			if (target && this.missingPanes.has(target)) return { exitCode: 0, stdout: "\n", stderr: "" };
			if (format === "#{pane_id}")
				return { exitCode: 0, stdout: target?.startsWith("%") ? `${target}\n` : "%9\n", stderr: "" };
			if (format === "#{pane_id} #{pane_dead}")
				return {
					exitCode: 0,
					stdout: `${target} ${this.deadPanes.has(target ?? "") ? "1" : "0"}\n`,
					stderr: "",
				};
			if (format === "#{pane_width} #{pane_height}")
				return {
					exitCode: 0,
					stdout: `${this.paneWidths.get(target ?? "") ?? 80} ${this.paneHeights.get(target ?? "") ?? 24}\n`,
					stderr: "",
				};
			if (format === "#{pane_height}")
				return { exitCode: 0, stdout: `${this.paneHeights.get(target ?? "") ?? 0}\n`, stderr: "" };
			if (format === "#{pane_dead}")
				return { exitCode: 0, stdout: this.deadPanes.has(target ?? "") ? "1\n" : "0\n", stderr: "" };
			return { exitCode: 0, stdout: "0\n", stderr: "" };
		}
		const pane = args[args.indexOf("-t") + 1];
		if (args[1] === "respawn-pane" && pane) this.deadPanes.delete(pane);
		if (args[1] === "resize-pane" && pane) this.paneHeights.set(pane, Number(args.at(-1)));
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
		const returnBinding = commands.find((command) => command.includes("bind-key") && command.includes(" C-q "));
		expect(returnBinding).toContain("select-pane -t %4");
		expect(returnBinding).not.toContain("select-pane -t %2");
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

	it("returns the displayed agent to its backing slot before showing another metadata-selected agent", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		runner.paneMetadata.set("%42", {
			"@backlog_root": workspace.rootPath,
			"@backlog_task": "TASK-1",
			"@backlog_session": "session-1",
			"@backlog_role": "agent",
		});
		runner.paneMetadata.set("%43", {
			"@backlog_root": workspace.rootPath,
			"@backlog_task": "TASK-2",
			"@backlog_session": "session-2",
			"@backlog_role": "agent",
		});
		runner.paneWidths.set("%6", 100);
		runner.paneHeights.set("%6", 12);
		await workspace.showAgentSession("TASK-1", "session-1");
		await workspace.showAgentSession("TASK-2", "session-2");
		const resizes = runner.calls.filter((args) => args[1] === "resize-window");
		expect(resizes).toEqual([
			["tmux", "resize-window", "-t", "%42", "-x", "100", "-y", "12"],
			["tmux", "resize-window", "-t", "%43", "-x", "100", "-y", "12"],
		]);
		const swaps = runner.calls.filter((args) => args[1] === "swap-pane");
		expect(swaps).toEqual([
			["tmux", "swap-pane", "-d", "-s", "%42", "-t", "%6"],
			["tmux", "swap-pane", "-d", "-s", "%42", "-t", "%6"],
			["tmux", "swap-pane", "-d", "-s", "%43", "-t", "%6"],
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

	it("resizes when a cached region height differs from the physical pane", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		await workspace.resizeFooter(2);
		runner.paneHeights.set("%3", 1);
		runner.calls.length = 0;
		await workspace.resizeFooter(2);
		expect(runner.calls).toContainEqual(["tmux", "resize-pane", "-t", "%3", "-y", "2"]);
	});

	it("respawns the footer before focusing workspace search", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.deadPanes.add("%3");
		runner.calls.length = 0;
		await workspace.focusSearch();
		const respawn = runner.calls.findIndex((args) => args[1] === "respawn-pane" && args.includes("%3"));
		const select = runner.calls.findIndex((args) => args[1] === "select-pane" && args.includes("%3"));
		expect(respawn).toBeGreaterThanOrEqual(0);
		expect(select).toBeGreaterThan(respawn);
		expect(runner.calls).toContainEqual(["tmux", "send-keys", "-t", "%3", "/"]);
	});

	it("rebuilds a stale footer before focusing workspace search", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.missingPanes.add("%3");
		runner.calls.length = 0;
		await workspace.focusSearch();
		expect(runner.calls).toContainEqual(["tmux", "kill-window", "-t", "@2"]);
		expect(runner.calls).toContainEqual(["tmux", "select-pane", "-t", "%7"]);
		expect(runner.calls).toContainEqual(["tmux", "send-keys", "-t", "%7", "/"]);
		expect(runner.calls).not.toContainEqual(["tmux", "select-pane", "-t", "%3"]);
	});

	it("rebuilds a stale footer before showing the workspace", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.missingPanes.add("%3");
		runner.calls.length = 0;
		await workspace.showWorkspace();
		expect(runner.calls).toContainEqual(["tmux", "kill-window", "-t", "@2"]);
		expect(runner.calls).toContainEqual(["tmux", "select-pane", "-t", "%8"]);
		expect(runner.calls).not.toContainEqual(["tmux", "respawn-pane", "-k", "-t", "%3"]);
	});

	it("rejects invalid workspace region heights", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.calls.length = 0;
		await expect(workspace.resizeNavigation(Number.NaN)).rejects.toThrow("positive finite number");
		await expect(workspace.resizeFooter(Number.POSITIVE_INFINITY)).rejects.toThrow("positive finite number");
		await expect(workspace.resizeNavigation(0)).rejects.toThrow("positive finite number");
		expect(runner.calls.some((args) => args[1] === "resize-pane")).toBe(false);
	});

	it("preserves valid measured heights when rebuilding workspace panes", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		await workspace.resizeNavigation(4);
		await workspace.resizeFooter(2);
		runner.options.delete("@backlog_workspace_tasks_pane");
		runner.calls.length = 0;
		await workspace.showWorkspace();
		expect(runner.calls.filter((args) => args[1] === "resize-pane")).toEqual([
			["tmux", "resize-pane", "-t", "%2", "-y", "4"],
			["tmux", "resize-pane", "-t", "%7", "-y", "2"],
		]);
	});

	it("serializes concurrent workspace state updates", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		await Promise.all([
			workspace.updateWorkspaceState<{ filters?: { status: string }; search?: string }>((state) => ({
				...state,
				filters: { status: "in-progress" },
			})),
			workspace.updateWorkspaceState<{ filters?: { status: string }; search?: string }>((state) => ({
				...state,
				search: "tmux",
			})),
		]);
		expect(await workspace.workspaceState()).toEqual({ filters: { status: "in-progress" }, search: "tmux" });
	});

	it("notifies each state subscriber and releases waits during teardown", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		const first: string[] = [];
		const second: string[] = [];
		const stopFirst = await workspace.subscribeWorkspaceState<{ search?: string }>((state) => {
			first.push(state.search ?? "");
		});
		const stopSecond = await workspace.subscribeWorkspaceState<{ search?: string }>((state) => {
			second.push(state.search ?? "");
		});
		runner.calls.length = 0;
		await workspace.updateWorkspaceState((state: { search?: string }) => ({ ...state, search: "latest" }));
		expect(runner.calls.filter((args) => args[1] === "wait-for" && args[2] === "-S")).toEqual([
			["tmux", "wait-for", "-S", expect.any(String), ";", "wait-for", "-S", expect.any(String)],
		]);
		await Bun.sleep(0);
		expect(first).toEqual(["", "latest"]);
		expect(second).toEqual(["", "latest"]);
		await stopFirst();
		await workspace.updateWorkspaceState((state: { search?: string }) => ({ ...state, search: "next" }));
		await Bun.sleep(0);
		expect(first).toEqual(["", "latest"]);
		expect(second).toEqual(["", "latest", "next"]);
		await stopSecond();
	});

	it("does not broadcast an unchanged serialized workspace state", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		await workspace.updateWorkspaceState((state: { search?: string }) => state);
		await workspace.subscribeWorkspaceState(() => {});
		runner.calls.length = 0;
		await workspace.updateWorkspaceState((state: { search?: string }) => state);
		expect(
			runner.calls.some((args) => args[1] === "set-option" && args.at(-2) === "@backlog_workspace_view_state"),
		).toBe(false);
		expect(runner.calls.some((args) => args[1] === "wait-for" && args[2] === "-S")).toBe(false);
	});

	it("removes a rejected initial subscriber without leaving a listener channel", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		await expect(workspace.subscribeWorkspaceState(() => Promise.reject(new Error("listener failed")))).rejects.toThrow(
			"listener failed",
		);
		expect(runner.options.get("@backlog_workspace_view_state_listeners")).toBe("[]");
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
		expect(runner.calls).toContainEqual([
			"tmux",
			"bind-key",
			"-T",
			`backlog-workspace-${workspace.sessionName.split("-").at(-1)}`,
			"C-q",
			"if-shell",
			"-F",
			"#{==:#{window_id},@2}",
			"if-shell -F '#{window_zoomed_flag}' 'resize-pane -Z; select-pane -t %8' 'select-pane -t %8'",
			"",
		]);
	});

	it("detaches the client from either owned UI pane", async () => {
		const runner = new RecordingRunner();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showBoard();
		for (const pane of ["%1", "%2", "%3", "%4", "%5"]) {
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
		"recreates a deleted Workspace window without removing Board",
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
				const removed = await runner.run([
					"tmux",
					"show-options",
					"-qv",
					"-t",
					workspace.sessionName,
					"@backlog_workspace_window",
				]);
				expect(removed.exitCode).toBe(0);
				await runner.run(["tmux", "kill-window", "-t", removed.stdout.trim()]);
				const afterRemoval = await runner.run([
					"tmux",
					"list-windows",
					"-t",
					workspace.sessionName,
					"-F",
					"#{window_name}:#{window_panes}",
				]);
				expect(afterRemoval.stdout.trim()).toBe("Board:1");

				await workspace.showWorkspace();
				const rebuilt = await runner.run([
					"tmux",
					"list-windows",
					"-t",
					workspace.sessionName,
					"-F",
					"#{window_name}:#{window_panes}",
				]);
				expect(rebuilt.exitCode).toBe(0);
				expect(rebuilt.stdout.split("\n")).toEqual(expect.arrayContaining(["Board:1", "Workspace:5"]));
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
				const placeholderCommand = "exec sleep 60";
				const agent = async (name: string, taskId: string, sessionId: string, rootPath = host.rootPath) => {
					const pane = (
						await runner.run(["tmux", "new-session", "-d", "-P", "-F", "#{pane_id}", "-s", name, placeholderCommand])
					).stdout.trim();
					for (const [option, value] of [
						["@backlog_root", rootPath],
						["@backlog_task", taskId],
						["@backlog_session", sessionId],
						["@backlog_role", "agent"],
					] as const)
						await runner.run(["tmux", "set-option", "-p", "-t", pane, option, value]);
					return pane;
				};
				const a = await agent("agent-a", "TASK-1", "session-a");
				await agent("agent-b", "TASK-2", "session-b");
				await host.showAgentSession("TASK-1", "session-a");
				await host.showAgentSession("TASK-1", "session-a");
				const current = await runner.run(["tmux", "display-message", "-p", "-t", host.sessionName, "#{window_name}"]);
				expect(current.stdout.trim()).toBe("Board");
				await host.showWorkspace();
				const tasks = (
					await runner.run(["tmux", "show-options", "-qv", "-t", host.sessionName, "@backlog_workspace_tasks_pane"])
				).stdout.trim();
				const selectedWorkspacePane = async () =>
					(
						await runner.run([
							"tmux",
							"list-panes",
							"-t",
							`${host.sessionName}:Workspace`,
							"-F",
							"#{pane_id}:#{pane_active}",
						])
					).stdout
						.split("\n")
						.find((pane) => pane.endsWith(":1"))
						?.slice(0, -2);
				expect(await selectedWorkspacePane()).toBe(tasks);
				await host.showAgentSession("TASK-2", "session-b");
				expect(await selectedWorkspacePane()).toBe(tasks);
				await host.showAgentSession("TASK-1", "session-a");
				expect(await selectedWorkspacePane()).toBe(tasks);
				await host.focusAgent(true);
				await host.focusAgent(false);
				const selected = await runner.run(["tmux", "display-message", "-p", "-t", host.sessionName, "#{pane_id}"]);
				expect(selected.stdout.trim()).toBe(a);
				await host.showAgentSession("TASK-2", "session-b");
				await host.showAgentSession("TASK-1", "session-a");
				await runner.run(["tmux", "kill-pane", "-t", a]);
				await host.showAgentSession(undefined);
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
				await agent("agent-c", "TASK-3", "session-c", second.rootPath);
				await expect(host.showAgentSession("TASK-3", "session-c")).rejects.toThrow("no longer exists");
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
