import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import lockfile from "proper-lockfile";
import type { AgentSessionRunner } from "./session-process.ts";
import { slug } from "./session-utils.ts";
import {
	AGENT_BOOTSTRAP_TYPES,
	AGENT_CONFIG_SCOPES,
	AGENT_SESSION_STATUS,
	type AgentSession,
	HANDOFF_STATUS,
	type HandoffRequest,
	type TaskSessions,
} from "./types.ts";

export interface SessionState extends TaskSessions {
	version: 1;
	hasSuccessfulSession?: boolean;
	handoffDocumentId?: string;
}

export interface SessionPaths {
	taskDir: string;
	statePath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function isPreset(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.command === "string" &&
		isStringRecord(value.env) &&
		typeof value.prepare === "string" &&
		typeof value.worktree === "boolean" &&
		AGENT_BOOTSTRAP_TYPES.includes(value.bootstrap as (typeof AGENT_BOOTSTRAP_TYPES)[number])
	);
}

function isSession(value: unknown, taskId: string): value is AgentSession {
	if (!isRecord(value)) return false;
	if (value.taskId !== taskId || !Object.values(AGENT_SESSION_STATUS).includes(value.status as AgentSession["status"]))
		return false;
	for (const key of ["id", "preset", "configScope", "tmuxName", "cwd", "createdAt", "outputPath", "bootstrapPath"]) {
		if (typeof value[key] !== "string") return false;
	}
	return (
		(value.paneId === undefined || typeof value.paneId === "string") &&
		(value.status === AGENT_SESSION_STATUS.STARTING || typeof value.paneId === "string") &&
		(value.presetSnapshot === undefined || isPreset(value.presetSnapshot)) &&
		AGENT_CONFIG_SCOPES.includes(value.configScope as AgentSession["configScope"]) &&
		["endedAt", "predecessorId", "error"].every((key) => value[key] === undefined || typeof value[key] === "string") &&
		(value.ownerPid === undefined || typeof value.ownerPid === "number")
	);
}

function isHandoff(value: unknown): value is HandoffRequest {
	if (!isRecord(value) || !Object.values(HANDOFF_STATUS).includes(value.status as HandoffRequest["status"]))
		return false;
	if (!["id", "sessionId", "documentPath", "createdAt"].every((key) => typeof value[key] === "string")) return false;
	if (!["dispatchedAt", "error"].every((key) => value[key] === undefined || typeof value[key] === "string"))
		return false;
	if (
		!["dispatchOwnerPid", "replacementOwnerPid"].every(
			(key) => value[key] === undefined || typeof value[key] === "number",
		)
	)
		return false;
	const document = value.document;
	return (
		document === undefined ||
		(isRecord(document) &&
			["id", "title", "type", "createdDate", "path"].every((key) => typeof document[key] === "string") &&
			(document.tags === undefined ||
				(Array.isArray(document.tags) && document.tags.every((tag) => typeof tag === "string"))))
	);
}

/** Owns the durable state and files for one project's task sessions. */
export class SessionStore {
	constructor(
		private readonly rootDir: string,
		private readonly runner: AgentSessionRunner,
	) {}

	async read(taskId: string): Promise<SessionState> {
		const { statePath } = await this.paths(taskId);
		try {
			return this.validate(JSON.parse(await Bun.file(statePath).text()), taskId);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.empty(taskId);
			throw new Error(
				`Could not read session state for ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async mutate<T>(taskId: string, fn: (state: SessionState) => Promise<T>): Promise<T> {
		const paths = await this.paths(taskId);
		await mkdir(paths.taskDir, { recursive: true });
		const release = await lockfile.lock(paths.statePath, {
			realpath: false,
			stale: 30_000,
			update: 5_000,
			retries: { retries: 20, minTimeout: 25, maxTimeout: 100 },
		});
		try {
			const state = await this.read(taskId);
			const result = await fn(state);
			this.validate(state, taskId);
			await this.write(paths.statePath, `${JSON.stringify(state, null, "\t")}\n`);
			return result;
		} finally {
			await release();
		}
	}

	async paths(taskId: string): Promise<SessionPaths> {
		const git = await this.runner.run(["git", "rev-parse", "--git-common-dir"], { cwd: this.rootDir });
		const projectHash = createHash("sha256").update(resolve(this.rootDir)).digest("hex").slice(0, 16);
		const root =
			git.exitCode === 0 && git.stdout.trim()
				? join(resolve(this.rootDir, git.stdout.trim()), "backlog-workspace")
				: join(
						process.env.XDG_STATE_HOME ?? join(process.env.HOME ?? "/tmp", ".local", "state"),
						"backlog-workspace",
						projectHash,
					);
		const taskDir = join(root, projectHash, slug(taskId));
		return { taskDir, statePath: join(taskDir, "state.json") };
	}

	async write(path: string, content: string): Promise<void> {
		await mkdir(dirname(path), { recursive: true });
		const temporary = `${path}.${randomUUID()}.tmp`;
		await Bun.write(temporary, content);
		await rename(temporary, path);
	}

	private empty(taskId: string): SessionState {
		return { version: 1, taskId, sessions: [] };
	}

	private validate(value: unknown, taskId: string): SessionState {
		if (!isRecord(value) || value.version !== 1 || value.taskId !== taskId || !Array.isArray(value.sessions))
			throw new Error("invalid state");
		if (
			!value.sessions.every((session) => isSession(session, taskId)) ||
			(value.activeSessionId !== undefined && typeof value.activeSessionId !== "string") ||
			(value.worktreePath !== undefined && typeof value.worktreePath !== "string") ||
			(value.hasSuccessfulSession !== undefined && typeof value.hasSuccessfulSession !== "boolean") ||
			(value.handoffDocumentId !== undefined && typeof value.handoffDocumentId !== "string") ||
			(value.handoff !== undefined && !isHandoff(value.handoff))
		)
			throw new Error("invalid state");
		return value as unknown as SessionState;
	}
}
