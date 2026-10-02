import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "libtmux";
import { isTmuxWorkspace, TmuxWorkspace, type TmuxWorkspaceServer } from "../agent-workspace/tmux-workspace.ts";

async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	throw new Error(`Timed out waiting for ${message}`);
}

class RecordingTmuxServer implements TmuxWorkspaceServer {
	readonly calls: string[][] = [];
	readonly options = new Map<string, string>();
	readonly paneHeights = new Map<string, number>();
	readonly paneWidths = new Map<string, number>();
	readonly deadPanes = new Set<string>();
	readonly missingPanes = new Set<string>();
	readonly paneMetadata = new Map<string, Record<string, string>>();
	readonly paneWindows = new Map<string, string>();
	clients = "";
	#nextPane = 3;
	#locks = new Set<string>();
	#waiters = new Map<string, (() => void)[]>();
	#signals = new Set<string>();
	async hasSession(name: string): Promise<boolean> {
		this.calls.push(["hasSession", name]);
		return this.options.has("session");
	}
	private paneHandle(id: string) {
		return {
			id,
			split: async (options: { direction?: string; size?: string | number; shellCommand?: string } = {}) => {
				this.calls.push(["split", id, options.direction ?? "", String(options.size ?? ""), options.shellCommand ?? ""]);
				const pane = `%${this.#nextPane++}`;
				this.paneWindows.set(pane, this.paneWindows.get(id) ?? "@2");
				return this.paneHandle(pane);
			},
		};
	}
	private windowHandle(id: string, pane: string) {
		return { id, activePane: this.paneHandle(pane) };
	}
	private sessionHandle() {
		return {
			activeWindow: this.windowHandle("@1", "%1"),
			activePane: this.paneHandle("%1"),
			newWindow: async (options: { startDirectory?: string; shellCommand?: string } = {}) => {
				this.calls.push(["newWindow", options.startDirectory ?? "", options.shellCommand ?? ""]);
				this.paneWindows.set("%2", "@2");
				return this.windowHandle("@2", "%2");
			},
		};
	}
	async newSession(options: { name: string; startDirectory: string; shellCommand: string }) {
		this.calls.push(["newSession", options.name, options.startDirectory, options.shellCommand]);
		this.options.set("session", "yes");
		this.paneWindows.set("%1", "@1");
		return this.sessionHandle();
	}
	async sessions() {
		return { where: ({ name }: { name: string }) => ({ first: () => (name ? this.sessionHandle() : undefined) }) };
	}
	async panes() {
		return {
			where: ({ id }: { id: string }) => ({
				first: () => (this.paneWindows.has(id) ? this.paneHandle(id) : undefined),
			}),
		};
	}
	async cmd(command: string, args: readonly string[] = []): Promise<readonly string[]> {
		const result = await this.run([command, ...args]);
		if (!result.stdout) return [];
		return (result.stdout.endsWith("\n") ? result.stdout.slice(0, -1) : result.stdout).split("\n");
	}
	async run(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		this.calls.push(args);
		if (args[0] === "wait-for") {
			for (let index = 1; index < args.length; ) {
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
		if (args[0] === "new-session") {
			this.paneWindows.set("%1", "@1");
			return { exitCode: 0, stdout: "@1|%1\n", stderr: "" };
		}
		if (args[0] === "list-windows") return { exitCode: 0, stdout: "@1\n@2\n", stderr: "" };
		if (args[0] === "has-session") return { exitCode: this.options.has("session") ? 0 : 1, stdout: "", stderr: "" };
		if (args[0] === "list-panes") {
			const rows = [...this.paneMetadata.entries()].map(([pane, metadata]) =>
				[
					pane,
					this.deadPanes.has(pane) ? "1" : "0",
					this.paneWindows.get(pane) ?? "@agent",
					metadata["@backlog_root"] ?? "",
					metadata["@backlog_task"] ?? "",
					metadata["@backlog_role"] ?? "",
				].join("\t"),
			);
			return { exitCode: 0, stdout: `${rows.join("\n")}\n`, stderr: "" };
		}
		if (args[0] === "show-options") {
			const value = this.options.get(args.at(-1) as string);
			return { exitCode: value ? 0 : 1, stdout: value ? `${value}\n` : "", stderr: "" };
		}
		if (args[0] === "set-option") {
			this.options.set("session", "yes");
			if (args.includes("-p")) {
				const pane = args[args.indexOf("-t") + 1] ?? "";
				const metadata = this.paneMetadata.get(pane) ?? {};
				metadata[args.at(-2) as string] = args.at(-1) as string;
				this.paneMetadata.set(pane, metadata);
			} else if (!args.includes("-qu")) this.options.set(args.at(-2) as string, args.at(-1) as string);
			else this.options.delete(args.at(-1) as string);
		}
		if (args[0] === "display-message") {
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
			if (format === "#{window_id}")
				return { exitCode: 0, stdout: `${this.paneWindows.get(target ?? "") ?? "@2"}\n`, stderr: "" };
			if (format === "#{pane_height}")
				return { exitCode: 0, stdout: `${this.paneHeights.get(target ?? "") ?? 0}\n`, stderr: "" };
			if (format === "#{pane_dead}")
				return { exitCode: 0, stdout: this.deadPanes.has(target ?? "") ? "1\n" : "0\n", stderr: "" };
			return { exitCode: 0, stdout: "0\n", stderr: "" };
		}
		const pane = args[args.indexOf("-t") + 1];
		if (args[0] === "swap-pane") {
			const source = args[args.indexOf("-s") + 1] ?? "";
			const target = args[args.indexOf("-t") + 1] ?? "";
			const sourceWindow = this.paneWindows.get(source);
			const targetWindow = this.paneWindows.get(target);
			if (sourceWindow) this.paneWindows.set(target, sourceWindow);
			if (targetWindow) this.paneWindows.set(source, targetWindow);
		}
		if (args[0] === "break-pane") {
			const source = args[args.indexOf("-s") + 1] ?? "";
			if (source) this.paneWindows.set(source, "@parked");
		}
		if (args[0] === "respawn-pane" && pane) this.deadPanes.delete(pane);
		if (args[0] === "resize-pane" && pane) this.paneHeights.set(pane, Number(args.at(-1)));
		if (args[0] === "resize-window" && pane?.startsWith("%")) {
			this.paneWidths.set(pane, Number(args[args.indexOf("-x") + 1]));
			this.paneHeights.set(pane, Number(args[args.indexOf("-y") + 1]));
		}
		if (args[0] === "list-clients") return { exitCode: 0, stdout: this.clients, stderr: "" };
		return { exitCode: 0, stdout: "", stderr: "" };
	}
}

describe("TmuxWorkspace", () => {
	it("creates only an owned Board/Workspace host with a scoped Ctrl+Q table", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showBoard();
		const commands = runner.calls.map((args) => args.join(" "));
		const returnBinding = commands.find((command) => command.includes("bind-key") && command.includes(" C-q "));
		expect(returnBinding).toContain("select-pane -t %4");
		expect(returnBinding).not.toContain("select-pane -t %2");
		expect(runner.calls).toContainEqual([
			"newSession",
			workspace.sessionName,
			workspace.rootPath,
			"exec sleep 2147483647",
		]);
		expect(commands).toContain("rename-window -t @1 Board");
		expect(commands).toContain(`newWindow ${workspace.rootPath} exec sleep 2147483647`);
		expect(commands).toContain("split %2 BELOW 1% exec sleep 2147483647");
		expect(commands).toContain("split %2 BELOW 90% exec sleep 2147483647");
		expect(commands).toContain("split %4 RIGHT 58% exec sleep 2147483647");
		expect(commands).toContain("split %5 BELOW 56% exec sleep 2147483647");
		expect(commands.some((command) => command.startsWith("new-window "))).toBe(false);
		expect(commands.some((command) => command.startsWith("split-window "))).toBe(false);
		expect(commands).toContain("resize-pane -t %2 -y 3");
		expect(commands).toContain("resize-pane -t %3 -y 1");
		expect(commands.some((command) => command.includes("bind-key -T backlog-workspace-"))).toBe(true);
		expect(commands.some((command) => command.includes("bind-key -T root"))).toBe(false);
	});

	it("preserves the configured tmux prefix in its scoped key table", async () => {
		const runner = new RecordingTmuxServer();
		runner.options.set("prefix", "C-a");
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showBoard();
		expect(runner.calls).toContainEqual([
			"bind-key",
			"-T",
			`backlog-workspace-${workspace.sessionName.split("-").at(-1)}`,
			"C-a",
			"switch-client",
			"-T",
			"prefix",
		]);
	});

	it("discovers live-preview panes by task and preserves the display backing slot", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		runner.paneMetadata.set("%42", {
			"@backlog_root": workspace.rootPath,
			"@backlog_task": "TASK-1",
			"@backlog_role": "live-preview",
		});
		runner.paneMetadata.set("%43", {
			"@backlog_root": workspace.rootPath,
			"@backlog_task": "TASK-2",
			"@backlog_role": "live-preview",
		});
		runner.paneMetadata.set("%44", {
			"@backlog_root": workspace.rootPath,
			"@backlog_task": "TASK-3",
			"@backlog_role": "live-preview",
		});
		runner.deadPanes.add("%44");
		runner.paneWindows.set("%42", "@agent");
		runner.paneWindows.set("%43", "@agent");
		runner.paneWindows.set("%44", "@agent");
		runner.paneWidths.set("%6", 100);
		runner.paneHeights.set("%6", 12);
		await workspace.showAgentSession("TASK-1", "session-1");
		await expect(workspace.showAgentSession("TASK-3", "session-3")).rejects.toThrow("no longer exists");
		await workspace.showAgentSession("TASK-2", "session-2");
		expect(runner.calls.some((args) => args[0] === "resize-window")).toBe(false);
		const swaps = runner.calls.filter((args) => args[0] === "swap-pane");
		expect(swaps).toEqual([
			["swap-pane", "-d", "-s", "%42", "-t", "%6"],
			["swap-pane", "-d", "-s", "%43", "-t", "%42"],
		]);
		expect(runner.calls.some((args) => args[0] === "break-pane")).toBe(false);
		expect(swaps.some((command) => command.includes("%44"))).toBe(false);
		expect(runner.options.get("@backlog_workspace_active_return_42")).toBeUndefined();
		expect(runner.options.get("@backlog_workspace_active_return_43")).toBeUndefined();
	});

	it("focuses tasks and resizes measured header and footer without repeated tmux resizes", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.calls.length = 0;
		await workspace.focusTasks();
		await workspace.resizeNavigation(4);
		await workspace.resizeNavigation(4);
		await workspace.resizeFooter(2);
		expect(runner.calls).toContainEqual(["select-pane", "-t", "%4"]);
		expect(runner.calls.filter((args) => args[0] === "resize-pane")).toEqual([
			["resize-pane", "-t", "%2", "-y", "4"],
			["resize-pane", "-t", "%3", "-y", "2"],
		]);
	});

	it("resizes when a cached region height differs from the physical pane", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		await workspace.resizeFooter(2);
		runner.paneHeights.set("%3", 1);
		runner.calls.length = 0;
		await workspace.resizeFooter(2);
		expect(runner.calls).toContainEqual(["resize-pane", "-t", "%3", "-y", "2"]);
	});

	it("respawns the footer before focusing workspace search", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.deadPanes.add("%3");
		runner.calls.length = 0;
		await workspace.focusSearch();
		const respawn = runner.calls.findIndex((args) => args[0] === "respawn-pane" && args.includes("%3"));
		const select = runner.calls.findIndex((args) => args[0] === "select-pane" && args.includes("%3"));
		expect(respawn).toBeGreaterThanOrEqual(0);
		expect(select).toBeGreaterThan(respawn);
		expect(runner.calls).toContainEqual(["send-keys", "-t", "%3", "/"]);
	});

	it("rebuilds a stale footer before focusing workspace search", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.missingPanes.add("%3");
		runner.calls.length = 0;
		await workspace.focusSearch();
		expect(runner.calls).toContainEqual(["kill-window", "-t", "@2"]);
		expect(runner.calls).toContainEqual(["select-pane", "-t", "%7"]);
		expect(runner.calls).toContainEqual(["send-keys", "-t", "%7", "/"]);
		expect(runner.calls).not.toContainEqual(["select-pane", "-t", "%3"]);
	});

	it("rebuilds a stale footer before showing the workspace", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.missingPanes.add("%3");
		runner.calls.length = 0;
		await workspace.showWorkspace();
		expect(runner.calls).toContainEqual(["kill-window", "-t", "@2"]);
		expect(runner.calls).toContainEqual(["select-pane", "-t", "%8"]);
		expect(runner.calls).not.toContainEqual(["respawn-pane", "-k", "-t", "%3"]);
	});

	it("rejects invalid workspace region heights", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.calls.length = 0;
		await expect(workspace.resizeNavigation(Number.NaN)).rejects.toThrow("positive finite number");
		await expect(workspace.resizeFooter(Number.POSITIVE_INFINITY)).rejects.toThrow("positive finite number");
		await expect(workspace.resizeNavigation(0)).rejects.toThrow("positive finite number");
		expect(runner.calls.some((args) => args[0] === "resize-pane")).toBe(false);
	});

	it("preserves valid measured heights when rebuilding workspace panes", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		await workspace.resizeNavigation(4);
		await workspace.resizeFooter(2);
		runner.options.delete("@backlog_workspace_tasks_pane");
		runner.calls.length = 0;
		await workspace.showWorkspace();
		expect(runner.calls.filter((args) => args[0] === "resize-pane")).toEqual([
			["resize-pane", "-t", "%2", "-y", "4"],
			["resize-pane", "-t", "%7", "-y", "2"],
		]);
	});

	it("serializes concurrent workspace state updates", async () => {
		const runner = new RecordingTmuxServer();
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
		const runner = new RecordingTmuxServer();
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
		expect(runner.calls.filter((args) => args[0] === "wait-for" && args[1] === "-S")).toEqual([
			["wait-for", "-S", expect.any(String), ";", "wait-for", "-S", expect.any(String)],
		]);
		await waitUntil(() => first.includes("latest") && second.includes("latest"), "state subscribers");
		expect(first).toEqual(["", "latest"]);
		expect(second).toEqual(["", "latest"]);
		await stopFirst();
		await workspace.updateWorkspaceState((state: { search?: string }) => ({ ...state, search: "next" }));
		await waitUntil(() => second.includes("next"), "remaining state subscriber");
		expect(first).toEqual(["", "latest"]);
		expect(second).toEqual(["", "latest", "next"]);
		await stopSecond();
	});

	it("does not broadcast an unchanged serialized workspace state", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		await workspace.updateWorkspaceState((state: { search?: string }) => state);
		await workspace.subscribeWorkspaceState(() => {});
		runner.calls.length = 0;
		await workspace.updateWorkspaceState((state: { search?: string }) => state);
		expect(
			runner.calls.some((args) => args[0] === "set-option" && args.at(-2) === "@backlog_workspace_view_state"),
		).toBe(false);
		expect(runner.calls.some((args) => args[0] === "wait-for" && args[1] === "-S")).toBe(false);
	});

	it("removes a rejected initial subscriber without leaving a listener channel", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		await expect(workspace.subscribeWorkspaceState(() => Promise.reject(new Error("listener failed")))).rejects.toThrow(
			"listener failed",
		);
		expect(runner.options.get("@backlog_workspace_view_state_listeners")).toBe("[]");
	});

	it("consumes the task mailbox without an unconditional delete", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace("BACK-723");
		expect(await workspace.takeTaskRequest()).toBe("BACK-723");
		const consume = runner.calls.find((args) => args[0] === "if-shell");
		expect(consume).toContain("#{==:#{@backlog_workspace_task_request},BACK-723}");
	});

	it("accepts task requests containing dots", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace("BACK-723.1");
		expect(await workspace.takeTaskRequest()).toBe("BACK-723.1");
	});

	it("rebuilds an owned host missing native workspace panes", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showWorkspace();
		runner.options.delete("@backlog_workspace_tasks_pane");
		runner.calls.length = 0;
		await workspace.showWorkspace();
		expect(runner.calls).toContainEqual(["kill-window", "-t", "@2"]);
		expect(runner.calls.filter((args) => args[0] === "split")).toHaveLength(4);
		expect(runner.calls.filter((args) => args[0] === "split-window")).toHaveLength(0);
		expect(runner.calls).toContainEqual([
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
		const runner = new RecordingTmuxServer();
		const workspace = new TmuxWorkspace(process.cwd(), runner);
		await workspace.showBoard();
		for (const pane of ["%1", "%2", "%3", "%4", "%5"]) {
			runner.calls.length = 0;
			runner.clients = `/dev/ttys001|${pane}\n`;
			await workspace.detach();
			expect(runner.calls).toContainEqual(["detach-client", "-t", "/dev/ttys001"]);
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

function isolatedTmuxServer(socket: string): Server {
	return new Server({ socketName: socket, configFile: "/dev/null", environment: { ...process.env, TMUX: "" } });
}

async function removeTmuxSocket(socket: string): Promise<void> {
	if (process.getuid === undefined) return;
	await rm(`/private/tmp/tmux-${process.getuid()}/${socket}`, { force: true });
}

async function cmdOutput(server: Server, command: string, args: readonly string[] = []): Promise<string> {
	const lines = await server.cmd(command, args);
	return lines.length ? `${lines.join("\n")}\n` : "";
}

describe("TmuxWorkspace real tmux", () => {
	realTmux(
		"creates Board and Workspace windows on an isolated server",
		async () => {
			const directory = await mkdtemp(join(tmpdir(), "backlog-tmux-workspace-"));
			paths.push(directory);
			const socket = `backlog-workspace-${crypto.randomUUID().slice(0, 8)}`;
			const server = isolatedTmuxServer(socket);
			const workspace = new TmuxWorkspace(await realpath(directory), server);
			try {
				await workspace.showWorkspace();
				const listed = await cmdOutput(server, "list-windows", ["-t", workspace.sessionName, "-F", "#{window_name}"]);
				expect(listed.split("\n")).toEqual(expect.arrayContaining(["Board", "Workspace"]));
			} finally {
				await server.cmd("kill-server").catch(() => {});
				await removeTmuxSocket(socket);
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
			const server = isolatedTmuxServer(socket);
			const workspace = new TmuxWorkspace(await realpath(directory), server);
			try {
				await workspace.showWorkspace();
				const removed = await cmdOutput(server, "show-options", [
					"-qv",
					"-t",
					workspace.sessionName,
					"@backlog_workspace_window",
				]);
				await server.cmd("kill-window", ["-t", removed.trim()]);
				const afterRemoval = await cmdOutput(server, "list-windows", [
					"-t",
					workspace.sessionName,
					"-F",
					"#{window_name}:#{window_panes}",
				]);
				expect(afterRemoval.trim()).toBe("Board:1");

				await workspace.showWorkspace();
				const rebuilt = await cmdOutput(server, "list-windows", [
					"-t",
					workspace.sessionName,
					"-F",
					"#{window_name}:#{window_panes}",
				]);
				expect(rebuilt.split("\n")).toEqual(expect.arrayContaining(["Board:1", "Workspace:5"]));
			} finally {
				await server.cmd("kill-server").catch(() => {});
				await removeTmuxSocket(socket);
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
			const server = isolatedTmuxServer(socket);
			const host = new TmuxWorkspace(await realpath(directory), server);
			try {
				await host.showBoard();
				const placeholderCommand = "exec sleep 60";
				const agent = async (name: string, taskId: string, _sessionId: string, rootPath = host.rootPath) => {
					const [pane = ""] = await server.cmd("new-session", [
						"-d",
						"-P",
						"-F",
						"#{pane_id}",
						"-s",
						name,
						placeholderCommand,
					]);
					for (const [option, value] of [
						["@backlog_root", rootPath],
						["@backlog_task", taskId],
						["@backlog_role", "live-preview"],
					] as const)
						await server.cmd("set-option", ["-p", "-t", pane, option, value]);
					return pane;
				};
				const a = await agent("agent-a", "TASK-1", "session-a");
				await agent("agent-b", "TASK-2", "session-b");
				await host.showAgentSession("TASK-1", "session-a");
				await host.showAgentSession("TASK-1", "session-a");
				const current = await cmdOutput(server, "display-message", ["-p", "-t", host.sessionName, "#{window_name}"]);
				expect(current.trim()).toBe("Board");
				await host.showWorkspace();
				const tasks = (
					await cmdOutput(server, "show-options", ["-qv", "-t", host.sessionName, "@backlog_workspace_tasks_pane"])
				).trim();
				const selectedWorkspacePane = async () =>
					(
						await cmdOutput(server, "list-panes", [
							"-t",
							`${host.sessionName}:Workspace`,
							"-F",
							"#{pane_id}:#{pane_active}",
						])
					)
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
				const selected = await cmdOutput(server, "display-message", ["-p", "-t", host.sessionName, "#{pane_id}"]);
				expect(selected.trim()).toBe(a);
				await host.showAgentSession("TASK-2", "session-b");
				await host.showAgentSession("TASK-1", "session-a");
				await server.cmd("kill-pane", ["-t", a]);
				await host.showAgentSession(undefined);
				const display = await cmdOutput(server, "show-options", [
					"-qv",
					"-t",
					host.sessionName,
					"@backlog_workspace_display_pane",
				]);
				expect(display.trim()).toStartWith("%");
				const secondDirectory = await mkdtemp(join(tmpdir(), "backlog-tmux-workspace-"));
				paths.push(secondDirectory);
				const second = new TmuxWorkspace(await realpath(secondDirectory), server);
				await second.showBoard();
				await agent("agent-c", "TASK-3", "session-c", second.rootPath);
				await expect(host.showAgentSession("TASK-3", "session-c")).rejects.toThrow("no longer exists");
				const secondCurrent = await cmdOutput(server, "display-message", [
					"-p",
					"-t",
					second.sessionName,
					"#{window_name}",
				]);
				expect(secondCurrent.trim()).toBe("Board");
			} finally {
				await server.cmd("kill-server").catch(() => {});
				await removeTmuxSocket(socket);
			}
		},
		10_000,
	);
});
