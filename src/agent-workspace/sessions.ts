import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import lockfile from "proper-lockfile";
import { DEFAULT_IN_PROGRESS_STATUS, DEFAULT_STATUSES } from "../constants/index.ts";
import type { Core } from "../core/backlog.ts";
import { renderSessionBootstrap } from "./bootstrap.ts";
import { resolveAgentConfiguration } from "./config.ts";
import { hasEmptyHandoffInput } from "./handoff-input.ts";
import { type AgentSessionRunner, BunRunner, SessionProcess } from "./session-process.ts";
import { fail, slug } from "./session-utils.ts";
import { spawnSessionWorker } from "./session-worker-client.ts";
import { ensureSessionWorktree } from "./session-worktree.ts";
import type { AgentPreset, AgentSession, HandoffRequest, TaskSessions } from "./types.ts";

const COMPLETED_HANDOFF_STATUS = "completed";
const TERMINAL_HANDOFF_STATUSES = new Set([COMPLETED_HANDOFF_STATUS, "failed"]);

interface State extends TaskSessions {
	version: 1;
	hasSuccessfulSession?: boolean;
	handoffDocumentId?: string;
}

export type { AgentSessionRunner } from "./session-process.ts";

function timestamp(): string {
	return new Date().toISOString();
}

/** Durable task-scoped tmux sessions. State operations are short; terminals never run while a state lock is held. */
export class AgentSessionService {
	private readonly runner: AgentSessionRunner;
	private readonly process: SessionProcess;
	private readonly backgroundWorkers: boolean;

	constructor(
		private readonly core: Core,
		options: { runner?: AgentSessionRunner } = {},
	) {
		this.runner = options.runner ?? new BunRunner();
		this.process = new SessionProcess(this.runner);
		this.backgroundWorkers = !options.runner;
	}

	async list(taskId: string): Promise<TaskSessions> {
		const task = await this.requireTask(taskId);
		return await this.read(task.id);
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
		const paths = await this.paths(task.id);
		let session: AgentSession | undefined;
		await this.mutate(task.id, async (state) => {
			if (state.handoff?.status === "replacing" && state.handoff.sessionId !== options.predecessorId)
				throw new Error(`Task ${task.id} is replacing its agent session.`);
			if (state.sessions.some((candidate) => candidate.status === "starting" || candidate.status === "running"))
				throw new Error(`Task ${task.id} already has an active agent session.`);
			const id = randomUUID();
			const cwd =
				options.cwd ??
				(preset.worktree ? (state.worktreePath ?? join(paths.taskDir, "worktree")) : this.core.fs.rootDir);
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
				status: "starting",
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
			if (preset.worktree) await ensureSessionWorktree(this.runner, this.core.fs.rootDir, task.id, reserved.cwd);
			const env = { ...process.env, ...preset.env, ...this.environment(reserved) } as Record<string, string>;
			if (preset.prepare) await this.process.prepare(preset.prepare, reserved.cwd, env);
			await this.writeAtomic(
				reserved.bootstrapPath,
				renderSessionBootstrap({
					taskId: task.id,
					sessionId: reserved.id,
					projectRoot: this.core.fs.rootDir,
					cwd: reserved.cwd,
					configScope,
					worktree: preset.worktree,
				}),
			);
			await this.process.launch(reserved, preset, env);
			const first = !(await this.read(task.id)).hasSuccessfulSession;
			const latest = await this.requireTask(task.id);
			if (
				first &&
				latest.status === task.status &&
				latest.status.toLocaleLowerCase() !== inProgress.toLocaleLowerCase()
			) {
				await this.core.updateTaskFromInput(task.id, { status: inProgress }, false, { includeCrossBranch: false });
			}
			await this.mutate(task.id, async (state) => {
				const current = this.session(state, reserved.id);
				current.status = "running";
				current.ownerPid = undefined;
				current.error = undefined;
				state.hasSuccessfulSession = true;
			});
			reserved.status = "running";
			return reserved;
		} catch (error) {
			await this.process.kill(reserved.tmuxName);
			await this.mutate(task.id, async (state) => {
				const current = this.session(state, reserved.id);
				current.status = "failed";
				current.endedAt = timestamp();
				current.error = error instanceof Error ? error.message : String(error);
				if (state.activeSessionId === current.id) delete state.activeSessionId;
			});
			reserved.status = "failed";
			reserved.endedAt = timestamp();
			reserved.error = error instanceof Error ? error.message : String(error);
			throw error;
		}
	}

	async stop(taskId: string, sessionId?: string): Promise<void> {
		const { task, session } = await this.sessionSnapshot(taskId, sessionId);
		await this.process.kill(session.tmuxName);
		await this.mutate(task.id, async (state) => {
			const current = this.session(state, session.id);
			current.status = "stopped";
			current.endedAt = timestamp();
			if (state.activeSessionId === current.id) delete state.activeSessionId;
		});
	}

	async preview(taskId: string, sessionId?: string): Promise<string> {
		const { session } = await this.sessionSnapshot(taskId, sessionId, false);
		const result = await this.process.capture(session.tmuxName);
		if (result.exitCode === 0) return result.stdout;
		try {
			return await Bun.file(session.outputPath).text();
		} catch {
			throw fail(`Could not read session ${session.id}`, result);
		}
	}

	async sendInput(taskId: string, input: string, sessionId?: string): Promise<void> {
		const { session } = await this.sessionSnapshot(taskId, sessionId);
		await this.process.paste(session.tmuxName, session.id, input);
	}

	async resize(taskId: string, cols: number, rows: number, sessionId?: string): Promise<void> {
		if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1)
			throw new Error("Terminal dimensions must be positive integers.");
		const { session } = await this.sessionSnapshot(taskId, sessionId);
		await this.process.resize(session.tmuxName, session.id, cols, rows);
	}

	async attach(taskId: string, sessionId?: string): Promise<void> {
		const { session } = await this.sessionSnapshot(taskId, sessionId);
		await this.resetSize(taskId, session.id);
		await this.process.attach(session.tmuxName, session.id);
	}

	async resetSize(taskId: string, sessionId?: string): Promise<void> {
		const { session } = await this.sessionSnapshot(taskId, sessionId);
		await this.process.resetSize(session.tmuxName, session.id);
	}

	async requestHandoff(taskId: string): Promise<HandoffRequest> {
		const task = await this.requireTask(taskId);
		let request: HandoffRequest | undefined;
		await this.mutate(task.id, async (state) => {
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
				await unlink(join(this.core.fs.docsDir, ...identity.path.split("/"))).catch((error) => {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				});
				state.handoffDocumentId = identity.id;
				const next: HandoffRequest = {
					id: randomUUID(),
					sessionId: active.id,
					documentPath: identity.path,
					document: identity,
					status: "requested",
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
				status: "requested",
				createdAt: timestamp(),
			};
			request = next;
			state.handoff = next;
		});
		if (!request) throw new Error("Could not reserve a handoff request.");
		const handoff = request;
		const delivery = await this.dispatchHandoff(task.id, handoff.id);
		if (delivery === "waiting" && this.backgroundWorkers)
			await spawnSessionWorker("handoff-dispatch", task.id, this.core.fs.rootDir);
		return (await this.read(task.id)).handoff ?? handoff;
	}

	async completeHandoff(taskId: string, requestId: string, content: string): Promise<void> {
		if (!content.trim()) throw new Error("Handoff content cannot be empty.");
		const task = await this.requireTask(taskId);
		await this.mutate(task.id, async (state) => {
			if (
				!state.handoff ||
				state.handoff.id !== requestId ||
				!["requested", "failed", "ready"].includes(state.handoff.status)
			)
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
			state.handoff.status = "ready";
			state.handoff.error = undefined;
		});
	}

	async continueHandoff(taskId: string): Promise<AgentSession | null> {
		const task = await this.requireTask(taskId);
		let predecessor: AgentSession | undefined;
		await this.mutate(task.id, async (state) => {
			if (!state.handoff || !["ready", "failed"].includes(state.handoff.status)) return;
			if (!state.handoff.document || !(await Bun.file(join(this.core.fs.docsDir, state.handoff.documentPath)).exists()))
				throw new Error("The completed handoff document is missing; save it before continuing.");
			predecessor = this.session(state, state.handoff.sessionId);
			state.handoff.status = "replacing";
			state.handoff.replacementOwnerPid = process.pid;
		});
		if (!predecessor) return null;
		const oldSession = predecessor;
		try {
			await this.process.kill(oldSession.tmuxName);
			await this.mutate(task.id, async (state) => {
				this.stopSession(state, oldSession.id);
			});
			const preset = oldSession.presetSnapshot ?? (await this.presetForLegacySession(task.id, oldSession.preset));
			const replacement = await this.startReserved(task, oldSession.preset, preset, oldSession.configScope, {
				predecessorId: oldSession.id,
				cwd: oldSession.cwd,
			});
			await this.mutate(task.id, async (state) => {
				const old = this.session(state, oldSession.id);
				old.status = "handed-off";
				old.endedAt = timestamp();
				if (state.handoff) {
					state.handoff.status = COMPLETED_HANDOFF_STATUS;
					delete state.handoff.replacementOwnerPid;
				}
			});
			return replacement;
		} catch (error) {
			await this.mutate(task.id, async (state) => {
				this.stopSession(state, oldSession.id);
				if (state.handoff) {
					state.handoff.status = "failed";
					delete state.handoff.replacementOwnerPid;
					state.handoff.error = error instanceof Error ? error.message : String(error);
				}
			});
			throw error;
		}
	}

	private stopSession(state: State, sessionId: string): void {
		const session = this.session(state, sessionId);
		session.status = "stopped";
		session.endedAt = timestamp();
		if (state.activeSessionId === session.id) delete state.activeSessionId;
	}

	async recover(taskId: string): Promise<void> {
		const task = await this.requireTask(taskId);
		const state = await this.read(task.id);
		for (const session of state.sessions.filter(
			(candidate) => candidate.status === "starting" || candidate.status === "running",
		)) {
			if (session.status === "starting" && this.ownerIsAlive(session.ownerPid)) continue;
			const alive = await this.runner.run(["tmux", "has-session", "-t", session.tmuxName]);
			const dead =
				alive.exitCode === 0
					? await this.runner.run(["tmux", "list-panes", "-t", session.tmuxName, "-F", "#{pane_dead}"])
					: alive;
			if (alive.exitCode === 0 && dead.stdout.trim() !== "1" && session.status === "running") continue;
			// An abandoned launch must not reserve the task forever, even if its placeholder pane survived.
			if (session.status === "starting" && alive.exitCode === 0) await this.process.kill(session.tmuxName);
			await this.mutate(task.id, async (current) => {
				const target = this.session(current, session.id);
				target.status = target.status === "starting" ? "failed" : "stopped";
				target.endedAt = timestamp();
				target.error = target.status === "failed" ? "Session launch did not complete." : undefined;
				if (current.activeSessionId === target.id) delete current.activeSessionId;
			});
		}
		await this.mutate(task.id, async (current) => {
			const handoff = current.handoff;
			if (handoff?.status !== "replacing" || this.ownerIsAlive(handoff.replacementOwnerPid)) return;
			const replacement = current.sessions.find(
				(candidate) => candidate.predecessorId === handoff.sessionId && candidate.status === "running",
			);
			if (replacement) {
				handoff.status = COMPLETED_HANDOFF_STATUS;
				const old = this.session(current, handoff.sessionId);
				old.status = "handed-off";
				old.endedAt ??= timestamp();
			} else {
				handoff.status = "ready";
			}
			delete handoff.replacementOwnerPid;
		});
		const recovered = await this.read(task.id);
		if (recovered.handoff?.status === "requested") {
			await this.dispatchHandoff(task.id);
		} else if (recovered.handoff && ["ready", "failed"].includes(recovered.handoff.status)) {
			await this.continueHandoff(task.id);
		}
	}

	private async requireTask(taskId: string) {
		const task = await this.core.loadTaskById(taskId, { includeCrossBranch: false });
		if (!task || task.source === "remote" || task.source === "local-branch")
			throw new Error(`Locally editable task not found: ${taskId}`);
		return task;
	}

	private async sessionSnapshot(taskId: string, sessionId?: string, activeOnly = true) {
		const task = await this.requireTask(taskId);
		const state = await this.read(task.id);
		const session = sessionId
			? state.sessions.find((candidate) => candidate.id === sessionId)
			: activeOnly
				? this.active(state)
				: state.sessions.find((candidate) => candidate.id === state.activeSessionId);
		if (!session) throw new Error(`Agent session not found: ${sessionId ?? "active"}`);
		if (activeOnly && session.status !== "running") throw new Error(`Agent session ${session.id} is not active.`);
		return { task, session };
	}

	private session(state: State, id: string): AgentSession {
		const session = state.sessions.find((candidate) => candidate.id === id);
		if (!session) throw new Error(`Agent session not found: ${id}`);
		return session;
	}

	private active(state: State): AgentSession {
		const session = state.sessions.find(
			(candidate) => candidate.id === state.activeSessionId && candidate.status === "running",
		);
		if (!session) throw new Error(`Task ${state.taskId} has no active agent session.`);
		return session;
	}

	private environment(session: AgentSession): Record<string, string> {
		return {
			...process.env,
			BACKLOG_CWD: this.core.fs.rootDir,
			BACKLOG_SESSION_ID: session.id,
			BACKLOG_TASK_ID: session.taskId,
		} as Record<string, string>;
	}

	async dispatchHandoff(requestedTaskId: string, requestId?: string): Promise<"sent" | "waiting" | "skipped"> {
		const taskId = (await this.requireTask(requestedTaskId)).id;
		let claimed = false;
		await this.mutate(taskId, async (state) => {
			const handoff = state.handoff;
			if (handoff?.status !== "requested" || (requestId && handoff.id !== requestId)) return;
			if (handoff.dispatchedAt || this.ownerIsAlive(handoff.dispatchOwnerPid)) return;
			handoff.dispatchOwnerPid = process.pid;
			claimed = true;
		});
		if (!claimed) return "skipped";
		try {
			const state = await this.read(taskId);
			const handoff = state.handoff;
			if (handoff?.status !== "requested" || (requestId && handoff.id !== requestId)) return "skipped";
			const session = state.sessions.find(
				(candidate) => candidate.id === handoff.sessionId && candidate.status === "running",
			);
			if (!session) return "skipped";
			const { initial, settled } = await this.process.settledCapture(session.tmuxName);
			const cursorRow = await this.process.cursorRow(session.tmuxName);
			if (
				initial.exitCode !== 0 ||
				settled.exitCode !== 0 ||
				initial.stdout !== settled.stdout ||
				!hasEmptyHandoffInput(session.presetSnapshot?.bootstrap ?? "prompt", settled.stdout, cursorRow)
			) {
				await this.mutate(taskId, async (current) => {
					if (current.handoff?.id === handoff.id && current.handoff.status === "requested")
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
			await this.process.paste(session.tmuxName, session.id, request);
			await this.process.sendEnter(session.tmuxName, session.id);
			await this.mutate(taskId, async (current) => {
				if (current.handoff?.id === handoff.id && current.handoff.status === "requested") {
					current.handoff.error = undefined;
					current.handoff.dispatchedAt = timestamp();
				}
			});
			return "sent";
		} finally {
			await this.mutate(taskId, async (state) => {
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
		const statuses = (await this.core.fs.loadConfig())?.statuses ?? DEFAULT_STATUSES;
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

	private async paths(taskId: string): Promise<{ taskDir: string; statePath: string }> {
		const git = await this.runner.run(["git", "rev-parse", "--git-common-dir"], { cwd: this.core.fs.rootDir });
		const root =
			git.exitCode === 0 && git.stdout.trim()
				? join(resolve(this.core.fs.rootDir, git.stdout.trim()), "backlog-workspace")
				: join(
						process.env.XDG_STATE_HOME ?? join(process.env.HOME ?? "/tmp", ".local", "state"),
						"backlog-workspace",
						createHash("sha256").update(resolve(this.core.fs.rootDir)).digest("hex").slice(0, 16),
					);
		const taskDir = join(
			root,
			createHash("sha256").update(resolve(this.core.fs.rootDir)).digest("hex").slice(0, 16),
			slug(taskId),
		);
		return { taskDir, statePath: join(taskDir, "state.json") };
	}

	private async read(taskId: string): Promise<State> {
		const paths = await this.paths(taskId);
		try {
			const state = JSON.parse(await Bun.file(paths.statePath).text()) as State;
			if (state.version !== 1 || state.taskId !== taskId || !Array.isArray(state.sessions))
				throw new Error("invalid state");
			return state;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, taskId, sessions: [] };
			throw new Error(
				`Could not read session state for ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async mutate(taskId: string, fn: (state: State) => Promise<void>): Promise<void> {
		const paths = await this.paths(taskId);
		await mkdir(paths.taskDir, { recursive: true });
		const release = await lockfile.lock(paths.statePath, {
			realpath: false,
			stale: 30_000,
			update: 5_000,
			retries: { retries: 20, minTimeout: 25, maxTimeout: 100 },
		});
		try {
			let state: State;
			try {
				state = await this.read(taskId);
			} catch (error) {
				if ((error as Error).message.includes("ENOENT")) state = { version: 1, taskId, sessions: [] };
				else throw error;
			}
			await fn(state);
			await this.writeAtomic(paths.statePath, `${JSON.stringify(state, null, "\t")}\n`);
		} finally {
			await release();
		}
	}

	private async writeAtomic(path: string, content: string): Promise<void> {
		await mkdir(dirname(path), { recursive: true });
		const temporary = `${path}.${randomUUID()}.tmp`;
		await Bun.write(temporary, content);
		await rename(temporary, path);
	}
}
