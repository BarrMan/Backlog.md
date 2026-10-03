/**
 * The tmux **signals and keys** object domain of the abstraction layer.
 *
 * Six methods, all of which wrap raw argv. Nothing here touches libtmux: each method builds the
 * argv array the tmux CLI would receive and hands it to the injected {@link TmuxExec}.
 *
 * ## ⭐ `sendKeys` is bare (§2.2)
 *
 * {@link sendKeys} emits exactly `["send-keys", "-t", target, keys]` — no `-l`, no `Enter`
 * element, and **no `enter`/`literal` parameters at all**. They are deliberately absent from the
 * signature rather than defaulted to `false`, because an optional parameter is what invites someone
 * to "correct" this method toward libtmux's `sendKeys()`, which *appends Enter by default*. The tmux
 * CLI does not. `focusSearch()` is the sole call site and relies on tmux's own default: with an
 * added Enter, `/` would be delivered with a carriage return and the footer search box would never
 * activate — a regression invisible to the test suite.
 *
 * ## ⭐ `unbindKey` carries `-q` as a hard requirement (§2.1)
 *
 * `unbind-key` is a separate method rather than a `quiet?: boolean` flag on `bindKey` for the same
 * reason: without `-q`, unbinding a key that was never bound exits non-zero, `require` throws, and
 * idempotent cleanup (`rebuildTopology`, `ensureHostUnlocked`) fails on an already-clean workspace.
 * The flag is not optional here and must not be made optional.
 *
 * ## ⭐ `resize-pane -Z` stays a bare atomic toggle (§2.3)
 *
 * The `if-shell` script {@link bindReturnKey} embeds is **one** argv element, and its inner
 * `resize-pane -Z` is a bare toggle. It must not be re-expressed as an
 * `if-shell -F '#{window_zoomed_flag}' …` read-then-toggle: the `zoomed()` helper is already a
 * check-then-act against a different process, and a second format read would add a TOCTOU window
 * inside that guard.
 *
 * ## Destructive methods
 *
 * {@link signalProcessTree} and {@link killPaneProcessTrees} signal **real OS processes**. The pid
 * filter (`0`, `1`, and `process.pid` are never signalled) is load-bearing. `killPaneProcessTrees`
 * is only ever reached from `quitWorkspace()` — a deliberate quit, where the user has asked that no
 * agent process survive — and it targets only panes of the workspace's own session, never a session
 * or server on the default socket.
 */

// Type-only imports: neither `exec.ts` nor `types.ts` is pulled in at runtime, so no cycle.
import type { TmuxExec } from "./exec";
import type { TmuxKeyTable, TmuxResult, TmuxSessionName, TmuxTarget } from "./types";

/**
 * The `-F` format `killPaneProcessTrees` asks tmux for. A module constant so the raw form is
 * obvious and greppable; never transformed (§2.5) — no `literalFormat()`, no `#` → `##`. Passing it
 * through `exec.run` reaches tmux byte for byte.
 */
const PANE_PID_FORMAT = "#{pane_pid}";

/** Default failure messages, verbatim from `tmux-workspace.ts`. */
const DEFAULT_BIND_MESSAGE = "Could not preserve tmux prefix";
const DEFAULT_UNBIND_MESSAGE = "Could not clear obsolete workspace key";
const DEFAULT_RETURN_KEY_MESSAGE = "Could not bind workspace return key";

/** Grace period between `SIGTERM` and `SIGKILL` in {@link signalProcessTree}. Verbatim from `:75`. */
const PANE_TREE_TERM_GRACE_MS = 100;

export interface TmuxSignalsKeys {
	/**
	 * `["bind-key", "-T", table, key, ...command]`.
	 *
	 * `command` is the head of the bound command and any arguments follow it as further argv
	 * elements, supplied via `options.commandArgs` — never folded into one shell-ish string. The
	 * prefix-preservation site (`:371`) emits
	 * `["bind-key", "-T", table, prefix, "switch-client", "-T", "prefix"]`, which needs those three
	 * trailing elements; the spec's bare `command: string` cannot express them, so the source wins
	 * and they ride in the options bag rather than a fourth positional.
	 */
	bindKey(
		key: string,
		command: string,
		options: { table: TmuxKeyTable; commandArgs?: readonly string[]; message?: string },
	): Promise<void>;

	/**
	 * `["unbind-key", "-q", "-T", table, key]`.
	 *
	 * **`-q` is mandatory** (§2.1) and lives here rather than behind an optional boolean. Sites
	 * `:373` and `:445`, each looping `["C-m", "C-i", "/"]`.
	 */
	unbindKey(key: string, options: { table: TmuxKeyTable }, message?: string): Promise<void>;

	/**
	 * Binds `C-q` in the workspace table to a return key that selects the tasks pane, and toggles
	 * the pane zoom when the workspace window is already focused.
	 *
	 * The trailing `""` is a real argv element, not an accident — tmux needs an empty final arg
	 * here. The nested `if-shell` script is **one** argv element with `;` inside, and its inner
	 * `resize-pane -Z` is a bare atomic toggle (§2.3).
	 */
	bindReturnKey(options: { table: TmuxKeyTable; workspaceWindow: TmuxTarget; tasksPane: TmuxTarget }): Promise<void>;

	/**
	 * `["send-keys", "-t", target, ...keys]` — bare, byte-for-byte with the current argv.
	 *
	 * **There is no `enter` parameter, no `literal` parameter, and no `-l` flag.** Do not add them
	 * (§2.2): tmux decides whether Enter is sent, and adding it would break `focusSearch()`.
	 *
	 * Uses `run`, not `require`: the current site branches on `exitCode` and only logs it, so a
	 * failure must surface as a value rather than a throw.
	 */
	sendKeys(target: TmuxTarget, keys: string): Promise<TmuxResult>;

	/**
	 * Signals the process tree rooted at `pid`: descendants first, then the root, each `SIGTERM`,
	 * a `PANE_TREE_TERM_GRACE_MS` grace period, then each `SIGKILL`. `ESRCH` is swallowed — the
	 * process being gone is the outcome teardown wanted.
	 *
	 * Not a tmux method: it reads the process table via `ps -A -o "pid=,ppid="` and is kept here
	 * because it is driven by {@link killPaneProcessTrees}' pane pid listing.
	 */
	signalProcessTree(pid: number, options?: { graceMs?: number }): Promise<void>;

	/**
	 * Lists the pane pids of `session` and signals each tree. Non-throwing: a non-zero exit from
	 * `list-panes` (including `/no server running`) returns silently, exactly as today.
	 *
	 * The pid filter is load-bearing — `pid <= 1` and this process's own pid are never signalled.
	 */
	killPaneProcessTrees(session: TmuxSessionName): Promise<void>;
}

/**
 * The concrete `TmuxSignalsKeys`. The injected {@link TmuxExec} is the only state, so every method
 * that builds argv is still a thin, order-preserving wrapper over one `require`/`run` call.
 *
 * The `TmuxSignalsKeys` *interface* stays the structural contract — tests build object literals
 * for it, so the interface must not become a class.
 */
export class TmuxSignalsKeysImpl implements TmuxSignalsKeys {
	private readonly exec: TmuxExec;

	constructor(exec: TmuxExec) {
		this.exec = exec;
	}

	async bindKey(
		key: string,
		command: string,
		options: { table: TmuxKeyTable; commandArgs?: readonly string[]; message?: string },
	): Promise<void> {
		await this.exec.require(
			["bind-key", "-T", options.table, key, command, ...(options.commandArgs ?? [])],
			options.message ?? DEFAULT_BIND_MESSAGE,
		);
	}

	/** Bare `unbind-key -q`: the `-q` is welded into the argv here and is not a flag (§2.1). */
	async unbindKey(key: string, options: { table: TmuxKeyTable }, message?: string): Promise<void> {
		await this.exec.require(["unbind-key", "-q", "-T", options.table, key], message ?? DEFAULT_UNBIND_MESSAGE);
	}

	async bindReturnKey(options: {
		table: TmuxKeyTable;
		workspaceWindow: TmuxTarget;
		tasksPane: TmuxTarget;
	}): Promise<void> {
		await this.exec.require(
			[
				"bind-key",
				"-T",
				options.table,
				"C-q",
				"if-shell",
				"-F",
				`#{==:#{window_id},${options.workspaceWindow}}`,
				`if-shell -F '#{window_zoomed_flag}' 'resize-pane -Z; select-pane -t ${options.tasksPane}' 'select-pane -t ${options.tasksPane}'`,
				"",
			],
			DEFAULT_RETURN_KEY_MESSAGE,
		);
	}

	/**
	 * Bare `["send-keys", "-t", target, keys]` — two parameters, no `enter`, no `literal` (§2.2).
	 */
	async sendKeys(target: TmuxTarget, keys: string): Promise<TmuxResult> {
		return await this.exec.run(["send-keys", "-t", target, keys]);
	}

	async signalProcessTree(pid: number, options?: { graceMs?: number }): Promise<void> {
		const tree = (await descendants(pid)).reverse();
		for (const target of tree) signalProcess(target, "SIGTERM");
		await Bun.sleep(options?.graceMs ?? PANE_TREE_TERM_GRACE_MS);
		for (const target of tree) signalProcess(target, "SIGKILL");
	}

	async killPaneProcessTrees(session: TmuxSessionName): Promise<void> {
		const listed = await this.exec.run(["list-panes", "-s", "-t", session, "-F", PANE_PID_FORMAT]);
		if (listed.exitCode !== 0) return;
		const pids = listed.stdout
			.trim()
			.split("\n")
			.map((line) => Number(line.trim()))
			.filter((pid) => Number.isInteger(pid) && pid > 1 && pid !== process.pid);
		for (const pid of pids) await this.signalProcessTree(pid);
	}
}

/**
 * Build the signals/keys surface over an injected exec.
 *
 * A thin wrapper kept for every existing call site; `new TmuxSignalsKeysImpl(exec)` is equivalent.
 */
export function createTmuxSignalsKeys(exec: TmuxExec): TmuxSignalsKeys {
	return new TmuxSignalsKeysImpl(exec);
}

/** Breadth-first descendants of `pid`, including `pid` itself. Moved here verbatim from `:1070`. */
async function descendants(pid: number): Promise<number[]> {
	const children = new Map<number, number[]>();
	for (const line of await processTable()) {
		const [child, parent] = line.split(/\s+/).map(Number);
		if (child === undefined || parent === undefined) continue;
		if (!Number.isInteger(child) || !Number.isInteger(parent)) continue;
		children.set(parent, [...(children.get(parent) ?? []), child]);
	}
	const tree = [pid];
	for (const current of [...tree])
		for (const child of children.get(current) ?? []) if (!tree.includes(child)) tree.push(child);
	return tree;
}

/** `ps -A -o "pid=,ppid="`, one non-blank line per process. Verbatim from `:1085`. */
async function processTable(): Promise<string[]> {
	const child = Bun.spawn(["ps", "-A", "-o", "pid=,ppid="], { stdout: "pipe", stderr: "ignore" });
	if ((await child.exited) !== 0) return [];
	return (await new Response(child.stdout).text()).split("\n").filter((line) => line.trim());
}

/** `ESRCH` is swallowed: the process being already gone is the outcome teardown wanted. */
function signalProcess(pid: number, signal: NodeJS.Signals): void {
	try {
		process.kill(pid, signal);
	} catch {
		// The process is already gone, which is the outcome teardown wanted.
	}
}
