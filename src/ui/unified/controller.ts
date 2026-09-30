/**
 * Unified view manager that handles Tab switching between task views and kanban board
 */

import type { Core } from "../../core/backlog.ts";
import { findLocalDuplicateTaskIds } from "../../core/duplicate-task-repair.ts";
import type { LabelMatchMode, Milestone, Task, TaskCreateInput } from "../../types/index.ts";
import { watchConfig } from "../../utils/config-watcher.ts";
import { formatDuplicateTaskIdSummary } from "../../utils/duplicate-detection.ts";
import { collectAvailableLabels } from "../../utils/label-filter.ts";
import { hasAnyPrefix } from "../../utils/prefix-config.ts";
import { applyTaskFilters, createTaskSearchIndex } from "../../utils/task-search.ts";
import { type TaskWatcherCallbacks, watchTasks } from "../../utils/task-watcher.ts";
import { createWorkspaceViewState, runAgentWorkspace } from "../agent-workspace.ts";
import { renderBoardTui } from "../board.ts";
import { createLoadingScreen } from "../loading.ts";
import { buildTaskViewerMilestoneFilterModel, viewTaskEnhanced } from "../task-viewer-with-search.ts";
import { createScreen, formatTuiTitle, keepTuiInputAlive } from "../tui.ts";
import type { ViewType } from "../view-switcher.ts";
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

type ViewResult = "switch" | "workspace" | "exit";

async function runUnifiedViewLoop(
	initialView: ViewType,
	showView: (view: ViewType) => Promise<ViewResult>,
	onViewChanged: (view: ViewType) => void,
	onViewCompleted: () => void,
): Promise<void> {
	let currentView = initialView;
	let isRunning = true;
	while (isRunning) {
		const result = await showView(currentView);
		onViewCompleted();
		if (result === "switch") {
			currentView = currentView === "workspace" ? "kanban" : currentView === "kanban" ? "task-list" : "kanban";
			onViewChanged(currentView);
		} else if (result === "workspace") {
			currentView = "workspace";
			onViewChanged(currentView);
		} else {
			isRunning = false;
		}
	}
}

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

/**
 * Main unified view controller that handles Tab switching between views
 */
export async function runUnifiedView(options: UnifiedViewOptions): Promise<void> {
	const releaseTuiInput = keepTuiInputAlive();
	let sharedScreen: ReturnType<typeof createScreen> | undefined;
	let taskWatcher: ReturnType<typeof watchTasks> | undefined;
	let configWatcher: ReturnType<typeof watchConfig> | undefined;
	let unsubscribeSession: (() => void) | undefined;
	const stopWatchers = () => {
		taskWatcher?.stop();
		configWatcher?.stop();
	};
	process.once("exit", stopWatchers);
	try {
		const {
			tasks: loadedTasks,
			statuses: loadedStatuses,
			readinessTasks: loadedReadinessTasks,
		} = await loadTasksForUnifiedView(options.core, {
			tasks: options.tasks,
			tasksLoader: options.tasksLoader,
			loadingScreenFactory: options.loadingScreenFactory,
		});

		const startupWarning = await getDuplicateTaskStartupWarning(options.core);

		const baseTasks = (loadedTasks || []).filter((t) => t.id && t.id.trim() !== "" && hasAnyPrefix(t.id));
		if (baseTasks.length === 0) {
			const emptyMessage = getEmptyUnifiedViewMessage(options.initialView, options.filter?.parentTaskId);
			if (emptyMessage) {
				console.log(emptyMessage);
				return;
			}
		}
		const initialConfig = await options.core.filesystem.loadConfig();
		let configuredLabels = initialConfig?.labels ?? [];
		let milestoneEntities = await options.core.filesystem.listMilestones();
		let milestoneFilterModel = buildTaskViewerMilestoneFilterModel(milestoneEntities);
		const unifiedSession = new UnifiedViewSession(
			baseTasks,
			options.selectedTask,
			createUnifiedViewFilters(options.filter),
		);
		let currentView: ViewType = options.initialView;
		const workspaceState = createWorkspaceViewState();
		let kanbanStatuses = loadedStatuses ?? [];
		let boardUpdater: ((nextTasks: Task[], nextStatuses: string[]) => void) | null = null;
		let taskListUpdater:
			| ((nextTasks: Task[], nextStatuses: string[], nextLabels: string[], nextSelectedTask?: Task) => void)
			| null = null;
		const getSharedScreen = () => {
			if (process.stdout.isTTY) {
				sharedScreen ??= createScreen({ title: formatTuiTitle("Board", initialConfig?.projectName) });
			}
			return sharedScreen;
		};

		const getRenderableTasks = () =>
			unifiedSession.tasks.filter((task) => task.id && task.id.trim() !== "" && hasAnyPrefix(task.id));
		const getBoardAvailableLabels = () => collectAvailableLabels(getRenderableTasks(), configuredLabels);
		const getBoardAvailableMilestones = () => [...milestoneFilterModel.availableMilestoneTitles];

		const emitBoardUpdate = () => {
			if (!boardUpdater) return;
			boardUpdater(getRenderableTasks(), kanbanStatuses);
		};
		const emitTaskListUpdate = () => {
			if (!taskListUpdater) return;
			taskListUpdater(getRenderableTasks(), kanbanStatuses, configuredLabels, unifiedSession.selectedTask);
		};
		unsubscribeSession = unifiedSession.subscribeTasks(() => {
			emitBoardUpdate();
			emitTaskListUpdate();
		});
		const taskUpdateCallbacks = createUnifiedTaskUpdateCallbacks(unifiedSession);
		let isInitialLoad = true; // Track if this is the first view load
		taskWatcher = watchTasks(options.core, taskUpdateCallbacks, baseTasks);

		configWatcher = watchConfig(options.core, {
			onConfigChanged: (config) => {
				kanbanStatuses = config?.statuses ?? [];
				configuredLabels = config?.labels ?? [];
				emitBoardUpdate();
				emitTaskListUpdate();
			},
		});

		// Function to show task view
		const showTaskView = async (): Promise<ViewResult> => {
			// The task viewer owns a separate screen, so release the Board/Workspace screen
			// before opening it rather than leaving two Blessed screens active at once.
			sharedScreen?.destroy();
			sharedScreen = undefined;
			const availableTasks = getRenderableTasks();

			if (availableTasks.length === 0) {
				console.log("No tasks available.");
				return "exit";
			}

			// Find the task to view - if selectedTask has an ID, find it in available tasks
			let taskToView: Task | undefined;
			if (unifiedSession.selectedTask?.id) {
				const foundTask = availableTasks.find((t) => t.id === unifiedSession.selectedTask?.id);
				taskToView = foundTask || availableTasks[0];
			} else {
				taskToView = availableTasks[0];
			}

			if (!taskToView) {
				console.log("No task selected.");
				return "exit";
			}

			// Show enhanced task viewer with view switching support
			return new Promise<ViewResult>((resolve) => {
				let result: ViewResult = "exit"; // Default to exit

				const onTabPress = async () => {
					result = "switch";
				};

				// Determine initial focus based on where we're coming from
				// - If we have a search query on initial load, focus search
				// - If currentView is task-detail, focus detail
				// - Otherwise (including when coming from kanban), focus task list
				const hasSearchQuery = options.filter ? "searchQuery" in options.filter : false;
				const shouldFocusSearch = isInitialLoad && hasSearchQuery;

				viewTaskEnhanced(taskToView, {
					tasks: availableTasks,
					core: options.core,
					title: options.filter?.title,
					filterDescription: options.filter?.filterDescription,
					searchQuery: unifiedSession.filters.searchQuery,
					statusFilter: unifiedSession.filters.statusFilter,
					excludeStatus: unifiedSession.filters.excludeStatus,
					typeFilter: unifiedSession.filters.typeFilter,
					projectFilter: unifiedSession.filters.projectFilter,
					priorityFilter: unifiedSession.filters.priorityFilter,
					labelFilter: unifiedSession.filters.labelFilter,
					labelMatch: unifiedSession.filters.labelMatch,
					milestoneFilter: unifiedSession.filters.milestoneFilter,
					readyFilter: options.filter?.ready,
					readinessTasks: loadedReadinessTasks,
					limit: unifiedSession.filters.limit,
					startWithDetailFocus: currentView === "task-detail",
					startWithSearchFocus: shouldFocusSearch,
					startupWarning,
					subscribeUpdates: (updater) => {
						taskListUpdater = updater;
						emitTaskListUpdate();
					},
					onTaskChange: (newTask) => {
						unifiedSession.selectTask(newTask);
						currentView = "task-detail";
					},
					onFilterChange: (filters) => {
						unifiedSession.updateFilters(mergeUnifiedViewFilters(unifiedSession.filters, filters));
					},
					onTabPress,
				}).then(() => {
					taskListUpdater = null;
					resolve(result);
				});
			});
		};

		const showWorkspaceView = async (): Promise<ViewResult> => {
			const result = await runAgentWorkspace(options.core, {
				screen: getSharedScreen(),
				preserveScreen: true,
				state: workspaceState,
			});
			return result === "board" ? "switch" : "exit";
		};

		// Function to show kanban view
		const showKanbanView = async (): Promise<ViewResult> => {
			const config = await options.core.filesystem.loadConfig();
			configuredLabels = config?.labels ?? configuredLabels;
			const layout = "horizontal" as const;
			const maxColumnWidth = config?.maxColumnWidth || 20;
			milestoneEntities = await options.core.filesystem.listMilestones();
			milestoneFilterModel = buildTaskViewerMilestoneFilterModel(milestoneEntities);
			const kanbanTasks = getRenderableTasks();
			const statuses = kanbanStatuses;

			// Show kanban board with view switching support
			return new Promise<ViewResult>((resolve) => {
				let result: ViewResult = "exit"; // Default to exit

				const onTabPress = async () => {
					result = "switch";
				};
				const onWorkspacePress = async () => {
					result = "workspace";
				};

				renderBoardTui(kanbanTasks, statuses, layout, maxColumnWidth, {
					core: options.core,
					onTaskSelect: (task) => {
						unifiedSession.selectTask(task);
					},
					onTabPress,
					onWorkspacePress,
					filters: createKanbanSharedFilters(unifiedSession.filters),
					availableLabels: getBoardAvailableLabels(),
					availableMilestones: getBoardAvailableMilestones(),
					onFilterChange: (filters) => {
						unifiedSession.updateFilters(
							mergeUnifiedViewFilters(unifiedSession.filters, {
								searchQuery: filters.searchQuery,
								statusFilter: unifiedSession.filters.statusFilter,
								excludeStatus: filters.excludeStatus,
								typeFilter: filters.typeFilter,
								projectFilter: filters.projectFilter,
								priorityFilter: filters.priorityFilter,
								labelFilter: [...filters.labelFilter],
								labelMatch: filters.labelMatch ?? unifiedSession.filters.labelMatch ?? "any",
								milestoneFilter: filters.milestoneFilter,
								limit: filters.limit,
							}),
						);
					},
					subscribeUpdates: (updater) => {
						boardUpdater = updater;
						emitBoardUpdate();
					},
					milestoneMode: options.milestoneMode,
					milestoneEntities,
					startupWarning,
					dateFormat: config?.dateFormat,
					projectName: config?.projectName,
					priorities: config?.priorities,
					types: config?.types,
					projects: config?.projects,
					hideEmptyColumns: config?.hideEmptyColumns ?? false,
					createTask: async (input) => createTaskFromBoard(options.core, input, taskUpdateCallbacks.onTaskAdded),
					screen: getSharedScreen(),
					preserveScreen: true,
				}).then(() => {
					boardUpdater = null;
					resolve(result);
				});
			});
		};

		await runUnifiedViewLoop(
			currentView,
			(view) => {
				if (view === "task-list" || view === "task-detail") return showTaskView();
				if (view === "kanban") return showKanbanView();
				return showWorkspaceView();
			},
			(view) => {
				currentView = view;
			},
			() => {
				isInitialLoad = false;
			},
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	} finally {
		unsubscribeSession?.();
		process.removeListener("exit", stopWatchers);
		stopWatchers();
		sharedScreen?.destroy();
		releaseTuiInput();
	}
}
