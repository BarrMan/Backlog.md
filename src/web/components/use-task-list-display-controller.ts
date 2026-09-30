import { useEffect, useMemo, useState } from "react";
import type { Task, TaskSearchResult } from "../../types";
import { apiClient } from "../lib/api";
import { canonicalizeMilestone } from "../utils/milestone-aliases";
import { milestoneKey } from "../utils/milestones";
import { sortTasksByIdDescending } from "./task-list-sorting";

type Options = {
	tasks: Task[];
	statusFilter: string[];
	excludedStatusFilter: string[];
	priorityFilter: string;
	labelFilter: string[];
	milestoneFilter: string;
	milestoneAliases: Map<string, string>;
	archivedMilestoneKeys: Set<string>;
};

export function useTaskListDisplayController({
	tasks,
	statusFilter,
	excludedStatusFilter,
	priorityFilter,
	labelFilter,
	milestoneFilter,
	milestoneAliases,
	archivedMilestoneKeys,
}: Options) {
	const sortedBaseTasks = useMemo(() => sortTasksByIdDescending(tasks), [tasks]);
	const [displayTasks, setDisplayTasks] = useState<Task[]>(sortedBaseTasks);
	const [error, setError] = useState<string | null>(null);
	const hasActiveFilters = Boolean(
		statusFilter.length || excludedStatusFilter.length || priorityFilter || labelFilter.length || milestoneFilter,
	);

	useEffect(() => {
		if (!hasActiveFilters) {
			setDisplayTasks(sortedBaseTasks);
			setError(null);
			return;
		}
		const filterByMilestone = (list: Task[]) =>
			list.filter((task) => {
				const filter = canonicalizeMilestone(milestoneFilter, milestoneAliases);
				if (!filter) return true;
				const milestone = canonicalizeMilestone(task.milestone, milestoneAliases);
				const visibleMilestone = archivedMilestoneKeys.has(milestoneKey(milestone)) ? "" : milestone;
				return filter === "__none" ? !visibleMilestone : visibleMilestone === filter;
			});
		const usesApi = Boolean(statusFilter.length || excludedStatusFilter.length || priorityFilter || labelFilter.length);
		let cancelled = false;
		setError(null);
		if (!usesApi) {
			setDisplayTasks(filterByMilestone(sortedBaseTasks));
			return;
		}
		void apiClient
			.search({
				types: ["task"],
				status: statusFilter.length ? statusFilter : undefined,
				excludeStatus: excludedStatusFilter.length ? excludedStatusFilter : undefined,
				priority: priorityFilter || undefined,
				labels: labelFilter.length ? labelFilter : undefined,
			})
			.then((results) => {
				if (!cancelled)
					setDisplayTasks(
						sortTasksByIdDescending(
							filterByMilestone(
								results
									.filter((result): result is TaskSearchResult => result.type === "task")
									.map((result) => result.task),
							),
						),
					);
			})
			.catch((error) => {
				console.error("Failed to apply task filters:", error);
				if (!cancelled) {
					setDisplayTasks([]);
					setError("Unable to fetch tasks for the selected filters.");
				}
			});
		return () => {
			cancelled = true;
		};
	}, [
		archivedMilestoneKeys,
		excludedStatusFilter,
		hasActiveFilters,
		labelFilter,
		milestoneAliases,
		milestoneFilter,
		priorityFilter,
		sortedBaseTasks,
		statusFilter,
	]);
	return {
		displayTasks,
		error,
		hasActiveFilters,
		reset: () => {
			setDisplayTasks(sortedBaseTasks);
			setError(null);
		},
		sortedBaseTasks,
	};
}
