import type React from "react";
import { Link } from "react-router-dom";
import type { Milestone, MilestoneBucket, Task } from "../../types";
import MilestoneCardWorkflows from "../features/milestones/MilestoneCardWorkflows";
import { isDoneStatus } from "../utils/milestones";
import MilestoneTaskRow from "./MilestoneTaskRow";
import StoredDate from "./StoredDate";

interface MilestoneCardProps {
	bucket: MilestoneBucket;
	statuses: string[];
	milestone?: Milestone;
	dateFormat?: string;
	milestoneEntities: Milestone[];
	onRefreshData?: () => Promise<void>;
	isExpanded: boolean;
	isDragging: boolean;
	isDropTarget: boolean;
	onToggle: () => void;
	onDragOver: (event: React.DragEvent) => void;
	onDragLeave: () => void;
	onDrop: (event: React.DragEvent) => void;
	onEditTask: (task: Task) => void;
	onDragStart: (event: React.DragEvent, task: Task) => void;
	onDragEnd: (event: React.DragEvent) => void;
}

const statusClass = (status?: string | null) =>
	status?.toLowerCase().includes("done") || status?.toLowerCase().includes("complete")
		? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
		: status?.toLowerCase().includes("progress")
			? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
			: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300";
const priorityClass = (priority?: string) =>
	priority?.toLowerCase() === "high"
		? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
		: priority?.toLowerCase() === "medium"
			? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300"
			: priority?.toLowerCase() === "low"
				? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
				: "";
const statusTextClass = (status: string) =>
	status.toLowerCase().includes("done") || status.toLowerCase().includes("complete")
		? "text-emerald-700 dark:text-emerald-300"
		: status.toLowerCase().includes("progress")
			? "text-blue-700 dark:text-blue-300"
			: "text-gray-600 dark:text-gray-400";
const statusColor = (status: string) =>
	status.toLowerCase().includes("done") || status.toLowerCase().includes("complete")
		? "#10b981"
		: status.toLowerCase().includes("progress")
			? "#3b82f6"
			: "#6b7280";
const safeIdSegment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const MilestoneCardContent: React.FC<
	Pick<MilestoneCardProps, "bucket" | "statuses" | "milestone" | "dateFormat" | "isDragging">
> = ({ bucket, statuses, milestone, dateFormat, isDragging }) => {
	const isEmpty = bucket.total === 0;
	const progress = isEmpty ? 0 : Math.round((bucket.doneCount / bucket.total) * 100);
	return (
		<>
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{bucket.label}</h3>
					{milestone?.dueDate && (
						<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
							Due: <StoredDate value={milestone.dueDate} dateFormat={dateFormat} />
						</p>
					)}
				</div>
				{isEmpty ? (
					<span className="text-sm text-gray-400 dark:text-gray-500">{isDragging ? "Drop here" : "No tasks"}</span>
				) : (
					<div className="flex items-center gap-3">
						<span className="text-sm text-gray-500 dark:text-gray-400">
							{bucket.total} task{bucket.total === 1 ? "" : "s"}
						</span>
						<span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{progress}%</span>
					</div>
				)}
			</div>
			{!isEmpty && (
				<>
					<div className="mt-3 w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
						<div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
					</div>
					<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
						{statuses.map((status) => {
							const count = bucket.statusCounts[status] ?? 0;
							return count === 0 ? null : (
								<span key={status} className={`inline-flex items-center gap-1.5 ${statusTextClass(status)}`}>
									<span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(status) }} />
									{count} {status}
								</span>
							);
						})}
					</div>
				</>
			)}
		</>
	);
};

const MilestoneCardActions: React.FC<
	Pick<MilestoneCardProps, "bucket" | "isExpanded" | "onToggle" | "milestoneEntities" | "onRefreshData">
> = ({ bucket, isExpanded, milestoneEntities, onRefreshData, onToggle }) => {
	const listId = `milestone-${safeIdSegment(bucket.key)}`;
	return (
		<div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-700 pt-4">
			<div className="flex items-center gap-2">
				<Link
					to={`/?lane=milestone&milestone=${encodeURIComponent(bucket.milestone ?? "")}`}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
				>
					Board
				</Link>
				<Link
					to={`/tasks?milestone=${encodeURIComponent(bucket.milestone ?? "")}`}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
				>
					List
				</Link>
				<MilestoneCardWorkflows bucket={bucket} milestoneEntities={milestoneEntities} onRefreshData={onRefreshData} />
			</div>
			<button
				type="button"
				aria-expanded={isExpanded}
				aria-controls={listId}
				onClick={onToggle}
				className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400"
			>
				{isExpanded ? "Hide" : "Show"} tasks
			</button>
		</div>
	);
};

const MilestoneCard: React.FC<MilestoneCardProps> = (props) => {
	const {
		bucket,
		isExpanded,
		isDragging,
		isDropTarget,
		onDragOver,
		onDragLeave,
		onDrop,
		onEditTask,
		onDragStart,
		onDragEnd,
	} = props;
	const tasks = bucket.tasks
		.slice()
		.sort(
			(a, b) =>
				Number(isDoneStatus(a.status)) - Number(isDoneStatus(b.status)) ||
				(b.createdDate ?? "").localeCompare(a.createdDate ?? ""),
		);
	const listId = `milestone-${safeIdSegment(bucket.key)}`;
	return (
		<fieldset
			className={`rounded-lg border-2 transition-all duration-200 ${isDropTarget ? "border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.01]" : isDragging ? "border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"}`}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			<div className="px-5 py-4">
				<MilestoneCardContent {...props} />
				<MilestoneCardActions {...props} />
				{isExpanded && bucket.total > 0 && (
					<div id={listId} className="mt-4 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
						<div className="divide-y divide-gray-200 dark:divide-gray-700">
							{tasks.slice(0, 10).map((task) => (
								<MilestoneTaskRow
									key={task.id}
									task={task}
									isDone={isDoneStatus(task.status)}
									statusBadgeClass={statusClass(task.status)}
									priorityBadgeClass={priorityClass(task.priority)}
									onEditTask={onEditTask}
									onDragStart={onDragStart}
									onDragEnd={onDragEnd}
								/>
							))}
						</div>
						{tasks.length > 10 && (
							<div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
								<Link
									to={`/tasks?milestone=${encodeURIComponent(bucket.milestone ?? "")}`}
									className="text-blue-600 dark:text-blue-400 hover:underline"
								>
									View all {tasks.length} tasks →
								</Link>
							</div>
						)}
					</div>
				)}
			</div>
		</fieldset>
	);
};

export default MilestoneCard;
