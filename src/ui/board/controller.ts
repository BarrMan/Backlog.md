import type { ScreenInterface } from "neo-neo-bblessed";
import { box } from "neo-neo-bblessed";
import { type BoardLayout, generateKanbanBoardWithMetadata, generateMilestoneGroupedBoard } from "../../board.ts";
import { type Core, createRuntimeCore } from "../../core/backlog.ts";
import type { Milestone, Task, TaskCreateInput } from "../../types/index.ts";
import { copyToClipboard } from "../../utils/clipboard.ts";
import { areLabelSelectionsEqual, collectAvailableLabels } from "../../utils/label-filter.ts";
import { NO_MILESTONE_FILTER_LABEL, NO_MILESTONE_FILTER_VALUE } from "../../utils/milestone-filter.ts";
import { applyTaskFilters, createTaskSearchIndex } from "../../utils/task-search.ts";
import { createFilterHeader, type FilterHeader, type FilterState } from "../components/filter-header.ts";
import { openMultiSelectFilterPopup, openSingleSelectFilterPopup } from "../components/filter-popup.ts";
import type { BoundaryNavigationKey } from "../components/generic-list.ts";
import { openHelpPopup } from "../components/help-popup.ts";
import { openTaskComposer, type TaskComposerOptions } from "../components/task-composer.ts";
import { formatFooterContent, getBoardFooterContent } from "../footer-content.ts";
import { formatKeymap, keymapKeys } from "../keymap.ts";
import { focusTaskFilterControl } from "../task-filter-wiring.ts";
import { resolveListBoundaryNavigation, resolveSearchExitTargetIndex } from "../task-viewer-with-search.ts";
import {
	type ColumnData,
	filterVisibleColumns,
	prepareBoardColumns,
	shouldRebuildColumns,
	upsertBoardTask,
} from "./column-policy.ts";
import { type BoardColumnView, createBoardColumns } from "./columns-view.ts";
import {
	type BoardSessionConfigurationOptions,
	collectBoardMilestoneLabels,
	normalizeBoardSessionConfiguration,
} from "./configuration.ts";
import { hasMoveBlockingBoardFilters } from "./filter-policy.ts";
import { moveTargetToAdjacentColumn } from "./interaction.ts";
import {
	type BoardMoveOperation,
	getMoveInsertionBase,
	getMoveSetIds,
	getPreviewMovingIds,
	mapMoveInsertionIndex,
	projectBoardMove,
} from "./move-policy.ts";
import { createBoardScreenSession } from "./screen.ts";
import { BoardSession } from "./session.ts";
import { createBoardTaskPopup } from "./task-popup.ts";

export {
	type ColumnData,
	filterVisibleColumns,
	formatTaskListItem,
	prepareBoardColumns,
	shouldRebuildColumns,
	upsertBoardTask,
} from "./column-policy.ts";
export { hasMoveBlockingBoardFilters } from "./filter-policy.ts";

type ColumnView = BoardColumnView;

type MoveOperation = BoardMoveOperation;

type BoardSelectionPolicy = {
	isBlocked: () => boolean;
	getColumn: () => ColumnView | undefined;
	getMoveOperation: () => MoveOperation | null;
	isMovePending: () => boolean;
	collapseHighlight: () => boolean;
	getPreviewMovingIds: (operation: MoveOperation) => string[];
	renderView: () => void;
	focusSearch: () => void;
	setPendingSearchWrap: (target: "to-first" | "to-last" | null) => void;
	updateFooter: () => void;
	renderScreen: () => void;
	selectColumnRow: (column: ColumnView, index: number, active: boolean) => void;
};

function moveBoardSelection(direction: "up" | "down", key: BoundaryNavigationKey, policy: BoardSelectionPolicy): void {
	if (policy.isBlocked()) return;
	const column = policy.getColumn();
	const operation = policy.getMoveOperation();
	if (operation) {
		moveBoardMoveSelection(direction, column, operation, policy);
		return;
	}
	moveBoardListSelection(direction, key, column, policy);
}

function moveBoardMoveSelection(
	direction: "up" | "down",
	column: ColumnView | undefined,
	operation: MoveOperation,
	policy: BoardSelectionPolicy,
): void {
	if (policy.isMovePending() || policy.collapseHighlight()) return;
	if (direction === "up") {
		if (operation.targetIndex > 0) {
			operation.targetIndex -= 1;
			policy.renderView();
		}
		return;
	}
	if (column && operation.targetIndex < column.tasks.length - policy.getPreviewMovingIds(operation).length) {
		operation.targetIndex += 1;
		policy.renderView();
	}
}

function moveBoardListSelection(
	direction: "up" | "down",
	key: BoundaryNavigationKey,
	column: ColumnView | undefined,
	policy: BoardSelectionPolicy,
): void {
	if (!column) return;
	const selected = column.list.selected ?? 0;
	const total = column.tasks.length;
	const navigation = resolveListBoundaryNavigation(direction, selected, total, key);
	if (navigation === "stay") return;
	if (navigation === "search") {
		policy.setPendingSearchWrap(total === 0 ? null : direction === "up" ? "to-last" : "to-first");
		policy.focusSearch();
		policy.updateFooter();
		policy.renderScreen();
		return;
	}
	policy.selectColumnRow(column, direction === "up" ? selected - 1 : selected + 1, true);
	policy.renderScreen();
}

function areBoardTaskCollectionsEqual(current: readonly Task[], next: readonly Task[]): boolean {
	if (current.length !== next.length) return false;
	return current.every((task, index) => JSON.stringify(task) === JSON.stringify(next[index]));
}

export function getCreatedTaskBoardOutcome(
	task: Task,
	visible: boolean,
): { focusTaskId?: string; message: string; tone: "green" | "yellow" } {
	if (task.status.trim().toLowerCase() === "draft") {
		return {
			message: `Created ${task.id} as a draft. Drafts are not shown on the task board.`,
			tone: "yellow",
		};
	}
	if (!visible) {
		return {
			message: `Created ${task.id}, but it is hidden by the current board filters.`,
			tone: "yellow",
		};
	}
	return { focusTaskId: task.id, message: `Created ${task.id}.`, tone: "green" };
}

/**
 * Render tasks in an interactive TUI when stdout is a TTY.
 * Falls back to plain-text board when not in a terminal
 * (e.g. piping output to a file or running in CI).
 */
export async function renderBoardTui(
	initialTasks: Task[],
	statuses: string[],
	_layout: BoardLayout,
	_maxColumnWidth: number,
	options?: {
		/** Core instance the board mutates through. Falls back to the runtime working directory. */
		core?: Core;
		viewSwitcher?: import("../view-switcher.ts").ViewSwitcher;
		onTaskSelect?: (task: Task) => void;
		onTabPress?: () => Promise<void>;
		onWorkspacePress?: () => Promise<void>;
		subscribeUpdates?: (update: (nextTasks: Task[], nextStatuses: string[]) => void) => void;
		filters?: BoardSessionConfigurationOptions["filters"];
		availableLabels?: string[];
		availableMilestones?: string[];
		priorities?: string[];
		types?: string[];
		projects?: string[];
		onFilterChange?: (filters: import("./configuration.ts").BoardSharedFilters) => void;
		milestoneMode?: boolean;
		milestoneEntities?: Milestone[];
		startupWarning?: string;
		dateFormat?: string;
		hideEmptyColumns?: boolean;
		projectName?: string;
		createTask?: (input: TaskCreateInput) => Promise<Task>;
		screen?: ScreenInterface;
		/** Leave a supplied screen alive after releasing Board-owned resources. */
		preserveScreen?: boolean;
		/** Called after the initial render and all board key handlers are ready for input. */
		onReady?: () => void;
		taskComposer?: (options: TaskComposerOptions) => Promise<Task | null>;
	},
): Promise<void> {
	if (!process.stdout.isTTY) {
		const projectName = options?.projectName?.trim() || "Project";
		// The piped board is the same view, so it hides the same columns the TUI hides.
		// Milestone lanes filter on the same board-wide emptiness the browser lanes use.
		const visibleStatuses = options?.hideEmptyColumns
			? filterVisibleColumns(prepareBoardColumns(initialTasks, statuses), true, false).map((column) => column.status)
			: statuses;
		if (options?.milestoneMode) {
			console.log(
				generateMilestoneGroupedBoard(initialTasks, visibleStatuses, options.milestoneEntities ?? [], projectName),
			);
		} else {
			console.log(generateKanbanBoardWithMetadata(initialTasks, visibleStatuses, projectName));
		}
		return;
	}

	const initialColumns = prepareBoardColumns(initialTasks, statuses);
	if (initialColumns.length === 0) {
		console.log("No tasks available for the Kanban board.");
		return;
	}

	await new Promise<void>((resolve) => {
		const { screen, ownsScreen, keyBindings, bindKey, container, boardArea } = createBoardScreenSession(
			options?.screen,
			options?.preserveScreen,
			options?.projectName,
		);

		let currentTasks = initialTasks;
		let columns: ColumnView[] = [];
		let currentColumnsData: ColumnData[] = [];
		const initialConfiguration = normalizeBoardSessionConfiguration(initialTasks, statuses, initialColumns, options);
		let configuredWorkflowStatuses = initialConfiguration.configuredWorkflowStatuses;
		let currentStatuses = initialConfiguration.currentStatuses;
		const boardSession = new BoardSession();
		let hideEmptyColumns = initialConfiguration.hideEmptyColumns;
		let currentCol = 0;
		let popupOpen = false;
		// The task popup renders a snapshot, so the board remembers which task it shows and
		// what that task's content looked like to keep it in step with later updates.
		let taskPopup: ReturnType<typeof createBoardTaskPopup> | null = null;
		const closeOpenPopup = () => {
			taskPopup?.close();
			popupOpen = false;
		};
		/** Focus a column after a popup closes; the board may have lost columns while it was open. */
		const restoreColumnFocus = (preferredIndex: number, preferredRow?: number) => {
			focusColumn(Math.max(0, Math.min(preferredIndex, columns.length - 1)), preferredRow);
		};
		let currentFocus: "board" | "filters" = "board";
		let filterPopupOpen = false;
		let modalOpen = false;
		let taskCreationOpen = false;
		let taskCreationPendingUpdate = false;
		let pendingSearchWrap: "to-first" | "to-last" | null = null;
		let renderingView = false;
		let fallbackCore: Core | null = null;
		// Board mutations reuse the caller's Core so every surface reads the same project root.
		const getCore = async (): Promise<Core> => {
			if (options?.core) return options.core;
			fallbackCore ??= await createRuntimeCore({ enableWatchers: true });
			return fallbackCore;
		};
		const { configuredTaskTypes, configuredProjects, sharedFilters, priorityOptions, resolveMilestoneLabel } =
			initialConfiguration;
		const runWithModalGuard = async <T>(operation: () => Promise<T>): Promise<T> => {
			modalOpen = true;
			try {
				return await boardSession.runModal(operation);
			} finally {
				modalOpen = false;
				// A task update that arrived while the dialog held the screen was deferred.
				taskPopup?.onModalClosed();
			}
		};
		let configuredLabels = initialConfiguration.configuredLabels;
		let availableMilestones = initialConfiguration.availableMilestones;

		let filterHeader: FilterHeader | null = null;
		const hasActiveSharedFilters = () =>
			Boolean(
				sharedFilters.searchQuery.trim() ||
					sharedFilters.excludeStatus.length > 0 ||
					sharedFilters.typeFilter.length > 0 ||
					sharedFilters.projectFilter.length > 0 ||
					sharedFilters.priorityFilter ||
					sharedFilters.labelFilter.length > 0 ||
					sharedFilters.milestoneFilter ||
					sharedFilters.limit !== undefined,
			);
		const hasMoveBlockingSharedFilters = () => hasMoveBlockingBoardFilters(sharedFilters);
		const emitFilterChange = () => {
			options?.onFilterChange?.({
				searchQuery: sharedFilters.searchQuery,
				excludeStatus: [...sharedFilters.excludeStatus],
				typeFilter: [...sharedFilters.typeFilter],
				projectFilter: [...sharedFilters.projectFilter],
				priorityFilter: sharedFilters.priorityFilter,
				labelFilter: [...sharedFilters.labelFilter],
				labelMatch: sharedFilters.labelMatch,
				milestoneFilter: sharedFilters.milestoneFilter,
				limit: sharedFilters.limit,
			});
		};
		const getFilteredTasks = (): Task[] => {
			let filteredTasks: Task[];
			if (!hasActiveSharedFilters()) {
				filteredTasks = [...currentTasks];
			} else {
				const searchIndex = createTaskSearchIndex(currentTasks);
				filteredTasks = applyTaskFilters(
					currentTasks,
					{
						query: sharedFilters.searchQuery,
						excludeStatus: sharedFilters.excludeStatus,
						type: sharedFilters.typeFilter,
						project: sharedFilters.projectFilter,
						priority: sharedFilters.priorityFilter || undefined,
						labels: sharedFilters.labelFilter,
						labelMatch: sharedFilters.labelMatch,
						milestone: sharedFilters.milestoneFilter || undefined,
						resolveMilestoneLabel,
					},
					searchIndex,
				);
			}
			return sharedFilters.limit !== undefined ? filteredTasks.slice(0, sharedFilters.limit) : filteredTasks;
		};

		const getInsertionBase = (targetStatus: string, excludeIds: string[]) =>
			getMoveInsertionBase(getFilteredTasks(), currentStatuses, targetStatus, excludeIds);

		/** Mutate the move selection/highlight while keeping targetIndex anchored to the same spot. */
		const updateMoveSelection = (operation: MoveOperation, mutate: () => void): void => {
			const before = getInsertionBase(operation.targetStatus, getPreviewMovingIds(operation));
			mutate();
			const after = getInsertionBase(operation.targetStatus, getPreviewMovingIds(operation));
			operation.targetIndex = mapMoveInsertionIndex(before, after, operation.targetIndex);
		};

		/**
		 * A plain arrow while the recruitment highlight is active collapses it back to the
		 * ghost, switching the preview to the whole set landing as one block. Returns true
		 * when the keypress was consumed by the collapse.
		 */
		const collapseHighlight = (): boolean => {
			if (!boardSession.move?.highlightTaskId) return false;
			const operation = boardSession.move;
			updateMoveSelection(operation, () => {
				operation.highlightTaskId = null;
			});
			renderView();
			return true;
		};

		const footerBox = box({
			parent: screen,
			bottom: 0,
			left: 0,
			height: 1,
			width: "100%",
			tags: true,
			wrap: true,
			content: "",
		});
		let transientFooterContent: string | null = null;
		let footerRestoreTimer: ReturnType<typeof setTimeout> | null = null;
		const clearFooterTimer = () => {
			if (!footerRestoreTimer) return;
			clearTimeout(footerRestoreTimer);
			footerRestoreTimer = null;
		};
		const getTerminalWidth = () => (typeof screen.width === "number" ? screen.width : 80);
		const getFooterHeight = () => (typeof footerBox.height === "number" ? footerBox.height : 1);
		const setFooterContent = (content: string) => {
			const formatted = formatFooterContent(content, getTerminalWidth());
			footerBox.height = formatted.height;
			footerBox.setContent(formatted.content);
		};

		const boardColumns = createBoardColumns({
			parent: boardArea,
			getTerminalWidth,
			getMovingTaskIds: () => (boardSession.move ? getMoveSetIds(boardSession.move) : undefined),
			isMoveActive: () => Boolean(boardSession.move),
			dateFormat: options?.dateFormat,
			projects: configuredProjects,
			isInteractionBlocked: () => popupOpen || filterPopupOpen || modalOpen,
			isRendering: () => renderingView,
			onBoardFocus: () => {
				currentCol = boardColumns.selection.currentColumnIndex;
				currentFocus = "board";
				filterHeader?.setBorderColor("cyan");
				updateFooter();
			},
			onRender: () => screen.render(),
		});
		columns = boardColumns.columns;
		currentColumnsData = boardColumns.data;
		const selectColumnRow = boardColumns.selectRow;
		const setColumnActiveState = boardColumns.setActive;
		const getSelectedTaskId = () => boardColumns.selectedTaskId;
		const focusColumn = (index: number, row?: number, active = true) => {
			boardColumns.selection.currentColumnIndex = currentCol;
			boardColumns.focus(index, row, active);
			currentCol = boardColumns.selection.currentColumnIndex;
		};
		const applyColumnData = boardColumns.apply;
		const rebuildColumns = boardColumns.rebuild;

		const focusFilterControl = (filterId: "search" | "type" | "project" | "priority" | "milestone" | "labels") => {
			if (filterHeader) focusTaskFilterControl(filterHeader, filterId);
		};

		const openFilterPicker = async (filterId: "type" | "project" | "priority" | "milestone" | "labels") => {
			if (filterPopupOpen || modalOpen || boardSession.move || !filterHeader) {
				return;
			}
			filterPopupOpen = true;
			try {
				if (filterId === "type") {
					const nextTypes = await openMultiSelectFilterPopup({
						screen,
						title: "Task Type Filter",
						items: configuredTaskTypes,
						selectedItems: sharedFilters.typeFilter,
					});
					if (nextTypes !== null) {
						sharedFilters.typeFilter = nextTypes;
						filterHeader.setFilters({ taskTypes: nextTypes });
						emitFilterChange();
						renderView();
					}
					return;
				}

				if (filterId === "project") {
					const nextProjects = await openMultiSelectFilterPopup({
						screen,
						title: "Project Filter",
						items: configuredProjects,
						selectedItems: sharedFilters.projectFilter,
					});
					if (nextProjects !== null) {
						sharedFilters.projectFilter = nextProjects;
						filterHeader.setFilters({ projects: nextProjects });
						emitFilterChange();
						renderView();
					}
					return;
				}

				if (filterId === "labels") {
					const nextLabels = await openMultiSelectFilterPopup({
						screen,
						title: "Label Filter",
						items: [...configuredLabels].sort((a, b) => a.localeCompare(b)),
						selectedItems: sharedFilters.labelFilter,
					});
					if (nextLabels !== null) {
						sharedFilters.labelFilter = nextLabels;
						sharedFilters.labelMatch = "any";
						filterHeader.setFilters({ labels: nextLabels });
						emitFilterChange();
						renderView();
					}
					return;
				}

				if (filterId === "priority") {
					const selected = await openSingleSelectFilterPopup({
						screen,
						title: "Priority Filter",
						selectedValue: sharedFilters.priorityFilter,
						choices: [
							{ label: "All", value: "" },
							...priorityOptions.map((priority) => ({ label: priority.label, value: priority.value })),
						],
					});
					if (selected !== null) {
						sharedFilters.priorityFilter = selected;
						filterHeader.setFilters({ priority: selected });
						emitFilterChange();
						renderView();
					}
					return;
				}

				const selected = await openSingleSelectFilterPopup({
					screen,
					title: "Milestone Filter",
					selectedValue: sharedFilters.milestoneFilter,
					choices: [
						{ label: "All", value: "" },
						{ label: NO_MILESTONE_FILTER_LABEL, value: NO_MILESTONE_FILTER_VALUE },
						...availableMilestones.map((value) => ({ label: value, value })),
					],
				});
				if (selected !== null) {
					sharedFilters.milestoneFilter = selected;
					filterHeader.setFilters({ milestone: selected });
					emitFilterChange();
					renderView();
				}
			} finally {
				filterPopupOpen = false;
				focusFilterControl(filterId);
				screen.render();
			}
		};

		filterHeader = createFilterHeader({
			parent: container,
			statuses: [],
			availableLabels: configuredLabels,
			availableMilestones,
			visibleFilters: [
				"search",
				"type",
				...(configuredProjects.length > 0 ? (["project"] as const) : []),
				"priority",
				"milestone",
				"labels",
			],
			initialFilters: {
				search: sharedFilters.searchQuery,
				taskTypes: sharedFilters.typeFilter,
				projects: sharedFilters.projectFilter,
				priority: sharedFilters.priorityFilter,
				labels: sharedFilters.labelFilter,
				milestone: sharedFilters.milestoneFilter,
			},
			onFilterChange: (filters: FilterState) => {
				const labelsChanged = !areLabelSelectionsEqual(sharedFilters.labelFilter, filters.labels);
				sharedFilters.searchQuery = filters.search;
				sharedFilters.typeFilter = filters.taskTypes;
				sharedFilters.projectFilter = filters.projects;
				sharedFilters.priorityFilter = filters.priority;
				sharedFilters.labelFilter = filters.labels;
				if (labelsChanged) {
					sharedFilters.labelMatch = "any";
				}
				sharedFilters.milestoneFilter = filters.milestone;
				emitFilterChange();
				renderView();
			},
			onFilterPickerOpen: (filterId) => {
				if (filterId === "status") {
					return;
				}
				void openFilterPicker(filterId);
			},
		});
		filterHeader.setFocusChangeHandler((focus) => {
			if (focus !== null) {
				currentFocus = "filters";
				setColumnActiveState(columns[currentCol], false);
				updateFooter();
				screen.render();
			}
		});
		filterHeader.setExitRequestHandler((direction) => {
			const currentColumn = columns[currentCol];
			const selected = currentColumn?.list.selected;
			const currentIndex = typeof selected === "number" ? selected : undefined;
			const totalTasks = currentColumn?.tasks.length ?? 0;
			const targetIndex = resolveSearchExitTargetIndex(direction, pendingSearchWrap, totalTasks, currentIndex);
			pendingSearchWrap = null;
			focusColumn(currentCol, targetIndex);
			updateFooter();
		});
		const syncBoardAreaLayout = () => {
			const headerHeight = filterHeader?.getHeight() ?? 0;
			boardArea.top = headerHeight;
			boardArea.height = `100%-${headerHeight + getFooterHeight()}`;
		};
		syncBoardAreaLayout();

		const updateFooter = () => {
			if (transientFooterContent) {
				setFooterContent(transientFooterContent);
				syncBoardAreaLayout();
				return;
			}
			if (currentFocus === "filters") {
				const filterFocus = filterHeader?.getCurrentFocus();
				if (filterFocus === "search") {
					setFooterContent(
						` {cyan-fg}[${formatKeymap("shared", "previous")}/${formatKeymap("shared", "next")}]{/} Cursor (edge=Prev/Next) | {cyan-fg}[${formatKeymap("board", "navUp")}/${formatKeymap("board", "navDown")}]{/} Back to Board | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Cancel | {gray-fg}(Live search){/}`,
					);
					syncBoardAreaLayout();
					return;
				}
				setFooterContent(
					` {cyan-fg}[${formatKeymap("shared", "activate")}]{/} Open Picker | {cyan-fg}[${formatKeymap("shared", "previous")}/${formatKeymap("shared", "next")}]{/} Prev/Next | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Back`,
				);
				syncBoardAreaLayout();
				return;
			}
			if (boardSession.move) {
				setFooterContent(
					` {green-fg}MOVE MODE{/} | {cyan-fg}[${formatKeymap("board", "navPrevious")}${formatKeymap("board", "navNext")}]{/} Change Column | {cyan-fg}[${formatKeymap("board", "navUp")}${formatKeymap("board", "navDown")}]{/} Reorder | {cyan-fg}[${formatKeymap("board", "moveHighlight")}]{/} Highlight | {cyan-fg}[${formatKeymap("board", "recruit")}]{/} Select | {cyan-fg}[${formatKeymap("board", "open")}]{/} Confirm | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Cancel`,
				);
			} else {
				const base = getBoardFooterContent({ hasProjects: configuredProjects.length > 0 });
				setFooterContent(hasActiveSharedFilters() ? `${base} | {yellow-fg}Filtered{/}` : base);
			}
			syncBoardAreaLayout();
		};

		const showTransientFooter = (message: string, durationMs = 3000, renderImmediately = true) => {
			transientFooterContent = message;
			clearFooterTimer();
			updateFooter();
			if (renderImmediately) screen.render();
			footerRestoreTimer = setTimeout(() => {
				transientFooterContent = null;
				footerRestoreTimer = null;
				updateFooter();
				screen.render();
			}, durationMs);
		};

		/**
		 * Tear the board down, optionally handing off to another view before resolving.
		 * First request wins: while a pending write delays the close, further exit actions
		 * (e.g. Tab then q) join the same closing promise instead of running a second
		 * teardown or replacing the first request's handoff.
		 */
		let closingBoard: Promise<void> | null = null;
		const closeBoard = (beforeResolve?: () => Promise<unknown>): Promise<void> => {
			closingBoard ??= (async () => {
				await boardSession.settleTaskCreation();
				await boardSession.settleWrites();
				clearFooterTimer();
				closeOpenPopup();
				filterHeader?.destroy();
				footerBox.destroy();
				container.destroy();
				for (const { keys, handler } of keyBindings) {
					screen.unkey(keys, handler);
				}
				if (ownsScreen) screen.destroy();
				await beforeResolve?.();
				resolve();
			})();
			return closingBoard;
		};

		const renderView = (preferredTaskId?: string) => {
			renderingView = true;
			try {
				const projectedData = projectBoardMove(getFilteredTasks(), currentStatuses, boardSession.move);
				// Track every projected status, not only the rendered ones, so hiding empty
				// columns cannot narrow the move targets or the next projection.
				if (projectedData.length > 0) {
					currentStatuses = projectedData.map((column) => column.status);
				}
				const dataForColumns = filterVisibleColumns(projectedData, hideEmptyColumns, Boolean(boardSession.move));

				// If we are moving, we want to select the recruitment highlight when it is
				// active, and the moving task's ghost otherwise
				const selectedId =
					preferredTaskId ??
					(boardSession.move ? (boardSession.move.highlightTaskId ?? boardSession.move.taskId) : getSelectedTaskId());

				if (dataForColumns.length === 0) {
					const fallbackStatus = currentStatuses[0] ?? "No Status";
					rebuildColumns([{ status: fallbackStatus, tasks: [] }], selectedId);
				} else if (shouldRebuildColumns(currentColumnsData, dataForColumns)) {
					rebuildColumns(dataForColumns, selectedId);
				} else {
					applyColumnData(dataForColumns, selectedId);
				}

				updateFooter();
			} finally {
				renderingView = false;
			}
			screen.render();
		};

		renderView();
		const firstColumn = columns[0];
		if (firstColumn) {
			currentCol = 0;
			if (firstColumn.tasks.length > 0) {
				selectColumnRow(firstColumn, 0, true);
			}
			setColumnActiveState(firstColumn, true);
			firstColumn.list.focus();
		}

		if (options?.startupWarning) {
			showTransientFooter(` {yellow-fg}${options.startupWarning}{/}`, 15000);
		}

		const updateBoard = (nextTasks: Task[], nextStatuses: string[]) => {
			const tasksChanged = !areBoardTaskCollectionsEqual(currentTasks, nextTasks);
			const statusesChanged =
				nextStatuses.length > 0 &&
				(nextStatuses.length !== currentStatuses.length ||
					nextStatuses.some((status, index) => status !== currentStatuses[index]));
			if (!tasksChanged && !statusesChanged) return;

			// Update source of truth
			currentTasks = nextTasks;
			// Only update statuses if they changed (rare in TUI)
			if (nextStatuses.length > 0) {
				configuredWorkflowStatuses = [...nextStatuses];
				currentStatuses = nextStatuses;
			}
			configuredLabels = collectAvailableLabels(currentTasks, options?.availableLabels ?? []);
			availableMilestones = collectBoardMilestoneLabels(
				options?.availableMilestones ?? [],
				currentTasks,
				resolveMilestoneLabel,
			);

			if (taskCreationOpen) {
				taskCreationPendingUpdate = true;
				return;
			}
			renderView();
			if (popupOpen) void syncOpenPopup();
		};

		options?.subscribeUpdates?.(updateBoard);

		const onResize = () => {
			filterHeader?.rebuild();
			syncBoardAreaLayout();
			renderView();
		};
		screen.on("resize", onResize);

		// Helper to get target column size (excluding the moving task if it's currently there)
		const getTargetColumnSize = (status: string): number => {
			const columnData = currentColumnsData.find((c) => c.status === status);
			if (!columnData) return 0;
			// If the moving task is currently in this column, we need to account for it
			if (boardSession.move && boardSession.move.targetStatus === status) {
				// The task is already "in" this column in the projected view
				return columnData.tasks.length;
			}
			// Otherwise, the task will be added to this column
			return columnData.tasks.length;
		};

		bindKey(keymapKeys("board", "search"), () => {
			if (popupOpen || filterPopupOpen || modalOpen || boardSession.move) return;
			pendingSearchWrap = null;
			focusFilterControl("search");
			updateFooter();
		});

		bindKey(keymapKeys("board", "create"), () => {
			if (popupOpen || filterPopupOpen || modalOpen || boardSession.move || currentFocus === "filters") return;
			boardSession.trackTaskCreation(
				(async () => {
					taskCreationOpen = true;
					let task: Task | null = null;
					let creationError: unknown;
					let hadPendingUpdate = false;
					try {
						task = await runWithModalGuard(() =>
							(options?.taskComposer ?? openTaskComposer)({
								screen,
								statuses: configuredWorkflowStatuses,
								types: options?.types,
								priorities: options?.priorities,
								projects: options?.projects,
								persist: async (input) => {
									if (options?.createTask) return options.createTask(input);
									const core = await getCore();
									const config = await core.fs.loadConfig();
									return (await core.createTaskFromInput(input, config?.autoCommit ?? false)).task;
								},
							}),
						);
					} catch (error) {
						creationError = error;
					} finally {
						taskCreationOpen = false;
						hadPendingUpdate = taskCreationPendingUpdate;
						taskCreationPendingUpdate = false;
					}

					if (creationError) {
						const message = creationError instanceof Error ? creationError.message : "Unknown error";
						showTransientFooter(` {red-fg}Error opening task composer: ${message}{/}`, 3000, false);
						if (hadPendingUpdate) renderView();
						else screen.render();
						return;
					}
					if (!task) {
						if (hadPendingUpdate) renderView();
						else focusColumn(currentCol);
						return;
					}

					const draft = task.status.trim().toLowerCase() === "draft";
					if (!draft) currentTasks = upsertBoardTask(currentTasks, task);
					const visible = !draft && getFilteredTasks().some((candidate) => candidate.id === task.id);
					const outcome = getCreatedTaskBoardOutcome(task, visible);
					showTransientFooter(` {${outcome.tone}-fg}${outcome.message}{/}`, 6000, false);
					renderView(outcome.focusTaskId);
				})(),
			);
		});

		bindKey(keymapKeys("board", "filterPriority"), () => {
			if (popupOpen || filterPopupOpen || modalOpen || boardSession.move) return;
			void openFilterPicker("priority");
		});

		bindKey(keymapKeys("board", "filterType"), () => {
			if (popupOpen || filterPopupOpen || modalOpen || boardSession.move) return;
			void openFilterPicker("type");
		});

		if (configuredProjects.length > 0) {
			// "v"/"V", not "g"/"G": kept consistent with the task-list view's project filter
			// shortcut, which had to move off "g"/"G" to avoid colliding with that view's
			// detail-pane scroll-to-top/bottom keys.
			bindKey(keymapKeys("board", "filterProject"), () => {
				if (popupOpen || filterPopupOpen || modalOpen || boardSession.move) return;
				void openFilterPicker("project");
			});
		}

		bindKey(keymapKeys("board", "filterLabels"), () => {
			if (popupOpen || filterPopupOpen || modalOpen || boardSession.move) return;
			void openFilterPicker("labels");
		});

		bindKey(keymapKeys("board", "filterMilestone"), () => {
			if (popupOpen || filterPopupOpen || modalOpen || boardSession.move) return;
			void openFilterPicker("milestone");
		});

		const moveToAdjacentColumn = (direction: "previous" | "next") => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters") return;
			if (boardSession.move) {
				if (boardSession.isMovePending()) return;
				if (collapseHighlight()) return;
				const target = moveTargetToAdjacentColumn(
					currentStatuses,
					boardSession.move.targetStatus,
					boardSession.move.targetIndex,
					direction,
					getTargetColumnSize,
				);
				if (target) {
					boardSession.move.targetStatus = target.status;
					boardSession.move.targetIndex = target.index;
					renderView();
				}
			} else {
				focusColumn(currentCol + (direction === "previous" ? -1 : 1));
			}
		};

		bindKey(keymapKeys("board", "navPrevious"), () => {
			moveToAdjacentColumn("previous");
		});

		bindKey(keymapKeys("board", "navNext"), () => {
			moveToAdjacentColumn("next");
		});

		const boardSelectionPolicy: BoardSelectionPolicy = {
			isBlocked: () => popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters",
			getColumn: () => columns[currentCol],
			getMoveOperation: () => boardSession.move,
			isMovePending: () => boardSession.isMovePending(),
			collapseHighlight,
			getPreviewMovingIds,
			renderView,
			focusSearch: () => focusFilterControl("search"),
			setPendingSearchWrap: (target) => {
				pendingSearchWrap = target;
			},
			updateFooter,
			renderScreen: () => screen.render(),
			selectColumnRow,
		};

		bindKey(keymapKeys("board", "navUp"), () => moveBoardSelection("up", "arrow", boardSelectionPolicy));
		bindKey(keymapKeys("board", "navUpVim"), () => moveBoardSelection("up", "vim", boardSelectionPolicy));
		bindKey(keymapKeys("board", "navDown"), () => moveBoardSelection("down", "arrow", boardSelectionPolicy));
		bindKey(keymapKeys("board", "navDownVim"), () => moveBoardSelection("down", "vim", boardSelectionPolicy));

		const lanePageAmount = () => {
			const column = columns[currentCol];
			if (!column) return 0;
			const height = typeof column.list.height === "number" ? column.list.height : 0;
			return height > 0 ? Math.max(1, height - 1) : 5;
		};

		const isBoardLaneNavigationBlocked = () =>
			popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters" || Boolean(boardSession.move);

		bindKey(keymapKeys("board", "pageUp"), () => {
			if (isBoardLaneNavigationBlocked()) return;
			const column = columns[currentCol];
			if (!column) return;
			const selected = column.list.selected ?? 0;
			const nextIndex = Math.max(0, selected - lanePageAmount());
			selectColumnRow(column, nextIndex, true);
			screen.render();
		});

		bindKey(keymapKeys("board", "pageDown"), () => {
			if (isBoardLaneNavigationBlocked()) return;
			const column = columns[currentCol];
			if (!column) return;
			const selected = column.list.selected ?? 0;
			const total = column.tasks.length;
			if (total === 0) return;
			const nextIndex = Math.min(total - 1, selected + lanePageAmount());
			selectColumnRow(column, nextIndex, true);
			screen.render();
		});

		bindKey(keymapKeys("board", "first"), () => {
			if (isBoardLaneNavigationBlocked()) return;
			const column = columns[currentCol];
			if (!column || column.tasks.length === 0) return;
			selectColumnRow(column, 0, true);
			screen.render();
		});

		bindKey(keymapKeys("board", "last"), () => {
			if (isBoardLaneNavigationBlocked()) return;
			const column = columns[currentCol];
			if (!column || column.tasks.length === 0) return;
			selectColumnRow(column, column.tasks.length - 1, true);
			screen.render();
		});

		taskPopup = createBoardTaskPopup({
			screen,
			getCore,
			getTasks: () => currentTasks,
			updateTasks: (tasks) => updateBoard(tasks, []),
			removeTask: (taskId) => {
				currentTasks = currentTasks.filter((task) => task.id !== taskId);
			},
			resolveMilestoneLabel,
			dateFormat: options?.dateFormat,
			projects: configuredProjects,
			runWithModalGuard,
			isModalOpen: () => modalOpen,
			showFooter: showTransientFooter,
			renderView,
			restoreColumnFocus: (taskId) => {
				const index = taskId
					? columns.findIndex((column) => column.tasks.some((task) => task.id === taskId))
					: currentCol;
				restoreColumnFocus(
					index === -1 ? currentCol : index,
					taskId ? columns[index]?.tasks.findIndex((task) => task.id === taskId) : undefined,
				);
			},
			onClosed: () => {
				popupOpen = false;
			},
		});
		const openTaskEditor = taskPopup.edit;
		const completeBoardTask = taskPopup.complete;
		const archiveBoardTask = taskPopup.archive;
		const openTaskPopup = async (task: Task): Promise<void> => {
			popupOpen = true;
			await taskPopup.open(task);
			popupOpen = taskPopup.isOpen;
		};

		/**
		 * Bring an open task popup back in step with the board's tasks: rebuild it when its
		 * task changed, close it with a notice when the task left the board.
		 */
		const syncOpenPopup = taskPopup.sync;

		bindKey(keymapKeys("board", "open"), async () => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters") return;

			// In move mode, Enter confirms the move
			if (boardSession.move) {
				await performTaskMove();
				return;
			}

			const column = columns[currentCol];
			if (!column) return;
			const idx = column.list.selected ?? 0;
			if (idx < 0 || idx >= column.tasks.length) return;
			const task = column.tasks[idx];
			if (!task) return;
			await openTaskPopup(task);
		});

		const withSelectedBoardTask = async (action: (task: Task) => Promise<void>) => {
			const column = columns[currentCol];
			const task = column?.tasks[column.list.selected ?? 0];
			if (task) await action(task);
		};

		bindKey(keymapKeys("board", "edit"), async () => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters") return;
			await withSelectedBoardTask(openTaskEditor);
		});

		// The confirmed write in flight; closeBoard awaits it (like pendingSettingWrite)
		// because the caller may process.exit as soon as the board resolves.
		/** Mark a confirm write as in flight; the returned settle runs in its finally. */
		const beginMoveWrite = (): (() => void) => {
			const settle = boardSession.beginMoveWrite();
			return () => {
				settle();
			};
		};

		/** Confirm a move with recruited tasks: the whole set lands as one block at the preview position. */
		const performSetMove = async () => {
			if (!boardSession.move || boardSession.isMovePending()) return;
			const operation = boardSession.move;

			// Snapshot the confirmed placement synchronously, before any await: a watcher
			// update replacing currentTasks while the write is being prepared must affect
			// the board, never the batch the user confirmed.
			const projectedData = projectBoardMove(currentTasks, currentStatuses, operation);
			const targetColumn = projectedData.find((c) => c.status === operation.targetStatus);

			if (!targetColumn) {
				boardSession.finishMove();
				renderView();
				return;
			}

			const orderedTaskIds = targetColumn.tasks.map((task) => task.id);
			const taskIds = getMoveSetIds(operation);
			const targetStatus = operation.targetStatus;

			// No-op guard: the set already sits exactly where the preview lands it.
			const realColumn = prepareBoardColumns(currentTasks, currentStatuses).find(
				(c) => c.status === operation.targetStatus,
			);
			const realIds = (realColumn?.tasks ?? []).map((task) => task.id);
			if (realIds.length === orderedTaskIds.length && realIds.every((id, index) => id === orderedTaskIds[index])) {
				boardSession.finishMove();
				renderView();
				return;
			}

			const settleMoveWrite = beginMoveWrite();
			try {
				const core = await getCore();
				const config = await core.fs.loadConfig();

				const { movedTasks, changedTasks, failures } = await core.moveTasksToStatus({
					taskIds,
					targetStatus,
					orderedTaskIds,
					autoCommit: config?.autoCommit ?? false,
				});

				// Update local state with all moved and changed tasks (includes ordinal updates)
				const changedTasksMap = new Map(changedTasks.map((t) => [t.id, t]));
				for (const task of movedTasks) changedTasksMap.set(task.id, task);
				currentTasks = currentTasks.map((t) => changedTasksMap.get(t.id) ?? t);

				boardSession.finishMove();
				renderView();

				if (failures.length > 0) {
					const details = failures.map((failure) => `${failure.taskId}: ${failure.reason}`).join("; ");
					showTransientFooter(` {red-fg}Could not move ${failures.length} of the selected tasks — ${details}{/}`, 6000);
				}
			} catch (error) {
				// On error, cancel the move and restore original positions
				if (process.env.DEBUG) {
					console.error("Move failed:", error);
				}
				boardSession.finishMove();
				renderView();
			} finally {
				settleMoveWrite();
			}
		};

		const performTaskMove = async () => {
			if (!boardSession.move || boardSession.isMovePending()) return;

			// A confirm while the recruitment highlight is active first collapses it and
			// renders the block preview, so the user always sees the exact order that a
			// second confirm will persist - the projection is the single source of truth.
			if (boardSession.move.selectedIds.length > 0 && boardSession.move.highlightTaskId) {
				collapseHighlight();
				return;
			}

			if (boardSession.move.selectedIds.length > 0) {
				await performSetMove();
				return;
			}

			// Check if any actual change occurred
			const noChange =
				boardSession.move.targetStatus === boardSession.move.originalStatus &&
				boardSession.move.targetIndex === boardSession.move.originalIndex;

			if (noChange) {
				// No change, just exit move mode
				boardSession.finishMove();
				renderView();
				return;
			}

			// Snapshot the confirmed placement synchronously, before any await: a watcher
			// update replacing currentTasks while the write is being prepared must affect
			// the board, never the move the user confirmed.
			const projectedData = projectBoardMove(currentTasks, currentStatuses, boardSession.move);
			const targetColumn = projectedData.find((c) => c.status === boardSession.move?.targetStatus);

			if (!targetColumn) {
				boardSession.finishMove();
				renderView();
				return;
			}

			const orderedTaskIds = targetColumn.tasks.map((task) => task.id);
			const taskId = boardSession.move.taskId;
			const targetStatus = boardSession.move.targetStatus;

			const settleMoveWrite = beginMoveWrite();
			try {
				const core = await getCore();
				const config = await core.fs.loadConfig();

				// Persist the move using core API
				const { updatedTask, changedTasks } = await core.reorderTask({
					taskId,
					targetStatus,
					orderedTaskIds,
					autoCommit: config?.autoCommit ?? false,
				});

				// Update local state with all changed tasks (includes ordinal updates)
				const changedTasksMap = new Map(changedTasks.map((t) => [t.id, t]));
				changedTasksMap.set(updatedTask.id, updatedTask);
				currentTasks = currentTasks.map((t) => changedTasksMap.get(t.id) ?? t);

				// Exit move mode
				boardSession.finishMove();

				// Render with updated local state
				renderView();
			} catch (error) {
				// On error, cancel the move and restore original position
				if (process.env.DEBUG) {
					console.error("Move failed:", error);
				}
				boardSession.finishMove();
				renderView();
			} finally {
				settleMoveWrite();
			}
		};
		const cancelMove = () => {
			// Once the confirm write is in flight the move can no longer be called off, so a
			// late Escape must not make the board look canceled while the write still lands.
			if (!boardSession.move || boardSession.isMovePending()) return;

			// Exit move mode - pure state reset
			boardSession.cancelMove();
			renderView();
		};

		const enterMoveMode = () => {
			if (hasMoveBlockingSharedFilters()) {
				showTransientFooter(" {yellow-fg}Clear filters before moving tasks.{/}");
				return;
			}

			const column = columns[currentCol];
			if (!column) return;
			const taskIndex = column.list.selected ?? 0;
			const task = column.tasks[taskIndex];
			if (!task) return;

			const outcome = boardSession.enterMove(task, column.status, taskIndex);
			if (outcome === "branched") {
				showTransientFooter(` {red-fg}Cannot move task from branch "${task.branch}".{/}`);
				return;
			}
			renderView();
		};

		/**
		 * Shift+Up/Down walk the recruitment highlight through the target column's tasks
		 * without moving the grabbed task. While the highlight is active, recruited tasks
		 * stay in their original places and the preview shows only the grabbed task's ghost.
		 */
		const walkRecruitHighlight = (direction: "up" | "down") => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters") return;
			// The move set and target freeze once the confirm write is in flight.
			if (!boardSession.move || boardSession.isMovePending()) return;
			const operation = boardSession.move;

			// While the preview shows the collapsed block, the ghost index counts a column
			// without the whole set; re-anchor it against the recruitment view (recruits back
			// in place) before walking. Committed only if the walk actually highlights a task.
			const recruitIndex =
				!operation.highlightTaskId && operation.selectedIds.length > 0
					? mapMoveInsertionIndex(
							getInsertionBase(operation.targetStatus, getMoveSetIds(operation)),
							getInsertionBase(operation.targetStatus, [operation.taskId]),
							operation.targetIndex,
						)
					: operation.targetIndex;

			// Recruitment-view rows of the target column: the column without the grabbed task,
			// with its ghost spliced back in at the target position.
			const rows = getInsertionBase(operation.targetStatus, [operation.taskId]);
			const ghostIndex = Math.max(0, Math.min(recruitIndex, rows.length));
			rows.splice(ghostIndex, 0, operation.taskId);

			const from = operation.highlightTaskId ? rows.indexOf(operation.highlightTaskId) : ghostIndex;
			const step = direction === "down" ? 1 : -1;
			let next = (from === -1 ? ghostIndex : from) + step;
			// The ghost row is the grabbed task itself; the highlight walks past it.
			while (rows[next] === operation.taskId) next += step;
			const nextId = rows[next];
			if (nextId === undefined) return;

			operation.highlightTaskId = nextId;
			operation.targetIndex = recruitIndex;
			renderView();
		};

		bindKey(keymapKeys("board", "moveHighlightUp"), () => walkRecruitHighlight("up"));
		bindKey(keymapKeys("board", "moveHighlightDown"), () => walkRecruitHighlight("down"));

		/**
		 * M toggles a task in or out of the move set. It acts on the recruitment highlight
		 * when one is active; without one (terminals where shift-arrows never arrive), it
		 * recruits the nearest unrecruited task below the grabbed row (above at the bottom
		 * of a column). The fallback skips tasks already in the set — the collapsed block
		 * keeps recruits adjacent to the grabbed task, so pointing at the nearest neighbor
		 * would only ever toggle the first recruit off — which keeps repeated M presses
		 * growing the set and the flow fully usable with plain arrows and M alone;
		 * un-recruiting needs the shift-arrow highlight or Esc.
		 */
		const toggleRecruitSelection = () => {
			// The move set and target freeze once the confirm write is in flight.
			if (!boardSession.move || boardSession.isMovePending()) return;
			const operation = boardSession.move;

			let candidateId: string | undefined;
			if (operation.highlightTaskId) {
				candidateId = operation.highlightTaskId;
			} else {
				const column = columns.find((candidate) => candidate.status === operation.targetStatus);
				const rows = column?.tasks ?? [];
				const grabbedRow = rows.findIndex((task) => task.id === operation.taskId);
				if (grabbedRow !== -1) {
					const recruited = new Set(operation.selectedIds);
					// Cross-branch tasks can never join the set, so the walk skips them the same
					// way it skips recruits — a read-only neighbor must not dead-end the fallback.
					const nearestRecruitable = (from: number, step: number): string | undefined => {
						for (let index = from; index >= 0 && index < rows.length; index += step) {
							const row = rows[index];
							if (row && row.id !== operation.taskId && !recruited.has(row.id) && !row.branch) return row.id;
						}
						return undefined;
					};
					candidateId = nearestRecruitable(grabbedRow + 1, 1) ?? nearestRecruitable(grabbedRow - 1, -1);
				}
			}
			const targetId = candidateId;
			if (!targetId || targetId === operation.taskId) {
				showTransientFooter(" {yellow-fg}No task to select here.{/}");
				return;
			}

			// Cross-branch tasks cannot move, so they cannot be recruited either
			const targetTask = currentTasks.find((task) => task.id === targetId);
			if (targetTask?.branch) {
				showTransientFooter(` {red-fg}Cannot move task from branch "${targetTask.branch}".{/}`);
				return;
			}

			updateMoveSelection(operation, () => {
				operation.selectedIds = operation.selectedIds.includes(targetId)
					? operation.selectedIds.filter((id) => id !== targetId)
					: [...operation.selectedIds, targetId];
			});
			renderView();
		};

		bindKey(keymapKeys("board", "move"), async () => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters") return;
			if (!boardSession.move) {
				enterMoveMode();
			} else {
				// Confirm move (same as Enter in move mode)
				await performTaskMove();
			}
		});

		bindKey(keymapKeys("board", "recruit"), () => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters") return;
			if (!boardSession.move) {
				enterMoveMode();
			} else {
				toggleRecruitSelection();
			}
		});

		bindKey(keymapKeys("board", "switchView"), async () => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters") return;
			const column = columns[currentCol];
			if (column) {
				const idx = column.list.selected ?? 0;
				if (idx >= 0 && idx < column.tasks.length) {
					const task = column.tasks[idx];
					if (task) options?.onTaskSelect?.(task);
				}
			}

			if (options?.onTabPress) {
				await closeBoard(options.onTabPress);
				return;
			}

			const viewSwitcher = options?.viewSwitcher;
			if (viewSwitcher) {
				await closeBoard(() => viewSwitcher.switchView());
			}
		});

		bindKey(keymapKeys("board", "workspace"), async () => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters" || boardSession.move) return;
			if (options?.onWorkspacePress) await closeBoard(options.onWorkspacePress);
		});

		bindKey(keymapKeys("shared", "help"), async () => {
			if (popupOpen || filterPopupOpen || modalOpen || boardSession.move) return;
			await runWithModalGuard(() => openHelpPopup(screen, "board", { hasProjects: configuredProjects.length > 0 }));
		});

		bindKey(keymapKeys("board", "copy"), async () => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters") return;
			const column = columns[currentCol];
			if (!column) return;
			const idx = column.list.selected ?? 0;
			const task = column.tasks[idx];
			if (!task) return;

			const success = await copyToClipboard(task.id);
			if (success) {
				showTransientFooter(` {green-fg}Copied ${task.id} to clipboard{/}`);
			} else {
				showTransientFooter(" {red-fg}Failed to copy to clipboard{/}");
			}
		});

		bindKey(keymapKeys("board", "complete"), async () => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters" || boardSession.move) return;
			await withSelectedBoardTask(completeBoardTask);
		});

		bindKey(keymapKeys("board", "archive"), async () => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters" || boardSession.move) return;
			await withSelectedBoardTask(archiveBoardTask);
		});

		const toggleHideEmptyColumns = async () => {
			const previous = hideEmptyColumns;
			hideEmptyColumns = !hideEmptyColumns;
			renderView();

			try {
				const core = await getCore();
				const config = await core.fs.loadConfig();
				if (!config) {
					throw new Error("No config found");
				}
				await core.fs.saveConfig({ ...config, hideEmptyColumns });
			} catch (error) {
				hideEmptyColumns = previous;
				renderView();
				showTransientFooter(
					` {red-fg}Error saving hide empty columns setting: ${error instanceof Error ? error.message : "Unknown error"}{/}`,
				);
				return;
			}
			showTransientFooter(
				hideEmptyColumns ? " {green-fg}Hiding empty columns{/}" : " {green-fg}Showing empty columns{/}",
			);
		};

		// Shift+H writes the shared hideEmptyColumns setting, so the board, the browser
		// board and `backlog config` all read the same preference.
		bindKey(keymapKeys("board", "toggleHideEmpty"), () => {
			if (popupOpen || filterPopupOpen || modalOpen || currentFocus === "filters" || boardSession.move) return;
			// Ignore toggles while a write is in flight: overlapping load/save
			// cycles would write back stale config snapshots (lost updates).
			if (boardSession.pendingSettingWrite) return;
			void boardSession.beginSettingWrite(
				toggleHideEmptyColumns()
					// The toggle reports its own failures; this only keeps the exit path awaitable.
					.catch(() => {}),
			);
		});

		bindKey(keymapKeys("shared", "quitWithoutEscape"), async () => {
			// A composer can have returned while its modal guard is still unwinding. Record an
			// exit requested in that gap; closeBoard waits for the session's composer work before teardown.
			if (popupOpen || filterPopupOpen || (modalOpen && !taskCreationOpen)) return;
			await closeBoard();
		});

		bindKey(keymapKeys("shared", "escape"), async () => {
			if (popupOpen || filterPopupOpen || modalOpen) return;
			if (currentFocus === "filters") {
				focusColumn(currentCol);
				updateFooter();
				return;
			}
			// In move mode, ESC cancels and restores original position
			if (boardSession.move) {
				cancelMove();
				return;
			}

			if (!popupOpen) {
				await closeBoard();
			}
		});

		screen.render();
		options?.onReady?.();
	});
}
