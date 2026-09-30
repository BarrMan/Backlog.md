import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_STATUSES } from "../../constants/index.ts";
import type { Milestone, Task } from "../../types";
import { collectAvailableLabels } from "../../utils/label-filter.ts";
import { getPriorityOptions } from "../../utils/priority-config.ts";
import { isTerminalStatus } from "../../utils/terminal-status.ts";
import { useMilestoneAliasMap } from "../utils/milestone-aliases";
import { collectArchivedMilestoneKeys, milestoneKey } from "../utils/milestones";
import { CleanupSuccess, useCleanupSuccess } from "./CleanupSuccess";
import { TaskListActionHeader } from "./TaskListActionHeader";
import { TaskListEmptyState } from "./TaskListEmptyState";
import { TaskListRow } from "./TaskListRow";
import { TaskListTableHeader } from "./TaskListTableHeader";
import { type SortDirection, sortDisplayTasks, type TaskSortColumn } from "./task-list-sorting";
import { useTaskListDisplayController } from "./use-task-list-display-controller";
import { useTaskListFilters } from "./use-task-list-filters";

interface TaskListProps {
	onEditTask: (task: Task) => void;
	onNewTask: () => void;
	tasks: Task[];
	availableStatuses: string[];
	availableLabels: string[];
	availableMilestones: string[];
	availablePriorities?: string[];
	milestoneEntities: Milestone[];
	archivedMilestones: Milestone[];
	onRefreshData?: () => Promise<void>;
	dateFormat?: string;
	isLoading?: boolean;
}

// Column widths in rem, in render order: ID, Title, Status, Priority, Ordinal, Labels,
// Assignee, Milestone, Created. Each metadata column is sized to the wider of its header
// label and its cell content; Title is the one flexible column (null) and absorbs whatever
// the content area has left, so the table fits a laptop viewport instead of overflowing it.
const TASK_COLUMN_WIDTHS_REM: readonly (number | null)[] = [6, null, 6.5, 6.5, 6, 8, 6.5, 8, 6];

// Below this the table scrolls horizontally rather than crushing the columns.
const TASK_TITLE_MIN_WIDTH_REM = 12;
const TASK_TABLE_MIN_WIDTH_REM = TASK_COLUMN_WIDTHS_REM.reduce<number>(
	(total, width) => total + (width ?? TASK_TITLE_MIN_WIDTH_REM),
	0,
);

const TaskList: React.FC<TaskListProps> = ({
	onEditTask,
	onNewTask,
	tasks,
	availableStatuses,
	availableLabels,
	availableMilestones,
	availablePriorities,
	milestoneEntities,
	archivedMilestones,
	onRefreshData,
	dateFormat,
	isLoading = false,
}) => {
	const statusOptions = useMemo(
		() => (availableStatuses.length > 0 ? availableStatuses : [...DEFAULT_STATUSES]),
		[availableStatuses],
	);
	const filters = useTaskListFilters(statusOptions, availablePriorities, isLoading);
	const { statusFilter, excludedStatusFilter, priorityFilter, milestoneFilter, labelFilter } = filters;
	const cleanup = useCleanupSuccess(onRefreshData);
	const [sortColumn, setSortColumn] = useState<TaskSortColumn>("id");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
	const priorityOptions = useMemo(
		() => [{ label: "All priorities", value: "" }, ...getPriorityOptions(availablePriorities)],
		[availablePriorities],
	);
	const tableHeaderScrollRef = useRef<HTMLDivElement | null>(null);
	const tableBodyScrollRef = useRef<HTMLDivElement | null>(null);
	const isSyncingTableScrollRef = useRef(false);
	const isFilteringTerminalStatus = statusFilter.some((status) => isTerminalStatus(status, statusOptions));
	const milestoneAliasToCanonical = useMilestoneAliasMap(milestoneEntities, archivedMilestones);
	const archivedMilestoneKeys = useMemo(
		() =>
			new Set(collectArchivedMilestoneKeys(archivedMilestones, milestoneEntities).map((value) => milestoneKey(value))),
		[archivedMilestones, milestoneEntities],
	);

	const mergedAvailableLabels = useMemo(() => collectAvailableLabels(tasks, availableLabels), [tasks, availableLabels]);
	const milestoneOptions = useMemo(() => {
		const uniqueMilestones = Array.from(new Set([...availableMilestones.map((m) => m.trim()).filter(Boolean)]));
		return uniqueMilestones;
	}, [availableMilestones]);
	const { displayTasks, error, hasActiveFilters, reset, sortedBaseTasks } = useTaskListDisplayController({
		tasks,
		statusFilter,
		excludedStatusFilter,
		priorityFilter,
		labelFilter,
		milestoneFilter,
		milestoneAliases: milestoneAliasToCanonical,
		archivedMilestoneKeys,
	});
	const totalTasks = sortedBaseTasks.length;

	const handleClearFilters = () => {
		filters.clear();
		reset();
	};

	const handleSortChange = (column: TaskSortColumn) => {
		if (sortColumn === column) {
			setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
			return;
		}

		setSortColumn(column);
		setSortDirection(column === "id" || column === "created" ? "desc" : "asc");
	};

	const renderColumnGroup = () => (
		<colgroup>
			{TASK_COLUMN_WIDTHS_REM.map((width, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: the column order is static
				<col key={index} style={width === null ? undefined : { width: `${width}rem` }} />
			))}
		</colgroup>
	);

	const sortedDisplayTasks = useMemo(
		() => sortDisplayTasks(displayTasks, sortColumn, sortDirection, availablePriorities, milestoneEntities),
		[availablePriorities, displayTasks, milestoneEntities, sortColumn, sortDirection],
	);

	const currentCount = sortedDisplayTasks.length;

	useEffect(() => {
		const headerEl = tableHeaderScrollRef.current;
		const bodyEl = tableBodyScrollRef.current;
		if (!headerEl || !bodyEl) return;

		const syncScrollLeft = (source: HTMLDivElement, target: HTMLDivElement) => {
			if (isSyncingTableScrollRef.current) return;
			isSyncingTableScrollRef.current = true;
			target.scrollLeft = source.scrollLeft;
			isSyncingTableScrollRef.current = false;
		};

		const handleHeaderScroll = () => syncScrollLeft(headerEl, bodyEl);
		const handleBodyScroll = () => syncScrollLeft(bodyEl, headerEl);

		headerEl.addEventListener("scroll", handleHeaderScroll, { passive: true });
		bodyEl.addEventListener("scroll", handleBodyScroll, { passive: true });
		headerEl.scrollLeft = bodyEl.scrollLeft;

		return () => {
			headerEl.removeEventListener("scroll", handleHeaderScroll);
			bodyEl.removeEventListener("scroll", handleBodyScroll);
		};
	}, []);

	return (
		<div className="page-shell transition-colors duration-200">
			<TaskListActionHeader
				onNewTask={onNewTask}
				statusOptions={statusOptions}
				statusFilter={statusFilter}
				excludedStatusFilter={excludedStatusFilter}
				priorityFilter={priorityFilter}
				priorityOptions={priorityOptions}
				milestoneFilter={milestoneFilter}
				milestoneOptions={milestoneOptions}
				milestoneEntities={milestoneEntities}
				availableLabels={mergedAvailableLabels}
				labelFilter={labelFilter}
				isFilteringTerminalStatus={isFilteringTerminalStatus}
				hasActiveFilters={hasActiveFilters}
				currentCount={currentCount}
				totalTasks={totalTasks}
				onStatusChange={filters.handleStatusChange}
				onExcludeStatusChange={filters.handleExcludeStatusChange}
				onPriorityChange={filters.handlePriorityChange}
				onMilestoneChange={filters.handleMilestoneChange}
				onLabelChange={filters.handleLabelChange}
				onOpenCleanup={cleanup.openCleanup}
				onClearFilters={handleClearFilters}
			/>
			{error && (
				<div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
					{error}
				</div>
			)}

			{currentCount === 0 ? (
				<TaskListEmptyState hasActiveFilters={hasActiveFilters} />
			) : (
				<div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
					<div className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/90 supports-[backdrop-filter]:dark:bg-gray-700/85">
						<div ref={tableHeaderScrollRef} className="overflow-x-auto" style={{ overflowY: "hidden" }}>
							<table
								className="w-full table-fixed border-collapse"
								style={{ minWidth: `${TASK_TABLE_MIN_WIDTH_REM}rem` }}
							>
								{renderColumnGroup()}
								<TaskListTableHeader
									sortColumn={sortColumn}
									sortDirection={sortDirection}
									onSortChange={handleSortChange}
								/>
							</table>
						</div>
					</div>
					<div ref={tableBodyScrollRef} className="overflow-x-auto" style={{ overflowY: "hidden" }}>
						<table
							className="w-full table-fixed border-collapse"
							style={{ minWidth: `${TASK_TABLE_MIN_WIDTH_REM}rem` }}
						>
							{renderColumnGroup()}
							<tbody className="divide-y divide-gray-200 dark:divide-gray-700">
								{sortedDisplayTasks.map((task) => (
									<TaskListRow
										key={task.id}
										task={task}
										availablePriorities={availablePriorities}
										milestoneEntities={milestoneEntities}
										dateFormat={dateFormat}
										onEditTask={onEditTask}
									/>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			<CleanupSuccess
				isOpen={cleanup.isCleanupOpen}
				onClose={cleanup.closeCleanup}
				onSuccess={cleanup.handleCleanupSuccess}
				message={cleanup.message}
				onDismiss={cleanup.dismissMessage}
				dateFormat={dateFormat}
			/>
		</div>
	);
};

export default TaskList;
