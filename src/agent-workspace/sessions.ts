import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_IN_PROGRESS_STATUS, DEFAULT_STATUSES } from "../constants/index.ts";
import type { Core } from "../core/backlog.ts";
import { TASK_SOURCE } from "../types/index.ts";
import { renderSessionBootstrap } from "./bootstrap.ts";
import { resolveAgentConfiguration } from "./config.ts";
import { hasEmptyHandoffInput } from "./handoff-input.ts";
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
const COMPLETABLE_HANDOFF_STATUSES = new Set<HandoffStatus>([
	HANDOFF_STATUS.REQUESTED,
	HANDOFF_STATUS.FAILED,
	HANDOFF_STATUS.READY,
]);
const REPLACEABLE_HANDOFF_STATUSES = new Set<HandoffStatus>([HANDOFF_STATUS.READY, HANDOFF_STATUS.FAILED]);

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
		this.process = new SessionProcess(this.runner);
		this.store = new SessionStore(this.core.filesystem.rootDir, this.runner);
		this.backgroundWorkers = !options.runner;
	}

	async list(taskId: string): Promise<TaskSessions> {
		const task = await this.requireTask(taskId);
		return await this.store.read(task.id);
	}

	async start(taskId: string, options: { preset?: string; predecessorId?: string } = {}): Promise<AgentSession> {
		if (options.predecessorId) throw new Error("Replacement sessions can only be created by a completed handoff.");
		const task = await this.requireTask(taskId);
		const resolved = await resolveAgentConfiguration(this.core, task.id);
		const presetName = options.preset ?? resolved.config.selectedPreset;
		const preset = resolved.config.presets[presetName];
		if (!preset) throw new Error(`Agent preset not found: ${presetName}`);
		return await this.startReserved(task, presetName, preset, resolved.scope);
	}

	private async startReserved(
		task: { id: string; status: string },
		presetName: string,
		preset: AgentPreset,
		configScope: AgentSession["configScope"],
		options: { predecessorId?: string; cwd?: string } = {},
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
						candidate.status === AGENT_SESSION_STATUS.STARTING || candidate.status === AGENT_SESSION_STATUS.RUNNING,
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
			state.activeSessionId = next.id;
		});
		if (!session) throw new Error("Could not reserve an agent session.");
		const reserved = session;
		// The state claim above prevents a concurrent launch; all expensive work follows outside the lock.
		try {
			if (preset.worktree)
				await ensureSessionWorktree(this.runner, this.core.filesystem.rootDir, task.id, reserved.cwd);
			const env = { ...process.env, ...preset.env, ...this.environment(reserved) } as Record<string, string>;
			const paneId = await this.process.create(reserved, env);
			await this.store.mutate(task.id, async (state) => {
				this.session(state, reserved.id).paneId = paneId;
			});
			reserved.paneId = paneId;
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
				state.hasSuccessfulSession = true;
			});
			reserved.status = AGENT_SESSION_STATUS.RUNNING;
			return reserved;
		} catch (error) {
			if (reserved.paneId) await this.process.kill(reserved);
			await this.store.mutate(task.id, async (state) => {
				if (!reserved.paneId) {
					state.sessions = state.sessions.filter((candidate) => candidate.id !== reserved.id);
					if (state.activeSessionId === reserved.id) delete state.activeSessionId;
					return;
				}
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
		const { session } = await this.sessionSnapshot(taskId, sessionId, false);
		try {
			return await Bun.file(session.outputPath).text();
		} catch {
			throw new Error(`Could not read session ${session.id} output.`);
		}
	}

	async attach(taskId: string, sessionId?: string): Promise<void> {
		const { session } = await this.sessionSnapshot(taskId, sessionId);
		await this.process.attach(session);
	}

	async requestHandoff(taskId: string): Promise<HandoffRequest> {
		const task = await this.requireTask(taskId);
		let request: HandoffRequest | undefined;
		await this.store.mutate(task.id, async (state) => {
			if (state.handoff && !TERMINAL_HANDOFF_STATUSES.has(state.handoff.status))
				throw new Error(`Task ${task.id} already has a handoff request.`);
			const active = this.active(state);
			const document = state.handoffDocumentId ? await this.core.getDocument(state.handoffDocumentId) : undefined;
			if (document?.path) {
				const identity = {
					id: document.id,
					title: document.title,
					type: document.type,
					createdDate: document.createdDate,
					path: document.path,
					tags: document.tags,
				};
				await unlink(join(this.core.filesystem.docsDir, ...identity.path.split("/"))).catch((error) => {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				});
				state.handoffDocumentId = identity.id;
				const next: HandoffRequest = {
					id: randomUUID(),
					sessionId: active.id,
					documentPath: identity.path,
					document: identity,
					status: HANDOFF_STATUS.REQUESTED,
					createdAt: timestamp(),
				};
				request = next;
				state.handoff = next;
				return;
			}
			const next: HandoffRequest = {
				id: randomUUID(),
				sessionId: active.id,
				documentPath: "",
				status: HANDOFF_STATUS.REQUESTED,
				createdAt: timestamp(),
			};
			request = next;
			state.handoff = next;
		});
		if (!request) throw new Error("Could not reserve a handoff request.");
		const handoff = request;
		const delivery = await this.dispatchHandoff(task.id, handoff.id);
		if (delivery === "waiting" && this.backgroundWorkers)
			await spawnSessionWorker("handoff-dispatch", task.id, this.core.filesystem.rootDir);
		return (await this.store.read(task.id)).handoff ?? handoff;
	}

	async completeHandoff(taskId: string, requestId: string, content: string): Promise<void> {
		if (!content.trim()) throw new Error("Handoff content cannot be empty.");
		const task = await this.requireTask(taskId);
		await this.store.mutate(task.id, async (state) => {
			if (!state.handoff || state.handoff.id !== requestId || !COMPLETABLE_HANDOFF_STATUSES.has(state.handoff.status))
				throw new Error(`No pending handoff request ${requestId} for task ${task.id}.`);
			let document = state.handoff.document;
			if (document) {
				await this.core.createDocument({ ...document, rawContent: content }, false, dirname(document.path));
			} else {
				const created = await this.core.createDocumentFromInput(
					{ title: `Handoff for ${task.id}`, content, type: "other", path: "handoffs" },
					false,
				);
				if (!created.path) throw new Error("Handoff document was created without a path.");
				document = {
					id: created.id,
					title: created.title,
					type: created.type,
					createdDate: created.createdDate,
					path: created.path,
					tags: created.tags,
				};
				await this.core.updateTaskFromInput(task.id, { addDocumentation: [document.id] }, false, {
					includeCrossBranch: false,
				});
			}
			state.handoffDocumentId = document.id;
			state.handoff.documentPath = document.path;
			state.handoff.document = {
				id: document.id,
				title: document.title,
				type: document.type,
				createdDate: document.createdDate,
				path: document.path,
				tags: document.tags,
			};
			state.handoff.status = HANDOFF_STATUS.READY;
			state.handoff.error = undefined;
		});
	}

	async continueHandoff(taskId: string): Promise<AgentSession | null> {
		const task = await this.requireTask(taskId);
		let predecessor: AgentSession | undefined;
		await this.store.mutate(task.id, async (state) => {
			if (!state.handoff || !REPLACEABLE_HANDOFF_STATUSES.has(state.handoff.status)) return;
			if (
				!state.handoff.document ||
				!(await Bun.file(join(this.core.filesystem.docsDir, state.handoff.documentPath)).exists())
			)
				throw new Error("The completed handoff document is missing; save it before continuing.");
			predecessor = this.session(state, state.handoff.sessionId);
			state.handoff.status = HANDOFF_STATUS.REPLACING;
			state.handoff.replacementOwnerPid = process.pid;
		});
		if (!predecessor) return null;
		const oldSession = predecessor;
		try {
			await this.process.kill(oldSession);
			await this.store.mutate(task.id, async (state) => {
				this.stopSession(state, oldSession.id);
			});
			const preset = oldSession.presetSnapshot ?? (await this.presetForLegacySession(task.id, oldSession.preset));
			const replacement = await this.startReserved(task, oldSession.preset, preset, oldSession.configScope, {
				predecessorId: oldSession.id,
				cwd: oldSession.cwd,
			});
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
				this.stopSession(state, oldSession.id);
				if (state.handoff) {
					state.handoff.status = HANDOFF_STATUS.FAILED;
					delete state.handoff.replacementOwnerPid;
					state.handoff.error = error instanceof Error ? error.message : String(error);
				}
			});
			throw error;
		}
	}

	private stopSession(state: SessionState, sessionId: string): void {
		const session = this.session(state, sessionId);
		session.status = AGENT_SESSION_STATUS.STOPPED;
		session.endedAt = timestamp();
		if (state.activeSessionId === session.id) delete state.activeSessionId;
	}

	async recover(taskId: string): Promise<void> {
		const task = await this.requireTask(taskId);
		const state = await this.store.read(task.id);
		for (const session of state.sessions.filter(
			(candidate) =>
				candidate.status === AGENT_SESSION_STATUS.STARTING || candidate.status === AGENT_SESSION_STATUS.RUNNING,
		)) {
			if (session.status === AGENT_SESSION_STATUS.STARTING && this.ownerIsAlive(session.ownerPid)) continue;
			const alive = session.paneId
				? await this.process.alive(session)
				: { exitCode: 1, stdout: "", stderr: "missing pane ID" };
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
			const replacement = current.sessions.find(
				(candidate) =>
					candidate.predecessorId === handoff.sessionId && candidate.status === AGENT_SESSION_STATUS.RUNNING,
			);
			if (replacement) {
				handoff.status = HANDOFF_STATUS.COMPLETED;
				const old = this.session(current, handoff.sessionId);
				old.status = AGENT_SESSION_STATUS.HANDED_OFF;
				old.endedAt ??= timestamp();
			} else {
				handoff.status = HANDOFF_STATUS.READY;
			}
			delete handoff.replacementOwnerPid;
		});
		const recovered = await this.store.read(task.id);
		if (recovered.handoff?.status === HANDOFF_STATUS.REQUESTED) {
			await this.dispatchHandoff(task.id);
		} else if (recovered.handoff && REPLACEABLE_HANDOFF_STATUSES.has(recovered.handoff.status)) {
			await this.continueHandoff(task.id);
		}
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

	private environment(session: AgentSession): Record<string, string> {
		return {
			...process.env,
			BACKLOG_CWD: this.core.filesystem.rootDir,
			BACKLOG_SESSION_ID: session.id,
			BACKLOG_TASK_ID: session.taskId,
		} as Record<string, string>;
	}

	async dispatchHandoff(requestedTaskId: string, requestId?: string): Promise<"sent" | "waiting" | "skipped"> {
		const taskId = (await this.requireTask(requestedTaskId)).id;
		let claimed = false;
		await this.store.mutate(taskId, async (state) => {
			const handoff = state.handoff;
			if (handoff?.status !== HANDOFF_STATUS.REQUESTED || (requestId && handoff.id !== requestId)) return;
			if (handoff.dispatchedAt || this.ownerIsAlive(handoff.dispatchOwnerPid)) return;
			handoff.dispatchOwnerPid = process.pid;
			claimed = true;
		});
		if (!claimed) return "skipped";
		try {
			const state = await this.store.read(taskId);
			const handoff = state.handoff;
			if (handoff?.status !== HANDOFF_STATUS.REQUESTED || (requestId && handoff.id !== requestId)) return "skipped";
			const session = state.sessions.find(
				(candidate) => candidate.id === handoff.sessionId && candidate.status === AGENT_SESSION_STATUS.RUNNING,
			);
			if (!session) return "skipped";
			const { initial, settled } = await this.process.settledCapture(session);
			const cursorRow = await this.process.cursorRow(session);
			if (
				initial.exitCode !== 0 ||
				settled.exitCode !== 0 ||
				initial.stdout !== settled.stdout ||
				!hasEmptyHandoffInput(session.presetSnapshot?.bootstrap ?? "prompt", settled.stdout, cursorRow)
			) {
				await this.store.mutate(taskId, async (current) => {
					if (current.handoff?.id === handoff.id && current.handoff.status === HANDOFF_STATUS.REQUESTED)
						current.handoff.error =
							"Waiting for the agent input line to become empty; the handoff request will be sent automatically.";
				});
				return "waiting";
			}
			const request = [
				"Write the task handoff now, then run",
				`backlog agent-session handoff-complete ${taskId} --request ${handoff.id} --file <handoff.md>.`,
				"Include completed work, changed files, verification, open risks, and next steps.",
			].join(" ");
			await this.process.paste(session, request);
			await this.process.sendEnter(session);
			await this.store.mutate(taskId, async (current) => {
				if (current.handoff?.id === handoff.id && current.handoff.status === HANDOFF_STATUS.REQUESTED) {
					current.handoff.error = undefined;
					current.handoff.dispatchedAt = timestamp();
				}
			});
			return "sent";
		} finally {
			await this.store.mutate(taskId, async (state) => {
				if (state.handoff?.dispatchOwnerPid === process.pid) delete state.handoff.dispatchOwnerPid;
			});
		}
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
