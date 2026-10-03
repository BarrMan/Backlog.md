/**
 * The tmux **window** object domain of the abstraction layer.
 *
 * Four methods, all of which wrap raw argv. Nothing here touches libtmux: every method builds the
 * argv array the tmux CLI would receive and hands it to the injected {@link TmuxExec}. No quoting,
 * no reordering, no flag that has no call site.
 *
 * ## Format strings (§2.5)
 *
 * {@link listWindows} emits the literal `#{window_id}` format below. It is passed through byte for
 * byte — no `literalFormat()`, no `#` → `##`, no escaping. The `run` path inside `exec.ts` does the
 * `[command, ...args]` destructure and forwards `args` to the runner untouched, so the format
 * string reaches tmux exactly as written here.
 *
 * ## Error messages
 *
 * All four call sites use `require`/`command` semantics today: a non-zero exit throws
 * `` `${message}: ${stderr.trim() || "tmux command failed"}` ``. The default message on each method
 * is the exact string from its single call site. `renameWindow` has three call sites with three
 * *different* messages, so it takes an optional trailing `message` — without it the layer could
 * not preserve two of the three verbatim.
 */

// Type-only import: `exec.ts` itself is never pulled in at runtime, so there is no cycle.
import type { TmuxExec } from "./exec";
import type { TmuxCommandOptions, TmuxSessionName, TmuxTarget } from "./types";

/**
 * The `-F` format `listWindows` asks tmux for. A module constant so the raw form is obvious and
 * greppable; never transformed (§2.5).
 */
const WINDOW_ID_FORMAT = "#{window_id}";

/** Default failure messages, verbatim from `tmux-workspace.ts`. */
const DEFAULT_RENAME_MESSAGE = "Could not name window";
const DEFAULT_SELECT_MESSAGE = "Could not select workspace window";
const DEFAULT_KILL_MESSAGE = "Could not remove obsolete Workspace window";
const DEFAULT_LIST_MESSAGE = "Could not inspect Workspace window";

export interface TmuxWindow {
	/**
	 * `["rename-window", "-t", target, name]`.
	 *
	 * Sites: `:363` (Board, `"Could not name Board window"`), `:365` (Workspace, `"Could not name
	 * Workspace window"`), `:496` (rebuild, `"Could not name rebuilt Workspace window"`). The name is
	 * a caller-supplied string and is forwarded verbatim — tmux treats it as one argv element.
	 */
	renameWindow(target: TmuxTarget, name: string, message?: string): Promise<void>;

	/**
	 * `["select-window", "-t", target]`.
	 *
	 * Site: `:622`. `select-window` is one of the four subcommands `exec.require` traces to the
	 * injected `diag` sink, so the `/tmp/focus.log` line survives this move untouched (§2.4 of the
	 * spec: that diagnostic set "must not drift").
	 */
	selectWindow(target: TmuxTarget, message?: string): Promise<void>;

	/**
	 * `["kill-window", "-t", target]`.
	 *
	 * Site: `:447`, guarded by `windowInSession(workspace)` immediately above it so it is never
	 * reached for an absent window. The guard stays in the caller — this method does not re-add a
	 * quiet flag or an existence probe.
	 */
	killWindow(target: TmuxTarget, message?: string): Promise<void>;

	/**
	 * `["list-windows", "-t", session, "-F", "#{window_id}"]`, with `command()` semantics: throws on
	 * a non-zero exit, hands the result back on success.
	 *
	 * Site: `:684` inside `windowInSession`. The returned array is `stdout.split("\n")` — the exact
	 * split the caller performs today. Because `exec.ts` normalises stdout with a trailing newline,
	 * that split yields a trailing `""` element, which the caller's `candidate.trim() === window`
	 * comparison ignores. This is deliberately not tidied up: filtering it here would be a
	 * behaviour change at the only call site.
	 */
	listWindows(session: TmuxSessionName, message?: string, options?: TmuxCommandOptions): Promise<readonly string[]>;
}

/**
 * The window domain over an injected exec surface.
 *
 * Stateless: the only state is the injected {@link TmuxExec}, so an instance can be built per
 * workspace without anything shared between instances. Mirrors `TmuxExecImpl` in `exec.ts` — the
 * {@link TmuxWindow} *interface* stays the structural contract so callers may keep injecting plain
 * `{ renameWindow, selectWindow, killWindow, listWindows }` object literals in tests.
 */
export class TmuxWindowImpl implements TmuxWindow {
	private readonly exec: TmuxExec;

	constructor(exec: TmuxExec) {
		this.exec = exec;
	}

	async renameWindow(target: TmuxTarget, name: string, message?: string): Promise<void> {
		await this.exec.require(["rename-window", "-t", target, name], message ?? DEFAULT_RENAME_MESSAGE);
	}

	async selectWindow(target: TmuxTarget, message?: string): Promise<void> {
		// `exec.require`, not `exec.run`: `select-window` is in `DIAG_REQUIRED_SUBCOMMANDS`, so this
		// call is what emits the `/tmp/focus.log` focus trace (§2.4 — that set must not drift).
		await this.exec.require(["select-window", "-t", target], message ?? DEFAULT_SELECT_MESSAGE);
	}

	async killWindow(target: TmuxTarget, message?: string): Promise<void> {
		await this.exec.require(["kill-window", "-t", target], message ?? DEFAULT_KILL_MESSAGE);
	}

	async listWindows(
		session: TmuxSessionName,
		message?: string,
		options?: TmuxCommandOptions,
	): Promise<readonly string[]> {
		const result = await this.exec.command(
			["list-windows", "-t", session, "-F", WINDOW_ID_FORMAT],
			message ?? DEFAULT_LIST_MESSAGE,
			options,
		);
		// Deliberately unfiltered: the trailing "" element from the normalised stdout's final newline
		// is part of the contract. The caller's `candidate.trim() === window` already ignores it, and
		// dropping it here would be an observable behaviour change at the only call site.
		return result.stdout.split("\n");
	}
}

/**
 * Build the window domain over an injected exec surface.
 *
 * A thin wrapper kept for the existing call sites and the tests of the layer; `new TmuxWindowImpl(exec)`
 * is equivalent.
 */
export function createTmuxWindow(exec: TmuxExec): TmuxWindow {
	return new TmuxWindowImpl(exec);
}
