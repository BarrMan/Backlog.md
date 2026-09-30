import { ProjectTaskGraph } from "../../core/project-task-graph.ts";
import type { TaskCorpus, TaskDetail, TaskListItem } from "../../core/task-detail.ts";
import type { BacklogConfig, Task } from "../../types/index.ts";
import type { MilestoneFilterValueResolver } from "../../utils/milestone-filter.ts";
import { createTaskSearchIndex } from "../../utils/task-search.ts";
import { filterTaskViewerTasks, type TaskViewerFilterModel } from "./filters.ts";
import { replaceTaskByIdentity } from "./interactions.ts";

/** Owns task-viewer corpus, filtering, selection generations, and pane lifetimes. */
export class TaskViewerSession {
	selected: Task;
	filteredTasks: TaskListItem[] = [];
	private tasks: TaskListItem[];
	private graph: ProjectTaskGraph;
	private searchIndex: ReturnType<typeof createTaskSearchIndex>;
	private selectionRequestId = 0;

	constructor(
		tasks: Task[],
		filters: TaskViewerFilterModel,
		initialTask: Task,
		private readonly resolveMilestoneLabel: MilestoneFilterValueResolver,
		private readonly resolveDependencyCorpus: (activeTasks: Task[]) => TaskCorpus,
		private readonly readyFilter = false,
	) {
		this.selected = initialTask;
		this.graph = this.prepareGraph(tasks);
		this.tasks = this.preparedTasks(tasks);
		this.searchIndex = createTaskSearchIndex(this.tasks);
		this.applyFilters(filters);
	}

	updateTasks(tasks: Task[], filters: TaskViewerFilterModel): void {
		this.graph = this.prepareGraph(tasks);
		this.tasks = this.preparedTasks(tasks);
		this.searchIndex = createTaskSearchIndex(this.tasks);
		this.applyFilters(filters);
	}

	getTasks(): Task[] {
		return this.tasks;
	}

	getTaskDetail(task: Task): TaskDetail {
		return this.graph.getTaskDetail(task);
	}

	replaceTask(task: Task, filters: TaskViewerFilterModel): boolean {
		const replaced = replaceTaskByIdentity(this.tasks, task);
		if (replaced) this.updateTasks(this.tasks, filters);
		return replaced;
	}

	removeTask(taskId: string, filters: TaskViewerFilterModel): boolean {
		const nextTasks = this.tasks.filter((task) => task.id !== taskId);
		if (nextTasks.length === this.tasks.length) return false;
		this.updateTasks(nextTasks, filters);
		return true;
	}

	updateFilters(filters: TaskViewerFilterModel): void {
		this.applyFilters(filters);
	}

	private applyFilters(filters: TaskViewerFilterModel): void {
		const filteredTasks = filterTaskViewerTasks(
			this.tasks,
			filters,
			this.searchIndex,
			this.resolveMilestoneLabel,
			this.readyFilter,
		);
		this.filteredTasks.splice(0, this.filteredTasks.length, ...filteredTasks);
		if (this.filteredTasks.length > 0 && !this.filteredTasks.some((task) => task.id === this.selected.id)) {
			this.selected = this.filteredTasks[0] as Task;
		}
	}

	private prepareGraph(tasks: Task[]): ProjectTaskGraph {
		const corpus = this.resolveDependencyCorpus(tasks);
		return new ProjectTaskGraph({
			tasks: corpus.tasks,
			activeTasks: tasks,
			completedTasks: corpus.completedTasks,
			config: corpus.statuses ? ({ statuses: corpus.statuses } as BacklogConfig) : null,
		});
	}

	private preparedTasks(tasks: Task[]): TaskListItem[] {
		return tasks.map((task) => this.graph.getTaskListItem(task));
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
