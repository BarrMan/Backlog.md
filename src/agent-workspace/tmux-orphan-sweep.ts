import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { TmuxCommandError } from "libtmux";
import { captureProcessOutput } from "../process/capture.ts";
import { createTmuxExec, type TmuxExec } from "./tmux/exec.ts";
import { createTmuxOptions, type TmuxOptions } from "./tmux/options.ts";
import { createTmuxServerSession } from "./tmux/server-session.ts";

/** Session name prefix shared by every Backlog workspace host. */
export const WORKSPACE_SESSION_PREFIX = "backlog-workspace-";
/**
 * Session option the host publishes so it can recognise its own session
 * (`src/agent-workspace/tmux-workspace.ts`). It holds the realpath of the project
 * root, NOT a pid — see `OWNER` usage in that file.
 */
export const OWNER_OPTION = "@backlog_workspace_owner";
/**
 * Session option holding the pid of the process that last claimed the session. It upgrades
 * the liveness check in {@link findAbandonedWorkspaces} from "unattached" to "provably dead pid".
 */
export const OWNER_PID_OPTION = "@backlog_workspace_owner_pid";

/** tmux failures that mean "the thing is already gone" and therefore count as success. */
const MISSING_TMUX_PATTERN = /can't find session|no server running|error connecting|server exited/i;

export interface TmuxCommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/** Minimal tmux runner; `BunRunner` below is the default. */
export interface TmuxRunner {
	run(args: readonly string[]): Promise<TmuxCommandResult>;
}

/**
 * The outcome of asking tmux who is attached to a session.
 *
 * The sweep's `isAbandoned` is a TRI-STATE decision, and a plain `readonly string[]` cannot carry
 * it: `[]` means both "nobody is attached" (⇒ the session is a corpse and may be killed) and "we
 * could not find out" (⇒ we must not kill anything). Collapsing the second case into the first
 * turns a transient tmux error into a session kill — the exact catastrophic failure mode this
 * sweep exists to prevent. The three cases therefore stay distinct all the way to the caller:
 *
 * - `listed`  — tmux answered; `clients` is authoritative.
 * - `missing` — tmux says the session/server is gone; the corpse is already collected, so the
 *   session is abandoned.
 * - `failed`  — tmux failed for any other reason (a permission error, a transient socket fault);
 *   the session is **kept**, never killed.
 */
export type TmuxClientListing =
	| { readonly kind: "listed"; readonly clients: readonly string[] }
	| { readonly kind: "missing" }
	| { readonly kind: "failed"; readonly reason: string };

/** Liveness probe for the recorded host pid; `SystemProcesses` is the default. */
export interface ProcessTree {
	alive(pid: number): boolean;
}

export interface SweepOptions {
	/** Project root whose workspace session this sweep is allowed to consider. */
	rootPath: string;
	/** Session the caller is currently using; it is never reported as abandoned. */
	currentSessionName?: string;
	runner?: TmuxRunner;
	processes?: ProcessTree;
}

export interface SweepResult {
	/** Sessions left behind by a host that is provably gone. The caller kills them. */
	abandoned: string[];
	/** Workspace sessions that are still in use and must be left alone. */
	kept: string[];
}

export class BunRunner implements TmuxRunner {
	async run(args: readonly string[]): Promise<TmuxCommandResult> {
		const child = Bun.spawn(["tmux", ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
		return await captureProcessOutput(child);
	}
}

/** `process.kill(pid, 0)` liveness probe; EPERM means the process exists but belongs to another user. */
export class SystemProcesses implements ProcessTree {
	alive(pid: number): boolean {
		try {
			process.kill(pid, 0);
			return true;
		} catch (error) {
			return (error as NodeJS.ErrnoException).code === "EPERM";
		}
	}
}

/** The workspace session name this root derives, mirroring `TmuxWorkspace`. */
export function workspaceSessionName(rootPath: string): string {
	const hash = createHash("sha256").update(realpathSync(rootPath)).digest("hex").slice(0, 12);
	return `${WORKSPACE_SESSION_PREFIX}${hash}`;
}

function isMissingTmux(result: TmuxCommandResult): boolean {
	return result.exitCode !== 0 && MISSING_TMUX_PATTERN.test(`${result.stderr}\n${result.stdout}`);
}

/**
 * The tmux layer, built over the injected {@link TmuxRunner}.
 *
 * The runner predates the layer and is what the tests inject, so this adapter is the seam: it
 * replays `run([command, ...args])` as a `cmd(command, args)` call and re-raises a non-zero exit as
 * libtmux's `TmuxCommandError`, which is the only thing `exec.ts` knows how to turn back into a
 * value. Line splitting mirrors what libtmux's own `cmd` does, so `exec`'s `outputText`
 * normalisation round-trips the runner's stdout byte for byte.
 */
function execOver(runner: TmuxRunner): TmuxExec {
	return createTmuxExec({
		runner: {
			cmd: async (command, args) => {
				const argv = [command, ...(args ?? [])];
				const result = await runner.run(argv);
				if (result.exitCode !== 0)
					throw new TmuxCommandError({
						args: argv,
						exitCode: result.exitCode,
						stdout: outputLines(result.stdout),
						stderr: outputLines(result.stderr),
					});
				return outputLines(result.stdout);
			},
		},
	});
}

/** What libtmux's `cmd` hands back: stdout split on newlines, with no trailing empty element. */
function outputLines(text: string): string[] {
	if (!text) return [];
	return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
}

/**
 * `list-clients` with the tri-state preserved.
 *
 * This is deliberately *not* `TmuxServerSession.listClients`, whose contract is
 * `readonly string[]` and which cannot distinguish "attached to nobody" from "could not ask".
 * The argv is identical; only the outcome typing differs.
 */
async function listClients(exec: TmuxExec, session: string): Promise<TmuxClientListing> {
	const result = await exec.run(["list-clients", "-t", session, "-F", "#{client_pid}"]);
	if (result.exitCode === 0) return { kind: "listed", clients: lines(result.stdout) };
	if (isMissingTmux(result)) return { kind: "missing" };
	return { kind: "failed", reason: result.stderr.trim() || "tmux list-clients failed" };
}

function lines(stdout: string): string[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

/**
 * Report Backlog workspace sessions left behind by a crashed host, so the caller can tear them
 * down with its own teardown path.
 *
 * A session is killed only when every one of these holds:
 * 1. its name is this root's workspace session name (or, more loosely, the workspace
 *    prefix) — another project's workspace and any non-Backlog tmux session are ignored;
 * 2. it is not `currentSessionName`;
 * 3. its `@backlog_workspace_owner` option equals this root's realpath, proving Backlog
 *    created it for this project;
 * 4. no client is attached to it;
 * 5. its owner is not alive — the recorded owner is a root path, not a pid
 *    (`tmux-workspace.ts` sets `@backlog_workspace_owner` to `this.rootPath`), so the
 *    strongest available signal is "no attached client"; when the session also carries
 *    `@backlog_workspace_owner_pid`, that pid must additionally be dead.
 */
export async function findAbandonedWorkspaces(options: SweepOptions): Promise<SweepResult> {
	const runner = options.runner ?? new BunRunner();
	const processes = options.processes ?? new SystemProcesses();
	const rootPath = realpathSync(options.rootPath);
	const ownedName = workspaceSessionName(rootPath);
	const result: SweepResult = { abandoned: [], kept: [] };

	const exec = execOver(runner);
	const sessions = createTmuxServerSession({
		exec,
		// SAFETY: this stub is unreachable, and that is a checked property of the code below —
		// not a hope. Trace it:
		//   * The only thing this file does with the returned `TmuxServerSession` is
		//     `sessions.listSessions()`. Everything else (`showOption`, `list-clients`) is driven
		//     straight off `exec` via `createTmuxOptions(exec)` and `listClients(exec, name)`.
		//   * Inside `server-session.ts`, the sole path to `graph.hasSession` is the exported
		//     `hasSession(name)` wrapper. `listSessions` is implemented purely over `exec`
		//     (`list-sessions -F '#{session_name}'`) and never touches `graph`.
		// So the throw cannot fire on any current path; it exists so that if a future edit ever
		// routes this sweep through `hasSession`, the failure is immediate and loud rather than a
		// fabricated answer in a path that decides which sessions to destroy.
		//
		// IF IT EVER BECOMES REACHABLE, DO NOT paper over it. Either (a) give the sweep a real
		// `hasSession` backed by the injected `TmuxRunner` — note `TmuxRunner.run` takes raw argv,
		// so this means emitting `has-session -t <name>` (check `exitCode !== 0` against
		// MISSING_TMUX_PATTERN so an absent session answers false, never throws); or (b) drop the
		// `createTmuxServerSession` dependency entirely and call `exec.run(["list-sessions", ...])`
		// here, which is all this sweep actually needs.
		graph: {
			hasSession: () => {
				throw new Error("the orphan sweep never performs a libtmux object-graph lookup; see the SAFETY comment above");
			},
		},
	});

	const listed = await sessions.listSessions();

	for (const name of listed) {
		if (!name.startsWith(WORKSPACE_SESSION_PREFIX)) continue;
		const verdict = await isAbandoned(name, rootPath, ownedName, options.currentSessionName, exec, processes);
		if (verdict.kind === "abandoned") result.abandoned.push(name);
		else result.kept.push(name);
	}
	return result;
}

/**
 * Why the sweep looks at a session, and the liveness evidence behind it.
 *
 * `failed` is reported separately rather than folded into `kept` so that a caller — and a human
 * reading a log — can tell "we know this session is alive" from "we could not find out". Only the
 * caller decides what to do with it; nothing here ever decides to kill.
 */
type AbandonmentVerdict = { kind: "abandoned" } | { kind: "kept" } | { kind: "failed"; reason: string };

async function isAbandoned(
	name: string,
	rootPath: string,
	ownedName: string,
	currentSessionName: string | undefined,
	exec: TmuxExec,
	processes: ProcessTree,
): Promise<AbandonmentVerdict> {
	if (name === currentSessionName) return { kind: "kept" };
	// Rule 1: only this project's workspace name (the prefix-only match is a
	// conservative superset, narrowed to one name by the owner check below).
	if (name !== ownedName) return { kind: "kept" };
	const tmuxOptions: TmuxOptions = createTmuxOptions(exec);
	const owner = await tmuxOptions.showOption(OWNER_OPTION, name);
	if (owner !== rootPath) return { kind: "kept" };
	const clients = await listClients(exec, name);
	// A session tmux cannot find is already gone: killing it stays a no-op success.
	if (clients.kind === "missing") return { kind: "abandoned" };
	// A tmux failure that is *not* "already gone" is never evidence of abandonment. Reporting it as
	// such would let a transient error kill a session that is very much in use.
	if (clients.kind === "failed") return { kind: "failed", reason: clients.reason };
	if (clients.clients.length > 0) return { kind: "kept" };
	const ownerPid = await tmuxOptions.showOption(OWNER_PID_OPTION, name);
	if (ownerPid && /^\d+$/.test(ownerPid))
		// A recorded host pid must be dead too; the owner marker itself is a path, not a pid.
		return processes.alive(Number(ownerPid)) ? { kind: "kept" } : { kind: "abandoned" };
	return { kind: "abandoned" };
}
