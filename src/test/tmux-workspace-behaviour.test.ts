/**
 * Characterisation tests for the destructive, policy-bearing half of the tmux workspace host.
 *
 * These assert what `src/agent-workspace/tmux-workspace.ts` does TODAY, so the encapsulation
 * refactor behind a tmux wrapper layer cannot quietly change teardown semantics. The behaviours
 * pinned here are the ones a bug already broke once: a `kill-session` on the wrong path destroys
 * the user's live view, and the same call against the *default* socket destroys every unrelated
 * session on the machine.
 *
 * Everything below runs against a recording fake — argv is captured, no tmux server is ever
 * contacted, and no real process is signalled.
 */

import { describe, expect, it } from "bun:test";
import { TmuxCommandError } from "libtmux";
import { TmuxWorkspace, type TmuxWorkspaceServer } from "../agent-workspace/tmux-workspace.ts";

const OWNER = "@backlog_workspace_owner";
const OWNER_PID = "@backlog_workspace_owner_pid";
const READY = "@backlog_workspace_ready";
const WORKSPACE_WINDOW = "@backlog_workspace_window";

/**
 * A pid above every real pid: signalling it always fails harmlessly, so the fake can stand in for
 * "a pane process is running" without the test ever touching the developer's process table.
 */
const FOREIGN_PANE_PID = 0x7ffff001;

type Result = { exitCode: number; stdout: string; stderr: string };
type SplitOptions = { direction?: string; size?: string | number; shellCommand?: string };
type PaneHandle = { id: string; split: (options?: SplitOptions) => Promise<PaneHandle> };
type WindowHandle = { id: string; activePane: PaneHandle };
type SessionHandle = {
	activeWindow?: WindowHandle;
	activePane?: PaneHandle;
	newWindow: (options?: { startDirectory?: string; shellCommand?: string }) => Promise<WindowHandle>;
};

/**
 * A tmux server that records argv instead of running it. Mirrors `RecordingTmuxServer` in
 * `tmux-workspace.test.ts`; only the teardown-relevant responses are reproduced here.
 */
class RecordingTmuxServer implements TmuxWorkspaceServer {
	readonly calls: string[][] = [];
	readonly options = new Map<string, string>();
	readonly paneWindows = new Map<string, string>();
	readonly panePids = new Map<string, number>();
	clients = "";
	sessionName = "backlog-workspace-test";
	missingPanes = new Set<string>();
	/** Overrides the `kill-session` reply so the "server already gone" paths can be exercised. */
	killSessionResult: Result | undefined;
	#nextPane = 3;

	async hasSession(name: string): Promise<boolean> {
		this.calls.push(["hasSession", name]);
		return this.options.has("session");
	}
	private paneHandle(id: string): PaneHandle {
		return {
			id,
			split: async (options: SplitOptions = {}) => {
				this.calls.push(["split", id, options.direction ?? "", String(options.size ?? ""), options.shellCommand ?? ""]);
				const pane = `%${this.#nextPane++}`;
				this.paneWindows.set(pane, this.paneWindows.get(id) ?? "@2");
				return this.paneHandle(pane);
			},
		};
	}
	private windowHandle(id: string, pane: string): WindowHandle {
		return { id, activePane: this.paneHandle(pane) };
	}
	private sessionHandle(): SessionHandle {
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
	async newSession(options: { name: string; startDirectory: string; shellCommand: string }): Promise<SessionHandle> {
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
		// libtmux raises on a non-zero exit; TmuxWorkspace converts that back into a result.
		// Modelling the raise is what makes an exit code mean anything to the code under test.
		if (result.exitCode !== 0)
			throw new TmuxCommandError({
				args: [command, ...args],
				exitCode: result.exitCode,
				stderr: result.stderr.split("\n").filter(Boolean),
				stdout: result.stdout.split("\n").filter(Boolean),
			});
		if (!result.stdout) return [];
		return (result.stdout.endsWith("\n") ? result.stdout.slice(0, -1) : result.stdout).split("\n");
	}
	async run(args: string[]): Promise<Result> {
		this.calls.push(args);
		const ok = (stdout = ""): Result => ({ exitCode: 0, stdout, stderr: "" });
		const target = () => args[args.indexOf("-t") + 1] ?? "";
		switch (args[0]) {
			case "new-session":
				return ok("@1|%1\n");
			case "list-windows":
				return ok("@1\n@2\n");
			case "has-session":
				return this.options.has("session") ? ok() : { exitCode: 1, stdout: "", stderr: "" };
			case "list-panes":
				if (args.includes("#{pane_pid}")) return ok([...this.panePids.values()].map((pid) => `${pid}\n`).join(""));
				return ok();
			case "capture-pane":
				return ok();
			case "kill-session": {
				// A kill that failed for any reason *other* than "already gone" leaves the
				// session exactly where it was; the reclaim path then has to cope with it.
				const result = this.killSessionResult ?? ok();
				if (result.exitCode === 0 || /can't find session|no server running|error connecting/i.test(result.stderr))
					this.options.delete("session");
				return result;
			}
			case "list-sessions":
				return this.options.has("session")
					? ok(`${this.sessionName}\n`)
					: { exitCode: 1, stdout: "", stderr: "no server running on /private/tmp/tmux-501/default\n" };
			case "show-options": {
				const value = this.options.get(args.at(-1) as string);
				return value ? ok(`${value}\n`) : { exitCode: 1, stdout: "", stderr: "" };
			}
			case "set-option":
				this.options.set("session", "yes");
				if (!args.includes("-p")) {
					if (args.includes("-qu")) this.options.delete(args.at(-1) as string);
					else this.options.set(args.at(-2) as string, args.at(-1) as string);
				}
				return ok();
			case "list-clients":
				return ok(this.clients);
			case "display-message": {
				const format = args.at(-1);
				if (this.missingPanes.has(target())) return ok("\n");
				if (format === "#{pane_id}") return ok(`${target().startsWith("%") ? target() : "%9"}\n`);
				if (format === "#{pane_id} #{pane_dead}") return ok(`${target()} 0\n`);
				if (format === "#{window_id}") return ok(`${this.paneWindows.get(target()) ?? "@2"}\n`);
				if (format === "#{pane_height}") return ok("24\n");
				return ok("0\n");
			}
			default:
				return ok();
		}
	}
}

/** argv joined into single strings, which is how the existing suite reasons about commands. */
function commands(runner: RecordingTmuxServer): string[] {
	return runner.calls.map((args) => args.join(" "));
}

function issued(runner: RecordingTmuxServer, name: string): boolean {
	return runner.calls.some((args) => args[0] === name);
}

async function withTmuxEnv<T>(value: string | undefined, body: () => Promise<T>): Promise<T> {
	const nested = process.env.TMUX;
	try {
		if (value === undefined) delete process.env.TMUX;
		else process.env.TMUX = value;
		return await body();
	} finally {
		if (nested === undefined) delete process.env.TMUX;
		else process.env.TMUX = nested;
	}
}

/** A workspace built once, so every session option and pane handle is populated. */
async function builtWorkspace(runner: RecordingTmuxServer): Promise<TmuxWorkspace> {
	const workspace = new TmuxWorkspace(process.cwd(), runner);
	runner.sessionName = workspace.sessionName;
	await workspace.showBoard();
	runner.calls.length = 0;
	return workspace;
}

/** Reduce a live workspace to a corpse: nobody attached, never finished, host provably gone. */
function makeCorpse(runner: RecordingTmuxServer): void {
	runner.options.delete(READY);
	runner.options.delete(OWNER_PID);
	runner.clients = "";
	runner.panePids.set("%1", FOREIGN_PANE_PID);
}

describe("quitWorkspace teardown policy", () => {
	it("never emits kill-session, whatever the client state is", async () => {
		// The whole point of the teardown policy: a deliberate quit keeps the session, its windows
		// and its layout, so reopening restores the view the user left behind.
		for (const clients of ["", "/dev/ttys001|%1\n", "/dev/ttys001|%6\n", "/dev/ttys001|%6\n/dev/ttys002|%6\n"]) {
			const runner = new RecordingTmuxServer();
			const workspace = await builtWorkspace(runner);
			runner.clients = clients;
			runner.panePids.set("%1", FOREIGN_PANE_PID);
			runner.calls.length = 0;
			await withTmuxEnv(undefined, () => workspace.quitWorkspace());
			expect(issued(runner, "kill-session")).toBe(false);
			expect(commands(runner)).not.toContain(`kill-session -t ${workspace.sessionName}`);
			// No other session-scoped destruction either.
			expect(commands(runner).some((command) => command.startsWith("kill"))).toBe(false);
			expect(runner.options.has("session")).toBe(true);
		}
	});

	it("kills the pane process trees first and only then detaches the client", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		runner.clients = "/dev/ttys001|%1\n";
		runner.panePids.set("%1", FOREIGN_PANE_PID);
		runner.calls.length = 0;
		await withTmuxEnv(undefined, () => workspace.quitWorkspace());
		const list = commands(runner);
		const pids = list.indexOf(`list-panes -s -t ${workspace.sessionName} -F #{pane_pid}`);
		const detach = list.indexOf(`detach-client -t ${workspace.sessionName}`);
		expect(pids).toBeGreaterThanOrEqual(0);
		expect(detach).toBeGreaterThanOrEqual(0);
		expect(pids).toBeLessThan(detach);
	});

	it("switches the client back rather than detaching when nested inside tmux", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		runner.clients = "/dev/ttys001|%6\n/dev/ttys002|%6\n";
		runner.panePids.set("%1", FOREIGN_PANE_PID);
		runner.calls.length = 0;
		await withTmuxEnv("/tmp/tmux-501/default,1234,0", () => workspace.quitWorkspace());
		const list = commands(runner);
		expect(list).toContain("switch-client -l");
		expect(list).not.toContain(`detach-client -t ${workspace.sessionName}`);
		expect(issued(runner, "kill-session")).toBe(false);
	});

	it("filters the sentinel pids and its own host pid out of the pane process trees", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		runner.panePids.clear();
		runner.panePids.set("%1", FOREIGN_PANE_PID);
		runner.panePids.set("%2", process.pid);
		// pid 0 and 1 are init: killing them would take the machine with them.
		runner.panePids.set("%3", 0);
		runner.panePids.set("%4", 1);
		runner.calls.length = 0;
		// Surviving this call is the assertion: the filter rejected the host pid and the sentinels.
		await workspace.quitWorkspace();
		expect(runner.calls).toContainEqual(["list-panes", "-s", "-t", workspace.sessionName, "-F", "#{pane_pid}"]);
		expect(issued(runner, "kill-session")).toBe(false);
		expect(process.pid).toBeGreaterThan(1);
	});

	it("is a silent no-op when the session is not owned by this root", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		runner.options.set(OWNER, "/somewhere/else");
		runner.calls.length = 0;
		await workspace.quitWorkspace();
		// Not ours: no pane trees killed, no client detached, nothing destroyed.
		expect(issued(runner, "kill-session")).toBe(false);
		expect(issued(runner, "detach-client")).toBe(false);
		expect(commands(runner).some((command) => command.startsWith("kill"))).toBe(false);
	});
});

describe("detach policy", () => {
	it("kills nothing at all outside tmux", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		runner.clients = "/dev/ttys001|%1\n";
		runner.calls.length = 0;
		await withTmuxEnv(undefined, () => workspace.detach());
		expect(runner.calls).toContainEqual(["detach-client", "-t", workspace.sessionName]);
		// A detach is not a quit: it stops no process, not even the pane process trees.
		expect(commands(runner).some((command) => command.startsWith("kill"))).toBe(false);
		expect(issued(runner, "kill-session")).toBe(false);
		expect(commands(runner)).not.toContain(`list-panes -s -t ${workspace.sessionName} -F #{pane_pid}`);
		expect(runner.options.has("session")).toBe(true);
	});

	it("kills nothing at all with no client attached", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		runner.clients = "";
		runner.calls.length = 0;
		await withTmuxEnv(undefined, () => workspace.detach());
		expect(commands(runner).some((command) => command.startsWith("kill"))).toBe(false);
		expect(runner.options.has("session")).toBe(true);
	});

	it("switches the client back rather than detaching when nested inside tmux", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		runner.clients = "/dev/ttys001|%6\n";
		runner.calls.length = 0;
		await withTmuxEnv("/tmp/tmux-501/default,1234,0", () => workspace.detach());
		expect(commands(runner)).toContain("switch-client -l");
		expect(commands(runner).some((command) => command.startsWith("detach-client"))).toBe(false);
		expect(commands(runner).some((command) => command.startsWith("kill"))).toBe(false);
		expect(runner.options.has("session")).toBe(true);
	});
});

describe("orphan reclaim", () => {
	it("kills the abandoned session exactly once, then builds a fresh one", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		makeCorpse(runner);
		runner.calls.length = 0;
		await workspace.showBoard();
		const list = commands(runner);
		expect(list.filter((command) => command === `kill-session -t ${workspace.sessionName}`)).toHaveLength(1);
		expect(list).toContain(`list-panes -s -t ${workspace.sessionName} -F #{pane_pid}`);
		expect(runner.calls).toContainEqual([
			"newSession",
			workspace.sessionName,
			workspace.rootPath,
			"exec sleep 2147483647",
		]);
	});

	it("leaves a session with a client attached alone", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		makeCorpse(runner);
		runner.clients = "/dev/ttys002|%1\n";
		runner.calls.length = 0;
		await workspace.showBoard();
		expect(issued(runner, "kill-session")).toBe(false);
		expect(issued(runner, "newSession")).toBe(false);
	});

	it("leaves a session whose recorded owner pid is still alive alone", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		makeCorpse(runner);
		runner.options.set(OWNER_PID, String(process.pid));
		runner.calls.length = 0;
		await workspace.showBoard();
		expect(issued(runner, "kill-session")).toBe(false);
		expect(issued(runner, "newSession")).toBe(false);
	});

	it("returns quietly when no tmux server is running", async () => {
		// `no server running` on stderr means "already gone": the sweep must not throw.
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		makeCorpse(runner);
		runner.killSessionResult = { exitCode: 1, stdout: "", stderr: "no server running on /tmp/tmux-1000/default\n" };
		runner.calls.length = 0;
		await workspace.showBoard();
		expect(runner.calls).toContainEqual(["kill-session", "-t", workspace.sessionName]);
		expect(runner.calls).toContainEqual(["hasSession", workspace.sessionName]);
	});

	it("returns quietly when the session itself is already gone", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		makeCorpse(runner);
		runner.killSessionResult = { exitCode: 1, stdout: "", stderr: `can't find session: ${workspace.sessionName}\n` };
		runner.calls.length = 0;
		await workspace.showBoard();
		expect(runner.calls).toContainEqual(["kill-session", "-t", workspace.sessionName]);
		expect(issued(runner, "newSession")).toBe(true);
	});

	it("falls back to rebuilding rather than failing when the kill fails for another reason", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		makeCorpse(runner);
		runner.killSessionResult = { exitCode: 1, stdout: "", stderr: "server exited unexpectedly\n" };
		runner.calls.length = 0;
		// Collecting a corpse is best effort: the failure is swallowed and the reuse path carries on.
		await workspace.showBoard();
		expect(runner.calls).toContainEqual(["kill-session", "-t", workspace.sessionName]);
		expect(issued(runner, "newSession")).toBe(false);
	});
});

describe("ready() reuse of a deliberately-quit workspace", () => {
	it("reuses a quit session instead of sweeping it", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		// Quit: the processes die, the session and its ready marker stay.
		runner.clients = "/dev/ttys001|%1\n";
		runner.panePids.set("%1", FOREIGN_PANE_PID);
		await withTmuxEnv(undefined, () => workspace.quitWorkspace());
		expect(runner.options.get(READY)).toBe("1");
		expect(issued(runner, "kill-session")).toBe(false);
		runner.calls.length = 0;
		// Reopening must take the reuse path: no sweep, no reclaim, no rebuild.
		await workspace.showBoard();
		expect(issued(runner, "list-sessions")).toBe(false);
		expect(issued(runner, "kill-session")).toBe(false);
		expect(issued(runner, "newSession")).toBe(false);
		expect(issued(runner, "newWindow")).toBe(false);
		expect(issued(runner, "split")).toBe(false);
		expect(commands(runner)).toContain("select-window -t @1");
	});

	it("still sweeps when the ready marker survives but the Workspace window is gone", async () => {
		// The control case: ready() is a conjunction, and losing either half re-arms the reclaim.
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		makeCorpse(runner);
		runner.options.set(READY, "1");
		runner.options.delete(WORKSPACE_WINDOW);
		runner.calls.length = 0;
		await workspace.showBoard();
		expect(issued(runner, "list-sessions")).toBe(true);
		expect(issued(runner, "kill-session")).toBe(true);
	});

	it("still sweeps when ready survives but the owner no longer matches this root", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		makeCorpse(runner);
		runner.options.set(READY, "1");
		runner.options.set(OWNER, "/somewhere/else");
		runner.calls.length = 0;
		// A foreign session is never reclaimed — it is refused, not killed.
		await expect(workspace.showBoard()).rejects.toThrow(
			`tmux session ${workspace.sessionName} is not a Backlog workspace for this root`,
		);
		expect(issued(runner, "kill-session")).toBe(false);
	});

	it("does not renumber or rebind anything on a ready session", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		runner.calls.length = 0;
		await workspace.showBoard();
		// Rebuilding a live workspace would renumber every pane under the user's cursor.
		expect(issued(runner, "rename-window")).toBe(false);
		expect(issued(runner, "bind-key")).toBe(false);
		expect(issued(runner, "kill-window")).toBe(false);
		expect(issued(runner, "kill-session")).toBe(false);
	});
});

describe("kill-session is confined to the orphan reclaim", () => {
	it("is issued only by the orphan reclaim, whatever the entry point", async () => {
		// This used to be a *structural* pin — counting occurrences of `"kill-session"` in the text
		// of tmux-workspace.ts — which asserted where the argv was spelled rather than what the
		// code does, and so went red the moment the argv moved down into the wrapper layer. The
		// invariant it was protecting is behavioural and outlives the file layout: the reclaim
		// (`collectAbandonedHost` → `killSessionIfPresent`) is the ONLY producer of a session
		// destruction, and it produces exactly one, targeted at this workspace's session.
		//
		// Half one: no entry point may destroy a healthy workspace, whatever the client state is.
		const healthy = new RecordingTmuxServer();
		const workspace = await builtWorkspace(healthy);
		healthy.clients = "/dev/ttys001|%1\n";
		healthy.panePids.set("%1", FOREIGN_PANE_PID);
		healthy.calls.length = 0;
		await workspace.showBoard();
		await workspace.showWorkspace();
		await withTmuxEnv(undefined, () => workspace.detach());
		await withTmuxEnv(undefined, () => workspace.quitWorkspace());
		expect(commands(healthy).some((command) => command.startsWith("kill"))).toBe(false);

		// Half two: with a corpse to reclaim, the reclaim is the one and only source, once.
		const corpse = new RecordingTmuxServer();
		const abandoned = await builtWorkspace(corpse);
		makeCorpse(corpse);
		corpse.calls.length = 0;
		await abandoned.showBoard();
		expect(commands(corpse).filter((command) => command.startsWith("kill-session"))).toEqual([
			`kill-session -t ${abandoned.sessionName}`,
		]);
	});

	it("is never reached by any deliberate user action", async () => {
		const runner = new RecordingTmuxServer();
		const workspace = await builtWorkspace(runner);
		runner.clients = "/dev/ttys001|%1\n";
		runner.panePids.set("%1", FOREIGN_PANE_PID);
		runner.calls.length = 0;
		await workspace.showWorkspace();
		await withTmuxEnv(undefined, () => workspace.detach());
		await withTmuxEnv(undefined, () => workspace.quitWorkspace());
		expect(issued(runner, "kill-session")).toBe(false);
		expect(commands(runner).some((command) => command.startsWith("kill"))).toBe(false);
	});
});
