import type { Milestone } from "../../types";
import { getMilestoneLabel } from "../utils/milestones";
import LabelFilterDropdown from "./LabelFilterDropdown";

interface TaskListActionHeaderProps {
	onNewTask: () => void;
	statusOptions: string[];
	statusFilter: string[];
	excludedStatusFilter: string[];
	priorityFilter: string;
	priorityOptions: { label: string; value: string }[];
	milestoneFilter: string;
	milestoneOptions: string[];
	milestoneEntities: Milestone[];
	availableLabels: string[];
	labelFilter: string[];
	isFilteringTerminalStatus: boolean;
	hasActiveFilters: boolean;
	currentCount: number;
	totalTasks: number;
	onStatusChange: (value: string[]) => void;
	onExcludeStatusChange: (value: string[]) => void;
	onPriorityChange: (value: string) => void;
	onMilestoneChange: (value: string) => void;
	onLabelChange: (value: string[]) => void;
	onOpenCleanup: () => void;
	onClearFilters: () => void;
}

export function TaskListActionHeader(props: TaskListActionHeaderProps) {
	const {
		onNewTask,
		statusOptions,
		statusFilter,
		excludedStatusFilter,
		priorityFilter,
		priorityOptions,
		milestoneFilter,
		milestoneOptions,
		milestoneEntities,
		availableLabels,
		labelFilter,
		isFilteringTerminalStatus,
		hasActiveFilters,
		currentCount,
		totalTasks,
		onStatusChange,
		onExcludeStatusChange,
		onPriorityChange,
		onMilestoneChange,
		onLabelChange,
		onOpenCleanup,
		onClearFilters,
	} = props;
	return (
		<div className="flex flex-col gap-4 mb-6">
			<div className="flex items-center justify-between gap-3">
				<h1 className="text-2xl font-bold text-gray-900 dark:text-white">All Tasks</h1>
				<button
					type="button"
					className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 dark:focus:ring-offset-gray-900 transition-colors duration-200"
					onClick={onNewTask}
				>
					+ New Task
				</button>
			</div>
			<div className="flex flex-wrap items-center gap-3 justify-between">
				<div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
					<LabelFilterDropdown
						availableLabels={statusOptions}
						selectedLabels={statusFilter}
						onChange={onStatusChange}
						menuId="task-list-status-menu"
						label="Status"
						emptyLabel="All"
						noOptionsLabel="No statuses"
						clearLabel="Clear status filter"
						className="min-w-[180px]"
					/>
					<LabelFilterDropdown
						availableLabels={statusOptions}
						selectedLabels={excludedStatusFilter}
						onChange={onExcludeStatusChange}
						menuId="task-list-exclude-status-menu"
						label="Exclude status"
						emptyLabel="None"
						noOptionsLabel="No statuses"
						clearLabel="Clear excluded statuses"
						className="min-w-[210px]"
					/>
					<select
						value={priorityFilter}
						onChange={(event) => onPriorityChange(event.target.value)}
						className="min-w-[120px] h-10 py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
					>
						{priorityOptions.map((option) => (
							<option key={option.value || "all"} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					<select
						value={milestoneFilter}
						onChange={(event) => onMilestoneChange(event.target.value)}
						className="min-w-[160px] h-10 py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
					>
						<option value="">All milestones</option>
						<option value="__none">No milestone</option>
						{milestoneOptions.map((milestone) => (
							<option key={milestone} value={milestone}>
								{getMilestoneLabel(milestone, milestoneEntities)}
							</option>
						))}
					</select>
					<LabelFilterDropdown
						availableLabels={availableLabels}
						selectedLabels={labelFilter}
						onChange={onLabelChange}
						menuId="task-list-labels-menu"
					/>
				</div>
				<div className="flex items-center gap-3 flex-shrink-0">
					{isFilteringTerminalStatus && currentCount > 0 && (
						<button
							type="button"
							onClick={onOpenCleanup}
							className="py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 flex items-center gap-2 whitespace-nowrap"
							title="Clean up old completed tasks"
						>
							<svg
								aria-hidden="true"
								className="w-4 h-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 012 2h-2M9 5a2 2 0 012 2 2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
								/>
							</svg>
							Clean Up
						</button>
					)}
					{hasActiveFilters && (
						<button
							type="button"
							onClick={onClearFilters}
							className="py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg whitespace-nowrap transition-colors duration-200 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
						>
							Clear filters
						</button>
					)}
					<div className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap text-right min-w-[170px]">
						Showing {currentCount} of {totalTasks} tasks
					</div>
				</div>
			</div>
		</div>
	);
}
