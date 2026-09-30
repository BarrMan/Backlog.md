import type { ComponentProps } from "react";
import type { BoardToolbar } from "./board-toolbar";
import LabelFilterDropdown from "./LabelFilterDropdown";

type Props = ComponentProps<typeof BoardToolbar>;
type FiltersProps = Pick<
	Props,
	| "onFiltersChange"
	| "filterAssignee"
	| "filterPriority"
	| "filterType"
	| "filterProject"
	| "normalizedFilterLabels"
	| "uniqueAssignees"
	| "uniqueLabels"
	| "priorityOptions"
	| "typeOptions"
	| "projectOptions"
	| "hasActiveFilters"
>;
const selectClass =
	"min-w-[140px] h-10 py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200";
const buttonClass =
	"h-10 py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg whitespace-nowrap transition-colors duration-200 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700";

export function BoardTitle({ onNewTask }: Pick<Props, "onNewTask">) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 transition-colors duration-200">
				Kanban Board
			</h2>
			<button
				type="button"
				className="inline-flex items-center px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 dark:focus:ring-blue-500 dark:focus:ring-offset-gray-800 transition-colors duration-200"
				onClick={onNewTask}
			>
				+ New Task
			</button>
		</div>
	);
}

export function BoardSelectionControls({
	selectedTaskIds,
	batchMoveStatus,
	setBatchMoveStatus,
	onBatchMove,
	onClearSelection,
	statuses,
}: Pick<
	Props,
	"selectedTaskIds" | "batchMoveStatus" | "setBatchMoveStatus" | "onBatchMove" | "onClearSelection" | "statuses"
>) {
	if (selectedTaskIds.length === 0) return null;
	return (
		<div
			className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 px-4 py-2 transition-colors duration-200"
			role="toolbar"
			aria-label="Task selection"
		>
			<span className="text-sm font-medium text-blue-900 dark:text-blue-100">{selectedTaskIds.length} selected</span>
			<label className="sr-only" htmlFor="batch-move-status">
				Move selected tasks to
			</label>
			<select
				id="batch-move-status"
				className={selectClass}
				value={batchMoveStatus}
				onChange={(event) => setBatchMoveStatus(event.target.value)}
			>
				<option value="">Move to...</option>
				{statuses.map((status) => (
					<option key={status} value={status}>
						{status}
					</option>
				))}
			</select>
			<button
				type="button"
				className={buttonClass}
				disabled={!batchMoveStatus}
				onClick={() => onBatchMove(batchMoveStatus)}
			>
				Move
			</button>
			<button type="button" className={buttonClass} onClick={onClearSelection}>
				Clear
			</button>
		</div>
	);
}

export function BoardViewControls({
	laneMode,
	onLaneChange,
	hasTasksWithMilestones,
}: Pick<Props, "laneMode" | "onLaneChange" | "hasTasksWithMilestones">) {
	return (
		<div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-800/50 transition-colors duration-200">
			<button
				type="button"
				onClick={() => onLaneChange("none")}
				className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${laneMode === "none" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"}`}
			>
				All Tasks
			</button>
			<button
				type="button"
				onClick={() => onLaneChange("milestone")}
				disabled={!hasTasksWithMilestones}
				title={
					!hasTasksWithMilestones
						? "No tasks have milestones. Assign milestones to tasks first."
						: "Group tasks by milestone"
				}
				className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${!hasTasksWithMilestones ? "text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50" : laneMode === "milestone" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"}`}
			>
				Milestone
			</button>
		</div>
	);
}

export function BoardFilters(props: FiltersProps) {
	const {
		onFiltersChange,
		filterAssignee,
		filterPriority,
		filterType,
		filterProject,
		normalizedFilterLabels,
		uniqueAssignees,
		uniqueLabels,
		priorityOptions,
		typeOptions,
		projectOptions,
		hasActiveFilters,
	} = props;
	if (!onFiltersChange) return null;
	const change = (changes: Partial<Parameters<typeof onFiltersChange>[0]>) =>
		onFiltersChange({
			assignee: filterAssignee,
			labels: normalizedFilterLabels,
			priority: filterPriority,
			taskType: filterType,
			project: filterProject,
			...changes,
		});
	return (
		<fieldset className="flex flex-wrap items-center gap-3" aria-label="Board filters">
			<select
				aria-label="Filter board by assignee"
				value={filterAssignee}
				onChange={(event) => change({ assignee: event.target.value })}
				className={selectClass}
			>
				<option value="">All assignees</option>
				<option value="__unassigned__">Unassigned</option>
				{uniqueAssignees.map((assignee) => (
					<option key={assignee} value={assignee}>
						{assignee}
					</option>
				))}
			</select>
			<LabelFilterDropdown
				availableLabels={uniqueLabels}
				selectedLabels={normalizedFilterLabels}
				onChange={(labels) => change({ labels })}
				menuId="board-labels-filter-menu"
				className="min-w-[200px]"
			/>
			<select
				aria-label="Filter board by type"
				value={filterType}
				onChange={(event) => change({ taskType: event.target.value })}
				className={selectClass}
			>
				<option value="">All types</option>
				{typeOptions.map((type) => (
					<option key={type} value={type}>
						{type}
					</option>
				))}
			</select>
			{projectOptions.length > 0 && (
				<select
					aria-label="Filter board by project"
					value={filterProject}
					onChange={(event) => change({ project: event.target.value })}
					className={selectClass}
				>
					<option value="">All projects</option>
					{projectOptions.map((project) => (
						<option key={project} value={project}>
							{project}
						</option>
					))}
				</select>
			)}
			<select
				aria-label="Filter board by priority"
				value={filterPriority}
				onChange={(event) => change({ priority: event.target.value })}
				className={selectClass}
			>
				{priorityOptions.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
			{hasActiveFilters && (
				<button
					type="button"
					onClick={() => onFiltersChange({ assignee: "", labels: [], priority: "", taskType: "", project: "" })}
					className={buttonClass}
				>
					Clear filters
				</button>
			)}
		</fieldset>
	);
}
