/**
 * Server + session object domain of the tmux abstraction layer.
 *
 * ## SAFETY — read before calling anything here
 *
 * This module contains the *only* destructive tmux operations the layer exposes. Two rules govern
 * it and must not be relaxed by a later refactor:
 *
 * 1. **`killSession` has no production caller.** A deliberate user quit (`quitWorkspace`) kills
 *    pane process trees and then *detaches the client*; it deliberately never kills the session,
 *    because the session holds the window/pane layout that the next `backlog workspace` reopens.
 *    The only production path that destroys a session is the orphan sweep inside
 *    `collectAbandonedHost`, and that goes through {@link TmuxServerSession.killSessionIfPresent}.
 *    Do **not** add a `killSession` call to a teardown, error path, or CLI command. Doing so
 *    re-introduces the bug that destroyed the user's live tmux view on quit.
 * 2. **`killSessionIfPresent` is not a catch-all.** It swallows *specific* failures (an absent
 *    session / absent server) and rethrows everything else. The distinction is deliberate: a
 *    `server exited unexpectedly` must surface so the caller can fall back to `rebuildTopology()`,
 *    not be silently treated as "already gone".
 *
 * ## socket discipline
 *
 * Nothing in this module ever runs a mutating tmux command on the default socket. Every argv here
 * targets an explicitly named session, and the layer is only ever wired to the workspace's own
 * dedicated socket. Listing argv (`list-sessions`, `list-clients`) is read-only and safe.
 */

import type { TmuxExec } from "./exec.ts";
import { SESSION_ABSENT } from "./exec.ts";
import type { TmuxResult, TmuxSessionName } from "./types.ts";

/**
 * tmux failures that mean "the thing is already gone", as used by the orphan sweep.
 *
 * Deliberately NOT `SESSION_ABSENT` from `./exec.ts`: this one is also case-insensitive and
 * additionally accepts `server exited`, and the sweep tests it against `stderr + "\n" + stdout`
 * rather than against a lower-cased stderr alone. Those are different tests over different
 * patterns; reusing `SESSION_ABSENT` here would quietly narrow the sweep's "already gone"
 * definition and change which sessions it is willing to treat as corpses.
 */
const MISSING_TMUX_PATTERN = /can't find session|no server running|error connecting|server exited/i;

/**
 * The slice of the libtmux object graph this module needs.
 *
 * `TmuxWorkspaceServer` satisfies it structurally. `hasSession` is a *libtmux handle*, not raw
 * argv (spec §3.3): it is one of the sites that already reads the object graph rather than shelling
 * out, so it is delegated unchanged rather than re-expressed as `list-sessions`.
 */
export interface TmuxSessionGraph {
	hasSession(name: TmuxSessionName): Promise<boolean>;
}

/** Everything {@link createTmuxServerSession} is built over. */
export interface TmuxServerSessionDependencies {
	readonly exec: TmuxExec;
	readonly graph: TmuxSessionGraph;
}

export interface TmuxServerSession {
	/** libtmux object-graph lookup. Emits no raw argv. */
	hasSession(name: TmuxSessionName): Promise<boolean>;
	/** Every session name on the connected server. Read-only. */
	listSessions(): Promise<readonly string[]>;
	/** Client pids attached to `session`. Read-only. */
	listClients(session: TmuxSessionName): Promise<readonly string[]>;
	/**
	 * UNCONDITIONAL session destruction. No production caller — see the module comment.
	 * Throws on any non-zero exit, including "session already absent".
	 */
	killSession(name: TmuxSessionName, message?: string): Promise<void>;
	/** Destroys `name`, but treats an already-absent session/server as success. */
	killSessionIfPresent(name: TmuxSessionName, message?: string): Promise<void>;
	/** Atomic tmux conditional: runs `command` iff `format` expands true in `session`. */
	ifShell(session: TmuxSessionName, format: string, command: string, message?: string): Promise<void>;
}

/**
 * The concrete `TmuxServerSession`. Holds the injected `exec` surface and object graph as fields;
 * there is no module state, so the sweep and the workspace can each build one without this module
 * importing anything else of the layer.
 *
 * The `TmuxServerSession` *interface* stays the structural contract — `tmux-orphan-sweep.ts` and
 * the tests build object literals, so the interface must not become a class. In particular the
 * sweep supplies a deliberately *throwing* `graph.hasSession`; see the `SAFETY:` comment at that
 * call site, which this class does not invalidate (its only caller of `graph.hasSession` remains
 * the exported `hasSession` wrapper, and `listSessions` is still implemented purely over `exec`).
 */
export class TmuxServerSessionImpl implements TmuxServerSession {
	private readonly exec: TmuxExec;
	private readonly graph: TmuxSessionGraph;

	constructor(dependencies: TmuxServerSessionDependencies) {
		this.exec = dependencies.exec;
		this.graph = dependencies.graph;
	}

	async hasSession(name: TmuxSessionName): Promise<boolean> {
		return await this.graph.hasSession(name);
	}

	async listSessions(): Promise<readonly string[]> {
		const result = await this.exec.run(["list-sessions", "-F", "#{session_name}"]);
		if (result.exitCode !== 0) {
			// No server at all: nothing to list, and that is not a failure.
			if (isMissingTmux(result)) return [];
			throw new Error(`Could not list tmux sessions: ${result.stderr.trim() || "tmux list-sessions failed"}`);
		}
		return lines(result.stdout);
	}

	async listClients(session: TmuxSessionName): Promise<readonly string[]> {
		const result = await this.exec.run(["list-clients", "-t", session, "-F", "#{client_pid}"]);
		// A session tmux cannot find is already gone: it has, by definition, no clients.
		// A *different* failure throws rather than returning `[]` — see the note on this method
		// in the module report; `[]` is indistinguishable from "attached to nobody" and would
		// otherwise read as "abandoned, kill it".
		if (result.exitCode !== 0) {
			if (isMissingTmux(result)) return [];
			throw new Error(`Could not list tmux clients: ${result.stderr.trim() || "tmux list-clients failed"}`);
		}
		return lines(result.stdout);
	}

	async killSession(name: TmuxSessionName, message?: string): Promise<void> {
		await this.exec.require(["kill-session", "-t", name], message ?? "Could not kill tmux session");
	}

	/**
	 * `exitCode === 0 || SESSION_ABSENT.test(stderr.toLowerCase())` → return quietly.
	 * Anything else is a real failure and is rethrown, so the caller can fall back to
	 * `rebuildTopology()`. This is deliberately NOT a generic try/catch around the call.
	 *
	 * The only production caller is the orphan sweep in `collectAbandonedHost`, whose own
	 * `try/catch` converts a rethrow into the reuse path.
	 */
	async killSessionIfPresent(name: TmuxSessionName, message?: string): Promise<void> {
		const killed = await this.exec.run(["kill-session", "-t", name]);
		if (killed.exitCode === 0 || SESSION_ABSENT.test(killed.stderr.toLowerCase())) return;
		throw new Error(`${message ?? "Could not quit tmux workspace"}: ${killed.stderr.trim() || "tmux command failed"}`);
	}

	/**
	 * A genuine tmux conditional — atomic, evaluated by tmux itself.
	 *
	 * Do NOT substitute this for a read-then-toggle, and do NOT split `command` on spaces: the
	 * `takeTaskRequest` call site passes `` `set-option -t ${session} ${MAILBOX} ''` `` as ONE argv
	 * element and tmux parses it as a command string.
	 */
	async ifShell(session: TmuxSessionName, format: string, command: string, message?: string): Promise<void> {
		await this.exec.require(
			["if-shell", "-t", session, "-F", format, command],
			message ?? "Could not run tmux if-shell",
		);
	}
}

/**
 * Build the server + session domain.
 *
 * A thin wrapper kept for the two production consumers (`tmux-workspace.ts` and
 * `tmux-orphan-sweep.ts`); `new TmuxServerSessionImpl(dependencies)` is equivalent. The dependency
 * shape is unchanged from the factory, so the sweep's throwing `graph` stub still satisfies it.
 */
export function createTmuxServerSession(dependencies: TmuxServerSessionDependencies): TmuxServerSession {
	return new TmuxServerSessionImpl(dependencies);
}

/** The orphan sweep's "already gone" test: stderr and stdout, case-insensitive, incl. `server exited`. */
function isMissingTmux(result: TmuxResult): boolean {
	return result.exitCode !== 0 && MISSING_TMUX_PATTERN.test(`${result.stderr}\n${result.stdout}`);
}

/** Output shape of the listing methods — trims, drops blanks, never yields `[""]` for empty output. */
function lines(stdout: string): string[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}
