import { NO_SERVER_RUNNING, type TmuxExec } from "./exec.ts";
import type { TmuxResult, TmuxSessionName, TmuxTarget } from "./types.ts";

/** `capture-pane` tail depth. Mirrors `PANE_OUTPUT_TAIL_LINES` in `tmux-workspace.ts:74`. */
const CAPTURE_DEFAULT_LINES = 20;

/** Options for `respawnPane`. `command` is one argv element — never split. */
export interface RespawnPaneOptions {
	readonly cwd: string;
	readonly command: string;
}

/** Options for `capture`. `start` overrides the `-S` offset entirely; see `capture`'s doc. */
export interface CaptureOptions {
	/** Line offset for `-S`. Negative counts back from the end of the history. Defaults to `-lines`. */
	readonly start?: number;
	/** Tail depth used to build the default `-S` offset. Defaults to 20. */
	readonly lines?: number;
}

/** Options for `listPanes`. */
export interface ListPanesOptions {
	/** tmux filter for `-f`. Omitted from argv when absent. */
	readonly filter?: string;
	/**
	 * tmux format for `-F`, passed through **raw**. `#{…}` must reach tmux verbatim — the layer
	 * never rewrites `#` to `##` (that is libtmux's `literalFormat()`, and adopting it would
	 * corrupt every format this method is fed).
	 */
	readonly format?: string;
}

/**
 * The pane object domain.
 *
 * Every method emits the raw argv the tmux CLI would receive. Three properties are load-bearing
 * and deliberately not "improved":
 *
 * 1. `toggleZoom` is a bare `resize-pane -Z`. tmux toggles atomically. libtmux's `Pane.zoom()`
 *    wraps this in `if-shell -F '#{window_zoomed_flag}' …`, which re-reads the flag at exec time;
 *    combined with the `zoomed()` guard in `focusAgent` that is a check-then-act against two
 *    different observations. Never reintroduce the `if-shell`.
 * 2. `capture` returns the `TmuxResult` with **raw stdout**, not libtmux's `string[]` with the
 *    trailing blank line stripped. `requireLivePane` reports the pane's last output verbatim.
 * 3. `listPanes` / `listPanePids` pass `#{…}` through untouched.
 *
 * The layer wraps argv, not libtmux: libtmux rewrites format strings and throws where this code
 * branches on `exitCode`.
 */
export interface TmuxPane {
	/** `["select-pane", "-t", target]`. Non-throwing; returns the result so callers can branch. */
	selectPane(target: TmuxTarget): Promise<TmuxResult>;
	/**
	 * `["select-pane", "-t", target]` via `require`: identical argv to `selectPane`, but a non-zero
	 * exit throws `` `${message}: …` `` instead of being returned.
	 *
	 * This is the variant every *focus* call site uses — `showBoard`, `showWorkspace`,
	 * `focusAgent`, `focusTasks`, `focusDetails` — because a failed focus must abort the handoff
	 * rather than be inspected. `selectPane` stays non-throwing for the three sites that genuinely
	 * branch on the result (focus restore in `nameShellPane`, and the diag-log paths).
	 *
	 * ⚠ `select-pane` is in `exec.ts`'s `DIAG_REQUIRED_SUBCOMMANDS`, so routing through `require`
	 * is what emits the `require ["select-pane",…]` line in `/tmp/focus.log`. Do not "simplify"
	 * these call sites back to `run` + manual throw: that silently drops the focus trace.
	 */
	requireSelectPane(target: TmuxTarget, message?: string): Promise<void>;
	/**
	 * `["select-pane", "-t", target, "-T", title]`. Throws on failure.
	 *
	 * ⚠ This **activates** `target`: tmux has no rename-without-activating. `nameShellPane` reads
	 * `#{window_id}`, then the window's active `#{pane_id}`, then sets the title, then restores the
	 * previous pane with a best-effort `run()` that cannot throw. That four-step ordering lives in
	 * the caller and must not be folded in here — see `setPaneTitle`'s call-site note.
	 */
	setPaneTitle(target: TmuxTarget, title: string): Promise<void>;
	/**
	 * `["swap-pane", "-d", "-s", source, "-t", target]`. `-d` detaches the source afterwards.
	 * Callers keep their own `source === target` short-circuit; this method does not.
	 */
	swapPane(source: TmuxTarget, target: TmuxTarget, message?: string): Promise<void>;
	/** `["resize-pane", "-t", target, "-y", String(rows)]`. Caller owns the finite/`>= 1` guard. */
	resizePaneHeight(target: TmuxTarget, rows: number, message?: string): Promise<void>;
	/**
	 * `["resize-pane", "-Z", "-t", target]` — bare, atomic, no `if-shell`, no size argument.
	 * Throws on failure (`message` differentiates zoom from unzoom at the call site).
	 */
	toggleZoom(target: TmuxTarget, message?: string): Promise<void>;
	/**
	 * `["capture-pane", "-p", "-S", String(offset), "-t", target]`, `offset = start ?? -lines`,
	 * `lines` defaulting to 20.
	 *
	 * Returns the raw `TmuxResult`: `stdout` is the pane's output byte-for-byte. Do **not** adopt
	 * libtmux's `string[]` capture, which drops the trailing blank line.
	 */
	capture(target: TmuxTarget, options?: CaptureOptions): Promise<TmuxResult>;
	/**
	 * `["respawn-pane", "-k", "-t", target, "-c", cwd, command]`. `-k` kills the running process.
	 * `command` is the whole `workspaceCommand(…)` string as a single argv element.
	 */
	respawnPane(target: TmuxTarget, options: RespawnPaneOptions): Promise<void>;
	/**
	 * `["list-panes", "-a", "-f", filter, "-F", format]`, or `["list-panes", "-a", "-F", format]`
	 * with no filter; `-F` is emitted only when `format` is supplied.
	 *
	 * Non-zero exit: `[]` when stderr matches `/no server running/i` (there is nothing to list),
	 * otherwise throws `Could not inspect live preview panes`. Feeds `tmux-pane-lookup.ts`, whose
	 * format is a tab-joined list of `#{…}` expressions — hence the raw pass-through.
	 */
	listPanes(options?: ListPanesOptions): Promise<readonly string[]>;
	/**
	 * `["display-message", "-p", "-t", target, format]`.
	 *
	 * `format` is passed through **raw**: `#{window_id}`, `#{pane_id}`, `#{pane_height}`,
	 * `#{pane_dead}` and `#{window_zoomed_flag}` must reach tmux verbatim. libtmux's
	 * `literalFormat()` rewrites `#` to `##`; adopting it here would make every one of those
	 * queries return the literal string instead of a value.
	 *
	 * Non-throwing, and it returns the **raw** `TmuxResult` — `stdout` byte-for-byte, untrimmed —
	 * because the ten call sites are genuinely two different things and collapsing them would be
	 * lossy in both directions:
	 * - **query** sites read `stdout.trim()` and treat a non-zero exit as `""` / `NaN`
	 *   (`#{pane_height}`, `#{window_id}`, `#{pane_id}`);
	 * - **predicate** sites branch on `exitCode` *and* on the trimmed value (`zoomed()`'s
	 *   `#{window_zoomed_flag}` === `"1"`, `paneExists`'s `#{pane_id}` round-trip,
	 *   `paneLive`'s `#{pane_id} #{pane_dead}` pair).
	 *
	 * Handing back the untouched result is the only shape that keeps both intact: an
	 * always-`string` return would erase `exitCode`, and a trimmed return would erase the
	 * distinction `Number("")` makes against `Number("24")`.
	 */
	displayMessage(target: TmuxTarget, format: string): Promise<TmuxResult>;
	/**
	 * `["list-panes", "-s", "-t", session, "-F", "#{pane_pid}"]`.
	 *
	 * Non-throwing: a non-zero exit is `[]`. Pids are filtered to
	 * `Number.isInteger(pid) && pid > 1 && pid !== process.pid` — the exclusion of pid 1 and of our
	 * own pid is what keeps teardown from signalling init or this process.
	 */
	listPanePids(session: TmuxSessionName): Promise<readonly number[]>;
}

/**
 * The concrete `TmuxPane`. Holds the injected exec surface as a single `private readonly` field;
 * there is no module state, so every consumer can take a `TmuxPane` without importing anything
 * else of the layer.
 *
 * The `TmuxPane` *interface* stays the structural contract — tests and `tmux-orphan-sweep.ts`
 * build `{ selectPane, … }` object literals, so the interface must not become a class.
 */
export class TmuxPaneImpl implements TmuxPane {
	private readonly exec: TmuxExec;

	constructor(exec: TmuxExec) {
		this.exec = exec;
	}

	// Non-throwing by design: three call sites branch on the result (focus restore, diag log)
	// rather than letting a failure propagate.
	async selectPane(target: TmuxTarget): Promise<TmuxResult> {
		return await this.exec.run(["select-pane", "-t", target]);
	}

	async requireSelectPane(target: TmuxTarget, message = "Could not focus workspace pane"): Promise<void> {
		await this.exec.require(["select-pane", "-t", target], message);
	}

	async setPaneTitle(target: TmuxTarget, title: string): Promise<void> {
		await this.exec.require(["select-pane", "-t", target, "-T", title], "Could not name workspace pane");
	}

	async swapPane(source: TmuxTarget, target: TmuxTarget, message = "Could not swap live preview pane"): Promise<void> {
		await this.exec.require(["swap-pane", "-d", "-s", source, "-t", target], message);
	}

	async resizePaneHeight(target: TmuxTarget, rows: number, message = "Could not resize workspace pane"): Promise<void> {
		await this.exec.require(["resize-pane", "-t", target, "-y", String(rows)], message);
	}

	// BARE -Z. Do not wrap in if-shell; see the interface doc.
	async toggleZoom(target: TmuxTarget, message = "Could not zoom agent pane"): Promise<void> {
		await this.exec.require(["resize-pane", "-Z", "-t", target], message);
	}

	async capture(target: TmuxTarget, options: CaptureOptions = {}): Promise<TmuxResult> {
		const lines = options.lines ?? CAPTURE_DEFAULT_LINES;
		const offset = options.start ?? -lines;
		return await this.exec.run(["capture-pane", "-p", "-S", String(offset), "-t", target]);
	}

	async respawnPane(target: TmuxTarget, options: RespawnPaneOptions): Promise<void> {
		await this.exec.require(
			["respawn-pane", "-k", "-t", target, "-c", options.cwd, options.command],
			"Could not reopen workspace UI",
		);
	}

	async listPanes(options: ListPanesOptions = {}): Promise<readonly string[]> {
		const argv = ["list-panes", "-a"];
		if (options.filter) argv.push("-f", options.filter);
		if (options.format !== undefined) argv.push("-F", options.format);
		const listed = await this.exec.run(argv);
		if (listed.exitCode !== 0) {
			if (NO_SERVER_RUNNING.test(listed.stderr)) return [];
			throw new Error(`Could not inspect live preview panes: ${listed.stderr.trim() || "tmux command failed"}`);
		}
		return listed.stdout ? listed.stdout.split("\n") : [];
	}

	// RAW format passthrough. No escaping, no literalFormat(), no `#` -> `##`.
	async displayMessage(target: TmuxTarget, format: string): Promise<TmuxResult> {
		return await this.exec.run(["display-message", "-p", "-t", target, format]);
	}

	async listPanePids(session: TmuxSessionName): Promise<readonly number[]> {
		const listed = await this.exec.run(["list-panes", "-s", "-t", session, "-F", "#{pane_pid}"]);
		if (listed.exitCode !== 0) return [];
		return listed.stdout
			.trim()
			.split("\n")
			.map((line) => Number(line.trim()))
			.filter((pid) => Number.isInteger(pid) && pid > 1 && pid !== process.pid);
	}
}

/**
 * Build the pane domain over an injected exec surface.
 *
 * A thin wrapper kept for the production consumers and the sibling modules of the layer that
 * already call it; `new TmuxPaneImpl(exec)` is equivalent.
 */
export function createTmuxPane(exec: TmuxExec): TmuxPane {
	return new TmuxPaneImpl(exec);
}
