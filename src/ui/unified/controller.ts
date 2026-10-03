/**
 * Unified view manager that handles Tab switching between task views and kanban board
 */

import { isTmuxWorkspace, TmuxWorkspace } from "../../agent-workspace/tmux-workspace.ts";
import type { Core } from "../../core/backlog.ts";
import { findLocalDuplicateTaskIds } from "../../core/duplicate-task-repair.ts";
import type { LabelMatchMode, Milestone, Task, TaskCreateInput } from "../../types/index.ts";
import { watchConfig } from "../../utils/config-watcher.ts";
import { formatDuplicateTaskIdSummary } from "../../utils/duplicate-detection.ts";
import { collectAvailableLabels } from "../../utils/label-filter.ts";
import { hasAnyPrefix } from "../../utils/prefix-config.ts";
import { applyTaskFilters, createTaskSearchIndex } from "../../utils/task-search.ts";
import { type TaskWatcherCallbacks, watchTasks } from "../../utils/task-watcher.ts";
import type { BoardSharedFilters } from "../board/configuration.ts";
import { TUIRenderer } from "../board/tui-renderer.ts";
import { createLoadingScreen } from "../loading.ts";
import { buildTaskViewerMilestoneFilterModel, TaskViewerController } from "../task-viewer/controller.ts";
import { createScreen, formatTuiTitle, keepTuiInputAlive } from "../tui.ts";
import type { ViewType } from "../view-switcher.ts";
import { quitWorkspaceHost } from "../workspace/native-regions.ts";
import { UnifiedViewSession } from "./session.ts";

export interface UnifiedViewOptions {
	core: Core;
	initialView: ViewType;
	selectedTask?: Task;
	tasks?: Task[];
	tasksLoader?: (
		updateProgress: (message: string) => void,
	) => Promise<{ tasks: Task[]; statuses: string[]; readinessTasks?: Task[] }>;
	loadingScreenFactory?: (initialMessage: string) => Promise<LoadingScreen | null>;
	title?: string;
	filter?: {
		status?: string | string[];
		assignee?: string;
		type?: string[];
		project?: string[];
		priority?: string;
		labels?: string[];
		labelMatch?: LabelMatchMode;
		milestone?: string;
		sort?: string;
		title?: string;
		filterDescription?: string;
		searchQuery?: string;
		excludeStatus?: string[];
		parentTaskId?: string;
		limit?: number;
		ready?: boolean;
	};
	preloadedKanbanData?: {
		tasks: Task[];
		statuses: string[];
	};
	milestoneMode?: boolean;
	milestoneEntities?: Milestone[];
}

type LoadingScreen = {
	update(message: string): void;
	close(): Promise<void> | void;
};

export interface UnifiedViewLoadResult {
	tasks: Task[];
	statuses: string[];
	/**
	 * Unfiltered task corpus for dependency readiness. Only needed when `tasks` was narrowed by
	 * loader-side filters; otherwise `tasks` is already the whole corpus.
	 */
	readinessTasks?: Task[];
}

export function createUnifiedTaskUpdateCallbacks(session: UnifiedViewSession): TaskWatcherCallbacks {
	return {
		onTaskAdded: (task) => session.applyTaskUpdate({ type: "upsert", task }),
		onTaskChanged: (task) => session.applyTaskUpdate({ type: "upsert", task }),
		onTaskRemoved: (taskId) => session.applyTaskUpdate({ type: "remove", taskId }),
	};
}

export interface UnifiedViewFilters {
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
}

type UnifiedViewFilterUpdate = Omit<UnifiedViewFilters, "excludeStatus" | "typeFilter" | "projectFilter"> &
	Partial<Pick<UnifiedViewFilters, "excludeStatus" | "typeFilter" | "projectFilter">>;

export interface KanbanSharedFilters {
	searchQuery: string;
	excludeStatus: string[];
	typeFilter?: string[];
	projectFilter?: string[];
	priorityFilter: string;
	labelFilter: string[];
	labelMatch?: LabelMatchMode;
	milestoneFilter: string;
	limit?: number;
}

export function createKanbanSharedFilters(filters: UnifiedViewFilters): KanbanSharedFilters {
	return {
		searchQuery: filters.searchQuery,
		excludeStatus: [...filters.excludeStatus],
		typeFilter: [...filters.typeFilter],
		projectFilter: [...filters.projectFilter],
		priorityFilter: filters.priorityFilter,
		labelFilter: [...filters.labelFilter],
		labelMatch: filters.labelMatch,
		milestoneFilter: filters.milestoneFilter,
		limit: filters.limit,
	};
}

export function filterTasksForKanban(
	tasks: Task[],
	filters: KanbanSharedFilters,
	resolveMilestoneLabel?: (milestone: string) => string,
): Task[] {
	if (
		!filters.searchQuery.trim() &&
		filters.excludeStatus.length === 0 &&
		(filters.typeFilter?.length ?? 0) === 0 &&
		(filters.projectFilter?.length ?? 0) === 0 &&
		!filters.priorityFilter &&
		filters.labelFilter.length === 0 &&
		!filters.milestoneFilter
	) {
		return filters.limit !== undefined ? tasks.slice(0, filters.limit) : [...tasks];
	}

	const searchIndex = createTaskSearchIndex(tasks);
	const filteredTasks = applyTaskFilters(
		tasks,
		{
			query: filters.searchQuery,
			excludeStatus: filters.excludeStatus,
			type: filters.typeFilter,
			project: filters.projectFilter,
			priority: filters.priorityFilter || undefined,
			labels: filters.labelFilter,
			labelMatch: filters.labelMatch ?? "any",
			milestone: filters.milestoneFilter || undefined,
			resolveMilestoneLabel,
		},
		searchIndex,
	);
	return filters.limit !== undefined ? filteredTasks.slice(0, filters.limit) : filteredTasks;
}

export function createUnifiedViewFilters(filter: UnifiedViewOptions["filter"] | undefined): UnifiedViewFilters {
	const status = filter?.status;
	return {
		searchQuery: filter?.searchQuery ?? "",
		statusFilter: asFilterArray(status),
		excludeStatus: [...(filter?.excludeStatus ?? [])],
		typeFilter: [...(filter?.type ?? [])],
		projectFilter: [...(filter?.project ?? [])],
		priorityFilter: filter?.priority ?? "",
		labelFilter: [...(filter?.labels ?? [])],
		labelMatch: filter?.labelMatch ?? "any",
		milestoneFilter: filter?.milestone ?? "",
		limit: filter?.limit,
	};
}

function asFilterArray(value: string | string[] | undefined): string[] {
	return value === undefined ? [] : Array.isArray(value) ? [...value] : [value];
}

export function mergeUnifiedViewFilters(
	current: UnifiedViewFilters,
	update: UnifiedViewFilterUpdate,
): UnifiedViewFilters {
	return {
		...current,
		searchQuery: update.searchQuery,
		statusFilter: update.statusFilter,
		excludeStatus: [...(update.excludeStatus ?? current.excludeStatus)],
		typeFilter: [...(update.typeFilter ?? current.typeFilter)],
		projectFilter: [...(update.projectFilter ?? current.projectFilter)],
		priorityFilter: update.priorityFilter,
		labelFilter: [...update.labelFilter],
		labelMatch: update.labelMatch ?? current.labelMatch ?? "any",
		milestoneFilter: update.milestoneFilter,
		limit: update.limit ?? current.limit,
	};
}

export async function loadTasksForUnifiedView(
	core: Core,
	options: Pick<UnifiedViewOptions, "tasks" | "tasksLoader" | "loadingScreenFactory">,
): Promise<UnifiedViewLoadResult> {
	if (options.tasks && options.tasks.length > 0) {
		const config = await core.filesystem.loadConfig();
		return {
			tasks: options.tasks,
			statuses: config?.statuses || ["To Do", "In Progress", "Done"],
		};
	}

	const loader =
		options.tasksLoader ||
		(async (
			updateProgress: (message: string) => void,
		): Promise<{ tasks: Task[]; statuses: string[]; readinessTasks?: Task[] }> => {
			const tasks = await core.loadTasks(updateProgress);
			const config = await core.filesystem.loadConfig();
			return {
				tasks,
				statuses: config?.statuses || ["To Do", "In Progress", "Done"],
			};
		});

	const loadingScreenFactory = options.loadingScreenFactory || createLoadingScreen;
	const loadingScreen = await loadingScreenFactory("Loading tasks");

	try {
		const result = await loader((message) => {
			loadingScreen?.update(message);
		});

		return {
			tasks: result.tasks,
			statuses: result.statuses,
			readinessTasks: result.readinessTasks,
		};
	} finally {
		await loadingScreen?.close();
	}
}

export async function getDuplicateTaskStartupWarning(core: Core): Promise<string | undefined> {
	const groups = await findLocalDuplicateTaskIds(core);
	return groups.length > 0 ? formatDuplicateTaskIdSummary(groups) : undefined;
}

type ViewResult = "switch" | "exit";

export function getEmptyUnifiedViewMessage(initialView: ViewType, parentTaskId?: string): string | null {
	if (parentTaskId) return `No child tasks found for parent task ${parentTaskId}.`;
	return initialView === "kanban" || initialView === "workspace" ? null : "No tasks found.";
}

export async function createTaskFromBoard(
	core: Core,
	input: TaskCreateInput,
	onCreated?: (task: Task) => Promise<void> | void,
): Promise<Task> {
	const config = await core.filesystem.loadConfig();
	const task = (await core.createTaskFromInput(input, config?.autoCommit ?? false)).task;
	if (task.status.trim().toLowerCase() !== "draft") await onCreated?.(task);
	return task;
}

/** Main unified view controller that handles Tab switching between views. */
export class UnifiedViewController {
	private readonly releaseTuiInput = keepTuiInputAlive();
	private boardScreen: ReturnType<typeof createScreen> | undefined;
	private taskWatcher: ReturnType<typeof watchTasks> | undefined;
	private configWatcher: ReturnType<typeof watchConfig> | undefined;
	private unsubscribeSession: (() => void) | undefined;
	private exitHandler: (() => void) | undefined;
	private session!: UnifiedViewSession;
	private currentView: ViewType;
	private isInitialLoad = true;
	private kanbanStatuses: string[] = [];
	private configuredLabels: string[] = [];
	private milestoneEntities: Milestone[] = [];
	private milestoneFilterModel!: ReturnType<typeof buildTaskViewerMilestoneFilterModel>;
	private readinessTasks: Task[] | undefined;
	private startupWarning: string | undefined;
	private projectName: string | undefined;
	private boardUpdater: ((nextTasks: Task[], nextStatuses: string[]) => void) | null = null;
	private taskListUpdater:
		| ((nextTasks: Task[], nextStatuses: string[], nextLabels: string[], nextSelectedTask?: Task) => void)
		| null = null;
	private viewResult: ViewResult = "exit";

	constructor(private readonly options: UnifiedViewOptions) {
		this.currentView = options.initialView;
	}

	async run(): Promise<void> {
		try {
			if (this.options.initialView === "workspace") {
				await new TmuxWorkspace(this.options.core.filesystem.rootDir).enter("workspace");
				return;
			}
			const loaded = await loadTasksForUnifiedView(this.options.core, this.options);
			if (!(await this.initialize(loaded))) return;
			this.startWatchers();
			await this.runViewLoop();
		} catch (error) {
			console.error(error instanceof Error ? error.message : error);
			process.exit(1);
		} finally {
			this.cleanup();
			this.releaseTuiInput();
		}
	}

	private async initialize(loaded: UnifiedViewLoadResult): Promise<boolean> {
		const baseTasks = loaded.tasks.filter((task) => task.id && task.id.trim() !== "" && hasAnyPrefix(task.id));
		if (baseTasks.length === 0) {
			const emptyMessage = getEmptyUnifiedViewMessage(this.options.initialView, this.options.filter?.parentTaskId);
			if (emptyMessage) {
				console.log(emptyMessage);
				return false;
			}
		}

		const [config, milestones, startupWarning] = await Promise.all([
			this.options.core.filesystem.loadConfig(),
			this.options.core.filesystem.listMilestones(),
			getDuplicateTaskStartupWarning(this.options.core),
		]);
		this.projectName = config?.projectName;
		this.configuredLabels = config?.labels ?? [];
		this.kanbanStatuses = loaded.statuses;
		this.milestoneEntities = milestones;
		this.milestoneFilterModel = buildTaskViewerMilestoneFilterModel(milestones);
		this.readinessTasks = loaded.readinessTasks;
		this.startupWarning = startupWarning;
		this.session = new UnifiedViewSession(
			baseTasks,
			this.options.selectedTask,
			createUnifiedViewFilters(this.options.filter),
		);
		this.unsubscribeSession = this.session.subscribeTasks(this.publishUpdates.bind(this));
		return true;
	}

	private startWatchers(): void {
		const callbacks = createUnifiedTaskUpdateCallbacks(this.session);
		this.taskWatcher = watchTasks(this.options.core, callbacks, this.session.tasks);
		this.configWatcher = watchConfig(this.options.core, {
			onConfigChanged: this.handleConfigChanged.bind(this),
		});
		this.exitHandler = this.stopWatchers.bind(this);
		process.once("exit", this.exitHandler);
	}

	private async runViewLoop(): Promise<void> {
		while (true) {
			const result = await this.showCurrentView();
			this.isInitialLoad = false;
			if (result === "exit") return;
			this.currentView = this.currentView === "kanban" ? "task-list" : "kanban";
		}
	}

	private showCurrentView(): Promise<ViewResult> {
		if (this.currentView === "task-list" || this.currentView === "task-detail") return this.showTaskView();
		return this.showKanbanView();
	}

	private async showTaskView(): Promise<ViewResult> {
		this.destroyBoardScreen();
		const tasks = this.getRenderableTasks();
		if (tasks.length === 0) {
			console.log("No tasks available.");
			return "exit";
		}
		const selectedTask = this.session.selectedTask?.id
			? tasks.find((task) => task.id === this.session.selectedTask?.id)
			: undefined;
		const task = selectedTask ?? tasks[0];
		if (!task) return "exit";

		this.viewResult = "exit";
		try {
			await new TaskViewerController(task, {
				tasks,
				core: this.options.core,
				title: this.options.filter?.title,
				filterDescription: this.options.filter?.filterDescription,
				searchQuery: this.session.filters.searchQuery,
				statusFilter: this.session.filters.statusFilter,
				excludeStatus: this.session.filters.excludeStatus,
				typeFilter: this.session.filters.typeFilter,
				projectFilter: this.session.filters.projectFilter,
				priorityFilter: this.session.filters.priorityFilter,
				labelFilter: this.session.filters.labelFilter,
				labelMatch: this.session.filters.labelMatch,
				milestoneFilter: this.session.filters.milestoneFilter,
				readyFilter: this.options.filter?.ready,
				readinessTasks: this.readinessTasks,
				limit: this.session.filters.limit,
				startWithDetailFocus: this.currentView === "task-detail",
				startWithSearchFocus: this.isInitialLoad && this.options.filter?.searchQuery !== undefined,
				startupWarning: this.startupWarning,
				subscribeUpdates: this.subscribeTaskListUpdates.bind(this),
				onTaskChange: this.selectTask.bind(this),
				onFilterChange: this.updateTaskListFilters.bind(this),
				onTabPress: this.switchView.bind(this),
			}).run();
			return this.viewResult;
		} finally {
			this.taskListUpdater = null;
		}
	}

	private async showKanbanView(): Promise<ViewResult> {
		const config = await this.options.core.filesystem.loadConfig();
		this.configuredLabels = config?.labels ?? this.configuredLabels;
		this.milestoneEntities = await this.options.core.filesystem.listMilestones();
		this.milestoneFilterModel = buildTaskViewerMilestoneFilterModel(this.milestoneEntities);
		this.viewResult = "exit";
		try {
			await new TUIRenderer(
				this.getRenderableTasks(),
				this.kanbanStatuses,
				"horizontal",
				config?.maxColumnWidth || 20,
				{
					core: this.options.core,
					onTaskSelect: this.selectTask.bind(this),
					onTabPress: this.switchView.bind(this),
					onWorkspacePress: this.showWorkspace.bind(this),
					keepWorkspaceOpen: isTmuxWorkspace(),
					onDetach: isTmuxWorkspace() ? this.detachWorkspace.bind(this) : undefined,
					filters: createKanbanSharedFilters(this.session.filters),
					availableLabels: this.getBoardAvailableLabels(),
					availableMilestones: [...this.milestoneFilterModel.availableMilestoneTitles],
					onFilterChange: this.updateKanbanFilters.bind(this),
					subscribeUpdates: this.subscribeBoardUpdates.bind(this),
					milestoneMode: this.options.milestoneMode,
					milestoneEntities: this.milestoneEntities,
					startupWarning: this.startupWarning,
					dateFormat: config?.dateFormat,
					projectName: config?.projectName,
					priorities: config?.priorities,
					types: config?.types,
					projects: config?.projects,
					hideEmptyColumns: config?.hideEmptyColumns ?? false,
					createTask: this.createBoardTask.bind(this),
					screen: this.getBoardScreen(),
					preserveScreen: true,
				},
			).run();
			return this.viewResult;
		} finally {
			this.boardUpdater = null;
		}
	}

	private getBoardScreen(): ReturnType<typeof createScreen> | undefined {
		if (process.stdout.isTTY) this.boardScreen ??= createScreen({ title: formatTuiTitle("Board", this.projectName) });
		return this.boardScreen;
	}

	private getRenderableTasks(): Task[] {
		return this.session.tasks.filter((task) => task.id && task.id.trim() !== "" && hasAnyPrefix(task.id));
	}

	private getBoardAvailableLabels(): string[] {
		return collectAvailableLabels(this.getRenderableTasks(), this.configuredLabels);
	}

	private publishUpdates(): void {
		this.emitBoardUpdate();
		this.emitTaskListUpdate();
	}

	private emitBoardUpdate(): void {
		this.boardUpdater?.(this.getRenderableTasks(), this.kanbanStatuses);
	}

	private emitTaskListUpdate(): void {
		this.taskListUpdater?.(
			this.getRenderableTasks(),
			this.kanbanStatuses,
			this.configuredLabels,
			this.session.selectedTask,
		);
	}

	private subscribeTaskListUpdates(updater: NonNullable<typeof this.taskListUpdater>): void {
		this.taskListUpdater = updater;
		this.publishUpdates();
	}

	private subscribeBoardUpdates(updater: NonNullable<typeof this.boardUpdater>): void {
		this.boardUpdater = updater;
		this.publishUpdates();
	}

	private selectTask(task: Task): void {
		this.session.selectTask(task);
		this.currentView = "task-detail";
	}

	private updateTaskListFilters(filters: UnifiedViewFilterUpdate): void {
		this.session.updateFilters(mergeUnifiedViewFilters(this.session.filters, filters));
	}

	private updateKanbanFilters(filters: BoardSharedFilters): void {
		this.updateTaskListFilters({
			...filters,
			statusFilter: this.session.filters.statusFilter,
			excludeStatus: filters.excludeStatus ?? [],
			typeFilter: filters.typeFilter ?? [],
			projectFilter: filters.projectFilter ?? [],
		});
	}

	private async switchView(): Promise<void> {
		this.viewResult = "switch";
	}

	private async showWorkspace(task: Task | undefined): Promise<void> {
		const workspace = new TmuxWorkspace(this.options.core.filesystem.rootDir);
		if (isTmuxWorkspace()) await workspace.showWorkspace(task?.id);
		else await workspace.enter("workspace", task?.id);
	}

	private async detachWorkspace(): Promise<void> {
		// Quitting from the board must tear the whole tmux workspace down, not just drop the client.
		await quitWorkspaceHost(new TmuxWorkspace(this.options.core.filesystem.rootDir));
	}

	private async createBoardTask(input: TaskCreateInput): Promise<Task> {
		return createTaskFromBoard(this.options.core, input, createUnifiedTaskUpdateCallbacks(this.session).onTaskAdded);
	}

	private handleConfigChanged(config: Awaited<ReturnType<Core["filesystem"]["loadConfig"]>>): void {
		this.kanbanStatuses = config?.statuses ?? [];
		this.configuredLabels = config?.labels ?? [];
		this.publishUpdates();
	}

	private stopWatchers(): void {
		this.taskWatcher?.stop();
		this.configWatcher?.stop();
	}

	private destroyBoardScreen(): void {
		this.boardScreen?.destroy();
		this.boardScreen = undefined;
	}

	private cleanup(): void {
		this.unsubscribeSession?.();
		if (this.exitHandler) process.removeListener("exit", this.exitHandler);
		this.stopWatchers();
		this.destroyBoardScreen();
	}
}
