/* Task viewer with search/filter header UI */

import { stdout as output } from "node:process";
import type { BoxInterface } from "neo-neo-bblessed";
import { box } from "neo-neo-bblessed";
import { type Core, createRuntimeCore } from "../../core/backlog.ts";
import { loadTaskDetail, type TaskCorpus } from "../../core/task-detail.ts";
import { formatTaskPlainText } from "../../formatters/task-plain-text.ts";
import type { LabelMatchMode, Milestone, Task } from "../../types/index.ts";
import { copyToClipboard } from "../../utils/clipboard.ts";
import { areLabelSelectionsEqual, collectAvailableLabels } from "../../utils/label-filter.ts";
import {
	createMilestoneFilterValueResolver,
	type MilestoneFilterValueResolver,
	NO_MILESTONE_FILTER_LABEL,
	NO_MILESTONE_FILTER_VALUE,
} from "../../utils/milestone-filter.ts";
import { canonicalTaskId, taskIdsEqual } from "../../utils/task-id.ts";
import { attachSubtaskSummaries } from "../../utils/task-subtasks.ts";
import { openConfirmPopup } from "../components/confirm-popup.ts";
import {
	createFilterHeader,
	type FilterControlId,
	type FilterHeader,
	type FilterState,
} from "../components/filter-header.ts";
import { createGenericList, type GenericList } from "../components/generic-list.ts";
import { openHelpPopup } from "../components/help-popup.ts";
import { formatFooterContent, getTaskListFooterContent } from "../footer-content.ts";
import { formatKeymap, keymapKeys } from "../keymap.ts";
import { createLoadingScreen } from "../loading.ts";
import { focusTaskFilterControl, openTaskFilterPicker, taskFilterHeaderControls } from "../task-filter-wiring.ts";
import { createScreen, formatTuiTitle } from "../tui.ts";
import { loadTaskViewerData, normalizeTaskViewerInitialFilters } from "./configuration.ts";
import { formatTaskViewerListItem } from "./detail-content.ts";
import { editTaskViewerTask } from "./editor.ts";
import type { TaskViewerFilterModel } from "./filters.ts";
import { runTaskViewerLifecycleShortcut } from "./lifecycle-shortcut.ts";
import {
	type PendingSearchWrap,
	resolveFilterExitPane,
	resolveListBoundaryNavigation,
	resolveSearchExitTargetIndex,
	resolveTaskListSelection,
} from "./navigation.ts";
import { TaskViewerRendering } from "./rendering.ts";
import { TaskViewerSession } from "./session.ts";

export { createTaskPopup } from "../shared/task-popup.ts";
export {
	formatTaskViewerListItem,
	generateDetailContent,
} from "./detail-content.ts";
export {
	type PendingSearchWrap,
	resolveFilterExitPane,
	resolveListBoundaryNavigation,
	resolveSearchExitTargetIndex,
	resolveTaskListSelection,
	shouldMoveFromDetailBoundaryToSearch,
} from "./navigation.ts";

export function buildTaskViewerMilestoneFilterModel(
	activeMilestones: Milestone[],
	archivedMilestones: Milestone[] = [],
): {
	availableMilestoneTitles: string[];
	resolveMilestoneLabel: MilestoneFilterValueResolver;
} {
	return {
		availableMilestoneTitles: activeMilestones.map((milestone) => milestone.title),
		resolveMilestoneLabel: createMilestoneFilterValueResolver([...activeMilestones, ...archivedMilestones]),
	};
}

type PaneFocus = "list" | "detail";

export function taskViewerEmptyState(filters: TaskViewerFilterModel): { detail: string; list: string } {
	const milestone = filters.milestone === NO_MILESTONE_FILTER_VALUE ? NO_MILESTONE_FILTER_LABEL : filters.milestone;
	const active = [
		filters.search.trim() && `Search: {cyan-fg}${filters.search.trim()}{/}`,
		filters.status.length > 0 && `Status: {cyan-fg}${filters.status.join(", ")}{/}`,
		filters.excludeStatus.length > 0 && `Exclude status: {cyan-fg}${filters.excludeStatus.join(", ")}{/}`,
		filters.taskTypes.length > 0 && `Type: {magenta-fg}${filters.taskTypes.join(", ")}{/}`,
		filters.projects.length > 0 && `Project: {blue-fg}${filters.projects.join(", ")}{/}`,
		filters.priority && `Priority: {cyan-fg}${filters.priority}{/}`,
		filters.labels.length > 0 && `Labels: {yellow-fg}${filters.labels.join(", ")}{/}`,
		filters.milestone && `Milestone: {magenta-fg}${milestone}{/}`,
	].filter((value): value is string => Boolean(value));
	if (active.length === 0) {
		return {
			detail: "{bold}No tasks available{/bold}\n{gray-fg}Create a task with {cyan-fg}backlog task create{/cyan-fg}.{/}",
			list: "{bold}No tasks available{/bold}",
		};
	}
	const items = active.map((value) => ` • ${value}`).join("\n");
	return {
		detail: `{bold}No tasks match your current filters{/bold}\n${items}\n\n{gray-fg}Try adjusting the search or clearing filters.{/}`,
		list: `{bold}No matching tasks{/bold}\n\n${items}`,
	};
}

/**
 * Merge the unfiltered readiness snapshot with the live display copies into the corpus the
 * dependency graph and readiness resolve against.
 *
 * Live copies win over the snapshot so status edits made in this session count. The merge works on
 * claimant groups rather than single records: an identity that either side holds more than once
 * keeps every claimant, so the shared record index still reports it ambiguous exactly as the CLI
 * does, instead of this merge quietly electing a winner.
 */
export function mergeDependencyCorpusTasks(snapshot: Task[], liveTasks: Task[]): Task[] {
	const groupById = (tasks: Task[]) => {
		const groups = new Map<string, Task[]>();
		for (const task of tasks) {
			const key = canonicalTaskId(task.id);
			const group = groups.get(key);
			if (group) group.push(task);
			else groups.set(key, [task]);
		}
		return groups;
	};

	const groups = groupById(snapshot);
	for (const [key, liveClaimants] of groupById(liveTasks)) {
		const snapshotClaimants = groups.get(key);
		// A live copy cannot be attributed to either claimant of a contested identity, so the
		// snapshot's ambiguity stands until the view reloads.
		if (snapshotClaimants && snapshotClaimants.length > 1) continue;
		groups.set(key, liveClaimants);
	}
	return [...groups.values()].flat();
}

/** Display task details with search/filter header UI. */
export async function viewTaskEnhanced(
	task: Task,
	options: {
		tasks?: Task[];
		core?: Core;
		title?: string;
		filterDescription?: string;
		searchQuery?: string;
		statusFilter?: string | string[];
		excludeStatus?: string[];
		typeFilter?: string[];
		projectFilter?: string[];
		priorityFilter?: string;
		milestoneFilter?: string;
		labelFilter?: string[];
		labelMatch?: LabelMatchMode;
		readyFilter?: boolean;
		/** Unfiltered corpus for dependency readiness; defaults to the tasks being displayed. */
		readinessTasks?: Task[];
		limit?: number;
		startWithDetailFocus?: boolean;
		startWithSearchFocus?: boolean;
		startupWarning?: string;
		viewSwitcher?: import("../view-switcher.ts").ViewSwitcher;
		subscribeUpdates?: (
			update: (nextTasks: Task[], nextStatuses: string[], nextLabels: string[], nextSelectedTask?: Task) => void,
		) => void;
		onTaskChange?: (task: Task) => void;
		onTabPress?: () => Promise<void>;
		onFilterChange?: (filters: {
			searchQuery: string;
			statusFilter: string[];
			excludeStatus: string[];
			typeFilter: string[];
			projectFilter: string[];
			priorityFilter: string;
			labelFilter: string[];
			labelMatch?: LabelMatchMode;
			milestoneFilter: string;
		}) => void;
	} = {},
): Promise<void> {
	if (output.isTTY === false) {
		console.log(formatTaskPlainText(await loadTaskDetail(options.core ?? (await createRuntimeCore()), task)));
		return;
	}

	// Reuse the caller's Core so every surface reads the same project root.
	const core = options.core || (await createRuntimeCore({ enableWatchers: true }));

	const loadingScreen = await createLoadingScreen("Loading tasks");
	let loaded: Awaited<ReturnType<typeof loadTaskViewerData>>;
	try {
		loadingScreen?.update("Loading configuration...");
		loaded = await loadTaskViewerData(core, options.tasks);
	} finally {
		await loadingScreen?.close();
	}
	const initialTasks = loaded.allTasks;
	let statuses = loaded.statuses;
	let labels = loaded.labels;
	const priorityOptions = loaded.priorityOptions;
	const configuredTaskTypes = loaded.configuredTaskTypes;
	const configuredProjects = loaded.configuredProjects;
	let availableLabels: string[] = [];
	const contentStore = loaded.contentStore ?? null;
	// Completed tasks are loaded alongside the milestone metadata so dependency readiness can
	// resolve dependencies that already left the active corpus, without a second full task load.
	const [milestoneEntities, archivedMilestones, completedTasks] = await Promise.all([
		core.filesystem.listMilestones(),
		core.filesystem.listArchivedMilestones(),
		core.filesystem.listCompletedTasks(),
	]);
	const { availableMilestoneTitles, resolveMilestoneLabel } = buildTaskViewerMilestoneFilterModel(
		milestoneEntities,
		archivedMilestones,
	);

	const { dateFormat, projectName } = loaded;

	// One shared index over the loaded corpus, however that corpus arrived. Searching exactly the
	// tasks this list renders is what keeps its results identical to the other surfaces'.

	// Collect available labels from config, tasks, and CLI-provided filters.
	availableLabels = collectAvailableLabels(initialTasks, [...labels, ...(options.labelFilter ?? [])]);

	// Dependency readiness must resolve against the whole corpus, not the filtered display list, so
	// it uses the unfiltered snapshot when the caller narrowed what is shown. Both sides stay
	// mutable because completing a task from this view moves it between them.
	let readinessSnapshot = options.readinessTasks ? [...options.readinessTasks] : null;
	const readinessCompletedTasks = [...completedTasks];
	let activeSession: TaskViewerSession | null = null;
	// The corpus that both readiness and the dependency graph resolve against, so the two never
	// disagree about which records this view can see.
	const resolveDependencyCorpus = (): TaskCorpus => {
		let tasks = activeSession?.getTasks() ?? initialTasks;
		if (readinessSnapshot) {
			tasks = mergeDependencyCorpusTasks(readinessSnapshot, tasks);
		}
		return { tasks, completedTasks: readinessCompletedTasks, statuses };
	};

	const initialFilters = normalizeTaskViewerInitialFilters(
		options,
		{ statuses, configuredTaskTypes, configuredProjects },
		availableLabels,
	);
	let searchQuery = initialFilters.searchQuery;
	let statusFilter = initialFilters.statusFilter;
	const excludeStatusFilter = initialFilters.excludeStatusFilter;
	let taskTypeFilter = initialFilters.taskTypeFilter;
	let projectFilter = initialFilters.projectFilter;
	let priorityFilter = initialFilters.priorityFilter;
	let labelFilter = initialFilters.labelFilter;
	let milestoneFilter = initialFilters.milestoneFilter;
	let labelMatch: LabelMatchMode = initialFilters.labelMatch;
	const taskLimit = initialFilters.taskLimit;
	let requireInitialFilterSelection = initialFilters.filtersActive;

	const enrichTask = (candidate: Task | null): Task | null => {
		if (!candidate) return null;
		return attachSubtaskSummaries(candidate, session.getTasks());
	};

	// Find the initial selected task
	const session = new TaskViewerSession(
		initialTasks,
		{
			search: searchQuery,
			status: statusFilter,
			excludeStatus: excludeStatusFilter,
			taskTypes: taskTypeFilter,
			projects: projectFilter,
			priority: priorityFilter,
			labels: labelFilter,
			milestone: milestoneFilter,
			labelMatch,
			limit: taskLimit,
		},
		task,
		resolveMilestoneLabel,
		resolveDependencyCorpus,
		Boolean(options.readyFilter),
	);
	activeSession = session;
	const filteredTasks = session.filteredTasks;
	let noResultsMessage: string | null = null;

	const screenTitle = formatTuiTitle(options.title || "Tasks", projectName);
	const screen = createScreen({ title: screenTitle });

	// Main container
	const container = box({
		parent: screen,
		width: "100%",
		height: "100%",
	});

	// State for tracking focus
	let currentFocus: "filters" | "list" | "detail" = "list";
	let filterPopupOpen = false;
	let modalOpen = false;
	let pendingSearchWrap: PendingSearchWrap = null;
	let filterExitPane: PaneFocus = "list";

	// Create filter header component
	let filterHeader: FilterHeader;

	const focusFilterControl = (filterId: FilterControlId) => focusTaskFilterControl(filterHeader, filterId);

	const openFilterPicker = async (filterId: Exclude<FilterControlId, "search">) => {
		if (filterPopupOpen) {
			return;
		}
		filterPopupOpen = true;

		try {
			const nextFilters = await openTaskFilterPicker({
				screen,
				filterId,
				filters: {
					search: searchQuery,
					status: statusFilter,
					taskTypes: taskTypeFilter,
					projects: projectFilter,
					priority: priorityFilter,
					labels: labelFilter,
					milestone: milestoneFilter,
				},
				statuses,
				taskTypes: configuredTaskTypes,
				projects: configuredProjects,
				priorityOptions,
				labels: availableLabels,
				milestones: availableMilestoneTitles,
			});
			if (nextFilters !== null) {
				searchQuery = nextFilters.search;
				statusFilter = nextFilters.status;
				taskTypeFilter = nextFilters.taskTypes;
				projectFilter = nextFilters.projects;
				priorityFilter = nextFilters.priority;
				labelFilter = nextFilters.labels;
				labelMatch = "any";
				milestoneFilter = nextFilters.milestone;
				filterHeader.setFilters(nextFilters);
				applyFilters();
				notifyFilterChange();
			}
			return;
		} finally {
			filterPopupOpen = false;
			focusFilterControl(filterId);
			screen.render();
		}
	};

	filterHeader = createFilterHeader({
		parent: container,
		statuses,
		availableLabels,
		availableMilestones: availableMilestoneTitles,
		visibleFilters: taskFilterHeaderControls(configuredProjects),
		initialFilters: {
			search: searchQuery,
			status: statusFilter,
			taskTypes: taskTypeFilter,
			projects: projectFilter,
			priority: priorityFilter,
			labels: labelFilter,
			milestone: milestoneFilter,
		},
		onFilterChange: (filters: FilterState) => {
			const labelsChanged = !areLabelSelectionsEqual(labelFilter, filters.labels);
			searchQuery = filters.search;
			statusFilter = filters.status;
			taskTypeFilter = filters.taskTypes;
			projectFilter = filters.projects;
			priorityFilter = filters.priority;
			labelFilter = filters.labels;
			if (labelsChanged) {
				labelMatch = "any";
			}
			milestoneFilter = filters.milestone;
			applyFilters();
			notifyFilterChange();
		},
		onFilterPickerOpen: (filterId) => {
			void openFilterPicker(filterId);
		},
	});

	// Handle focus changes from filter header
	filterHeader.setFocusChangeHandler((focus) => {
		if (focus !== null) {
			if (currentFocus !== "filters") {
				filterExitPane = currentFocus === "detail" ? "detail" : "list";
			}
			currentFocus = "filters";
			setActivePane("none");
			updateHelpBar();
		}
	});
	filterHeader.setExitRequestHandler((direction) => {
		filterHeader.setBorderColor("cyan");
		const targetPane = resolveFilterExitPane(filterExitPane, Boolean(taskList), Boolean(rendering.descriptionBox));
		if (targetPane === "list" && taskList) {
			const selected = taskList.getSelectedIndex();
			const currentIndex = Array.isArray(selected) ? selected[0] : selected;
			const targetIndex = resolveSearchExitTargetIndex(
				direction,
				pendingSearchWrap,
				filteredTasks.length,
				currentIndex,
			);
			focusTaskList(targetIndex);
		} else if (targetPane === "detail" && rendering.descriptionBox) {
			focusDetailPane();
		}
		pendingSearchWrap = null;
	});

	// Get dynamic header height
	const getHeaderHeight = () => filterHeader.getHeight();

	let rendering: TaskViewerRendering;
	const taskListPane = () => rendering.taskListPane;
	let transientHelpContent: string | null = null;
	let helpRestoreTimer: ReturnType<typeof setTimeout> | null = null;

	function showTransientHelp(message: string, durationMs = 3000) {
		transientHelpContent = message;
		if (helpRestoreTimer) {
			clearTimeout(helpRestoreTimer);
			helpRestoreTimer = null;
		}
		updateHelpBar();
		helpRestoreTimer = setTimeout(() => {
			transientHelpContent = null;
			helpRestoreTimer = null;
			updateHelpBar();
		}, durationMs);
	}

	function getTerminalWidth(): number {
		return typeof screen.width === "number" ? screen.width : 80;
	}

	function getTaskListSummaryWidth(): number {
		return Math.max(1, Math.floor(getTerminalWidth() * 0.4) - 4);
	}

	function setHelpBarContent(content: string) {
		rendering.setHelpBarContent(content, getTerminalWidth(), formatFooterContent);
	}

	function setActivePane(active: "list" | "detail" | "none") {
		rendering.setActivePane(active);
	}

	function focusTaskList(targetIndex?: number): void {
		if (!taskList) {
			if (rendering.descriptionBox) {
				currentFocus = "detail";
				setActivePane("detail");
				rendering.descriptionBox.focus();
				updateHelpBar();
				screen.render();
			}
			return;
		}
		currentFocus = "list";
		setActivePane("list");
		if (typeof targetIndex === "number") {
			taskList.setSelectedIndex(targetIndex);
		}
		taskList.focus();
		updateHelpBar();
		screen.render();
	}

	function focusDetailPane(): void {
		if (!rendering.descriptionBox) return;
		currentFocus = "detail";
		setActivePane("detail");
		rendering.descriptionBox.focus();
		updateHelpBar();
		screen.render();
	}

	rendering = new TaskViewerRendering({
		screen,
		container,
		getHeaderHeight,
		startupWarning: options.startupWarning,
		screenTitle,
		projectName: projectName ?? "",
		dateFormat: dateFormat ?? "",
		configuredProjects,
		resolveMilestoneLabel,
		getSelectedTask: () => session.selected,
		resolveDependencyCorpus,
		getNoResultsMessage: () => noResultsMessage,
		getFocus: () => currentFocus,
		setFocus: (focus) => {
			currentFocus = focus;
		},
		focusTaskList,
		focusSearch: () => filterHeader.focusSearch(),
		clearPendingSearchWrap: () => {
			pendingSearchWrap = null;
		},
		updateHelpBar,
	});

	// Helper to notify filter changes
	function notifyFilterChange() {
		if (options.onFilterChange) {
			options.onFilterChange({
				searchQuery,
				statusFilter,
				excludeStatus: excludeStatusFilter,
				typeFilter: taskTypeFilter,
				projectFilter,
				priorityFilter,
				labelFilter,
				labelMatch,
				milestoneFilter,
			});
		}
	}

	// Function to apply filters and refresh the task list
	function applyFilters() {
		const filters: TaskViewerFilterModel = {
			search: searchQuery,
			status: statusFilter,
			excludeStatus: excludeStatusFilter,
			taskTypes: taskTypeFilter,
			projects: projectFilter,
			priority: priorityFilter,
			labels: labelFilter,
			milestone: milestoneFilter,
			labelMatch,
			limit: taskLimit,
		};
		session.updateFilters(filters);

		taskListPane().setLabel?.(`\u00A0Tasks (${filteredTasks.length})\u00A0`);
		taskList?.destroy();
		taskList = null;
		if (filteredTasks.length === 0) {
			const emptyState = taskViewerEmptyState(filters);
			noResultsMessage = emptyState.detail;
			showListEmptyState(emptyState.list);
		} else {
			noResultsMessage = null;
			hideListEmptyState();
			taskList = createTaskList();
			const selectedIndex = filteredTasks.findIndex((task) => task.id === session.selected.id);
			const desiredIndex = requireInitialFilterSelection || selectedIndex < 0 ? 0 : selectedIndex;
			const selected = filteredTasks[desiredIndex];
			if (selected && session.select(enrichTask(selected) ?? selected)) options.onTaskChange?.(session.selected);
			taskList?.setSelectedIndex(desiredIndex);
			requireInitialFilterSelection = false;
		}
		refreshDetailPane();
		screen.render();
	}

	// Task list component
	let taskList: GenericList<Task> | null = null;
	let listEmptyStateBox: BoxInterface | null = null;

	function showListEmptyState(message: string) {
		if (listEmptyStateBox) {
			listEmptyStateBox.destroy();
		}
		listEmptyStateBox = box({
			parent: taskListPane(),
			top: 1,
			left: 1,
			width: "100%-4",
			height: "100%-3",
			content: message,
			tags: true,
			style: { fg: "gray" },
		});
	}

	function hideListEmptyState() {
		if (listEmptyStateBox) {
			listEmptyStateBox.destroy();
			listEmptyStateBox = null;
		}
	}

	async function applySelection(selectedTask: Task | null) {
		if (!selectedTask) return;
		if (selectedTask.id === session.selected.id) {
			return;
		}
		const enriched = enrichTask(selectedTask);
		session.select(enriched ?? selectedTask);
		options.onTaskChange?.(session.selected);
		const requestId = session.beginSelectionRefresh();
		refreshDetailPane();
		screen.render();
		const refreshed = await core.getTaskWithSubtasks(selectedTask.id, session.getTasks());
		if (!session.isCurrentSelectionRefresh(requestId)) {
			return;
		}
		if (refreshed) {
			session.select(refreshed);
			options.onTaskChange?.(refreshed);
		}
		refreshDetailPane();
		screen.render();
	}

	function createTaskList(): GenericList<Task> | null {
		const initialIndex = Math.max(
			0,
			filteredTasks.findIndex((t) => t.id === session.selected.id),
		);

		taskList = createGenericList<Task>({
			parent: taskListPane(),
			title: "",
			items: filteredTasks,
			selectedIndex: initialIndex,
			border: false,
			scrollbar: false,
			top: 1,
			left: 1,
			width: "100%-4",
			height: "100%-3",
			itemRenderer: (task: Task) =>
				formatTaskViewerListItem(task, getTaskListSummaryWidth(), dateFormat, configuredProjects),
			onSelect: (selected: Task | Task[]) => {
				const selectedTask = Array.isArray(selected) ? selected[0] : selected;
				void applySelection(selectedTask || null);
			},
			onHighlight: (selected: Task | null) => {
				void applySelection(selected);
			},
			onBoundaryNavigation: (direction, selectedIndex, total, key) => {
				const navigation = resolveListBoundaryNavigation(direction, selectedIndex, total, key);
				if (navigation === "move") {
					return false;
				}
				if (navigation === "search") {
					pendingSearchWrap = direction === "up" ? "to-last" : "to-first";
					filterHeader.focusSearch();
				}
				// "stay" consumes the key so vim navigation neither wraps nor leaves the list.
				return true;
			},
			showHelp: false,
		});

		// Focus handler for task list
		if (taskList) {
			const listBox = taskList.getListBox();
			listBox.on("focus", () => {
				currentFocus = "list";
				setActivePane("list");
				screen.render();
				updateHelpBar();
			});
			listBox.on("blur", () => {
				setActivePane("none");
				screen.render();
			});
			listBox.key(keymapKeys("taskList", "focusDetail"), () => {
				focusDetailPane();
				return false;
			});
		}

		return taskList;
	}

	function refreshDetailPane() {
		rendering.refreshDetailPane();
	}

	// Dynamic help bar content
	function updateHelpBar() {
		if (transientHelpContent) {
			setHelpBarContent(transientHelpContent);
			screen.render();
			return;
		}

		let content = "";

		const filterFocus = filterHeader.getCurrentFocus();
		if (currentFocus === "filters" && filterFocus) {
			if (filterFocus === "search") {
				content = ` {cyan-fg}[${formatKeymap("shared", "previous")}/${formatKeymap("shared", "next")}]{/} Cursor (edge=Prev/Next) | {cyan-fg}[${formatKeymap("shared", "up")}/${formatKeymap("shared", "down")}]{/} Back to Tasks | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Cancel | {gray-fg}(Live search){/}`;
			} else {
				content = ` {cyan-fg}[${formatKeymap("shared", "activate")}]{/} Open Picker | {cyan-fg}[${formatKeymap("shared", "previous")}/${formatKeymap("shared", "next")}]{/} Prev/Next | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Back`;
			}
		} else if (currentFocus === "detail") {
			content = ` {cyan-fg}[${formatKeymap("shared", "tab")}]{/} View | {cyan-fg}[${formatKeymap("taskList", "focusList")}]{/} List | {cyan-fg}[${formatKeymap("shared", "up")}${formatKeymap("shared", "down")}]{/} Scroll | {cyan-fg}[${formatKeymap("taskList", "edit")}]{/} Edit | {cyan-fg}[${formatKeymap("taskList", "copy")}]{/} Yank | {cyan-fg}[${formatKeymap("shared", "help")}]{/} Help | {cyan-fg}[${formatKeymap("shared", "quitWithoutEscape")}]{/} Quit`;
		} else {
			// Task list help
			content = getTaskListFooterContent({ hasProjects: configuredProjects.length > 0 });
		}

		setHelpBarContent(content);
		screen.render();
	}

	const openCurrentTaskInEditor = async () => {
		if (filterPopupOpen || currentFocus === "filters" || noResultsMessage) {
			return;
		}
		const selectedTask = session.selected;
		await editTaskViewerTask({
			core,
			screen,
			task: selectedTask,
			onSaved: (savedTask) => {
				session.replaceTask(savedTask);
				const enhancedTask = enrichTask(savedTask) ?? savedTask;
				session.select(enhancedTask);
				options.onTaskChange?.(enhancedTask);
			},
			refresh: applyFilters,
			showHelp: showTransientHelp,
		});
	};

	const getCurrentShortcutTask = (): Task | null => {
		if (noResultsMessage) {
			return null;
		}
		return resolveTaskListSelection(filteredTasks, taskList?.getSelectedIndex(), session.selected);
	};

	const removeTaskFromCurrentView = (taskId: string) => {
		const currentIndex = filteredTasks.findIndex((taskItem) => taskItem.id === taskId);
		const remainingFilteredTasks = filteredTasks.filter((taskItem) => taskItem.id !== taskId);
		const nextIndex = Math.min(Math.max(currentIndex, 0), remainingFilteredTasks.length - 1);
		const nextTask = remainingFilteredTasks[nextIndex] ?? null;

		session.removeTask(taskId);
		if (nextTask) {
			session.select(enrichTask(nextTask) ?? nextTask);
			options.onTaskChange?.(session.selected);
		}
		applyFilters();
	};

	const runWithModalGuard = async <T>(operation: () => Promise<T>): Promise<T> => {
		modalOpen = true;
		try {
			return await operation();
		} finally {
			modalOpen = false;
		}
	};

	const applyTaskLifecycleShortcut = async (task: Task, action: "complete" | "archive") => {
		await runTaskViewerLifecycleShortcut({
			core,
			screen,
			task,
			action,
			confirm: openConfirmPopup,
			runModal: runWithModalGuard,
			onCompleted: (completedTask, completedAction) => {
				readinessSnapshot =
					readinessSnapshot?.filter((candidate) => !taskIdsEqual(candidate.id, completedTask.id)) ?? null;
				if (completedAction === "complete") readinessCompletedTasks.push(completedTask);
				removeTaskFromCurrentView(completedTask.id);
			},
			showHelp: showTransientHelp,
		});
	};

	// Handle resize
	screen.on("resize", () => {
		filterHeader.rebuild();
		taskList?.updateItems(filteredTasks);
		updateHelpBar();
	});

	// Keyboard shortcuts
	screen.key(keymapKeys("shared", "search"), () => {
		if (modalOpen) return;
		pendingSearchWrap = null;
		filterHeader.focusSearch();
	});

	screen.key(keymapKeys("shared", "find"), () => {
		if (modalOpen) return;
		pendingSearchWrap = null;
		filterHeader.focusSearch();
	});

	screen.key(keymapKeys("taskList", "filterStatus"), () => {
		if (modalOpen) return;
		void openFilterPicker("status");
	});

	screen.key(keymapKeys("taskList", "filterType"), () => {
		if (modalOpen || filterPopupOpen) return;
		void openFilterPicker("type");
	});

	if (configuredProjects.length > 0) {
		// Not "g"/"G": those already scroll the detail pane to top/bottom (see the
		// boxInstance bindings above) and a screen-level handler here would conflict.
		screen.key(keymapKeys("taskList", "filterProject"), () => {
			if (modalOpen || filterPopupOpen) return;
			void openFilterPicker("project");
		});
	}

	screen.key(keymapKeys("taskList", "filterPriority"), () => {
		if (modalOpen) return;
		void openFilterPicker("priority");
	});

	screen.key(keymapKeys("taskList", "filterLabels"), () => {
		if (modalOpen) return;
		void openFilterPicker("labels");
	});

	screen.key(keymapKeys("taskList", "filterMilestone"), () => {
		if (modalOpen) return;
		void openFilterPicker("milestone");
	});

	screen.key(keymapKeys("taskList", "edit"), () => {
		if (modalOpen) return;
		void openCurrentTaskInEditor();
	});

	screen.key(keymapKeys("taskList", "copy"), async () => {
		if (modalOpen || filterPopupOpen || currentFocus === "filters") return;
		const task = getCurrentShortcutTask();
		if (!task) return;
		const success = await copyToClipboard(task.id);
		if (success) {
			showTransientHelp(` {green-fg}Copied ${task.id} to clipboard{/}`);
		} else {
			showTransientHelp(" {red-fg}Failed to copy to clipboard{/}");
		}
	});

	screen.key(keymapKeys("taskList", "complete"), async () => {
		if (modalOpen || filterPopupOpen || currentFocus === "filters") return;
		const task = getCurrentShortcutTask();
		if (!task) return;
		await applyTaskLifecycleShortcut(task, "complete");
	});

	screen.key(keymapKeys("taskList", "archive"), async () => {
		if (modalOpen || filterPopupOpen || currentFocus === "filters") return;
		const task = getCurrentShortcutTask();
		if (!task) return;
		await applyTaskLifecycleShortcut(task, "archive");
	});

	screen.key(keymapKeys("shared", "help"), async () => {
		if (modalOpen || filterPopupOpen) return;
		await runWithModalGuard(() => openHelpPopup(screen, "task-list", { hasProjects: configuredProjects.length > 0 }));
	});

	screen.key(keymapKeys("shared", "escape"), () => {
		if (modalOpen || filterPopupOpen) {
			return;
		}
		if (currentFocus === "filters") {
			filterHeader.setBorderColor("cyan");
			const targetPane = resolveFilterExitPane(filterExitPane, Boolean(taskList), Boolean(rendering.descriptionBox));
			if (targetPane === "list" && taskList) {
				focusTaskList();
			} else if (targetPane === "detail" && rendering.descriptionBox) {
				focusDetailPane();
			}
		} else if (currentFocus !== "list") {
			if (taskList) {
				focusTaskList();
			}
		} else {
			// If already in task list, quit
			contentStore?.dispose();
			filterHeader.destroy();
			screen.destroy();
			process.exit(0);
		}
	});

	// Tab key handling for view switching - only when in task list
	if (options.onTabPress) {
		screen.key(keymapKeys("shared", "tab"), async () => {
			// Keep tab as filter-navigation while filters are focused.
			if (modalOpen || filterPopupOpen || currentFocus === "filters") {
				return;
			}
			if (currentFocus === "list" || currentFocus === "detail") {
				// Cleanup before switching
				contentStore?.dispose();
				filterHeader.destroy();
				screen.destroy();
				await options.onTabPress?.();
			}
		});
	}

	// Quit handlers
	screen.key(keymapKeys("shared", "quitWithoutEscape"), () => {
		if (modalOpen || filterPopupOpen) {
			return;
		}
		contentStore?.dispose();
		filterHeader.destroy();
		screen.destroy();
		process.exit(0);
	});

	// Initial setup
	updateHelpBar();

	// Apply filters first if any are set
	if (initialFilters.filtersActive) {
		applyFilters();
	} else {
		taskList = createTaskList();
	}
	options.subscribeUpdates?.((nextTasks, nextStatuses, nextLabels, nextSelectedTask) => {
		statuses = nextStatuses;
		labels = nextLabels;
		availableLabels = collectAvailableLabels(nextTasks, labels);
		session.updateTasks(nextTasks);

		const previousTaskId = session.selected.id;
		const currentTask =
			session.getTasks().find((candidate) => candidate.id === nextSelectedTask?.id) ??
			session.getTasks().find((candidate) => candidate.id === session.selected.id) ??
			session.getTasks()[0];
		if (currentTask) {
			session.select(enrichTask(currentTask) ?? currentTask);
			if (session.selected.id !== previousTaskId) options.onTaskChange?.(session.selected);
		}
		applyFilters();
	});
	refreshDetailPane();

	if (options.startWithSearchFocus) {
		filterHeader.focusSearch();
	} else if (options.startWithDetailFocus) {
		if (rendering.descriptionBox) {
			focusDetailPane();
		}
	} else {
		// Focus the task list initially and highlight it
		if (taskList) {
			focusTaskList();
		}
	}

	screen.render();

	// Wait for screen to close
	return new Promise<void>((resolve) => {
		screen.on("destroy", () => {
			if (helpRestoreTimer) {
				clearTimeout(helpRestoreTimer);
				helpRestoreTimer = null;
			}
			contentStore?.dispose();
			resolve();
		});
	});
}

/*
async function createTaskPopupLegacy(
	screen: ScreenInterface,
	task: Task,
	resolveMilestoneLabel?: (milestone: string) => string,
	dateFormat?: string,
	configuredProjects?: string[],
): Promise<{
	background: BoxInterface;
	popup: BoxInterface;
	contentArea: ScrollableTextInterface;
	close: () => void;
} | null> {
	if (output.isTTY === false) return null;

	const popup = box({
		parent: screen,
		top: "center",
		left: "center",
		width: "85%",
		height: "80%",
		border: "line",
		style: {
			border: { fg: "gray" },
		},
		keys: true,
		tags: true,
		autoPadding: true,
	});

	const background = box({
		parent: screen,
		top: Number(popup.top ?? 0) - 1,
		left: Number(popup.left ?? 0) - 2,
		width: Number(popup.width ?? 0) + 4,
		height: Number(popup.height ?? 0) + 2,
		style: {
			bg: "black",
		},
	});

	popup.setFront?.();

	const { headerContent, bodyContent } = generateDetailContent(task, {
		resolveMilestoneLabel,
		dateFormat,
		configuredProjects,
	});

	// Calculate header height based on content and available width
	const popupWidth = typeof popup.width === "number" ? popup.width : 80;
	const availableWidth = popupWidth - 6;

	let headerLineCount = 0;
	for (const headerLine of headerContent) {
		const plainText = headerLine.replace(/\{[^}]+\}/g, "");
		const lineCount = Math.max(1, Math.ceil(plainText.length / availableWidth));
		headerLineCount += lineCount;
	}

	box({
		parent: popup,
		top: 0,
		left: 1,
		right: 1,
		height: headerLineCount,
		tags: true,
		wrap: true,
		scrollable: false,
		padding: { left: 1, right: 1 },
		content: headerContent.join("\n"),
	});

	line({
		parent: popup,
		top: headerLineCount,
		left: 1,
		right: 1,
		orientation: "horizontal",
		style: { fg: "gray" },
	});

	box({
		parent: popup,
		content: ` ${formatKeymap("shared", "escape")} `,
		top: -1,
		right: 1,
		width: 5,
		height: 1,
		style: { inverse: true, bold: true },
	});

	const contentArea = scrollabletext({
		parent: popup,
		top: headerLineCount + 1,
		left: 1,
		right: 1,
		bottom: 1,
		keys: true,
		vi: true,
		mouse: true,
		tags: true,
		wrap: true,
		padding: { left: 1, right: 1, top: 0, bottom: 0 },
		content: bodyContent.join("\n"),
		scrollbar: { ch: " ", inverse: true },
		style: { scrollbar: { bg: "gray" } },
	});

	addScrollKeys(contentArea, screen);

	const closePopup = () => {
		popup.destroy();
		background.destroy();
		screen.render();
	};

	popup.key(keymapKeys("shared", "quit"), () => {
		closePopup();
		return false;
	});

	contentArea.on("focus", () => {
		const popupStyle = popup.style as { border?: { fg?: string } };
		popupStyle.border = { ...(popupStyle.border ?? {}), fg: "yellow" };
		screen.render();
	});

	contentArea.on("blur", () => {
		const popupStyle = popup.style as { border?: { fg?: string } };
		popupStyle.border = { ...(popupStyle.border ?? {}), fg: "gray" };
		screen.render();
	});

	contentArea.key(keymapKeys("shared", "escape"), () => {
		closePopup();
		return false;
	});

	setImmediate(() => {
		contentArea.focus();
	});

	return {
		background,
		popup,
		contentArea,
		close: closePopup,
	};
}
*/
