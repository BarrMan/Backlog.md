import type { TaskCorpus } from "../../core/task-detail.ts";
import type { Task } from "../../types/index.ts";
import type { MilestoneFilterValueResolver } from "../../utils/milestone-filter.ts";
import { createTaskSearchIndex } from "../../utils/task-search.ts";
import { filterTaskViewerTasks, type TaskViewerFilterModel } from "./filters.ts";
import { replaceTaskByIdentity } from "./interactions.ts";

/** Owns task-viewer corpus, filtering, selection generations, and pane lifetimes. */
export class TaskViewerSession {
	selected: Task;
	filteredTasks: Task[] = [];
	private searchIndex: ReturnType<typeof createTaskSearchIndex>;
	private selectionRequestId = 0;

	constructor(
		private tasks: Task[],
		private filters: TaskViewerFilterModel,
		initialTask: Task,
		private readonly resolveMilestoneLabel: MilestoneFilterValueResolver,
		private readonly resolveDependencyCorpus: () => TaskCorpus,
		private readonly readyFilter = false,
	) {
		this.selected = initialTask;
		this.searchIndex = createTaskSearchIndex(tasks);
		this.applyFilters();
	}

	updateTasks(tasks: Task[]): void {
		this.tasks = tasks;
		this.searchIndex = createTaskSearchIndex(tasks);
		this.applyFilters();
	}

	getTasks(): Task[] {
		return this.tasks;
	}

	replaceTask(task: Task): boolean {
		const replaced = replaceTaskByIdentity(this.tasks, task);
		if (replaced) this.applyFilters();
		return replaced;
	}

	removeTask(taskId: string): boolean {
		const nextTasks = this.tasks.filter((task) => task.id !== taskId);
		if (nextTasks.length === this.tasks.length) return false;
		this.updateTasks(nextTasks);
		return true;
	}

	updateFilters(filters: TaskViewerFilterModel): void {
		this.filters = filters;
		this.applyFilters();
	}

	private applyFilters(): void {
		const filteredTasks = filterTaskViewerTasks(
			this.tasks,
			this.filters,
			this.searchIndex,
			this.resolveMilestoneLabel,
			this.readyFilter ? this.resolveDependencyCorpus() : undefined,
		);
		this.filteredTasks.splice(0, this.filteredTasks.length, ...filteredTasks);
		if (this.filteredTasks.length > 0 && !this.filteredTasks.some((task) => task.id === this.selected.id)) {
			this.selected = this.filteredTasks[0] as Task;
		}
	}

	select(task: Task): boolean {
		if (task.id === this.selected.id) return false;
		this.selected = task;
		this.selectionRequestId += 1;
		return true;
	}

	beginSelectionRefresh(): number {
		this.selectionRequestId += 1;
		return this.selectionRequestId;
	}

	isCurrentSelectionRefresh(requestId: number): boolean {
		return requestId === this.selectionRequestId;
	}
}
