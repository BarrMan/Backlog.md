/* Task viewer with search/filter header UI */

import { stdout as output } from "node:process";
import type { BoxInterface, ScreenInterface } from "neo-neo-bblessed";
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
import type { PriorityOption } from "../../utils/priority-config.ts";
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

export { formatTaskViewerListItem, generateDetailContent } from "./detail-content.ts";
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
): { availableMilestoneTitles: string[]; resolveMilestoneLabel: MilestoneFilterValueResolver } {
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
		if (snapshotClaimants && snapshotClaimants.length > 1) continue;
		groups.set(key, liveClaimants);
	}
	return [...groups.values()].flat();
}

export type TaskViewerOptions = {
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
};

/** Coordinates the task-viewer session, controls, and screen lifecycle. */
export class TaskViewerController {
	private core!: Core;
	private screen!: ScreenInterface;
	private filterHeader!: FilterHeader;
	private rendering!: TaskViewerRendering;
	private session!: TaskViewerSession;
	private statuses: string[] = [];
	private labels: string[] = [];
	private availableLabels: string[] = [];
	private configuredTaskTypes: string[] = [];
	private configuredProjects: string[] = [];
	private priorityOptions: PriorityOption[] = [];
	private availableMilestoneTitles: string[] = [];
	private resolveMilestoneLabel!: MilestoneFilterValueResolver;
	private dateFormat = "";
	private projectName = "";
	private screenTitle = "";
	private readinessSnapshot: Task[] | null = null;
	private readinessCompletedTasks: Task[] = [];
	private searchQuery = "";
	private statusFilter: string[] = [];
	private excludeStatusFilter: string[] = [];
	private taskTypeFilter: string[] = [];
	private projectFilter: string[] = [];
	private priorityFilter = "";
	private labelFilter: string[] = [];
	private milestoneFilter = "";
	private labelMatch: LabelMatchMode = "any";
	private taskLimit: number | undefined;
	private requireInitialFilterSelection = false;
	private currentFocus: "filters" | "list" | "detail" = "list";
	private filterPopupOpen = false;
	private modalOpen = false;
	private pendingSearchWrap: PendingSearchWrap = null;
	private filterExitPane: PaneFocus = "list";
	private taskList: GenericList<Task> | null = null;
	private listEmptyStateBox: BoxInterface | null = null;
	private noResultsMessage: string | null = null;
	private transientHelpContent: string | null = null;
	private helpRestoreTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly screenKeyBindings: Array<{ keys: string[]; handler: () => unknown }> = [];
	private readonly resizeHandler = () => {
		this.filterHeader.rebuild();
		this.taskList?.updateItems(this.session.filteredTasks);
		this.updateHelpBar();
	};
	private closed = false;

	constructor(
		private readonly task: Task,
		private readonly options: TaskViewerOptions = {},
	) {}

	async run(): Promise<void> {
		if (output.isTTY === false) {
			console.log(
				formatTaskPlainText(await loadTaskDetail(this.options.core ?? (await createRuntimeCore()), this.task)),
			);
			return;
		}
		await this.load();
		this.createInterface();
		this.bindScreen();
		this.start();
		return this.waitForClose();
	}

	private async load(): Promise<void> {
		this.core = this.options.core ?? (await createRuntimeCore());
		const loadingScreen = await createLoadingScreen("Loading tasks");
		let loaded: Awaited<ReturnType<typeof loadTaskViewerData>>;
		try {
			loadingScreen?.update("Loading configuration...");
			loaded = await loadTaskViewerData(this.core, this.options.tasks);
		} finally {
			await loadingScreen?.close();
		}
		this.statuses = loaded.statuses;
		this.labels = loaded.labels;
		this.priorityOptions = loaded.priorityOptions;
		this.configuredTaskTypes = loaded.configuredTaskTypes;
		this.configuredProjects = loaded.configuredProjects;
		this.dateFormat = loaded.dateFormat ?? "";
		this.projectName = loaded.projectName ?? "";
		const [milestones, archivedMilestones, completedTasks] = await Promise.all([
			this.core.filesystem.listMilestones(),
			this.core.filesystem.listArchivedMilestones(),
			this.core.filesystem.listCompletedTasks(),
		]);
		const milestoneModel = buildTaskViewerMilestoneFilterModel(milestones, archivedMilestones);
		this.availableMilestoneTitles = milestoneModel.availableMilestoneTitles;
		this.resolveMilestoneLabel = milestoneModel.resolveMilestoneLabel;
		this.availableLabels = collectAvailableLabels(loaded.allTasks, [
			...this.labels,
			...(this.options.labelFilter ?? []),
		]);
		this.readinessSnapshot = this.options.readinessTasks ? [...this.options.readinessTasks] : null;
		this.readinessCompletedTasks = [...completedTasks];
		const initial = normalizeTaskViewerInitialFilters(
			this.options,
			{
				statuses: this.statuses,
				configuredTaskTypes: this.configuredTaskTypes,
				configuredProjects: this.configuredProjects,
			},
			this.availableLabels,
		);
		this.searchQuery = initial.searchQuery;
		this.statusFilter = initial.statusFilter;
		this.excludeStatusFilter = initial.excludeStatusFilter;
		this.taskTypeFilter = initial.taskTypeFilter;
		this.projectFilter = initial.projectFilter;
		this.priorityFilter = initial.priorityFilter;
		this.labelFilter = initial.labelFilter;
		this.milestoneFilter = initial.milestoneFilter;
		this.labelMatch = initial.labelMatch;
		this.taskLimit = initial.taskLimit;
		this.requireInitialFilterSelection = initial.filtersActive;
		this.session = new TaskViewerSession(
			loaded.allTasks,
			this.filters(),
			this.task,
			this.resolveMilestoneLabel,
			(tasks) => this.dependencyCorpus(tasks),
			Boolean(this.options.readyFilter),
		);
	}

	private createInterface(): void {
		this.screenTitle = formatTuiTitle(this.options.title || "Tasks", this.projectName);
		this.screen = createScreen({ title: this.screenTitle });
		const container = box({ parent: this.screen, width: "100%", height: "100%" });
		this.filterHeader = createFilterHeader({
			parent: container,
			statuses: this.statuses,
			availableLabels: this.availableLabels,
			availableMilestones: this.availableMilestoneTitles,
			visibleFilters: taskFilterHeaderControls(this.configuredProjects),
			initialFilters: this.headerFilters(),
			onFilterChange: (filters) => this.updateFilters(filters),
			onFilterPickerOpen: (filterId) => void this.openFilterPicker(filterId),
		});
		this.rendering = new TaskViewerRendering({
			screen: this.screen,
			container,
			getHeaderHeight: () => this.filterHeader.getHeight(),
			startupWarning: this.options.startupWarning,
			screenTitle: this.screenTitle,
			projectName: this.projectName,
			dateFormat: this.dateFormat,
			configuredProjects: this.configuredProjects,
			resolveMilestoneLabel: this.resolveMilestoneLabel,
			getSelectedTask: () => this.session.selected,
			getTaskDetail: (candidate) => this.session.getTaskDetail(candidate),
			getNoResultsMessage: () => this.noResultsMessage,
			getFocus: () => this.currentFocus,
			setFocus: (focus) => {
				this.currentFocus = focus;
			},
			focusTaskList: () => this.focusTaskList(),
			focusSearch: () => this.filterHeader.focusSearch(),
			clearPendingSearchWrap: () => {
				this.pendingSearchWrap = null;
			},
			updateHelpBar: () => this.updateHelpBar(),
		});
		this.filterHeader.setFocusChangeHandler((focus) => {
			if (focus !== null) {
				if (this.currentFocus !== "filters") this.filterExitPane = this.currentFocus === "detail" ? "detail" : "list";
				this.currentFocus = "filters";
				this.setActivePane("none");
				this.updateHelpBar();
			}
		});
		this.filterHeader.setExitRequestHandler((direction) => this.exitFilters(direction));
	}

	private bindScreen(): void {
		this.screen.on("resize", this.resizeHandler);
		this.bindScreenKey(keymapKeys("shared", "search"), () => this.focusSearch());
		this.bindScreenKey(keymapKeys("shared", "find"), () => this.focusSearch());
		this.bindPickerShortcut("filterStatus", "status");
		this.bindPickerShortcut("filterType", "type");
		if (this.configuredProjects.length > 0) this.bindPickerShortcut("filterProject", "project");
		this.bindPickerShortcut("filterPriority", "priority");
		this.bindPickerShortcut("filterLabels", "labels");
		this.bindPickerShortcut("filterMilestone", "milestone");
		this.bindScreenKey(keymapKeys("taskList", "edit"), () => {
			if (!this.modalOpen) void this.openEditor();
		});
		this.bindScreenKey(keymapKeys("taskList", "copy"), () => void this.copyTaskId());
		this.bindScreenKey(keymapKeys("taskList", "complete"), () => void this.runLifecycle("complete"));
		this.bindScreenKey(keymapKeys("taskList", "archive"), () => void this.runLifecycle("archive"));
		this.bindScreenKey(keymapKeys("shared", "help"), () => void this.openHelp());
		this.bindScreenKey(keymapKeys("shared", "escape"), () => this.escape());
		this.bindScreenKey(keymapKeys("shared", "quitWithoutEscape"), () => this.quit());
		if (this.options.onTabPress) this.bindScreenKey(keymapKeys("shared", "tab"), () => void this.switchView());
	}

	private start(): void {
		this.updateHelpBar();
		if (this.requireInitialFilterSelection) this.applyFilters();
		else this.taskList = this.createTaskList();
		this.options.subscribeUpdates?.((tasks, statuses, labels, selected) =>
			this.applyUpdates(tasks, statuses, labels, selected),
		);
		this.refreshDetailPane();
		if (this.options.startWithSearchFocus) this.filterHeader.focusSearch();
		else if (this.options.startWithDetailFocus && this.rendering.descriptionBox) this.focusDetailPane();
		else if (this.taskList) this.focusTaskList();
		this.screen.render();
	}

	private dependencyCorpus(activeTasks: Task[]): TaskCorpus {
		let tasks = activeTasks;
		if (this.readinessSnapshot) tasks = mergeDependencyCorpusTasks(this.readinessSnapshot, tasks);
		return { tasks, completedTasks: this.readinessCompletedTasks, statuses: this.statuses };
	}

	private filters(): TaskViewerFilterModel {
		return {
			search: this.searchQuery,
			status: this.statusFilter,
			excludeStatus: this.excludeStatusFilter,
			taskTypes: this.taskTypeFilter,
			projects: this.projectFilter,
			priority: this.priorityFilter,
			labels: this.labelFilter,
			milestone: this.milestoneFilter,
			labelMatch: this.labelMatch,
			limit: this.taskLimit,
		};
	}

	private headerFilters(): FilterState {
		return {
			search: this.searchQuery,
			status: this.statusFilter,
			taskTypes: this.taskTypeFilter,
			projects: this.projectFilter,
			priority: this.priorityFilter,
			labels: this.labelFilter,
			milestone: this.milestoneFilter,
		};
	}

	private updateFilters(filters: FilterState): void {
		const labelsChanged = !areLabelSelectionsEqual(this.labelFilter, filters.labels);
		this.searchQuery = filters.search;
		this.statusFilter = filters.status;
		this.taskTypeFilter = filters.taskTypes;
		this.projectFilter = filters.projects;
		this.priorityFilter = filters.priority;
		this.labelFilter = filters.labels;
		this.milestoneFilter = filters.milestone;
		if (labelsChanged) this.labelMatch = "any";
		this.applyFilters();
		this.notifyFilterChange();
	}

	private async openFilterPicker(filterId: Exclude<FilterControlId, "search">): Promise<void> {
		if (this.filterPopupOpen) return;
		this.filterPopupOpen = true;
		try {
			const filters = await openTaskFilterPicker({
				screen: this.screen,
				filterId,
				filters: this.headerFilters(),
				statuses: this.statuses,
				taskTypes: this.configuredTaskTypes,
				projects: this.configuredProjects,
				priorityOptions: this.priorityOptions,
				labels: this.availableLabels,
				milestones: this.availableMilestoneTitles,
			});
			if (filters) {
				this.labelMatch = "any";
				this.updateFilters(filters);
				this.filterHeader.setFilters(filters);
			}
		} finally {
			this.filterPopupOpen = false;
			focusTaskFilterControl(this.filterHeader, filterId);
			this.screen.render();
		}
	}

	private applyFilters(): void {
		this.session.updateFilters(this.filters());
		this.rendering.taskListPane.setLabel?.(` Tasks (${this.session.filteredTasks.length}) `);
		this.taskList?.destroy();
		this.taskList = null;
		if (this.session.filteredTasks.length === 0) {
			const emptyState = taskViewerEmptyState(this.filters());
			this.noResultsMessage = emptyState.detail;
			this.showListEmptyState(emptyState.list);
		} else {
			this.noResultsMessage = null;
			this.hideListEmptyState();
			this.taskList = this.createTaskList();
			const selectedIndex = this.session.filteredTasks.findIndex((task) => task.id === this.session.selected.id);
			const index = this.requireInitialFilterSelection || selectedIndex < 0 ? 0 : selectedIndex;
			const selected = this.session.filteredTasks[index];
			if (selected && this.session.select(this.enrichTask(selected) ?? selected))
				this.options.onTaskChange?.(this.session.selected);
			this.taskList?.setSelectedIndex(index);
			this.requireInitialFilterSelection = false;
		}
		this.refreshDetailPane();
		this.screen.render();
	}

	private createTaskList(): GenericList<Task> {
		const taskList = createGenericList<Task>({
			parent: this.rendering.taskListPane,
			title: "",
			items: this.session.filteredTasks,
			selectedIndex: Math.max(
				0,
				this.session.filteredTasks.findIndex((task) => task.id === this.session.selected.id),
			),
			border: false,
			scrollbar: false,
			top: 1,
			left: 1,
			width: "100%-4",
			height: "100%-3",
			itemRenderer: (task) =>
				formatTaskViewerListItem(task, this.taskListSummaryWidth(), this.dateFormat, this.configuredProjects),
			onSelect: (selected) => void this.applySelection((Array.isArray(selected) ? selected[0] : selected) ?? null),
			onHighlight: (selected) => void this.applySelection(selected),
			onBoundaryNavigation: (direction, selectedIndex, total, key) =>
				this.handleListBoundary(direction, selectedIndex, total, key),
			showHelp: false,
		});
		const listBox = taskList.getListBox();
		listBox.on("focus", () => {
			this.currentFocus = "list";
			this.setActivePane("list");
			this.screen.render();
			this.updateHelpBar();
		});
		listBox.on("blur", () => {
			this.setActivePane("none");
			this.screen.render();
		});
		listBox.key(keymapKeys("taskList", "focusDetail"), () => {
			this.focusDetailPane();
			return false;
		});
		return taskList;
	}

	private handleListBoundary(
		direction: "up" | "down",
		selectedIndex: number,
		total: number,
		key: "arrow" | "vim",
	): boolean {
		const navigation = resolveListBoundaryNavigation(direction, selectedIndex, total, key);
		if (navigation === "move") return false;
		if (navigation === "search") {
			this.pendingSearchWrap = direction === "up" ? "to-last" : "to-first";
			this.filterHeader.focusSearch();
		}
		return true;
	}

	private async applySelection(selectedTask: Task | null): Promise<void> {
		if (!selectedTask || selectedTask.id === this.session.selected.id) return;
		this.session.select(this.enrichTask(selectedTask) ?? selectedTask);
		this.options.onTaskChange?.(this.session.selected);
		const requestId = this.session.beginSelectionRefresh();
		this.refreshDetailPane();
		this.screen.render();
		const refreshed = await this.core.getTaskWithSubtasks(selectedTask.id, this.session.getTasks());
		if (!this.session.isCurrentSelectionRefresh(requestId)) return;
		if (refreshed) {
			this.session.select(refreshed);
			this.options.onTaskChange?.(refreshed);
		}
		this.refreshDetailPane();
		this.screen.render();
	}

	private enrichTask(task: Task | null): Task | null {
		return task ? attachSubtaskSummaries(task, this.session.getTasks()) : null;
	}
	private refreshDetailPane(): void {
		this.rendering.refreshDetailPane();
	}
	private setActivePane(pane: "list" | "detail" | "none"): void {
		this.rendering.setActivePane(pane);
	}
	private taskListSummaryWidth(): number {
		return Math.max(1, Math.floor((typeof this.screen.width === "number" ? this.screen.width : 80) * 0.4) - 4);
	}

	private focusTaskList(index?: number): void {
		if (!this.taskList) {
			if (this.rendering.descriptionBox) this.focusDetailPane();
			return;
		}
		this.currentFocus = "list";
		this.setActivePane("list");
		if (typeof index === "number") this.taskList.setSelectedIndex(index);
		this.taskList.focus();
		this.updateHelpBar();
		this.screen.render();
	}

	private focusDetailPane(): void {
		if (!this.rendering.descriptionBox) return;
		this.currentFocus = "detail";
		this.setActivePane("detail");
		this.rendering.descriptionBox.focus();
		this.updateHelpBar();
		this.screen.render();
	}

	private focusSearch(): void {
		if (!this.modalOpen) {
			this.pendingSearchWrap = null;
			this.filterHeader.focusSearch();
		}
	}
	private exitFilters(direction: "up" | "down" | "escape"): void {
		this.filterHeader.setBorderColor("cyan");
		const pane = resolveFilterExitPane(
			this.filterExitPane,
			Boolean(this.taskList),
			Boolean(this.rendering.descriptionBox),
		);
		if (pane === "list" && this.taskList) {
			const selected = this.taskList.getSelectedIndex();
			const index = Array.isArray(selected) ? selected[0] : selected;
			this.focusTaskList(
				resolveSearchExitTargetIndex(
					direction === "up" ? "up" : "down",
					this.pendingSearchWrap,
					this.session.filteredTasks.length,
					index,
				),
			);
		} else if (pane === "detail") this.focusDetailPane();
		this.pendingSearchWrap = null;
	}

	private updateHelpBar(): void {
		if (this.transientHelpContent) {
			this.setHelp(this.transientHelpContent);
			return;
		}
		const filterFocus = this.filterHeader.getCurrentFocus();
		const content =
			this.currentFocus === "filters" && filterFocus
				? filterFocus === "search"
					? ` {cyan-fg}[${formatKeymap("shared", "previous")}/${formatKeymap("shared", "next")}]{/} Cursor (edge=Prev/Next) | {cyan-fg}[${formatKeymap("shared", "up")}/${formatKeymap("shared", "down")}]{/} Back to Tasks | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Cancel | {gray-fg}(Live search){/}`
					: ` {cyan-fg}[${formatKeymap("shared", "activate")}]{/} Open Picker | {cyan-fg}[${formatKeymap("shared", "previous")}/${formatKeymap("shared", "next")}]{/} Prev/Next | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Back`
				: this.currentFocus === "detail"
					? ` {cyan-fg}[${formatKeymap("shared", "tab")}]{/} View | {cyan-fg}[${formatKeymap("taskList", "focusList")}]{/} List | {cyan-fg}[${formatKeymap("shared", "up")}${formatKeymap("shared", "down")}]{/} Scroll | {cyan-fg}[${formatKeymap("taskList", "edit")}]{/} Edit | {cyan-fg}[${formatKeymap("taskList", "copy")}]{/} Yank | {cyan-fg}[${formatKeymap("shared", "help")}]{/} Help | {cyan-fg}[${formatKeymap("shared", "quitWithoutEscape")}]{/} Quit`
					: getTaskListFooterContent({ hasProjects: this.configuredProjects.length > 0 });
		this.setHelp(content);
	}

	private setHelp(content: string): void {
		const width = typeof this.screen.width === "number" ? this.screen.width : 80;
		this.rendering.setHelpBarContent(content, width, formatFooterContent);
		this.screen.render();
	}
	private showTransientHelp(message: string, durationMs = 3000): void {
		this.transientHelpContent = message;
		if (this.helpRestoreTimer) clearTimeout(this.helpRestoreTimer);
		this.updateHelpBar();
		this.helpRestoreTimer = setTimeout(() => {
			this.transientHelpContent = null;
			this.helpRestoreTimer = null;
			this.updateHelpBar();
		}, durationMs);
	}

	private showListEmptyState(message: string): void {
		this.listEmptyStateBox?.destroy();
		this.listEmptyStateBox = box({
			parent: this.rendering.taskListPane,
			top: 1,
			left: 1,
			width: "100%-4",
			height: "100%-3",
			content: message,
			tags: true,
			style: { fg: "gray" },
		});
	}
	private hideListEmptyState(): void {
		this.listEmptyStateBox?.destroy();
		this.listEmptyStateBox = null;
	}
	private notifyFilterChange(): void {
		this.options.onFilterChange?.({
			searchQuery: this.searchQuery,
			statusFilter: this.statusFilter,
			excludeStatus: this.excludeStatusFilter,
			typeFilter: this.taskTypeFilter,
			projectFilter: this.projectFilter,
			priorityFilter: this.priorityFilter,
			labelFilter: this.labelFilter,
			labelMatch: this.labelMatch,
			milestoneFilter: this.milestoneFilter,
		});
	}

	private async openEditor(): Promise<void> {
		if (this.filterPopupOpen || this.currentFocus === "filters" || this.noResultsMessage) return;
		await editTaskViewerTask({
			core: this.core,
			screen: this.screen,
			task: this.session.selected,
			onSaved: (task) => {
				this.session.replaceTask(task, this.filters());
				const enhanced = this.enrichTask(task) ?? task;
				this.session.select(enhanced);
				this.options.onTaskChange?.(enhanced);
			},
			refresh: () => this.applyFilters(),
			showHelp: (message) => this.showTransientHelp(message),
		});
	}

	private async copyTaskId(): Promise<void> {
		if (this.modalOpen || this.filterPopupOpen || this.currentFocus === "filters") return;
		const task = this.currentShortcutTask();
		if (!task) return;
		this.showTransientHelp(
			(await copyToClipboard(task.id))
				? ` {green-fg}Copied ${task.id} to clipboard{/}`
				: " {red-fg}Failed to copy to clipboard{/}",
		);
	}

	private currentShortcutTask(): Task | null {
		return this.noResultsMessage
			? null
			: resolveTaskListSelection(this.session.filteredTasks, this.taskList?.getSelectedIndex(), this.session.selected);
	}
	private async runLifecycle(action: "complete" | "archive"): Promise<void> {
		if (this.modalOpen || this.filterPopupOpen || this.currentFocus === "filters") return;
		const task = this.currentShortcutTask();
		if (!task) return;
		this.modalOpen = true;
		try {
			await runTaskViewerLifecycleShortcut({
				core: this.core,
				screen: this.screen,
				task,
				action,
				confirm: openConfirmPopup,
				runModal: async (operation) => operation(),
				onCompleted: (completed, completedAction) => {
					this.readinessSnapshot =
						this.readinessSnapshot?.filter((candidate) => !taskIdsEqual(candidate.id, completed.id)) ?? null;
					if (completedAction === "complete") this.readinessCompletedTasks.push(completed);
					this.removeTask(completed.id);
				},
				showHelp: (message) => this.showTransientHelp(message),
			});
		} finally {
			this.modalOpen = false;
		}
	}

	private removeTask(taskId: string): void {
		const filtered = this.session.filteredTasks;
		const index = filtered.findIndex((task) => task.id === taskId);
		const next = filtered.filter((task) => task.id !== taskId)[Math.max(0, Math.min(index, filtered.length - 2))];
		this.session.removeTask(taskId, this.filters());
		if (next) {
			this.session.select(this.enrichTask(next) ?? next);
			this.options.onTaskChange?.(this.session.selected);
		}
		this.applyFilters();
	}

	private bindPickerShortcut(
		shortcut: "filterStatus" | "filterType" | "filterProject" | "filterPriority" | "filterLabels" | "filterMilestone",
		filter: Exclude<FilterControlId, "search">,
	): void {
		this.bindScreenKey(keymapKeys("taskList", shortcut), () => {
			if (!this.modalOpen && !this.filterPopupOpen) void this.openFilterPicker(filter);
		});
	}
	private bindScreenKey(keys: string[], handler: () => unknown): void {
		this.screen.key(keys, handler);
		this.screenKeyBindings.push({ keys, handler });
	}
	private async openHelp(): Promise<void> {
		if (!this.modalOpen && !this.filterPopupOpen) {
			this.modalOpen = true;
			try {
				await openHelpPopup(this.screen, "task-list", { hasProjects: this.configuredProjects.length > 0 });
			} finally {
				this.modalOpen = false;
			}
		}
	}
	private escape(): void {
		if (this.modalOpen || this.filterPopupOpen) return;
		if (this.currentFocus === "filters") {
			this.filterHeader.setBorderColor("cyan");
			const pane = resolveFilterExitPane(
				this.filterExitPane,
				Boolean(this.taskList),
				Boolean(this.rendering.descriptionBox),
			);
			if (pane === "list" && this.taskList) this.focusTaskList();
			else if (pane === "detail") this.focusDetailPane();
			return;
		}
		if (this.currentFocus !== "list" && this.taskList) this.focusTaskList();
		else if (this.currentFocus === "list") this.quit();
	}
	private quit(): void {
		if (!this.modalOpen && !this.filterPopupOpen) {
			this.cleanup();
			this.screen.destroy();
			process.exit(0);
		}
	}
	private async switchView(): Promise<void> {
		if (this.modalOpen || this.filterPopupOpen || this.currentFocus === "filters") return;
		this.cleanup();
		this.screen.destroy();
		await this.options.onTabPress?.();
	}
	private applyUpdates(tasks: Task[], statuses: string[], labels: string[], selected?: Task): void {
		this.statuses = statuses;
		this.labels = labels;
		this.availableLabels = collectAvailableLabels(tasks, labels);
		this.session.updateTasks(tasks, this.filters());
		const previous = this.session.selected.id;
		const current =
			this.session.getTasks().find((task) => task.id === selected?.id) ??
			this.session.getTasks().find((task) => task.id === this.session.selected.id) ??
			this.session.getTasks()[0];
		if (current) {
			this.session.select(this.enrichTask(current) ?? current);
			if (this.session.selected.id !== previous) this.options.onTaskChange?.(this.session.selected);
		}
		this.applyFilters();
	}
	private waitForClose(): Promise<void> {
		return new Promise((resolve) =>
			this.screen.on("destroy", () => {
				this.cleanup();
				resolve();
			}),
		);
	}
	private cleanup(): void {
		if (this.closed) return;
		this.closed = true;
		if (this.helpRestoreTimer) clearTimeout(this.helpRestoreTimer);
		this.helpRestoreTimer = null;
		(this.screen as unknown as { removeListener(event: string, listener: () => void): void }).removeListener(
			"resize",
			this.resizeHandler,
		);
		for (const { keys, handler } of this.screenKeyBindings) this.screen.unkey(keys, handler);
		this.screenKeyBindings.length = 0;
		this.filterHeader.destroy();
		this.taskList?.destroy();
		this.taskList = null;
		this.listEmptyStateBox?.destroy();
		this.listEmptyStateBox = null;
	}
}
