import type { Core } from "../core/backlog.ts";
import type { Task, TaskUpdateInput } from "../types/index.ts";
import { AgentSessionService } from "./sessions.ts";
import type { AgentSession, TaskSessions } from "./types.ts";

export interface WorkspaceTaskState {
	task: Task;
	sessions: TaskSessions;
	activeSession?: AgentSession;
}

export function activeSessionOf(state: TaskSessions): AgentSession | undefined {
	return state.sessions.find((session) => session.id === state.activeSessionId);
}

export class WorkspaceStateService {
	private readonly sessions: AgentSessionService;

	constructor(
		private readonly core: Core,
		options: { sessions?: AgentSessionService } = {},
	) {
		this.sessions = options.sessions ?? new AgentSessionService(core);
	}

	async listTasks(): Promise<Task[]> {
		return await this.core.filesystem.listTasks();
	}

	async taskState(taskId: string): Promise<WorkspaceTaskState> {
		await this.sessions.recover(taskId);
		const task = await this.core.getTask(taskId);
		if (!task) throw new Error(`Task not found: ${taskId}`);
		const sessions = await this.sessions.list(taskId);
		return { task, sessions, activeSession: activeSessionOf(sessions) };
	}

	async sessionState(taskId: string): Promise<TaskSessions> {
		await this.sessions.recover(taskId);
		return await this.sessions.list(taskId);
	}

	async listSessions(taskId: string): Promise<TaskSessions> {
		return await this.sessions.list(taskId);
	}

	async startSession(taskId: string): Promise<WorkspaceTaskState> {
		await this.sessions.start(taskId);
		return await this.taskState(taskId);
	}

	async stopSession(taskId: string, sessionId?: string): Promise<WorkspaceTaskState> {
		await this.sessions.stop(taskId, sessionId);
		return await this.taskState(taskId);
	}

	async sessionOutput(taskId: string, sessionId?: string): Promise<string> {
		return await this.sessions.output(taskId, sessionId);
	}

	async touchSession(taskId: string, sessionId?: string): Promise<void> {
		await this.sessions.touchUsage(taskId, sessionId);
	}

	async requestHandoff(taskId: string) {
		return await this.sessions.requestHandoff(taskId);
	}

	async updateTask(taskId: string, input: TaskUpdateInput): Promise<Task> {
		await this.core.updateTaskFromInput(taskId, input);
		const task = await this.core.getTask(taskId);
		if (!task) throw new Error(`Task not found: ${taskId}`);
		return task;
	}
}
