import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
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

const SESSION_KEYS = new Set([
	"id",
	"taskId",
	"preset",
	"presetSnapshot",
	"configScope",
	"tmuxName",
	"nativeSessionId",
	"cwd",
	"createdAt",
	"status",
	"ownerPid",
	"outputPath",
	"bootstrapPath",
	"endedAt",
	"predecessorId",
	"error",
	"lastUsedAt",
	"useCount",
]);

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>): boolean {
	return Object.keys(value).every((key) => keys.has(key));
}

function isSession(value: unknown, taskId: string): value is AgentSession {
	if (!isRecord(value) || !hasOnlyKeys(value, SESSION_KEYS)) return false;
	if (value.taskId !== taskId || !Object.values(AGENT_SESSION_STATUS).includes(value.status as AgentSession["status"]))
		return false;
	for (const key of ["id", "preset", "configScope", "tmuxName", "cwd", "createdAt", "outputPath", "bootstrapPath"]) {
		if (typeof value[key] !== "string") return false;
	}
	return (
		(value.presetSnapshot === undefined || isPreset(value.presetSnapshot)) &&
		AGENT_CONFIG_SCOPES.includes(value.configScope as AgentSession["configScope"]) &&
		["nativeSessionId", "endedAt", "predecessorId", "error", "lastUsedAt"].every(
			(key) => value[key] === undefined || typeof value[key] === "string",
		) &&
		(value.ownerPid === undefined || typeof value.ownerPid === "number") &&
		(value.useCount === undefined || (typeof value.useCount === "number" && value.useCount >= 0))
	);
}

function isHandoff(value: unknown): value is HandoffRequest {
	if (!isRecord(value) || !Object.values(HANDOFF_STATUS).includes(value.status as HandoffRequest["status"]))
		return false;
	if (!["id", "sessionId", "createdAt"].every((key) => typeof value[key] === "string")) return false;
	if (value.documentPath !== undefined && typeof value.documentPath !== "string") return false;
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
			if (error instanceof Error && error.message === "invalid state") {
				throw new Error(
					`Invalid agent session state for ${taskId}. Reset it with: backlog agent-session reset ${taskId}`,
				);
			}
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
		const taskDir = join(await this.projectStateRoot(), slug(taskId));
		return { taskDir, statePath: join(taskDir, "state.json") };
	}

	async reset(taskId: string): Promise<void> {
		const { statePath } = await this.paths(taskId);
		await rm(statePath, { force: true });
	}

	async readAll(): Promise<SessionState[]> {
		const root = await this.projectStateRoot();
		let entries: string[];
		try {
			entries = (await readdir(root, { withFileTypes: true }))
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
		const states: SessionState[] = [];
		for (const entry of entries) {
			try {
				const parsed = JSON.parse(await Bun.file(join(root, entry, "state.json")).text());
				if (isRecord(parsed) && typeof parsed.taskId === "string") states.push(this.validate(parsed, parsed.taskId));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		return states;
	}

	async write(path: string, content: string): Promise<void> {
		await mkdir(dirname(path), { recursive: true });
		const temporary = `${path}.${randomUUID()}.tmp`;
		await Bun.write(temporary, content);
		await rename(temporary, path);
	}

	private async projectStateRoot(): Promise<string> {
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
		return join(root, projectHash);
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
