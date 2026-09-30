import type { TaskStatistics } from "../../core/statistics";
import type { Task } from "../../types";
import { formatPriorityLabel } from "../../utils/priority-config";
import MetricRow from "./MetricRow";
import StoredDate from "./StoredDate";

type Statistics = Omit<TaskStatistics, "statusCounts" | "priorityCounts"> & {
	statusCounts: Record<string, number>;
	priorityCounts: Record<string, number>;
};
type TaskListProps = {
	tasks: Task[];
	date: "created" | "updated";
	onEditTask?: (task: Task) => void;
	dateFormat?: string;
};

const CARD_CLASS = "bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700";
const statusColor = (status: string) =>
	({
		"to do": "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200",
		"in progress": "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
		done: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",
	})[status.toLowerCase()] ?? "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200";
const priorityColor = (priority: string) =>
	({
		high: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
		medium: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200",
		low: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
		none: "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200",
	})[priority.toLowerCase()] ?? "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200";

const StatusIcon = ({ status }: { status: string }) => (
	<span
		className={`w-4 h-4 rounded-circle ${status.toLowerCase() === "done" ? "bg-green-500" : status.toLowerCase() === "in progress" ? "bg-blue-500" : "bg-gray-400"}`}
	/>
);
const PriorityIcon = ({ priority }: { priority: string }) => (
	<span
		className={`w-4 h-4 rounded-circle ${priority.toLowerCase() === "high" ? "bg-red-500" : priority.toLowerCase() === "medium" ? "bg-yellow-500" : priority.toLowerCase() === "low" ? "bg-blue-500" : "bg-gray-400"}`}
	/>
);

export const MetricsOverview = ({ statistics }: { statistics: Statistics }) => (
	<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
		<MetricCard label="Total Tasks" value={statistics.totalTasks} tone="blue" />
		<MetricCard label="Completed" value={statistics.completedTasks} tone="green" />
		<MetricCard label="Completion" value={`${statistics.completionPercentage}%`} tone="purple" />
		<MetricCard label="Drafts" value={statistics.draftCount} tone="orange" />
	</div>
);

const MetricCard = ({ label, value, tone }: { label: string; value: string | number; tone: string }) => (
	<div className={`${CARD_CLASS} p-6`}>
		<div className="flex items-center">
			<div className={`w-12 h-12 rounded-lg bg-${tone}-100 dark:bg-${tone}-900/30`} />
			<div className="ml-4">
				<p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
				<p className="text-gray-600 dark:text-gray-400 text-sm">{label}</p>
			</div>
		</div>
	</div>
);

export const ProgressOverview = ({ statistics }: { statistics: Statistics }) => (
	<section className={`${CARD_CLASS} p-6`}>
		<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Overall Progress</h3>
		<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-circle h-4 mb-2">
			<div
				className="bg-gradient-to-r from-blue-500 to-green-500 h-4 rounded-circle transition-all duration-300"
				style={{ width: `${statistics.completionPercentage}%` }}
			/>
		</div>
		<div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
			<span>{statistics.completedTasks} completed</span>
			<span>{statistics.totalTasks - statistics.completedTasks} remaining</span>
		</div>
	</section>
);

export const DistributionSections = ({ statistics }: { statistics: Statistics }) => {
	const priorities = [
		...Object.entries(statistics.priorityCounts).map(([priority, count]) => ({
			priority,
			label: formatPriorityLabel(priority),
			count,
		})),
		{ priority: "", label: "No Priority", count: statistics.noPriorityCount },
	].filter(({ count }) => count > 0);
	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
			<Distribution title="Status Distribution">
				{Object.entries(statistics.statusCounts)
					.filter(([, count]) => count > 0)
					.map(([status, count]) => (
						<MetricRow
							key={status}
							icon={<StatusIcon status={status} />}
							label={status}
							labelClassName={statusColor(status)}
							count={count}
							total={statistics.totalTasks}
							barClassName="bg-blue-500"
						/>
					))}
			</Distribution>
			<Distribution title="Priority Distribution">
				{priorities.map(({ priority, label, count }) => (
					<MetricRow
						key={priority || "no-priority"}
						icon={<PriorityIcon priority={priority} />}
						label={label}
						labelClassName={priorityColor(priority)}
						count={count}
						total={statistics.totalTasks}
						barClassName="bg-yellow-500"
					/>
				))}
			</Distribution>
		</div>
	);
};

const Distribution = ({ title, children }: { title: string; children: React.ReactNode }) => (
	<section className={`${CARD_CLASS} p-6`}>
		<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
		<div className="space-y-4">{children}</div>
	</section>
);

export const ActivitySections = ({
	activity,
	onEditTask,
	dateFormat,
}: {
	activity: Statistics["recentActivity"];
	onEditTask?: (task: Task) => void;
	dateFormat?: string;
}) => (
	<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
		<TaskList
			title="Recently Created"
			empty="No recently created tasks"
			tasks={activity.created}
			date="created"
			onEditTask={onEditTask}
			dateFormat={dateFormat}
		/>
		<TaskList
			title="Recently Updated"
			empty="No recently updated tasks"
			tasks={activity.updated}
			date="updated"
			onEditTask={onEditTask}
			dateFormat={dateFormat}
		/>
	</div>
);

const TaskList = ({ title, empty, tasks, ...props }: TaskListProps & { title: string; empty: string }) => (
	<section className={`${CARD_CLASS} p-6`}>
		<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
		{tasks.length ? (
			<div className="space-y-3">
				{tasks.map((task) => (
					<TaskPreview key={task.id} task={task} {...props} />
				))}
			</div>
		) : (
			<p className="text-gray-500 dark:text-gray-400 text-sm">{empty}</p>
		)}
	</section>
);

const TaskPreview = ({ task, date, onEditTask, dateFormat }: Omit<TaskListProps, "tasks"> & { task: Task }) => {
	const value = date === "created" ? task.createdDate : task.updatedDate || task.createdDate;
	return (
		<button
			type="button"
			className={`w-full flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-left ${onEditTask ? "hover:bg-gray-100 dark:hover:bg-gray-600/50 cursor-pointer" : "cursor-default"}`}
			onClick={() => onEditTask?.(task)}
			disabled={!onEditTask}
		>
			<StatusIcon status={task.status} />
			<div className="flex-1 min-w-0">
				<p className="font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
				<p className="text-sm text-gray-500 dark:text-gray-400">
					{task.id} • {date === "created" ? "Created" : "Updated"} <StoredDate value={value} dateFormat={dateFormat} />
				</p>
			</div>
		</button>
	);
};

export const ProjectHealth = ({
	health,
	onEditTask,
	dateFormat,
}: {
	health: Statistics["projectHealth"];
	onEditTask?: (task: Task) => void;
	dateFormat?: string;
}) => (
	<section className={`${CARD_CLASS} p-4`}>
		<div className="flex items-center justify-between">
			<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Project Health</h3>
			<div className="flex items-center space-x-4 text-sm">
				<span className="text-gray-600 dark:text-gray-400">
					Avg age: <strong className="text-gray-900 dark:text-gray-100">{health.averageTaskAge}d</strong>
				</span>
				<HealthCount count={health.staleTasks.length} label="stale" tone="yellow" />
				<HealthCount count={health.blockedTasks.length} label="blocked" tone="red" />
				{!health.staleTasks.length && !health.blockedTasks.length && (
					<span className="font-medium text-green-700 dark:text-green-400">All good!</span>
				)}
			</div>
		</div>
		{(health.staleTasks.length > 0 || health.blockedTasks.length > 0) && (
			<div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-1 lg:grid-cols-2 gap-6">
				<HealthTasks
					title="Stale Tasks (&gt;30 days)"
					tasks={health.staleTasks}
					date="updated"
					onEditTask={onEditTask}
					dateFormat={dateFormat}
				/>
				<HealthTasks
					title="Blocked Tasks"
					tasks={health.blockedTasks}
					date="created"
					onEditTask={onEditTask}
					dateFormat={dateFormat}
				/>
			</div>
		)}
	</section>
);

const HealthCount = ({ count, label, tone }: { count: number; label: string; tone: string }) =>
	count ? (
		<span className={`font-medium text-${tone}-700 dark:text-${tone}-400`}>
			{count} {label}
		</span>
	) : null;
const HealthTasks = ({ title, tasks, ...props }: TaskListProps & { title: string }) =>
	tasks.length ? (
		<div>
			<h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 text-sm">{title}</h4>
			<div className="space-y-2">
				{tasks.slice(0, 3).map((task) => (
					<TaskPreview key={task.id} task={task} {...props} />
				))}
				{tasks.length > 3 && (
					<p className="text-xs text-gray-500 dark:text-gray-400 px-3">+{tasks.length - 3} more tasks</p>
				)}
			</div>
		</div>
	) : null;
