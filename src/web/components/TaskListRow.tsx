import type { Milestone, Task, TaskSummary } from "../../types";
import { formatPriorityLabel } from "../../utils/priority-config";
import { apiClient } from "../lib/api";
import { getMilestoneLabel } from "../utils/milestones";
import AcceptanceCriteriaProgress from "./AcceptanceCriteriaProgress";
import StoredDate from "./StoredDate";

interface TaskListRowProps {
	task: TaskSummary | Task;
	availablePriorities?: string[];
	milestoneEntities: Milestone[];
	dateFormat?: string;
	onEditTask: (task: TaskSummary | Task) => void;
}

function getAssigneeInitials(value: string): string {
	const cleaned = value.replace(/^@/, "").trim();
	if (!cleaned) return "?";
	const parts = cleaned
		.split(/[\s._-]+/)
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length === 0) return cleaned.slice(0, 2).toUpperCase();
	const first = parts[0] ?? "";
	if (parts.length === 1) return first.slice(0, 2).toUpperCase();
	const second = parts[1] ?? "";
	return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

function getStatusColor(status: string): string {
	switch (status.toLowerCase()) {
		case "to do":
			return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
		case "in progress":
			return "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200";
		case "done":
			return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200";
		default:
			return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
	}
}

function getPriorityColor(priority?: string): string {
	switch (priority?.toLowerCase()) {
		case "high":
			return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200";
		case "medium":
			return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200";
		case "low":
			return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200";
		default:
			return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
	}
}

export function TaskListRow({
	task,
	availablePriorities,
	milestoneEntities,
	dateFormat,
	onEditTask,
}: TaskListRowProps) {
	const isFromOtherBranch = Boolean(task.branch);
	const visibleLabels = task.labels.slice(0, 2);
	const labelOverflow = Math.max(task.labels.length - visibleLabels.length, 0);
	const visibleAssignees = task.assignee.slice(0, 2);
	const assigneeOverflow = Math.max(task.assignee.length - visibleAssignees.length, 0);
	const milestoneLabel = task.milestone ? getMilestoneLabel(task.milestone, milestoneEntities) : "—";

	return (
		<tr
			onClick={() => onEditTask(task)}
			onMouseEnter={() => void apiClient.loadTaskDetail(task.id).catch(() => {})}
			className={`cursor-pointer transition-colors ${
				isFromOtherBranch
					? "bg-amber-50/50 hover:bg-amber-100/70 dark:bg-amber-900/10 dark:hover:bg-amber-900/20"
					: "bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700/50"
			}`}
		>
			<td className="px-3 py-2.5 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{task.id}</td>
			<td className="px-3 py-2.5">
				<div className="flex items-center gap-2 min-w-0">
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							onEditTask(task);
						}}
						className={`block truncate text-sm ${isFromOtherBranch ? "text-gray-600 dark:text-gray-300" : "text-gray-900 dark:text-gray-100"} rounded text-left focus:outline-none focus:ring-2 focus:ring-stone-500`}
						title={task.title}
						aria-label={`Open ${task.id}: ${task.title}`}
					>
						{task.title}
					</button>
					{isFromOtherBranch && task.branch && (
						<span
							className="inline-flex shrink-0 items-center rounded-circle bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
							title={`Read-only task from ${task.branch} branch`}
						>
							{task.branch}
						</span>
					)}
				</div>
				<AcceptanceCriteriaProgress task={task} density="list" className="mt-1" />
				{task.dueDate && (
					<div className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
						Due: <StoredDate value={task.dueDate} dateFormat={dateFormat} />
					</div>
				)}
			</td>
			<td className="px-3 py-2.5">
				<span
					className={`inline-flex rounded-circle px-2 py-0.5 text-[11px] font-medium ${getStatusColor(task.status)}`}
				>
					{task.status}
				</span>
			</td>
			<td className="px-3 py-2.5">
				{task.priority ? (
					<span
						className={`inline-flex rounded-circle px-2 py-0.5 text-[11px] font-medium ${getPriorityColor(task.priority)}`}
					>
						{formatPriorityLabel(task.priority, availablePriorities)}
					</span>
				) : (
					<span className="text-xs text-gray-300 dark:text-gray-600">—</span>
				)}
			</td>
			<td className="px-3 py-2.5 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
				{task.ordinal !== undefined ? task.ordinal : <span className="text-gray-300 dark:text-gray-600">—</span>}
			</td>
			<td className="px-3 py-2.5">
				{visibleLabels.length > 0 ? (
					<div className="flex items-center gap-1 min-w-0">
						{visibleLabels.map((label) => (
							<span
								key={label}
								className="inline-flex max-w-[7rem] truncate rounded-circle bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 dark:bg-gray-700 dark:text-gray-200"
								title={label}
							>
								{label}
							</span>
						))}
						{labelOverflow > 0 && (
							<span className="text-[11px] text-gray-500 dark:text-gray-400">+{labelOverflow}</span>
						)}
					</div>
				) : (
					<span className="text-xs text-gray-300 dark:text-gray-600">—</span>
				)}
			</td>
			<td className="px-3 py-2.5">
				{visibleAssignees.length > 0 ? (
					<div className="flex items-center gap-1.5">
						{visibleAssignees.map((assignee) => (
							<span
								key={assignee}
								title={assignee}
								className="inline-flex h-6 w-6 items-center justify-center rounded-circle bg-blue-100 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-200"
							>
								{getAssigneeInitials(assignee)}
							</span>
						))}
						{assigneeOverflow > 0 && (
							<span className="text-[11px] text-gray-500 dark:text-gray-400">+{assigneeOverflow}</span>
						)}
					</div>
				) : (
					<span className="text-xs text-gray-300 dark:text-gray-600">—</span>
				)}
			</td>
			<td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 truncate" title={milestoneLabel}>
				{milestoneLabel}
			</td>
			<td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
				<StoredDate value={task.createdDate} dateFormat={dateFormat} compact />
			</td>
		</tr>
	);
}
