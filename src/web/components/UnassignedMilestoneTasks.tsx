import type React from "react";
import type { MilestoneBucket, Task } from "../../types";
import { isDoneStatus } from "../utils/milestones";
import MilestoneTaskRow from "./MilestoneTaskRow";

interface UnassignedMilestoneTasksProps {
	bucket: MilestoneBucket | undefined;
	isSearchActive: boolean;
	isExpanded: boolean;
	showAll: boolean;
	onToggleExpanded: () => void;
	onToggleShowAll: () => void;
	onEditTask: (task: Task) => void;
	onDragStart: (event: React.DragEvent, task: Task) => void;
	onDragEnd: (event: React.DragEvent) => void;
}

const statusBadgeClass = (status?: string) => {
	const normalized = status?.toLowerCase() ?? "";
	if (normalized.includes("done") || normalized.includes("complete"))
		return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300";
	if (normalized.includes("progress")) return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
	return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
};

const priorityBadgeClass = (priority?: string) => {
	switch (priority?.toLowerCase()) {
		case "high":
			return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
		case "medium":
			return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300";
		case "low":
			return "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
		default:
			return "";
	}
};

const UnassignedMilestoneTasks: React.FC<UnassignedMilestoneTasksProps> = ({
	bucket,
	isSearchActive,
	isExpanded,
	showAll,
	onToggleExpanded,
	onToggleShowAll,
	onEditTask,
	onDragStart,
	onDragEnd,
}) => {
	if (!bucket || (!isSearchActive && bucket.total === 0)) return null;

	const activeTasks = bucket.tasks
		.filter((task) => !isDoneStatus(task.status))
		.slice()
		.sort((a, b) => (b.createdDate ?? "").localeCompare(a.createdDate ?? ""));
	const displayTasks = showAll ? activeTasks : activeTasks.slice(0, 12);
	const hasMore = activeTasks.length > 12;

	return (
		<div className="mb-8 rounded-lg border border-gray-300 bg-gray-50 transition-colors duration-200 dark:border-gray-600 dark:bg-gray-800/50">
			<div className="px-5 py-4">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<svg
							aria-hidden="true"
							className="h-4 w-4 text-gray-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Unassigned tasks</h3>
						<span className="text-sm text-gray-500 dark:text-gray-400">({activeTasks.length})</span>
					</div>
					<button
						type="button"
						onClick={onToggleExpanded}
						className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
					>
						{isExpanded ? "Collapse" : "Expand"}
						<svg
							aria-hidden="true"
							className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
						</svg>
					</button>
				</div>

				{isExpanded && (
					<div className="mt-4">
						{activeTasks.length > 0 ? (
							<>
								<div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
									<div className="grid grid-cols-[auto_auto_1fr_auto_auto] gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium tracking-wider text-gray-500 uppercase dark:border-gray-700 dark:bg-gray-700/50 dark:text-gray-400">
										<div className="w-6" />
										<div className="w-24">ID</div>
										<div>Title</div>
										<div className="w-24 text-center">Status</div>
										<div className="w-20 text-center">Priority</div>
									</div>
									<div className="divide-y divide-gray-200 dark:divide-gray-700">
										{displayTasks.map((task) => (
											<MilestoneTaskRow
												key={task.id}
												task={task}
												isDone={isDoneStatus(task.status)}
												statusBadgeClass={statusBadgeClass(task.status)}
												priorityBadgeClass={priorityBadgeClass(task.priority)}
												onEditTask={onEditTask}
												onDragStart={onDragStart}
												onDragEnd={onDragEnd}
											/>
										))}
									</div>
									{hasMore && (
										<div className="border-t border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-700/30">
											<button
												type="button"
												onClick={onToggleShowAll}
												className="text-blue-600 hover:underline dark:text-blue-400"
											>
												{showAll ? "Show less ↑" : `Show all ${activeTasks.length} tasks ↓`}
											</button>
										</div>
									)}
								</div>
								<p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
									Drag tasks to a milestone below to assign them
								</p>
							</>
						) : (
							<p className="rounded-md border border-dashed border-gray-300 bg-white/70 px-4 py-3 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
								{isSearchActive
									? "No matching unassigned tasks."
									: "No active unassigned tasks. Completed tasks are hidden."}
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default UnassignedMilestoneTasks;
