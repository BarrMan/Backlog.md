import type { TmuxExec } from "./exec.ts";
import type { TmuxSessionName } from "./types.ts";

/**
 * tmux client attachment.
 *
 * This module is the small end of the layer, and it is small on purpose: four methods, two argv
 * shapes for entering a session and two for leaving one. What it does *not* contain matters more
 * than what it does.
 *
 * ## The invariant this module encodes
 *
 * The workspace exists so that closing the app does not lose the view, while quitting the app does
 * not leave processes running. Those two requirements look contradictory and are reconciled in the
 * caller, not here:
 *
 * - **Deliberate quit** (`quitWorkspace`) kills the pane process trees and *then* calls
 *   {@link TmuxClient.detachClient}. The session, its windows and its layout survive; there is no
 *   `kill-session` on that path.
 * - **Incidental detach** (terminal closed, crash, app killed) runs {@link TmuxClient.detachClient}
 *   alone, and the pane processes survive so that re-attaching resumes live state.
 *
 * {@link TmuxClient.detachClient} therefore emits exactly one argv. It stops no process, does not
 * consult the `#{pane_pid}` listing, and — this is a characterisation test, not a style preference —
 * emits **no `kill*` command of any kind**. Any future "cleanup" added to this method destroys the
 * user's live workspace on every incidental detach. Do not add one.
 *
 * ## No `client-detached` hook
 *
 * A tmux `client-detached` hook that ran `kill-session` whenever `session_attached == 0` was
 * deliberately deleted. It conflated "the user quit" with "the client vanished" and destroyed both
 * the session and the agent process. Nothing in this module reinstates it, and no method here
 * conditions a session kill on a client detach. If a design for this module appears to want one,
 * the design is wrong.
 *
 * ## The `process.env.TMUX` branch
 *
 * Leaving a workspace has two genuinely different commands, and the environment variable is the
 * only thing that tells them apart:
 * {@link TmuxClient.detachClient} is for a **top-level** tmux client, and
 * {@link TmuxClient.switchClientLast} is for a client running **inside** tmux, which cannot
 * detach without taking its own window with it and so hands control back to the previous client.
 * Do not unify the two paths, and do not "simplify" the branch condition.
 */
export interface TmuxClientEntry {
	/**
	 * Enter `session` from outside tmux — `["tmux", "attach-session", "-t", session]`.
	 *
	 * Returns the command name that succeeded. Spawned with `stdin`/`stdout`/`stderr` all
	 * `"inherit"`: this is a terminal *handover*, not a pipe-captured read, so it must never be
	 * routed through {@link TmuxExec.run} — capturing stdout would break the attach.
	 *
	 * ⚠ `options` is part of the public surface, not an internal detail. The spawn seam it exposes
	 * is what lets a caller (and the argv-capturing tests) run this handover without a real
	 * terminal, and omitting it here silently drops that seam from every typed call site even
	 * though the factory accepts it. Pass `options` whenever you need a `spawn` override;
	 * `allowAttachFallback` is inert for this method, which has a single command to try.
	 */
	attachSession(session: TmuxSessionName, options?: TmuxClientSpawnOptions): Promise<string>;
	/**
	 * Enter `session` from inside tmux — `["tmux", "switch-client", "-t", session]`.
	 *
	 * ⚠ **Spec divergence.** `docs/tmux-layer-spec.md` §3.9 renders this argv as
	 * `["tmux", "switch-client", "attach-session", "-t", session]`, describing `attach-session` as an
	 * argument to `switch-client`. The source says otherwise: `attachWorkspaceClient` builds
	 * `["switch-client", "attach-session"]` as the *list of commands to try in order*, and spawns
	 * `["tmux", <command>, "-t", sessionName]` for each. tmux would read a literal `attach-session`
	 * element as a target-client name, so the spec's argv is not merely different from the source —
	 * it would fail. **The source wins**; this method reproduces the source.
	 *
	 * The fallback to `attach-session` is the second element of that command list, and it is why
	 * this method returns a command name. `attachClient` (the other site) picks `switch-client` from
	 * `process.env.TMUX` and does *not* fall back; pass `allowAttachFallback: false` to reproduce it.
	 */
	switchClientAttach(session: TmuxSessionName, options?: TmuxClientSpawnOptions): Promise<string>;
}

export interface TmuxClient extends TmuxClientEntry {
	/**
	 * Detach the top-level client from `session` — `["detach-client", "-t", session]`.
	 *
	 * ⚠ `-t`, **not** `-s`. libtmux's `Session.detach()` emits `-s`, which is a different target
	 * selector; adopting it would silently target the wrong thing or fail. This is deliberate.
	 *
	 * Non-throwing (plain {@link TmuxExec.run}) and completely inert beyond the detach itself — see
	 * the module note on the invariant.
	 */
	detachClient(session: TmuxSessionName): Promise<void>;
	/**
	 * Hand control back to the previously active client — `["switch-client", "-l"]`.
	 *
	 * ⚠ libtmux has **no** equivalent: its `switchClient(client, sessionId)` requires a `-t`
	 * argument and cannot express "switch to the last client". The `-l` is genuinely required and
	 * must survive verbatim.
	 *
	 * Non-throwing, like {@link TmuxClient.detachClient}.
	 */
	switchClientLast(): Promise<void>;
}

/** Injection point so tests can capture argv without attaching anything. */
export interface TmuxClientSpawnOptions {
	/** Defaults to `Bun.spawn`. Both attach methods hand the child a real terminal. */
	readonly spawn?: typeof Bun.spawn;
	/**
	 * Whether `switchClientAttach` may fall back to `attach-session` when `switch-client` exits
	 * non-zero. `true` (the default) mirrors `attachWorkspaceClient`; `false` mirrors `attachClient`.
	 */
	readonly allowAttachFallback?: boolean;
}

/** Anything injected by the caller that the client surface needs but does not own. */
export interface TmuxClientDependencies {
	/**
	 * The argv execution surface, used **only** by the two leaving methods
	 * ({@link TmuxClient.detachClient}, {@link TmuxClient.switchClientLast}).
	 *
	 * The two entry methods deliberately never touch it — they hand the terminal to `Bun.spawn`
	 * with inherited stdio instead, and routing them through `exec.run` would break the handover.
	 * Callers that only *enter* a session therefore do not need one at all and should depend on
	 * {@link TmuxClientEntry}; see {@link createTmuxClientEntry}.
	 */
	readonly exec: TmuxExec;
}

/**
 * The concrete `TmuxClient`.
 *
 * Holds the injected exec as a field and keeps no module state. `TmuxClient` itself stays the
 * structural contract so every call site can keep passing an object literal if it prefers.
 */
export class TmuxClientEntryImpl implements TmuxClientEntry {
	/**
	 * `["tmux", "attach-session", "-t", session]`, once.
	 *
	 * Deliberately *not* `exec.run`: `Bun.spawn` with all three standard streams inherited is what
	 * makes this a handover. Returns `"attach-session"`, or throws with the caller's wording.
	 */
	async attachSession(session: TmuxSessionName, options?: TmuxClientSpawnOptions): Promise<string> {
		return await enterSession(["attach-session"], session, options);
	}

	/**
	 * `["tmux", "switch-client", "-t", session]`, optionally falling back to `attach-session`.
	 *
	 * See the interface note: the spec's `["tmux", "switch-client", "attach-session", …]` argv is a
	 * misreading of the source's command *list*, and is not what tmux receives today.
	 */
	async switchClientAttach(session: TmuxSessionName, options?: TmuxClientSpawnOptions): Promise<string> {
		const commands = options?.allowAttachFallback === false ? ["switch-client"] : ["switch-client", "attach-session"];
		return await enterSession(commands, session, options);
	}
}

/**
 * The concrete `TmuxClient`: the entry surface plus the two leaving methods that need an exec.
 */
export class TmuxClientImpl extends TmuxClientEntryImpl implements TmuxClient {
	private readonly exec: TmuxExec;

	constructor(dependencies: TmuxClientDependencies) {
		super();
		this.exec = dependencies.exec;
	}

	/**
	 * The one command, inherited verbatim: `["detach-client", "-t", session]`.
	 *
	 * Note what is *absent*: no `#{pane_pid}` listing, no signalling, no session teardown. Detaching
	 * is the whole job, because on this path the processes must outlive us. `-t`, never libtmux's `-s`.
	 */
	async detachClient(session: TmuxSessionName): Promise<void> {
		await this.exec.run(["detach-client", "-t", session]);
	}

	/** `["switch-client", "-l"]`. Inherits stdio — this takes over the terminal. */
	async switchClientLast(): Promise<void> {
		await this.exec.run(["switch-client", "-l"]);
	}
}

/**
 * Build the client surface over an injected exec surface.
 *
 * A one-line factory kept for the two production consumers (`TmuxWorkspace`'s constructor and
 * `attachWorkspaceClient`); `new TmuxClientImpl({ exec })` is equivalent.
 *
 * ⚠ **`exec` is genuinely required, but only by the leaving methods.** Both entry methods bypass it
 * entirely, so a caller that only enters a session should use {@link createTmuxClientEntry} instead
 * of inventing an exec it never runs.
 */
export function createTmuxClient(exec: TmuxExec): TmuxClient {
	return new TmuxClientImpl({ exec });
}

/**
 * Build the entry-only surface — no exec, because neither entry method uses one.
 *
 * Used by `attachWorkspaceClient` in `tmux-workspace.ts`, which hands the terminal to `Bun.spawn`
 * with inherited stdio on both of its branches and would otherwise have to fabricate an exec.
 */
export function createTmuxClientEntry(): TmuxClientEntry {
	return new TmuxClientEntryImpl();
}

/**
 * Shared spawn-and-await-exit helper for the two entry points.
 *
 * Kept out of the class (and out of `exec`) precisely because it bypasses `exec.run`: the child
 * owns the terminal. Each command is tried in order and the first clean exit wins; the error
 * message names every attempted command, matching `attachWorkspaceClient`.
 */
async function enterSession(
	commands: readonly string[],
	session: TmuxSessionName,
	options?: TmuxClientSpawnOptions,
): Promise<string> {
	const spawn = options?.spawn ?? Bun.spawn;
	for (const command of commands) {
		const child = spawn(["tmux", command, "-t", session], {
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
		if ((await child.exited) === 0) return command;
	}
	throw new Error(`Could not enter tmux workspace: tmux ${commands.join(" then ")} failed`);
}
