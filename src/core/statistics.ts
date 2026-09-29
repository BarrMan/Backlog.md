import { DEFAULT_DONE_STATUS } from "../constants/index.ts";
import type { Task } from "../types/index.ts";
import { getPriorityValues, normalizePriorityValue } from "../utils/priority-config.ts";
import { MILLISECONDS_PER_DAY } from "../utils/time.ts";

const RECENT_ACTIVITY_DAYS = 7;
const STALE_TASK_DAYS = 30;
const HEALTH_TASK_LIMIT = 5;

function taskAgeInDays(task: Task, now: Date): number | null {
	if (!task.createdDate) return null;
	const created = new Date(task.createdDate);
	const end = task.status === DEFAULT_DONE_STATUS && task.updatedDate ? new Date(task.updatedDate) : now;
	return Math.floor((end.getTime() - created.getTime()) / MILLISECONDS_PER_DAY);
}

function hasBlockingDependency(task: Task, tasksById: Map<string, Task>): boolean {
	return Boolean(
		task.dependencies?.some((dependencyId) => {
			const dependency = tasksById.get(dependencyId);
			return dependency?.status !== DEFAULT_DONE_STATUS;
		}),
	);
}

export interface TaskStatistics {
	statusCounts: Map<string, number>;
	priorityCounts: Map<string, number>;
	noPriorityCount: number;
	totalTasks: number;
	completedTasks: number;
	completionPercentage: number;
	draftCount: number;
	recentActivity: {
		created: Task[];
		updated: Task[];
	};
	projectHealth: {
		averageTaskAge: number;
		staleTasks: Task[];
		blockedTasks: Task[];
	};
}

/**
 * Calculate comprehensive task statistics for the overview
 */
export function getTaskStatistics(
	tasks: Task[],
	drafts: Task[],
	statuses: string[],
	priorityOrder?: readonly string[],
): TaskStatistics {
	const statusCounts = new Map<string, number>();
	const priorityCounts = new Map<string, number>();

	// Initialize status counts
	for (const status of statuses) {
		statusCounts.set(status, 0);
	}

	// Initialize priority counts
	for (const priority of getPriorityValues(priorityOrder)) {
		priorityCounts.set(priority, 0);
	}

	let completedTasks = 0;
	let noPriorityCount = 0;
	const now = new Date();
	const recentActivityCutoff = new Date(now.getTime() - RECENT_ACTIVITY_DAYS * MILLISECONDS_PER_DAY);
	const staleTaskCutoff = new Date(now.getTime() - STALE_TASK_DAYS * MILLISECONDS_PER_DAY);

	const recentlyCreated: Task[] = [];
	const recentlyUpdated: Task[] = [];
	const staleTasks: Task[] = [];
	const blockedTasks: Task[] = [];
	let totalAge = 0;
	let taskCount = 0;
	const tasksById = new Map(tasks.map((task) => [task.id, task]));

	// Process each task
	for (const task of tasks) {
		// Skip tasks with empty or undefined status
		if (!task.status || task.status === "") {
			continue;
		}

		// Count by status
		const currentCount = statusCounts.get(task.status) || 0;
		statusCounts.set(task.status, currentCount + 1);

		// Count completed tasks
		if (task.status === DEFAULT_DONE_STATUS) {
			completedTasks++;
		}

		// Count by priority
		const priority = normalizePriorityValue(task.priority);
		if (priority) {
			const priorityCount = priorityCounts.get(priority) || 0;
			priorityCounts.set(priority, priorityCount + 1);
		} else {
			noPriorityCount++;
		}

		// Track recent activity
		if (task.createdDate) {
			if (new Date(task.createdDate) >= recentActivityCutoff) {
				recentlyCreated.push(task);
			}
			const ageInDays = taskAgeInDays(task, now);
			if (ageInDays !== null) {
				totalAge += ageInDays;
				taskCount++;
			}
		}

		if (task.updatedDate) {
			const updatedDate = new Date(task.updatedDate);
			if (updatedDate >= recentActivityCutoff) {
				recentlyUpdated.push(task);
			}
		}

		// Identify stale tasks (not updated in 30 days and not done)
		if (task.status !== DEFAULT_DONE_STATUS) {
			const lastDate = task.updatedDate || task.createdDate;
			if (lastDate) {
				const date = new Date(lastDate);
				if (date < staleTaskCutoff) {
					staleTasks.push(task);
				}
			}
		}

		// Identify blocked tasks (has dependencies that are not done)
		if (task.dependencies?.length && task.status !== DEFAULT_DONE_STATUS) {
			if (hasBlockingDependency(task, tasksById)) {
				blockedTasks.push(task);
			}
		}
	}

	// Sort recent activity by date
	recentlyCreated.sort((a, b) => {
		const dateA = new Date(a.createdDate || 0);
		const dateB = new Date(b.createdDate || 0);
		return dateB.getTime() - dateA.getTime();
	});

	recentlyUpdated.sort((a, b) => {
		const dateA = new Date(a.updatedDate || 0);
		const dateB = new Date(b.updatedDate || 0);
		return dateB.getTime() - dateA.getTime();
	});

	// Calculate average task age
	const averageTaskAge = taskCount > 0 ? Math.round(totalAge / taskCount) : 0;

	// Calculate completion percentage (only count tasks with valid status)
	const totalTasks = Array.from(statusCounts.values()).reduce((sum, count) => sum + count, 0);
	const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

	return {
		statusCounts,
		priorityCounts,
		noPriorityCount,
		totalTasks,
		completedTasks,
		completionPercentage,
		draftCount: drafts.length,
		recentActivity: {
			created: recentlyCreated.slice(0, HEALTH_TASK_LIMIT),
			updated: recentlyUpdated.slice(0, HEALTH_TASK_LIMIT),
		},
		projectHealth: {
			averageTaskAge,
			staleTasks: staleTasks.slice(0, HEALTH_TASK_LIMIT),
			blockedTasks: blockedTasks.slice(0, HEALTH_TASK_LIMIT),
		},
	};
}
