import type { TmuxExec } from "./exec.ts";
import type { TmuxSessionName, TmuxTarget } from "./types.ts";

/**
 * The option get/set domain of the tmux abstraction layer.
 *
 * Everything here wraps **raw argv**, byte for byte. There is no libtmux equivalent for a
 * single-value quiet read: libtmux's `showOptions()` / `showGlobalOptions()` return a full `Map` of
 * every option and cannot express `show-options -qv <name>`, and routing these reads through
 * libtmux's `literalFormat()` would also corrupt any format string that passed through.
 */

/**
 * The fallback the workspace applies when the `prefix` option cannot be read.
 *
 * Kept here so the caller does not re-derive the literal, and exported rather than applied inside
 * `showGlobalOption` because the current code defaults at the call site (`tmux-workspace.ts`'s
 * `prefix()`): a layer that returned `"C-b"` itself would hide a missing server behind a plausible
 * value. See the note on `showGlobalOption`.
 */
export const DEFAULT_PREFIX = "C-b";

/**
 * The fallback messages for the two setters that can be told better.
 *
 * Defaults only. A call site with its own wording passes it as the trailing `message` argument;
 * the default is what a caller with no opinion gets, not a licence to drop a distinct message.
 */
export const DEFAULT_SET_MESSAGE = "Could not update tmux workspace state";
export const DEFAULT_SET_WINDOW_MESSAGE = "Could not stabilize workspace window";

/**
 * The four argv shapes the option domain emits.
 *
 * They are four *distinct* methods, not one method with boolean flags threaded through it. The
 * reason is the quiet flag: `showOption` and `unsetOption` both depend on `-q` / `-qu`, and an
 * optional `quiet?: boolean` would let a caller silently drop a flag whose absence turns idempotent
 * cleanup into a thrown error. `docs/tmux-layer-spec.md` §2.1 and §3.6 lock this split in; do not
 * collapse it.
 */
export interface TmuxOptions {
	/**
	 * Read one session-scoped option value.
	 *
	 * argv: `["show-options", "-qv", "-t", session, name]`
	 * — `-q` quiet (a missing option is not an error), `-v` value only, `-t` the session.
	 *
	 * Value semantics, never throws: `undefined` when the command exits non-zero or prints nothing.
	 * The non-zero branch is what makes an absent option and an absent server both read as
	 * `undefined` — `NO_SERVER_RUNNING` and `SESSION_ABSENT` from `exec.ts` are cases of that single
	 * condition, so they are deliberately not re-tested here and not re-declared.
	 */
	showOption(name: string, session: TmuxSessionName): Promise<string | undefined>;

	/**
	 * Read one global (server-wide) option value.
	 *
	 * argv: `["show-options", "-gv", name]` — `-g` global, `-v` value only, in the order emitted
	 * today. **Do not reorder to `-vg`.**
	 *
	 * Value semantics, same contract as `showOption`. The `prefix` read defaults to
	 * `DEFAULT_PREFIX` at the call site, not here.
	 */
	showGlobalOption(name: string): Promise<string | undefined>;

	/**
	 * Set one session-scoped option.
	 *
	 * argv: `["set-option", "-t", session, name, value]`
	 *
	 * `require` semantics (throws on failure): every current site is a `require` site.
	 * `session` is required rather than optional because an absent session would emit
	 * `["set-option", name, value]`, which is a different command targeting the server's default
	 * session — a silent behaviour change, not a default.
	 *
	 * `message` is optional and defaults to `DEFAULT_SET_MESSAGE`. Any caller that carries
	 * wording of its own (e.g. the `key-table` option, which reports "Could not scope workspace
	 * keys") must pass it here explicitly — the default is for callers with no opinion, never a
	 * substitute for migrating a distinct site.
	 */
	setOption(name: string, value: string, session: TmuxSessionName, message?: string): Promise<void>;

	/**
	 * Unset one session-scoped option, quietly.
	 *
	 * argv: `["set-option", "-qu", "-t", session, name]` — **`-qu` is quiet + unset.**
	 *
	 * Without `-q`, unsetting an option that was never set exits non-zero and this throws, which
	 * breaks re-running the setup path on an already-clean workspace. The flag is part of the
	 * method's identity, not a parameter. `require` semantics otherwise (throws on a real failure).
	 */
	unsetOption(name: string, session: TmuxSessionName): Promise<void>;

	/**
	 * Set one window-scoped option on a window or pane target.
	 *
	 * argv: `["set-option", "-w", "-t", target, name, value]` — `-w` selects window scope.
	 *
	 * Distinct from `setOption`: the only difference is the `-w`, and threading it through as an
	 * option bag is exactly how it would go missing. `require` semantics.
	 *
	 * `message` is optional and defaults to `DEFAULT_SET_WINDOW_MESSAGE`; callers whose wording
	 * differs (e.g. the two `remain-on-exit` sites) must pass it explicitly.
	 */
	setWindowOption(name: string, value: string, target: TmuxTarget, message?: string): Promise<void>;
}

/**
 * The concrete `TmuxOptions`. Holds the injected exec surface as a field; there is no module state,
 * so every object-domain module can still take a `TmuxExec` without importing any other module of
 * the layer.
 *
 * The `TmuxOptions` *interface* stays the structural contract — `tmux-orphan-sweep.ts` and
 * `tmux-workspace.ts` hold a `TmuxOptions` typed field, so the interface must not become a class.
 *
 * Each method keeps its quiet flag welded into its own argv. That split is the module's central
 * safety property, not a stylistic choice: do not thread `-qv` / `-gv` / `-qu` / `-w` through a
 * `quiet?: boolean` or an options bag. The `TmuxExec` import above is type-only on purpose — the
 * absent-option and absent-server cases are already subsumed by the single `exitCode !== 0` branch
 * in `read`, so this module has no runtime dependency on `exec.ts` (and no `SESSION_ABSENT` /
 * `NO_SERVER_RUNNING`).
 */
export class TmuxOptionsImpl implements TmuxOptions {
	private readonly exec: TmuxExec;

	constructor(exec: TmuxExec) {
		this.exec = exec;
	}

	async showOption(name: string, session: TmuxSessionName): Promise<string | undefined> {
		return this.read(["show-options", "-qv", "-t", session, name]);
	}

	async showGlobalOption(name: string): Promise<string | undefined> {
		return this.read(["show-options", "-gv", name]);
	}

	async setOption(name: string, value: string, session: TmuxSessionName, message?: string): Promise<void> {
		await this.exec.require(["set-option", "-t", session, name, value], message ?? DEFAULT_SET_MESSAGE);
	}

	async unsetOption(name: string, session: TmuxSessionName): Promise<void> {
		await this.exec.require(["set-option", "-qu", "-t", session, name], DEFAULT_SET_MESSAGE);
	}

	async setWindowOption(name: string, value: string, target: TmuxTarget, message?: string): Promise<void> {
		await this.exec.require(["set-option", "-w", "-t", target, name, value], message ?? DEFAULT_SET_WINDOW_MESSAGE);
	}

	/**
	 * The shared `-q*` read. `stdout` is trimmed exactly as the current code trims it — the layer
	 * does not trim on the way out (§2.4), but this contract is a trimmed value or `undefined`.
	 *
	 * A single `exitCode !== 0` condition covers both "option absent" and "no server"; that
	 * collapsing is deliberate and must not be split apart.
	 */
	private async read(argv: readonly string[]): Promise<string | undefined> {
		const result = await this.exec.run(argv);
		if (result.exitCode !== 0) return undefined;
		const value = result.stdout.trim();
		return value ? value : undefined;
	}
}

/**
 * Build the option domain over an injected exec surface.
 *
 * A thin wrapper kept for `tmux-workspace.ts` and `tmux-orphan-sweep.ts`;
 * `new TmuxOptionsImpl(exec)` is equivalent.
 */
export function createTmuxOptions(exec: TmuxExec): TmuxOptions {
	return new TmuxOptionsImpl(exec);
}
