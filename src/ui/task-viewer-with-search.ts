/* Task viewer with search/filter header UI */

import { stdout as output } from "node:process";
import type { BoxInterface, LineInterface, ScreenInterface, ScrollableTextInterface } from "neo-neo-bblessed";
import { box, line, scrollabletext } from "neo-neo-bblessed";
import { type Core, createRuntimeCore } from "../core/backlog.ts";
import {
	loadTaskDetail,
	type TaskCorpus,
	type TaskDetail,
	taskDependencyGraph,
	taskReadiness,
	toTaskDetail,
	withReadiness,
} from "../core/task-detail.ts";
import { formatDependencyGraphLines, formatDependencyNodeTuiLabel } from "../formatters/dependency-graph-text.ts";
import {
	buildAcceptanceCriteriaItems,
	formatDateForDisplay,
	formatDefinitionOfDoneChecklist,
	formatTaskPlainText,
} from "../formatters/task-plain-text.ts";
import type { BacklogConfig, LabelMatchMode, Milestone, Task } from "../types/index.ts";
import { copyToClipboard } from "../utils/clipboard.ts";
import { areLabelSelectionsEqual, collectAvailableLabels } from "../utils/label-filter.ts";
import {
	createMilestoneFilterValueResolver,
	type MilestoneFilterValueResolver,
	NO_MILESTONE_FILTER_LABEL,
	NO_MILESTONE_FILTER_VALUE,
} from "../utils/milestone-filter.ts";
import { hasAnyPrefix } from "../utils/prefix-config.ts";
import {
	formatPriorityLabel,
	getPriorityOptions,
	normalizePriorityValue,
	type PriorityOption,
} from "../utils/priority-config.ts";
import { getProjectValues, resolveProjectValues } from "../utils/project-config.ts";
import { formatReadinessBlockers } from "../utils/readiness.ts";
import { canonicalTaskId, taskIdsEqual } from "../utils/task-id.ts";
import { applyTaskFilters, createTaskSearchIndex } from "../utils/task-search.ts";
import { attachSubtaskSummaries } from "../utils/task-subtasks.ts";
import { getTaskTypeValues, resolveTaskTypeValues } from "../utils/task-type-config.ts";
import { formatAcceptanceCriteriaProgress } from "./acceptance-criteria-progress.ts";
import { formatChecklistItem } from "./checklist.ts";
import { transformCodePaths } from "./code-path.ts";
import { openConfirmPopup } from "./components/confirm-popup.ts";
import {
	createFilterHeader,
	type FilterControlId,
	type FilterHeader,
	type FilterState,
} from "./components/filter-header.ts";
import { type BoundaryNavigationKey, createGenericList, type GenericList } from "./components/generic-list.ts";
import { openHelpPopup } from "./components/help-popup.ts";
import { formatFooterContent, getTaskListFooterContent } from "./footer-content.ts";
import { formatHeading } from "./heading.ts";
import { formatKeymap, keymapKeys } from "./keymap.ts";
import { createLoadingScreen } from "./loading.ts";
import { formatProjectBadge } from "./project.ts";
import { formatStatusWithIcon, getStatusColor, getStatusIcon, wrapStatusColor } from "./status-icon.ts";
import {
	focusTaskFilterControl,
	openTaskFilterPicker,
	taskFilterHeaderControls,
	taskFilterOptions,
} from "./task-filter-wiring.ts";
import {
	completeTaskFromTui,
	confirmTaskLifecycleAction,
	formatTaskArchivedMessage,
	formatTaskCompletionBlockedMessage,
} from "./task-lifecycle.ts";
import { formatTaskTypeBadge } from "./task-type.ts";
import { TaskViewerSession } from "./task-viewer-session.ts";
import { addScrollKeys, createScreen, formatTuiTitle } from "./tui.ts";

function getPriorityDisplay(priority?: string): string {
	switch (normalizePriorityValue(priority)) {
		case "high":
			return " {red-fg}●{/}";
		case "medium":
			return " {yellow-fg}●{/}";
		case "low":
			return " {green-fg}●{/}";
		default:
			return "";
	}
}

function applyTaskViewerConfig(config: BacklogConfig | null): {
	statuses: string[];
	labels: string[];
	priorityOptions: PriorityOption[];
	configuredTaskTypes: string[];
	configuredProjects: string[];
	dateFormat: string | undefined;
	projectName: string | undefined;
} {
	return {
		statuses: config?.statuses || ["To Do", "In Progress", "Done"],
		labels: config?.labels || [],
		priorityOptions: getPriorityOptions(config),
		configuredTaskTypes: getTaskTypeValues(config),
		configuredProjects: getProjectValues(config),
		dateFormat: config?.dateFormat,
		projectName: config?.projectName,
	};
}

async function loadTaskViewerConfig(core: Core) {
	return applyTaskViewerConfig(await core.filesystem.loadConfig());
}

async function loadTaskViewerTasks(core: Core, providedTasks?: Task[]) {
	if (providedTasks) {
		return {
			allTasks: providedTasks.filter((task) => task.id && task.id.trim() !== "" && hasAnyPrefix(task.id)),
			contentStore: null,
			...(await loadTaskViewerConfig(core)),
		};
	}

	const loadingScreen = await createLoadingScreen("Loading tasks");
	try {
		loadingScreen?.update("Loading configuration...");
		const config = await loadTaskViewerConfig(core);
		loadingScreen?.update("Loading tasks from branches...");
		const contentStore = await core.getContentStore();
		loadingScreen?.update("Preparing task list...");
		const allTasks = (await core.queryTasks()).filter(
			(task) => task.id && task.id.trim() !== "" && hasAnyPrefix(task.id),
		);
		return { allTasks, contentStore, ...config };
	} finally {
		await loadingScreen?.close();
	}
}

export function formatTaskViewerListItem(
	task: Task,
	availableWidth = Number.POSITIVE_INFINITY,
	dateFormat?: string,
	configuredProjects?: string[],
): string {
	const progress = formatAcceptanceCriteriaProgress(task, availableWidth);
	// The compact status icon keeps task identity visible beside the progress indicator. Its
	// shape still distinguishes active work from the terminal-status checkmark.
	const status = progress ? getStatusIcon(task.status) : formatStatusWithIcon(task.status);
	const statusColor = getStatusColor(task.status);
	const assigneeText = task.assignee?.length
		? ` {cyan-fg}${task.assignee[0]?.startsWith("@") ? task.assignee[0] : `@${task.assignee[0]}`}{/}`
		: "";
	const labelsText = task.labels?.length ? ` {yellow-fg}[${task.labels.join(", ")}]{/}` : "";
	const typeBadge = formatTaskTypeBadge(task.type);
	const typeText = typeBadge ? ` ${typeBadge}` : "";
	const projectBadge = formatProjectBadge(task.project, configuredProjects);
	const projectText = projectBadge ? ` ${projectBadge}` : "";
	const priorityText = getPriorityDisplay(task.priority);
	const dueDateText = task.dueDate ? ` {gray-fg}(due ${formatDateForDisplay(task.dueDate, { dateFormat })}){/}` : "";
	const isCrossBranch = Boolean((task as Task & { branch?: string }).branch);
	const branchText = isCrossBranch ? ` {green-fg}(${(task as Task & { branch?: string }).branch}){/}` : "";
	const progressText = progress ? ` ${progress}` : "";

	const content = `${wrapStatusColor(status, statusColor)}${progressText} {bold}${task.id}{/bold}${typeText}${projectText}${dueDateText} - ${task.title}${priorityText}${assigneeText}${labelsText}${branchText}`;
	return isCrossBranch ? `{gray-fg}${content}{/}` : content;
}

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

export type TaskListBoundaryDirection = "up" | "down";
export type PendingSearchWrap = "to-first" | "to-last" | null;
type PaneFocus = "list" | "detail";

/** What vertical navigation should do next: keep moving, hand focus to search, or stay put. */
export type ListBoundaryNavigation = "move" | "search" | "stay";

/**
 * Resolves vertical navigation in the task list and in board columns. Arrow keys hand focus
 * to the search input at a boundary (and from an empty list), while vim keys stay inside the
 * list so j/k never leave it.
 */
export function resolveListBoundaryNavigation(
	direction: TaskListBoundaryDirection,
	selectedIndex: number,
	totalTasks: number,
	key: BoundaryNavigationKey,
): ListBoundaryNavigation {
	const atBoundary = totalTasks <= 0 || (direction === "up" ? selectedIndex <= 0 : selectedIndex >= totalTasks - 1);
	if (!atBoundary) {
		return "move";
	}
	return key === "arrow" ? "search" : "stay";
}

/** The detail pane hands focus back to search only when the up arrow is pressed at the top. */
export function shouldMoveFromDetailBoundaryToSearch(scrollOffset: number, key: BoundaryNavigationKey): boolean {
	return key === "arrow" && scrollOffset <= 0;
}

export function resolveSearchExitTargetIndex(
	direction: "up" | "down" | "escape",
	pendingWrap: PendingSearchWrap,
	totalTasks: number,
	currentIndex: number | undefined,
): number | undefined {
	if (totalTasks <= 0) {
		return undefined;
	}
	if (direction === "up" && pendingWrap === "to-last") {
		return totalTasks - 1;
	}
	if (direction === "down" && pendingWrap === "to-first") {
		return 0;
	}
	return currentIndex;
}

export function resolveFilterExitPane(
	preferredPane: PaneFocus,
	hasTaskList: boolean,
	hasDetailPane: boolean,
): PaneFocus | null {
	if (preferredPane === "detail" && hasDetailPane) {
		return "detail";
	}
	if (hasTaskList) {
		return "list";
	}
	if (hasDetailPane) {
		return "detail";
	}
	return null;
}

export function resolveTaskListSelection<T>(
	items: readonly T[],
	selectedIndex: number | number[] | undefined,
	fallback: T | null = null,
): T | null {
	const index = Array.isArray(selectedIndex) ? selectedIndex[0] : selectedIndex;
	if (typeof index !== "number") {
		return fallback;
	}
	return items[index] ?? fallback;
}

type TaskViewerFilterModel = {
	search: string;
	status: string[];
	excludeStatus: string[];
	taskTypes: string[];
	projects: string[];
	priority: string;
	labels: string[];
	milestone: string;
	labelMatch: LabelMatchMode;
	limit?: number;
};

function filterTaskViewerTasks(
	tasks: Task[],
	filters: TaskViewerFilterModel,
	searchIndex: ReturnType<typeof createTaskSearchIndex>,
	resolveMilestoneLabel: MilestoneFilterValueResolver,
	readyTasks?: TaskCorpus,
): Task[] {
	const filtered = applyTaskFilters(
		tasks,
		{
			...taskFilterOptions(filters, filters.labelMatch, resolveMilestoneLabel),
			excludeStatus: filters.excludeStatus,
		},
		searchIndex,
	);
	const ready = readyTasks ? withReadiness(filtered, readyTasks).filter((task) => task.isReady) : filtered;
	return filters.limit === undefined ? ready : ready.slice(0, filters.limit);
}

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

/**
 * Display task details with search/filter header UI
 */
/**
 * Persistent one-line warning bar rendered above the help bar. Used for
 * data-integrity alerts (e.g. duplicate task IDs) that must stay visible
 * instead of expiring like transient help messages.
 */
export function createStartupWarningBar(parent: BoxInterface, message: string): BoxInterface {
	return box({
		parent,
		bottom: 1,
		left: 0,
		width: "100%",
		height: 1,
		tags: true,
		wrap: false,
		content: ` {yellow-fg}${message}{/}`,
	});
}

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
		viewSwitcher?: import("./view-switcher.ts").ViewSwitcher;
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

	const loaded = await loadTaskViewerTasks(core, options.tasks);
	let allTasks = loaded.allTasks;
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
	let taskSearchIndex = createTaskSearchIndex(allTasks);

	// Collect available labels from config, tasks, and CLI-provided filters.
	availableLabels = collectAvailableLabels(allTasks, [...labels, ...(options.labelFilter ?? [])]);

	// Dependency readiness must resolve against the whole corpus, not the filtered display list, so
	// it uses the unfiltered snapshot when the caller narrowed what is shown. Both sides stay
	// mutable because completing a task from this view moves it between them.
	let readinessSnapshot = options.readinessTasks ? [...options.readinessTasks] : null;
	const readinessCompletedTasks = [...completedTasks];
	// The corpus that both readiness and the dependency graph resolve against, so the two never
	// disagree about which records this view can see.
	const resolveDependencyCorpus = (): TaskCorpus => {
		let tasks = allTasks;
		if (readinessSnapshot) {
			tasks = mergeDependencyCorpusTasks(readinessSnapshot, allTasks);
		}
		return { tasks, completedTasks: readinessCompletedTasks, statuses };
	};

	// State for filtering - normalize filters to match configured values
	let searchQuery = options.searchQuery || "";

	// Keep the requested statuses that match configured ones (case-insensitive), in config order
	let statusFilter: string[] = [];
	if (options.statusFilter && options.statusFilter.length > 0) {
		const requested = new Set(
			(Array.isArray(options.statusFilter) ? options.statusFilter : [options.statusFilter]).map((status) =>
				status.trim().toLowerCase(),
			),
		);
		statusFilter = statuses.filter((status) => requested.has(status.toLowerCase()));
	}
	const excludeStatusFilter = [...(options.excludeStatus ?? [])];

	let taskTypeFilter = resolveTaskTypeValues(options.typeFilter ?? [], configuredTaskTypes).values;
	let projectFilter = resolveProjectValues(options.projectFilter ?? [], configuredProjects).values;
	let priorityFilter = normalizePriorityValue(options.priorityFilter) || "";
	let labelFilter: string[] = [];
	let milestoneFilter = options.milestoneFilter || "";
	let labelMatch: LabelMatchMode = options.labelMatch ?? "any";
	const taskLimit = options.limit;
	let filteredTasks = [...allTasks];

	if (options.labelFilter && options.labelFilter.length > 0) {
		const availableSet = new Set(availableLabels.map((label) => label.toLowerCase()));
		labelFilter = options.labelFilter.filter((label) => availableSet.has(label.toLowerCase()));
	}

	// Decides whether the first render goes through applyFilters(). Every filter that narrows the
	// list has to be listed here, or the flag that set it silently does nothing until something
	// else triggers a refilter.
	const filtersActive = Boolean(
		searchQuery ||
			statusFilter.length > 0 ||
			excludeStatusFilter.length > 0 ||
			taskTypeFilter.length > 0 ||
			projectFilter.length > 0 ||
			priorityFilter ||
			labelFilter.length > 0 ||
			milestoneFilter ||
			options.readyFilter ||
			taskLimit !== undefined,
	);
	let requireInitialFilterSelection = filtersActive;

	const enrichTask = (candidate: Task | null): Task | null => {
		if (!candidate) return null;
		return attachSubtaskSummaries(candidate, allTasks);
	};

	// Find the initial selected task
	const session = new TaskViewerSession(enrichTask(task) ?? task);
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
		const targetPane = resolveFilterExitPane(filterExitPane, Boolean(taskList), Boolean(descriptionBox));
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
		} else if (targetPane === "detail" && descriptionBox) {
			focusDetailPane();
		}
		pendingSearchWrap = null;
	});

	// Get dynamic header height
	const getHeaderHeight = () => filterHeader.getHeight();

	// Task list pane (left 40%)
	const taskListPane = box({
		parent: container,
		top: getHeaderHeight(),
		left: 0,
		width: "40%",
		height: `100%-${getHeaderHeight() + 1}`,
		border: { type: "line" },
		style: { border: { fg: "gray" } },
		label: `\u00A0Tasks (${filteredTasks.length})\u00A0`,
	});

	// Detail pane - use right: 0 to ensure it extends to window edge
	const detailPane = box({
		parent: container,
		top: getHeaderHeight(),
		left: "40%",
		right: 0,
		height: `100%-${getHeaderHeight() + 1}`,
		border: { type: "line" },
		style: { border: { fg: "gray" } },
		label: "\u00A0Details\u00A0",
	});

	// Help bar at bottom
	const helpBar = box({
		parent: container,
		bottom: 0,
		left: 0,
		width: "100%",
		height: 1,
		tags: true,
		wrap: true,
		content: "",
	});
	const warningBar = options.startupWarning ? createStartupWarningBar(container, options.startupWarning) : null;
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

	function syncPaneLayout() {
		const headerHeight = filterHeader.getHeight();
		const helpHeight = typeof helpBar.height === "number" ? helpBar.height : 1;
		let footerHeight = helpHeight;
		if (warningBar) {
			warningBar.bottom = helpHeight;
			footerHeight += 1;
		}
		taskListPane.top = headerHeight;
		taskListPane.height = `100%-${headerHeight + footerHeight}`;
		detailPane.top = headerHeight;
		detailPane.height = `100%-${headerHeight + footerHeight}`;
	}

	function setHelpBarContent(content: string) {
		const formatted = formatFooterContent(content, getTerminalWidth());
		helpBar.height = formatted.height;
		helpBar.setContent(formatted.content);
		syncPaneLayout();
	}

	function setActivePane(active: "list" | "detail" | "none") {
		const listBorder = taskListPane.style as { border?: { fg?: string } };
		const detailBorder = detailPane.style as { border?: { fg?: string } };
		if (listBorder.border) listBorder.border.fg = active === "list" ? "yellow" : "gray";
		if (detailBorder.border) detailBorder.border.fg = active === "detail" ? "yellow" : "gray";
	}

	function focusTaskList(targetIndex?: number): void {
		if (!taskList) {
			if (descriptionBox) {
				currentFocus = "detail";
				setActivePane("detail");
				descriptionBox.focus();
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
		if (!descriptionBox) return;
		currentFocus = "detail";
		setActivePane("detail");
		descriptionBox.focus();
		updateHelpBar();
		screen.render();
	}

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
		filteredTasks = filterTaskViewerTasks(
			allTasks,
			filters,
			taskSearchIndex,
			resolveMilestoneLabel,
			options.readyFilter ? resolveDependencyCorpus() : undefined,
		);

		// Update the task list label
		if (taskListPane.setLabel) {
			taskListPane.setLabel(`\u00A0Tasks (${filteredTasks.length})\u00A0`);
		}

		if (filteredTasks.length === 0) {
			if (taskList) {
				taskList.destroy();
				taskList = null;
			}
			const emptyState = taskViewerEmptyState(filters);
			noResultsMessage = emptyState.detail;
			showListEmptyState(emptyState.list);
			refreshDetailPane();
			screen.render();
			return;
		}

		noResultsMessage = null;
		hideListEmptyState();

		if (taskList) {
			taskList.destroy();
			taskList = null;
		}
		const listController = createTaskList();
		taskList = listController;
		if (listController) {
			const forceFirst = requireInitialFilterSelection;
			let desiredIndex = filteredTasks.findIndex((t) => t.id === session.selected.id);
			if (forceFirst || desiredIndex < 0) {
				desiredIndex = 0;
			}
			const desiredTask = filteredTasks[desiredIndex];
			if (desiredTask && session.select(enrichTask(desiredTask) ?? desiredTask)) {
				options.onTaskChange?.(session.selected);
			}
			const currentIndexRaw = listController.getSelectedIndex();
			const currentIndex = Array.isArray(currentIndexRaw) ? (currentIndexRaw[0] ?? 0) : currentIndexRaw;
			if (forceFirst || currentIndex !== desiredIndex) {
				listController.setSelectedIndex(desiredIndex);
			}
			requireInitialFilterSelection = false;
		}

		// Ensure detail pane is refreshed when transitioning from no-results to results
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
			parent: taskListPane,
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
		const refreshed = await core.getTaskWithSubtasks(selectedTask.id, allTasks);
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
			parent: taskListPane,
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

	// Detail pane refresh function
	let headerDetailBox: BoxInterface | undefined;
	let divider: LineInterface | undefined;
	let descriptionBox: ScrollableTextInterface | undefined;

	function refreshDetailPane() {
		if (headerDetailBox) headerDetailBox.destroy();
		if (divider) divider.destroy();
		if (descriptionBox) descriptionBox.destroy();

		const configureDetailBox = (boxInstance: ScrollableTextInterface) => {
			descriptionBox = boxInstance;
			const scrollable = boxInstance as unknown as {
				scroll?: (offset: number) => void;
				setScroll?: (offset: number) => void;
				setScrollPerc?: (perc: number) => void;
				getScroll?: () => number;
			};

			const pageAmount = () => {
				const height = typeof boxInstance.height === "number" ? boxInstance.height : 0;
				return height > 0 ? Math.max(1, height - 3) : 0;
			};

			// Returning true leaves the key to the built-in scroll handling, which is clamped at the top.
			const moveUpFromDetail = (key: BoundaryNavigationKey) => {
				if (!shouldMoveFromDetailBoundaryToSearch(scrollable.getScroll?.() ?? 0, key)) {
					return true;
				}
				pendingSearchWrap = null;
				filterHeader.focusSearch();
				return false;
			};

			boxInstance.key(keymapKeys("taskList", "detailUp"), () => moveUpFromDetail("arrow"));
			boxInstance.key(keymapKeys("taskList", "detailUpVim"), () => moveUpFromDetail("vim"));

			boxInstance.key(keymapKeys("taskList", "detailPageUp"), () => {
				const delta = pageAmount();
				if (delta > 0) {
					scrollable.scroll?.(-delta);
					screen.render();
				}
				return false;
			});
			boxInstance.key(keymapKeys("taskList", "detailPageDown"), () => {
				const delta = pageAmount();
				if (delta > 0) {
					scrollable.scroll?.(delta);
					screen.render();
				}
				return false;
			});
			boxInstance.key(keymapKeys("taskList", "detailFirst"), () => {
				scrollable.setScroll?.(0);
				screen.render();
				return false;
			});
			boxInstance.key(keymapKeys("taskList", "detailLast"), () => {
				scrollable.setScrollPerc?.(100);
				screen.render();
				return false;
			});
			boxInstance.on("focus", () => {
				currentFocus = "detail";
				setActivePane("detail");
				updateHelpBar();
				screen.render();
			});
			boxInstance.on("blur", () => {
				if (currentFocus !== "detail") {
					setActivePane(currentFocus === "list" ? "list" : "none");
					screen.render();
				}
			});
			boxInstance.key(keymapKeys("taskList", "focusList"), () => {
				focusTaskList();
				return false;
			});
			boxInstance.key(keymapKeys("taskList", "focusListEscape"), () => {
				focusTaskList();
				return false;
			});
			if (currentFocus === "detail") {
				setImmediate(() => boxInstance.focus());
			}
		};

		if (noResultsMessage) {
			screen.title = screenTitle;

			headerDetailBox = box({
				parent: detailPane,
				top: 0,
				left: 1,
				right: 1,
				height: "shrink",
				tags: true,
				wrap: true,
				scrollable: false,
				padding: { left: 1, right: 1 },
				content: "{bold}No tasks to display{/bold}",
			});

			descriptionBox = undefined;
			divider = undefined;
			const messageBox = scrollabletext({
				parent: detailPane,
				top: (typeof headerDetailBox.bottom === "number" ? headerDetailBox.bottom : 0) + 1,
				left: 1,
				right: 1,
				bottom: 1,
				keys: true,
				vi: true,
				mouse: true,
				tags: true,
				wrap: true,
				padding: { left: 1, right: 1, top: 0, bottom: 0 },
				content: noResultsMessage,
			});

			configureDetailBox(messageBox);
			screen.render();
			return;
		}

		screen.title = formatTuiTitle(`Task ${session.selected.id} - ${session.selected.title}`, projectName);

		const detailContent = generateDetailContent(toTaskDetail(session.selected, resolveDependencyCorpus()), {
			resolveMilestoneLabel,
			dateFormat,
			configuredProjects,
		});

		// Calculate header height based on content and available width
		const detailPaneWidth = typeof detailPane.width === "number" ? detailPane.width : 60;
		const availableWidth = detailPaneWidth - 6; // 2 for border, 2 for box padding, 2 for header padding

		let headerLineCount = 0;
		for (const detailLine of detailContent.headerContent) {
			const plainText = detailLine.replace(/\{[^}]+\}/g, "");
			const lineCount = Math.max(1, Math.ceil(plainText.length / availableWidth));
			headerLineCount += lineCount;
		}

		headerDetailBox = box({
			parent: detailPane,
			top: 0,
			left: 1,
			right: 1,
			height: headerLineCount,
			tags: true,
			wrap: true,
			scrollable: false,
			padding: { left: 1, right: 1 },
			content: detailContent.headerContent.join("\n"),
		});

		divider = line({
			parent: detailPane,
			top: headerLineCount,
			left: 1,
			right: 1,
			orientation: "horizontal",
			style: { fg: "gray" },
		});

		const bodyContainer = scrollabletext({
			parent: detailPane,
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
			content: detailContent.bodyContent.join("\n"),
			scrollbar: { ch: " ", inverse: true },
			style: { scrollbar: { bg: "gray" } },
		});

		configureDetailBox(bodyContainer);
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

		try {
			const result = await core.editTaskInTui(selectedTask.id, screen, selectedTask);
			if (result.reason === "read_only") {
				const branchInfo = result.task?.branch ? ` in branch ${result.task.branch}` : "";
				showTransientHelp(` {red-fg}Task is read-only${branchInfo}.{/}`);
				return;
			}
			if (result.reason === "editor_failed") {
				showTransientHelp(" {red-fg}Editor exited with an error; task was not modified.{/}");
				return;
			}
			if (result.reason === "not_found") {
				showTransientHelp(` {red-fg}Task ${selectedTask.id} was not found on this branch.{/}`);
				return;
			}
			if (result.reason === "identity_conflict") {
				showTransientHelp(
					" {red-fg}File identity is inconsistent; make the frontmatter id match the filename, then retry.{/}",
				);
				return;
			}
			if (result.reason === "unreadable") {
				showTransientHelp(" {red-fg}Could not read the saved file; fix its YAML/markdown syntax.{/}");
				return;
			}
			if (result.reason === "ambiguous") {
				showTransientHelp(
					" {red-fg}Numeric draft id is shared by multiple files; rename or fix their ids, then retry.{/}",
				);
				return;
			}

			if (result.task) {
				// Reconcile by file identity first: with task_prefix="draft" a task and a draft can
				// share one id, so an id match alone may target the wrong record.
				const index = allTasks.findIndex(
					(taskItem) =>
						(result.task?.filePath !== undefined &&
							taskItem.filePath !== undefined &&
							taskItem.filePath === result.task.filePath) ||
						taskItem.id === result.task?.id,
				);
				if (index >= 0) {
					allTasks[index] = result.task;
				}
				const enhancedTask = enrichTask(result.task) ?? result.task;
				session.select(enhancedTask);
				options.onTaskChange?.(enhancedTask);
				taskSearchIndex = createTaskSearchIndex(allTasks);
			}

			applyFilters();
			if (result.changed) {
				showTransientHelp(` {green-fg}Task ${result.task?.id ?? selectedTask.id} marked modified.{/}`);
				return;
			}
			showTransientHelp(` {gray-fg}No changes detected for ${result.task?.id ?? selectedTask.id}.{/}`);
		} catch (_error) {
			showTransientHelp(" {red-fg}Failed to open editor.{/}");
		}
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

		allTasks = allTasks.filter((taskItem) => taskItem.id !== taskId);
		taskSearchIndex = createTaskSearchIndex(allTasks);
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
		if (task.branch) {
			const verb = action === "complete" ? "complete" : "archive";
			showTransientHelp(` {red-fg}Cannot ${verb} task from branch "${task.branch}".{/}`);
			return;
		}

		const confirmed = await runWithModalGuard(() => confirmTaskLifecycleAction(screen, task, action, openConfirmPopup));

		if (!confirmed) {
			return;
		}

		try {
			const config = action === "archive" ? await core.fs.loadConfig() : null;
			const archived = action === "archive" ? await core.archiveTask(task.id, config?.autoCommit ?? false) : undefined;
			const result = archived ? { ...archived, reason: "failed" as const } : await completeTaskFromTui(core, task);

			if (result.success) {
				// Drop the record from the active graph; completed work remains completion evidence.
				readinessSnapshot = readinessSnapshot?.filter((candidate) => !taskIdsEqual(candidate.id, task.id)) ?? null;
				if (action === "complete") {
					readinessCompletedTasks.push(task);
				}
				removeTaskFromCurrentView(task.id);
				const message = archived
					? formatTaskArchivedMessage(task.id, archived.cleanedTaskIds)
					: `Moved ${task.id} to completed`;
				showTransientHelp(` {green-fg}${message}{/}`);
			} else if (action === "complete" && result.reason === "not-terminal") {
				showTransientHelp(` {red-fg}${formatTaskCompletionBlockedMessage(task.id, result.terminalStatus)}{/}`);
			} else {
				const verb = action === "complete" ? "complete" : "archive";
				showTransientHelp(` {red-fg}Failed to ${verb} ${task.id}{/}`);
			}
		} catch (error) {
			const verb = action === "complete" ? "completing" : "archiving";
			showTransientHelp(` {red-fg}Error ${verb} task: ${error instanceof Error ? error.message : "Unknown error"}{/}`);
		}
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
			const targetPane = resolveFilterExitPane(filterExitPane, Boolean(taskList), Boolean(descriptionBox));
			if (targetPane === "list" && taskList) {
				focusTaskList();
			} else if (targetPane === "detail" && descriptionBox) {
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
	if (filtersActive) {
		applyFilters();
	} else {
		taskList = createTaskList();
	}
	options.subscribeUpdates?.((nextTasks, nextStatuses, nextLabels, nextSelectedTask) => {
		allTasks = nextTasks;
		statuses = nextStatuses;
		labels = nextLabels;
		availableLabels = collectAvailableLabels(allTasks, labels);
		taskSearchIndex = createTaskSearchIndex(allTasks);

		const previousTaskId = session.selected.id;
		const currentTask =
			allTasks.find((candidate) => candidate.id === nextSelectedTask?.id) ??
			allTasks.find((candidate) => candidate.id === session.selected.id) ??
			allTasks[0];
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
		if (descriptionBox) {
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

export interface TaskDetailContentOptions {
	resolveMilestoneLabel?: (milestone: string) => string;
	dateFormat?: string;
	configuredProjects?: string[];
}

function detailMetadata(task: Task | TaskDetail, options: TaskDetailContentOptions): string[] {
	const { resolveMilestoneLabel, dateFormat, configuredProjects } = options;
	const metadata = [`{bold}Created:{/bold} ${formatDateForDisplay(task.createdDate, { dateFormat })}`];
	if (task.updatedDate && task.updatedDate !== task.createdDate)
		metadata.push(`{bold}Updated:{/bold} ${formatDateForDisplay(task.updatedDate, { dateFormat })}`);
	if (task.dueDate) metadata.push(`{bold}Due:{/bold} ${formatDateForDisplay(task.dueDate, { dateFormat })}`);
	if (task.priority)
		metadata.push(`{bold}Priority:{/bold} ${formatPriorityLabel(task.priority)}${getPriorityDisplay(task.priority)}`);
	if (task.type) metadata.push(`{bold}Type:{/bold} ${formatTaskTypeBadge(task.type)}`);
	if (task.project && configuredProjects?.length)
		metadata.push(`{bold}Project:{/bold} ${formatProjectBadge(task.project, configuredProjects)}`);
	if (task.assignee?.length)
		metadata.push(
			`{bold}Assignee:{/bold} {cyan-fg}${task.assignee.map((a) => (a.startsWith("@") ? a : `@${a}`)).join(", ")}{/}`,
		);
	if (task.labels?.length)
		metadata.push(`{bold}Labels:{/bold} ${task.labels.map((label) => `{yellow-fg}[${label}]{/}`).join(" ")}`);
	if (task.reporter)
		metadata.push(
			`{bold}Reporter:{/bold} {cyan-fg}${task.reporter.startsWith("@") ? task.reporter : `@${task.reporter}`}{/}`,
		);
	if (task.milestone)
		metadata.push(
			`{bold}Milestone:{/bold} {magenta-fg}${resolveMilestoneLabel?.(task.milestone) ?? task.milestone}{/}`,
		);
	if (task.parentTaskId)
		metadata.push(
			`{bold}Parent:{/bold} {blue-fg}${task.parentTaskTitle ? `${task.parentTaskId} - ${task.parentTaskTitle}` : task.parentTaskId}{/}`,
		);
	if (task.subtasks?.length)
		metadata.push(`{bold}Subtasks:{/bold} ${task.subtasks.length} task${task.subtasks.length > 1 ? "s" : ""}`);
	const readiness = task.dependencies?.length ? taskReadiness(task) : undefined;
	if (readiness?.isReady) metadata.push("{bold}Readiness:{/bold} {green-fg}✓ Ready to start{/}");
	if (readiness?.isBlocked)
		metadata.push(`{bold}Readiness:{/bold} {yellow-fg}● ${formatReadinessBlockers(readiness)}{/}`);
	if (task.modifiedFiles?.length) metadata.push(`{bold}Modified files:{/bold} ${task.modifiedFiles.join(", ")}`);
	return metadata;
}

function textDetailSection(heading: string, value: string | undefined, empty?: string): string[] {
	const text = value?.trim();
	if (!text && !empty) return [];
	return [formatHeading(heading, 2), text ? transformCodePaths(text) : (empty ?? ""), ""];
}

function checklistDetailSection(
	heading: string,
	items: Array<{ text: string; checked: boolean }>,
	empty: string,
): string[] {
	const content = items.length
		? items
				.map((item) =>
					formatChecklistItem(
						{ text: transformCodePaths(item.text), checked: item.checked },
						{ padding: " ", checkedSymbol: "{green-fg}✓{/}", uncheckedSymbol: "{gray-fg}○{/}" },
					),
				)
				.join("\n")
		: `{gray-fg}${empty}{/}`;
	return [formatHeading(heading, 2), content, ""];
}

export function generateDetailContent(
	task: Task | TaskDetail,
	options: TaskDetailContentOptions = {},
): { headerContent: string[]; bodyContent: string[] } {
	const { dateFormat } = options;
	const headerContent = [
		` ${wrapStatusColor(formatStatusWithIcon(task.status), getStatusColor(task.status))} {bold}{blue-fg}${task.id}{/blue-fg}{/bold} - ${task.title}`,
	];

	// Add cross-branch indicator if task is from another branch
	const isCrossBranch = Boolean((task as Task & { branch?: string }).branch);
	if (isCrossBranch) {
		const branchName = (task as Task & { branch?: string }).branch;
		headerContent.push(
			` {yellow-fg}⚠ Read-only:{/} This task exists in branch {green-fg}${branchName}{/}. Switch to that branch to edit it.`,
		);
	}

	const bodyContent: string[] = [];
	bodyContent.push(formatHeading("Details", 2));

	bodyContent.push(detailMetadata(task, options).join("\n"));
	bodyContent.push("");

	// Directly below the details block and above the description, the same relative position the
	// canonical CLI plain output uses. This builder is not shared with the plain formatter, so the
	// order is kept deliberately in step rather than inherited.
	const dependencyGraph = taskDependencyGraph(task);
	const dependencyGraphLines = dependencyGraph
		? formatDependencyGraphLines(dependencyGraph, { formatLabel: formatDependencyNodeTuiLabel })
		: [];
	if (dependencyGraphLines.length > 0) {
		bodyContent.push(formatHeading("Dependency Graph", 2));
		bodyContent.push(dependencyGraphLines.join("\n"));
		bodyContent.push("");
	}

	bodyContent.push(...textDetailSection("Description", task.description, "{gray-fg}No description provided{/}"));

	if (task.references?.length) {
		bodyContent.push(formatHeading("References", 2));
		const formattedRefs = task.references.map((ref) => {
			// Color URLs differently from file paths
			if (ref.startsWith("http://") || ref.startsWith("https://")) {
				return `  {cyan-fg}${ref}{/}`;
			}
			return `  {yellow-fg}${ref}{/}`;
		});
		bodyContent.push(formattedRefs.join("\n"));
		bodyContent.push("");
	}

	if (task.documentation?.length) {
		bodyContent.push(formatHeading("Documentation", 2));
		const formattedDocs = task.documentation.map((doc) => {
			if (doc.startsWith("http://") || doc.startsWith("https://")) {
				return `  {cyan-fg}${doc}{/}`;
			}
			return `  {yellow-fg}${doc}{/}`;
		});
		bodyContent.push(formattedDocs.join("\n"));
		bodyContent.push("");
	}

	bodyContent.push(
		...checklistDetailSection(
			"Acceptance Criteria",
			buildAcceptanceCriteriaItems(task),
			"No acceptance criteria defined",
		),
	);
	bodyContent.push(
		...checklistDetailSection(
			"Definition of Done",
			formatDefinitionOfDoneChecklist(task),
			"No Definition of Done items defined",
		),
	);
	bodyContent.push(...textDetailSection("Implementation Plan", task.implementationPlan));
	bodyContent.push(...textDetailSection("Implementation Notes", task.implementationNotes));

	const comments = (task.comments ?? []).filter((comment) => comment.body.trim().length > 0);
	if (comments.length > 0) {
		bodyContent.push(formatHeading("Comments", 2));
		for (const comment of comments) {
			const parts = [`#${comment.index}`];
			if (comment.author) parts.push(comment.author);
			if (comment.createdDate) parts.push(formatDateForDisplay(comment.createdDate, { dateFormat }));
			bodyContent.push(`{bold}${parts.join(" - ")}{/bold}`);
			bodyContent.push(transformCodePaths(comment.body.trim()));
			bodyContent.push("");
		}
	}

	const finalSummary = task.finalSummary?.trim();
	if (finalSummary) {
		bodyContent.push(formatHeading("Final Summary", 2));
		bodyContent.push(transformCodePaths(finalSummary));
		bodyContent.push("");
	}

	return { headerContent, bodyContent };
}

export async function createTaskPopup(
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
