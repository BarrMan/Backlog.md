import type { Task, TaskSummary } from "../../types";
import { formatPriorityLabel } from "../../utils/priority-config";
import AcceptanceCriteriaProgress, { getAcceptanceCriteriaProgressCounts } from "./AcceptanceCriteriaProgress";
import ProjectBadge from "./ProjectBadge";
import StoredDate from "./StoredDate";
import TaskTypeBadge from "./TaskTypeBadge";

type TaskCardContentProps = {
	task: Task | TaskSummary;
	isFromOtherBranch: boolean;
	availableTypes?: string[];
	availableProjects?: string[];
	dateFormat?: string;
};

const PRIORITY_BADGES: Record<string, { bg: string; text: string; label: string }> = {
	high: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300", label: "High" },
	medium: { bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-700 dark:text-yellow-300", label: "Med" },
	low: { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300", label: "Low" },
};

function formatRelativeDate(dateValue: string): string {
	const hasTime = dateValue.includes(" ") || dateValue.includes("T");
	const date = new Date(dateValue.replace(" ", "T") + (hasTime ? ":00Z" : "T00:00:00Z"));
	const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
	if (diffDays === 0) return "today";
	if (diffDays === 1) return "yesterday";
	if (diffDays < 7) return `${diffDays}d ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
	if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
	return `${Math.floor(diffDays / 365)}y ago`;
}

function getPriorityBadge(priority?: string) {
	if (!priority) return null;
	return (
		PRIORITY_BADGES[priority] ?? {
			bg: "bg-gray-100 dark:bg-gray-600",
			text: "text-gray-700 dark:text-gray-200",
			label: formatPriorityLabel(priority),
		}
	);
}

function BranchBanner({ branch }: { branch: string }) {
	return (
		<div className="flex items-center gap-1.5 mb-2 px-2 py-1 -mx-1 -mt-1 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700 rounded-t text-xs text-amber-700 dark:text-amber-300">
			<svg
				aria-hidden="true"
				className="w-3.5 h-3.5 flex-shrink-0"
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
			<span className="truncate">
				From <span className="font-semibold">{branch}</span> branch
			</span>
		</div>
	);
}

export function TaskCardContent({
	task,
	isFromOtherBranch,
	availableTypes,
	availableProjects,
	dateFormat,
}: TaskCardContentProps) {
	const progress = getAcceptanceCriteriaProgressCounts(task);
	const priorityBadge = getPriorityBadge(task.priority);
	return (
		<>
			{isFromOtherBranch && task.branch && <BranchBanner branch={task.branch} />}
			<div className="flex items-center justify-between gap-2 mb-1.5">
				<div className="flex min-w-0 items-center gap-2">
					<span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 font-mono transition-colors duration-200">
						{task.id}
					</span>
					<TaskTypeBadge type={task.type} availableTypes={availableTypes} className="min-w-0" />
					<ProjectBadge project={task.project} availableProjects={availableProjects} className="min-w-0" />
				</div>
				{(progress || priorityBadge) && (
					<div className="flex shrink-0 items-center gap-2">
						<AcceptanceCriteriaProgress task={task} density="card" />
						{priorityBadge && (
							<span
								className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${priorityBadge.bg} ${priorityBadge.text} transition-colors duration-200`}
							>
								{priorityBadge.label}
							</span>
						)}
					</div>
				)}
			</div>
			<h4
				className={`font-semibold text-sm line-clamp-2 transition-colors duration-200 ${isFromOtherBranch ? "text-gray-600 dark:text-gray-400" : "text-gray-900 dark:text-gray-100"}`}
			>
				{task.title}
			</h4>
			{task.labels.length > 0 && (
				<div className="flex flex-wrap gap-1 mt-2">
					{task.labels.slice(0, 3).map((label) => (
						<span
							key={label}
							className="inline-block px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded transition-colors duration-200"
						>
							{label}
						</span>
					))}
					{task.labels.length > 3 && (
						<span className="inline-block px-1.5 py-0.5 text-[10px] text-gray-400 dark:text-gray-500">
							+{task.labels.length - 3}
						</span>
					)}
				</div>
			)}
			<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-gray-400 dark:text-gray-500 mt-2 pt-1.5 border-t border-gray-100 dark:border-gray-600/50 transition-colors duration-200">
				<span>{formatRelativeDate(task.createdDate)}</span>
				{task.dueDate && (
					<span>
						Due: <StoredDate value={task.dueDate} dateFormat={dateFormat} />
					</span>
				)}
				{task.assignee.length > 0 && (
					<span className="truncate max-w-[80px]" title={task.assignee.join(", ")}>
						{task.assignee[0]}
					</span>
				)}
			</div>
		</>
	);
}
