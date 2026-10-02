import { randomUUID } from "node:crypto";
import { delimiter, join } from "node:path";
import { DEFAULT_IN_PROGRESS_STATUS, DEFAULT_STATUSES } from "../constants/index.ts";
import type { Core } from "../core/backlog.ts";
import { TASK_SOURCE } from "../types/index.ts";
import { renderSessionBootstrap } from "./bootstrap.ts";
import { resolveAgentConfiguration } from "./config.ts";
import { type AgentSessionRunner, BunRunner, SessionProcess } from "./session-process.ts";
import { type SessionState, SessionStore } from "./session-store.ts";
import { slug } from "./session-utils.ts";
import { spawnSessionWorker } from "./session-worker-client.ts";
import { ensureSessionWorktree } from "./session-worktree.ts";
import {
	AGENT_SESSION_STATUS,
	type AgentPreset,
	type AgentSession,
	HANDOFF_STATUS,
	type HandoffRequest,
	type HandoffStatus,
	type TaskSessions,
} from "./types.ts";

const TERMINAL_HANDOFF_STATUSES = new Set<HandoffStatus>([HANDOFF_STATUS.COMPLETED, HANDOFF_STATUS.FAILED]);
const REPLACEABLE_HANDOFF_STATUSES = new Set<HandoffStatus>([HANDOFF_STATUS.READY, HANDOFF_STATUS.FAILED]);
const DEFAULT_MAX_RUNNING_AGENT_SESSIONS = 10;

export type { AgentSessionRunner } from "./session-process.ts";

function timestamp(): string {
	return new Date().toISOString();
}

/** Durable task-scoped tmux sessions. State operations are short; terminals never run while a state lock is held. */
export class AgentSessionService {
	private readonly runner: AgentSessionRunner;
	private readonly process: SessionProcess;
	private readonly store: SessionStore;
	private readonly backgroundWorkers: boolean;

	constructor(
		private readonly core: Core,
		options: { runner?: AgentSessionRunner } = {},
	) {
		this.runner = options.runner ?? new BunRunner();
		this.process = new SessionProcess(this.runner, this.core.filesystem.rootDir);
		this.store = new SessionStore(this.core.filesystem.rootDir, this.runner);
		this.backgroundWorkers = !options.runner;
	}

	async list(taskId: string): Promise<TaskSessions> {
		const task = await this.requireTask(taskId);
		return await this.store.read(task.id);
	}

	async start(
		taskId: string,
		options: { preset?: string; predecessorId?: string; maxRunningSessions?: number } = {},
	): Promise<AgentSession> {
		if (options.predecessorId) throw new Error("Use agent-session handoff to replace a session.");
		const task = await this.requireTask(taskId);
		const resolved = await resolveAgentConfiguration(this.core, task.id);
		const presetName = options.preset ?? resolved.config.selectedPreset;
		const preset = resolved.config.presets[presetName];
		if (!preset) throw new Error(`Agent preset not found: ${presetName}`);
		return await this.startReserved(task, presetName, preset, resolved.scope, {
			maxRunningSessions: options.maxRunningSessions,
		});
	}

	private async startReserved(
		task: { id: string; status: string },
		presetName: string,
		preset: AgentPreset,
		configScope: AgentSession["configScope"],
		options: { predecessorId?: string; cwd?: string; maxRunningSessions?: number } = {},
	): Promise<AgentSession> {
		const inProgress = await this.inProgressStatus();
		const paths = await this.store.paths(task.id);
		let session: AgentSession | undefined;
		await this.store.mutate(task.id, async (state) => {
			if (state.handoff?.status === HANDOFF_STATUS.REPLACING && state.handoff.sessionId !== options.predecessorId)
				throw new Error(`Task ${task.id} is replacing its agent session.`);
			if (
				state.sessions.some(
					(candidate) =>
						candidate.id !== options.predecessorId &&
						(candidate.status === AGENT_SESSION_STATUS.STARTING || candidate.status === AGENT_SESSION_STATUS.RUNNING),
				)
			)
				throw new Error(`Task ${task.id} already has an active agent session.`);
			const id = randomUUID();
			const cwd =
				options.cwd ??
				(preset.worktree ? (state.worktreePath ?? join(paths.taskDir, "worktree")) : this.core.filesystem.rootDir);
			if (preset.worktree) state.worktreePath = cwd;
			const next: AgentSession = {
				id,
				taskId: task.id,
				preset: presetName,
				presetSnapshot: structuredClone(preset),
				configScope,
				tmuxName: `backlog-${slug(task.id)}-${id.slice(0, 8)}`,
				cwd,
				createdAt: timestamp(),
				status: AGENT_SESSION_STATUS.STARTING,
				ownerPid: process.pid,
				...(options.predecessorId && { predecessorId: options.predecessorId }),
				outputPath: join(paths.taskDir, `${id}.log`),
				bootstrapPath: join(paths.taskDir, `${id}.md`),
			};
			session = next;
			state.sessions.push(next);
			if (!options.predecessorId) state.activeSessionId = next.id;
		});
		if (!session) throw new Error("Could not reserve an agent session.");
		const reserved = session;
		// The state claim above prevents a concurrent launch; all expensive work follows outside the lock.
		try {
			if (preset.worktree)
				await ensureSessionWorktree(this.runner, this.core.filesystem.rootDir, task.id, reserved.cwd);
			const env = this.environment(reserved, preset.env);
			await this.process.create(reserved, env);
			if (preset.prepare) await this.process.prepare(preset.prepare, reserved.cwd, env);
			await this.store.write(
				reserved.bootstrapPath,
				renderSessionBootstrap({
					taskId: task.id,
					sessionId: reserved.id,
					projectRoot: this.core.filesystem.rootDir,
					cwd: reserved.cwd,
					configScope,
					worktree: preset.worktree,
				}),
			);
			await this.process.preparePane(reserved);
			await this.process.launch(reserved, preset);
			const first = !(await this.store.read(task.id)).hasSuccessfulSession;
			const latest = await this.requireTask(task.id);
			if (
				first &&
				latest.status === task.status &&
				latest.status.toLocaleLowerCase() !== inProgress.toLocaleLowerCase()
			) {
				await this.core.updateTaskFromInput(task.id, { status: inProgress }, false, { includeCrossBranch: false });
			}
			await this.store.mutate(task.id, async (state) => {
				const current = this.session(state, reserved.id);
				current.status = AGENT_SESSION_STATUS.RUNNING;
				current.ownerPid = undefined;
				current.error = undefined;
				this.touch(current, timestamp());
				state.activeSessionId = current.id;
				state.hasSuccessfulSession = true;
			});
			reserved.status = AGENT_SESSION_STATUS.RUNNING;
			this.touch(reserved, timestamp());
			await this.enforceRunningLimit(reserved, options.maxRunningSessions ?? DEFAULT_MAX_RUNNING_AGENT_SESSIONS);
			return reserved;
		} catch (error) {
			await this.process.kill(reserved);
			await this.store.mutate(task.id, async (state) => {
				const current = this.session(state, reserved.id);
				current.status = AGENT_SESSION_STATUS.FAILED;
				current.endedAt = timestamp();
				current.error = error instanceof Error ? error.message : String(error);
				if (state.activeSessionId === current.id) delete state.activeSessionId;
			});
			reserved.status = AGENT_SESSION_STATUS.FAILED;
			reserved.endedAt = timestamp();
			reserved.error = error instanceof Error ? error.message : String(error);
			throw error;
		}
	}

	async stop(taskId: string, sessionId?: string): Promise<void> {
		const { task, session } = await this.sessionSnapshot(taskId, sessionId);
		await this.process.kill(session);
		await this.store.mutate(task.id, async (state) => {
			const current = this.session(state, session.id);
			current.status = AGENT_SESSION_STATUS.STOPPED;
			current.endedAt = timestamp();
			if (state.activeSessionId === current.id) delete state.activeSessionId;
		});
	}

	async output(taskId: string, sessionId?: string): Promise<string> {
		const { task, session } = await this.sessionSnapshot(taskId, sessionId, false);
		await this.touchSession(task.id, session.id);
		try {
			return await Bun.file(session.outputPath).text();
		} catch {
			throw new Error(`Could not read session ${session.id} output.`);
		}
	}

	async attach(taskId: string, sessionId?: string): Promise<void> {
		const { task, session } = await this.sessionSnapshot(taskId, sessionId);
		await this.touchSession(task.id, session.id);
		await this.process.attach(session);
	}

	async requestHandoff(taskId: string): Promise<HandoffRequest> {
		const task = await this.requireTask(taskId);
		let request: HandoffRequest | undefined;
		await this.store.mutate(task.id, async (state) => {
			if (state.handoff?.status === HANDOFF_STATUS.FAILED) {
				state.handoff.status = HANDOFF_STATUS.READY;
				state.handoff.error = undefined;
				request = state.handoff;
				return;
			}
			if (state.handoff && !TERMINAL_HANDOFF_STATUSES.has(state.handoff.status))
				throw new Error(`Task ${task.id} already has a handoff request.`);
			const active = this.active(state);
			this.touch(active, timestamp());
			const next: HandoffRequest = {
				id: randomUUID(),
				sessionId: active.id,
				status: HANDOFF_STATUS.READY,
				createdAt: timestamp(),
			};
			request = next;
			state.handoff = next;
		});
		if (!request) throw new Error("Could not reserve a handoff request.");
		if (this.backgroundWorkers) await spawnSessionWorker("handoff-continue", task.id, this.core.filesystem.rootDir);
		return request;
	}

	async continueHandoff(taskId: string): Promise<AgentSession | null> {
		const task = await this.requireTask(taskId);
		let predecessor: AgentSession | undefined;
		await this.store.mutate(task.id, async (state) => {
			if (!state.handoff || !REPLACEABLE_HANDOFF_STATUSES.has(state.handoff.status)) return;
			predecessor = this.session(state, state.handoff.sessionId);
			state.handoff.status = HANDOFF_STATUS.REPLACING;
			state.handoff.replacementOwnerPid = process.pid;
		});
		if (!predecessor) return null;
		const oldSession = predecessor;
		try {
			const preset = oldSession.presetSnapshot ?? (await this.presetForLegacySession(task.id, oldSession.preset));
			const existing = (await this.store.read(task.id)).sessions.find(
				(candidate) => candidate.predecessorId === oldSession.id && candidate.status === AGENT_SESSION_STATUS.RUNNING,
			);
			const replacement =
				existing ??
				(await this.startReserved(task, oldSession.preset, preset, oldSession.configScope, {
					predecessorId: oldSession.id,
					cwd: oldSession.cwd,
				}));
			await this.process.kill(oldSession);
			await this.store.mutate(task.id, async (state) => {
				const old = this.session(state, oldSession.id);
				old.status = AGENT_SESSION_STATUS.HANDED_OFF;
				old.endedAt = timestamp();
				if (state.handoff) {
					state.handoff.status = HANDOFF_STATUS.COMPLETED;
					delete state.handoff.replacementOwnerPid;
				}
			});
			return replacement;
		} catch (error) {
			await this.store.mutate(task.id, async (state) => {
				if (state.handoff) {
					state.handoff.status = HANDOFF_STATUS.FAILED;
					delete state.handoff.replacementOwnerPid;
					state.handoff.error = error instanceof Error ? error.message : String(error);
				}
			});
			throw error;
		}
	}

	async touchUsage(taskId: string, sessionId?: string): Promise<void> {
		const task = await this.requireTask(taskId);
		const state = await this.store.read(task.id);
		const session = sessionId
			? state.sessions.find((candidate) => candidate.id === sessionId)
			: state.sessions.find((candidate) => candidate.id === state.activeSessionId);
		if (session) await this.touchSession(task.id, session.id);
	}

	async recover(taskId: string): Promise<void> {
		const task = await this.requireTask(taskId);
		const state = await this.store.read(task.id);
		for (const session of state.sessions.filter(
			(candidate) =>
				candidate.status === AGENT_SESSION_STATUS.STARTING || candidate.status === AGENT_SESSION_STATUS.RUNNING,
		)) {
			if (session.status === AGENT_SESSION_STATUS.STARTING && this.ownerIsAlive(session.ownerPid)) continue;
			const alive = await this.process.alive(session);
			const dead = alive;
			if (alive.exitCode === 0 && dead.stdout.trim() !== "1" && session.status === AGENT_SESSION_STATUS.RUNNING)
				continue;
			// An abandoned launch must not reserve the task forever, even if its placeholder pane survived.
			if (session.status === AGENT_SESSION_STATUS.STARTING && alive.exitCode === 0) await this.process.kill(session);
			await this.store.mutate(task.id, async (current) => {
				const target = this.session(current, session.id);
				target.status =
					target.status === AGENT_SESSION_STATUS.STARTING ? AGENT_SESSION_STATUS.FAILED : AGENT_SESSION_STATUS.STOPPED;
				target.endedAt = timestamp();
				target.error = target.status === AGENT_SESSION_STATUS.FAILED ? "Session launch did not complete." : undefined;
				if (current.activeSessionId === target.id) delete current.activeSessionId;
			});
		}
		await this.store.mutate(task.id, async (current) => {
			const handoff = current.handoff;
			if (handoff?.status !== HANDOFF_STATUS.REPLACING || this.ownerIsAlive(handoff.replacementOwnerPid)) return;
			handoff.status = HANDOFF_STATUS.READY;
			delete handoff.replacementOwnerPid;
		});
		const recovered = await this.store.read(task.id);
		if (recovered.handoff?.status === HANDOFF_STATUS.READY) {
			await this.continueHandoff(task.id);
		}
	}

	private async enforceRunningLimit(current: AgentSession, max: number): Promise<void> {
		if (max < 1) return;
		const states = await this.store.readAll();
		const live: AgentSession[] = [];
		for (const state of states) {
			for (const session of state.sessions) {
				if (session.status !== AGENT_SESSION_STATUS.RUNNING) continue;
				const alive = await this.process.alive(session);
				if (alive.exitCode === 0 && alive.stdout.trim() === "0") live.push(session);
			}
		}
		if (live.length <= max) return;
		const candidates = live
			.filter((session) => session.id !== current.id && session.taskId !== current.taskId)
			.sort((left, right) => {
				const use = (left.useCount ?? 0) - (right.useCount ?? 0);
				if (use !== 0) return use;
				return (left.lastUsedAt ?? left.createdAt).localeCompare(right.lastUsedAt ?? right.createdAt);
			});
		const stopCount = live.length - max;
		for (const session of candidates.slice(0, stopCount)) {
			await this.process.kill(session);
			await this.store.mutate(session.taskId, async (state) => {
				const current = this.session(state, session.id);
				current.status = AGENT_SESSION_STATUS.STOPPED;
				current.endedAt = timestamp();
				if (state.activeSessionId === current.id) delete state.activeSessionId;
			});
		}
	}

	private async touchSession(taskId: string, sessionId: string): Promise<void> {
		await this.store.mutate(taskId, async (state) => {
			this.touch(this.session(state, sessionId), timestamp());
		});
	}

	private touch(session: AgentSession, at: string): void {
		session.lastUsedAt = at;
		session.useCount = (session.useCount ?? 0) + 1;
	}

	private async requireTask(taskId: string) {
		const task = await this.core.loadTaskById(taskId, { includeCrossBranch: false });
		if (!task || task.source === TASK_SOURCE.REMOTE || task.source === TASK_SOURCE.LOCAL_BRANCH)
			throw new Error(`Locally editable task not found: ${taskId}`);
		return task;
	}

	private async sessionSnapshot(taskId: string, sessionId?: string, activeOnly = true) {
		const task = await this.requireTask(taskId);
		const state = await this.store.read(task.id);
		const session = sessionId
			? state.sessions.find((candidate) => candidate.id === sessionId)
			: activeOnly
				? this.active(state)
				: state.sessions.find((candidate) => candidate.id === state.activeSessionId);
		if (!session) throw new Error(`Agent session not found: ${sessionId ?? "active"}`);
		if (activeOnly && session.status !== AGENT_SESSION_STATUS.RUNNING)
			throw new Error(`Agent session ${session.id} is not active.`);
		return { task, session };
	}

	private session(state: SessionState, id: string): AgentSession {
		const session = state.sessions.find((candidate) => candidate.id === id);
		if (!session) throw new Error(`Agent session not found: ${id}`);
		return session;
	}

	private active(state: SessionState): AgentSession {
		const session = state.sessions.find(
			(candidate) => candidate.id === state.activeSessionId && candidate.status === AGENT_SESSION_STATUS.RUNNING,
		);
		if (!session) throw new Error(`Task ${state.taskId} has no active agent session.`);
		return session;
	}

	private environment(session: AgentSession, presetEnv: Record<string, string>): Record<string, string> {
		const env = { ...process.env, ...presetEnv } as Record<string, string>;
		const dist = join(this.core.filesystem.rootDir, "dist");
		const path = env.PATH ? `${dist}${delimiter}${env.PATH}` : dist;
		return {
			...env,
			PATH: path,
			BACKLOG_CWD: this.core.filesystem.rootDir,
			BACKLOG_SESSION_ID: session.id,
			BACKLOG_TASK_ID: session.taskId,
		};
	}

	private ownerIsAlive(pid: number | undefined): boolean {
		if (!pid) return false;
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	}

	private async presetForLegacySession(taskId: string, name: string): Promise<AgentPreset> {
		const resolved = await resolveAgentConfiguration(this.core, taskId);
		const preset = resolved.config.presets[name];
		if (!preset) throw new Error(`Agent preset not found for existing session: ${name}`);
		return preset;
	}

	private async inProgressStatus(): Promise<string> {
		const statuses = (await this.core.filesystem.loadConfig())?.statuses ?? DEFAULT_STATUSES;
		const status = statuses.find(
			(candidate) => candidate.toLocaleLowerCase() === DEFAULT_IN_PROGRESS_STATUS.toLocaleLowerCase(),
		);
		if (!status) {
			throw new Error(
				`Cannot start an agent session: configured statuses must include "${DEFAULT_IN_PROGRESS_STATUS}".`,
			);
		}
		return status;
	}
}
