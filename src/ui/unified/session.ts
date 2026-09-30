import type { LabelMatchMode, Task } from "../../types/index.ts";

export type UnifiedFilterSnapshot = {
	searchQuery: string;
	statusFilter: string[];
	excludeStatus: string[];
	typeFilter: string[];
	projectFilter: string[];
	priorityFilter: string;
	labelFilter: string[];
	labelMatch?: LabelMatchMode;
	milestoneFilter: string;
	limit?: number;
};

/** Owns the corpus, filters, and selection shared by unified child controllers. */
export class UnifiedViewSession {
	private readonly taskSubscribers = new Set<(snapshot: UnifiedTaskSnapshot) => void>();
	constructor(
		public tasks: Task[],
		public selectedTask: Task | undefined,
		public filters: UnifiedFilterSnapshot,
	) {}

	private applyTaskSnapshot(tasks: Task[], selectedTask: Task | undefined): void {
		this.tasks = tasks;
		this.selectedTask = selectedTask;
		this.publishTasks();
	}

	applyTaskUpdate(update: { type: "upsert"; task: Task } | { type: "remove"; taskId: string }): void {
		const state = applyTaskUpdateToSnapshot({ tasks: this.tasks, selectedTask: this.selectedTask }, update);
		this.applyTaskSnapshot(state.tasks, state.selectedTask);
	}

	updateFilters(filters: UnifiedFilterSnapshot): void {
		this.filters = filters;
		this.publishTasks();
	}

	selectTask(task: Task | undefined): void {
		if (this.selectedTask?.id === task?.id) return;
		this.selectedTask = task;
		this.publishTasks();
	}

	/** Watchers publish to this shared session; screens subscribe for their short lifetime. */
	subscribeTasks(subscriber: (snapshot: UnifiedTaskSnapshot) => void): () => void {
		this.taskSubscribers.add(subscriber);
		subscriber(this.snapshot());
		return () => this.taskSubscribers.delete(subscriber);
	}

	private snapshot(): UnifiedTaskSnapshot {
		return { tasks: this.tasks, selectedTask: this.selectedTask, filters: this.filters };
	}

	private publishTasks(): void {
		const snapshot = this.snapshot();
		for (const subscriber of this.taskSubscribers) subscriber(snapshot);
	}
}

type UnifiedTaskSnapshot = {
	tasks: readonly Task[];
	selectedTask: Task | undefined;
	filters: Readonly<UnifiedFilterSnapshot>;
};

function applyTaskUpdateToSnapshot(
	state: { tasks: Task[]; selectedTask?: Task },
	update: { type: "upsert"; task: Task } | { type: "remove"; taskId: string },
): { tasks: Task[]; selectedTask?: Task } {
	if (update.type === "upsert") {
		const index = state.tasks.findIndex((task) => task.id === update.task.id);
		const tasks = [...state.tasks];
		if (index === -1) tasks.push(update.task);
		else tasks[index] = update.task;
		return { tasks, selectedTask: state.selectedTask?.id === update.task.id ? update.task : state.selectedTask };
	}
	const index = state.tasks.findIndex((task) => task.id === update.taskId);
	if (index === -1) return state;
	const tasks = state.tasks.filter((task) => task.id !== update.taskId);
	return {
		tasks,
		selectedTask:
			state.selectedTask?.id === update.taskId
				? tasks[Math.min(index, Math.max(tasks.length - 1, 0))]
				: state.selectedTask,
	};
}
