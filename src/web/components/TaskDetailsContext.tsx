import type React from "react";
import type { Task } from "../../types";
import { createUrlPath } from "../utils/urlHelpers";
import { HierarchyChevron, HierarchyStatusBadge } from "./TaskDetailsContent";

export function TaskDetailsContext({
	branch,
	parentTask,
	task,
	availableStatuses,
	onNavigateToTask,
	onConfirmNavigation,
}: {
	branch?: string;
	parentTask: Task | null;
	task?: Task;
	availableStatuses: string[];
	onNavigateToTask?: (task: Task) => void;
	onConfirmNavigation: (event: React.MouseEvent<HTMLElement>) => void;
}) {
	return (
		<>
			{branch && (
				<div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
					<svg
						aria-hidden="true"
						className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
						/>
					</svg>
					<div className="flex-1">
						<span className="font-medium">Read-only:</span> This task exists in the{" "}
						<span className="font-semibold">{branch}</span> branch. Switch to that branch to edit it.
					</div>
				</div>
			)}
			{parentTask && task && (
				<nav aria-label="Task hierarchy" className="mb-4" data-task-hierarchy onClickCapture={onConfirmNavigation}>
					<ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
						<li className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Parent</li>
						<li className="min-w-0 max-w-full">
							<button
								type="button"
								onClick={() => onNavigateToTask?.(parentTask)}
								disabled={!onNavigateToTask}
								data-parent-task-id={parentTask.id}
								data-parent-task-href={createUrlPath("/tasks", parentTask.id, parentTask.title)}
								className="group inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1 text-left text-gray-700 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-default disabled:hover:bg-transparent dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white"
								aria-label={`Open parent task ${parentTask.id}: ${parentTask.title} (${parentTask.status})`}
							>
								<span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">{parentTask.id}</span>
								<span className="min-w-0 break-words font-medium">{parentTask.title}</span>
								<HierarchyStatusBadge status={parentTask.status} statuses={availableStatuses} />
							</button>
						</li>
						<li aria-hidden="true">
							<HierarchyChevron />
						</li>
						<li aria-current="page" className="font-mono text-xs text-gray-500 dark:text-gray-400">
							{task.id}
						</li>
					</ol>
				</nav>
			)}
		</>
	);
}
