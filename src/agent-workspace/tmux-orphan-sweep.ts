import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { captureProcessOutput } from "../process/capture.ts";

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

	const sessions = await runner.run(["list-sessions", "-F", "#{session_name}"]);
	if (sessions.exitCode !== 0) {
		if (isMissingTmux(sessions)) return result;
		throw new Error(`Could not list tmux sessions: ${sessions.stderr.trim() || "tmux list-sessions failed"}`);
	}

	for (const name of lines(sessions.stdout)) {
		if (!name.startsWith(WORKSPACE_SESSION_PREFIX)) continue;
		if (!(await isAbandoned(name, rootPath, ownedName, options.currentSessionName, runner, processes))) {
			result.kept.push(name);
			continue;
		}
		result.abandoned.push(name);
	}
	return result;
}

async function optionValue(runner: TmuxRunner, session: string, option: string): Promise<string | undefined> {
	const result = await runner.run(["show-options", "-qv", "-t", session, option]);
	if (result.exitCode !== 0) return undefined;
	const value = result.stdout.trim();
	return value ? value : undefined;
}

async function isAbandoned(
	name: string,
	rootPath: string,
	ownedName: string,
	currentSessionName: string | undefined,
	runner: TmuxRunner,
	processes: ProcessTree,
): Promise<boolean> {
	if (name === currentSessionName) return false;
	// Rule 1: only this project's workspace name (the prefix-only match is a
	// conservative superset, narrowed to one name by the owner check below).
	if (name !== ownedName) return false;
	const owner = await optionValue(runner, name, OWNER_OPTION);
	if (owner !== rootPath) return false;
	const clients = await runner.run(["list-clients", "-t", name, "-F", "#{client_pid}"]);
	// A session tmux cannot find is already gone: killing it stays a no-op success.
	if (clients.exitCode !== 0) return isMissingTmux(clients);
	if (lines(clients.stdout).length > 0) return false;
	const ownerPid = await optionValue(runner, name, OWNER_PID_OPTION);
	if (ownerPid && /^\d+$/.test(ownerPid))
		// A recorded host pid must be dead too; the owner marker itself is a path, not a pid.
		return !processes.alive(Number(ownerPid));
	return true;
}
