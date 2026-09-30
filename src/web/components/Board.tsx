import type React from "react";
import { useCallback, useMemo, useState } from "react";
import type { Milestone, Task } from "../../types";
import { collectAvailableLabels } from "../../utils/label-filter";
import { getTerminalStatus } from "../../utils/terminal-status";
import { useBoardDragVisibility } from "../hooks/use-board-drag-visibility";
import { useBoardSelection } from "../hooks/use-board-selection";
import { useBoardTaskHighlight } from "../hooks/use-board-task-highlight";
import { useBoardTaskMutations } from "../hooks/use-board-task-mutations";
import { useTaskMetadataOptions } from "../hooks/use-task-metadata-options";
import { buildLanes, type LaneMode } from "../lib/lanes";
import { filterBoardTasks, hasBoardFilters } from "../utils/board-view-data";
import { canonicalizeMilestone, useMilestoneAliasMap } from "../utils/milestone-aliases";
import { collectArchivedMilestoneKeys, milestoneKey } from "../utils/milestones";
import { BoardContentState } from "./board-content-state";
import { BoardLanes } from "./board-lanes";
import { BoardToolbar } from "./board-toolbar";
import { CleanupSuccess, useCleanupSuccess } from "./CleanupSuccess";
import { useBoardLaneView } from "./use-board-lane-view";

export interface BoardProps {
	onEditTask: (task: Task) => void;
	onNewTask: () => void;
	highlightTaskId?: string | null;
	tasks: Task[];
	onRefreshData?: () => Promise<void>;
	onTasksUpdated?: (tasks: Task[], requestTask: Task) => void;
	statuses: string[];
	isLoading: boolean;
	loadingMessage?: string | null;
	loadError?: Error | null;
	milestones: string[];
	availableLabels: string[];
	milestoneEntities: Milestone[];
	archivedMilestones: Milestone[];
	laneMode: LaneMode;
	onLaneChange: (mode: LaneMode) => void;
	milestoneFilter?: string | null;
	filterAssignee?: string;
	filterLabels?: string[];
	filterPriority?: string;
	availablePriorities?: string[];
	filterType?: string;
	availableTypes?: string[];
	filterProject?: string;
	availableProjects?: string[];
	onFiltersChange?: (filters: {
		assignee: string;
		labels: string[];
		priority: string;
		taskType: string;
		project: string;
	}) => void;
	hideEmptyColumns?: boolean;
	dateFormat?: string;
}

const Board: React.FC<BoardProps> = (props) => {
	const {
		onEditTask,
		onNewTask,
		highlightTaskId,
		tasks,
		onRefreshData,
		onTasksUpdated,
		statuses,
		isLoading,
		loadingMessage,
		loadError,
		availableLabels,
		milestoneEntities,
		archivedMilestones,
		laneMode,
		onLaneChange,
		milestoneFilter,
		filterAssignee = "",
		filterLabels = [],
		filterPriority = "",
		availablePriorities,
		filterType = "",
		availableTypes,
		filterProject = "",
		availableProjects,
		onFiltersChange,
		hideEmptyColumns = false,
		dateFormat,
	} = props;
	const [updateError, setUpdateError] = useState<string | null>(null);
	const drag = useBoardDragVisibility(hideEmptyColumns);
	const cleanup = useCleanupSuccess(onRefreshData);
	const [collapsedLanes, setCollapsedLanes] = useState<Record<string, boolean>>({});
	const terminalStatus = getTerminalStatus(statuses);
	const taskMetadataOptions = useTaskMetadataOptions({ availablePriorities, availableTypes, availableProjects });
	const priorityOptions = useMemo(
		() => [{ label: "All priorities", value: "" }, ...taskMetadataOptions.priorityOptions],
		[taskMetadataOptions.priorityOptions],
	);
	const { typeOptions, projectOptions } = taskMetadataOptions;
	const archivedMilestoneIds = useMemo(
		() => collectArchivedMilestoneKeys(archivedMilestones, milestoneEntities),
		[archivedMilestones, milestoneEntities],
	);
	const milestoneAliasToCanonical = useMilestoneAliasMap(milestoneEntities, archivedMilestones);
	const canonicalMilestoneFilter = canonicalizeMilestone(milestoneFilter, milestoneAliasToCanonical);
	// Collect unique assignees and labels from all tasks for filter dropdowns
	const uniqueAssignees = useMemo(() => {
		const seen = new Set<string>();
		for (const task of tasks) {
			for (const a of task.assignee) {
				if (a.trim()) seen.add(a.trim());
			}
		}
		return Array.from(seen).sort((a, b) => a.localeCompare(b));
	}, [tasks]);

	const uniqueLabels = useMemo(() => collectAvailableLabels(tasks, availableLabels), [tasks, availableLabels]);
	const normalizedFilterLabels = useMemo(
		() => filterLabels.map((label) => label.trim()).filter(Boolean),
		[filterLabels],
	);

	const boardFilters = useMemo(
		() => ({
			assignee: filterAssignee,
			labels: filterLabels,
			priority: filterPriority,
			type: filterType,
			project: filterProject,
			milestone: milestoneFilter,
		}),
		[filterAssignee, filterLabels, filterPriority, filterType, filterProject, milestoneFilter],
	);
	const hasActiveFilters = hasBoardFilters(boardFilters);
	const filteredTasks = useMemo(
		() => filterBoardTasks(tasks, boardFilters, milestoneAliasToCanonical),
		[tasks, boardFilters, milestoneAliasToCanonical],
	);

	useBoardTaskHighlight(highlightTaskId, tasks, onEditTask);

	const { handleTaskUpdate, handleTaskReorder } = useBoardTaskMutations({
		tasks,
		onRefreshData,
		onTasksUpdated,
		onError: setUpdateError,
	});

	// Use all tasks for building lanes (so we can show/collapse other milestones)
	const lanes = useMemo(
		() =>
			buildLanes(
				laneMode,
				tasks,
				milestoneEntities.map((milestone) => milestone.id),
				milestoneEntities,
				{
					archivedMilestoneIds,
					archivedMilestones,
				},
			),
		[laneMode, tasks, milestoneEntities, archivedMilestoneIds, archivedMilestones],
	);

	// Check if any tasks actually have milestones assigned
	const hasTasksWithMilestones = useMemo(() => {
		if (archivedMilestoneIds.length === 0) {
			return tasks.some((task) => task.milestone && task.milestone.trim() !== "");
		}
		const archivedKeys = new Set(archivedMilestoneIds.map((value) => milestoneKey(value)));
		return tasks.some((task) => {
			const key = milestoneKey(canonicalizeMilestone(task.milestone, milestoneAliasToCanonical));
			return key.length > 0 && !archivedKeys.has(key);
		});
	}, [tasks, archivedMilestoneIds, milestoneAliasToCanonical]);

	const { displayTasksByLane, laneTaskCount, getLaneProgress, visibleStatuses } = useBoardLaneView({
		laneMode,
		lanes,
		statuses,
		tasks,
		filteredTasks,
		hasActiveFilters,
		milestoneFilter,
		archivedMilestoneIds,
		milestoneEntities,
		archivedMilestones,
		hideEmptyColumns,
		hiddenColumnsRevealed: drag.hiddenColumnsRevealed,
	});
	const getTasksForLane = (laneKey: string, status: string): Task[] =>
		displayTasksByLane.get(laneKey)?.get(status) ?? [];
	// Filter out empty lanes in milestone mode
	const visibleLanes = useMemo(() => {
		if (laneMode !== "milestone") return lanes;
		return lanes.filter((l) => laneTaskCount(l.key) > 0);
	}, [laneMode, lanes, laneTaskCount]);

	// Only show lane headers when multiple lanes exist
	const shouldShowLaneHeaders = useMemo(() => {
		if (laneMode !== "milestone") return false;
		return visibleLanes.length > 1;
	}, [laneMode, visibleLanes]);

	// Determine if a lane should be collapsed (respects milestoneFilter)
	const isLaneCollapsed = useCallback(
		(laneKey: string, laneMilestone?: string): boolean => {
			// If user manually toggled, respect that
			if (collapsedLanes[laneKey] !== undefined) {
				return collapsedLanes[laneKey];
			}
			// When filtering by milestone, collapse all other lanes by default
			if (
				milestoneFilter &&
				canonicalizeMilestone(laneMilestone, milestoneAliasToCanonical) !== canonicalMilestoneFilter
			) {
				return true;
			}
			return false;
		},
		[canonicalMilestoneFilter, collapsedLanes, milestoneAliasToCanonical, milestoneFilter],
	);
	const visibleTaskIds = useMemo(() => {
		const ids = new Set(filteredTasks.map((task) => task.id));
		if (laneMode !== "milestone") return ids;
		for (const lane of lanes) {
			if (!isLaneCollapsed(lane.key, lane.milestone)) continue;
			for (const tasksInStatus of displayTasksByLane.get(lane.key)?.values() ?? []) {
				for (const task of tasksInStatus) ids.delete(task.id);
			}
		}
		return ids;
	}, [displayTasksByLane, filteredTasks, laneMode, lanes, isLaneCollapsed]);
	const selection = useBoardSelection({
		tasks,
		statuses,
		milestoneAliases: milestoneAliasToCanonical,
		onTasksUpdated,
		onRefreshData,
		onError: setUpdateError,
		visibleTaskIds,
	});

	const getLaneLabel = (lane: (typeof lanes)[0]): string => {
		if (lane.isNoMilestone || !lane.milestone) {
			return "Unassigned";
		}
		return lane.label;
	};

	const toggleLaneCollapse = (laneKey: string) => {
		setCollapsedLanes((prev) => ({
			...prev,
			[laneKey]: !prev[laneKey],
		}));
	};

	// Dynamic layout using flexbox:
	// - Columns are flex items with equal growth (flex-1) to divide space evenly
	// - A minimum width keeps columns readable; beyond available space, container scrolls horizontally
	// - Works uniformly for any number of columns without per-count conditionals

	const selectionProps = {
		selectedTaskIds: selection.selectedTaskIds,
		selectionAnchorId: selection.selectionAnchorId,
		onToggleTaskSelection: selection.toggleTaskSelection,
		onSelectTaskRange: selection.selectTaskRange,
		onBatchMove: selection.handleBatchMove,
		isSelectionDragging: selection.isSelectionDragging,
		onSelectionDragChange: selection.setIsSelectionDragging,
	};

	return (
		<section
			className="w-full"
			aria-label="Task board"
			tabIndex={-1}
			onClick={(event) => {
				if (selection.selectedTaskIds.length > 0 && event.target === event.currentTarget) selection.clearSelection();
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") selection.clearSelection();
			}}
		>
			{updateError && (
				<div className="mb-4 rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200 transition-colors duration-200">
					{updateError}
				</div>
			)}
			<BoardToolbar
				onNewTask={onNewTask}
				laneMode={laneMode}
				onLaneChange={onLaneChange}
				hasTasksWithMilestones={hasTasksWithMilestones}
				selectedTaskIds={selection.selectedTaskIds}
				batchMoveStatus={selection.batchMoveStatus}
				setBatchMoveStatus={selection.setBatchMoveStatus}
				onBatchMove={selection.handleBatchMove}
				onClearSelection={selection.clearSelection}
				statuses={statuses}
				onFiltersChange={onFiltersChange}
				filterAssignee={filterAssignee}
				filterPriority={filterPriority}
				filterType={filterType}
				filterProject={filterProject}
				normalizedFilterLabels={normalizedFilterLabels}
				uniqueAssignees={uniqueAssignees}
				uniqueLabels={uniqueLabels}
				priorityOptions={priorityOptions}
				typeOptions={typeOptions}
				projectOptions={projectOptions}
				hasActiveFilters={hasActiveFilters}
			/>
			<BoardContentState
				loadError={loadError}
				isLoading={isLoading}
				loadingMessage={loadingMessage}
				columnCount={statuses.length}
				onRefreshData={onRefreshData}
			>
				<BoardLanes
					laneMode={laneMode}
					lanes={visibleLanes}
					visibleStatuses={visibleStatuses}
					shouldShowLaneHeaders={shouldShowLaneHeaders}
					getTasksForLane={getTasksForLane}
					laneTaskCount={laneTaskCount}
					getLaneProgress={getLaneProgress}
					isLaneCollapsed={isLaneCollapsed}
					getLaneLabel={getLaneLabel}
					onToggleLaneCollapse={toggleLaneCollapse}
					onTaskUpdate={handleTaskUpdate}
					onEditTask={onEditTask}
					onTaskReorder={handleTaskReorder}
					dragSourceStatus={drag.dragSourceStatus}
					dragSourceLane={drag.dragSourceLane}
					onDragStart={drag.handleDragStart}
					onDragEnd={drag.handleDragEnd}
					onCleanup={cleanup.openCleanup}
					terminalStatus={terminalStatus}
					priorityOrder={availablePriorities}
					availableTypes={typeOptions}
					availableProjects={projectOptions}
					dateFormat={dateFormat}
					selection={selectionProps}
				/>
			</BoardContentState>

			<CleanupSuccess
				isOpen={cleanup.isCleanupOpen}
				onClose={cleanup.closeCleanup}
				onSuccess={cleanup.handleCleanupSuccess}
				message={cleanup.message}
				onDismiss={cleanup.dismissMessage}
				dateFormat={dateFormat}
			/>
		</section>
	);
};

export default Board;
