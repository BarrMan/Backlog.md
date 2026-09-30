import type { Milestone, Task } from "../../types";
import { getPriorityRank } from "../../utils/priority-config";
import { compareTaskIds, compareTaskIdsDescending } from "../../utils/task-sorting";
import { parseStoredUtcDate } from "../utils/date-display";
import { getMilestoneLabel } from "../utils/milestones";

export type TaskSortColumn = "id" | "title" | "status" | "priority" | "ordinal" | "milestone" | "created";
export type SortDirection = "asc" | "desc";

export function sortTasksByIdDescending(tasks: Task[]): Task[] {
	return [...tasks].sort((a, b) => compareTaskIdsDescending(a.id, b.id));
}

function compareOptionalNumbers(left: number | undefined, right: number | undefined, direction: SortDirection): number {
	if (left === undefined && right === undefined) return 0;
	if (left === undefined) return 1;
	if (right === undefined) return -1;
	return direction === "asc" ? left - right : right - left;
}

function compareTasks(
	a: Task,
	b: Task,
	sortColumn: TaskSortColumn,
	sortDirection: SortDirection,
	availablePriorities: string[] | undefined,
	milestones: Milestone[],
	collator: Intl.Collator,
): number {
	const withDirection = (value: number) => (sortDirection === "asc" ? value : -value);
	switch (sortColumn) {
		case "id":
			return sortDirection === "asc" ? compareTaskIds(a.id, b.id) : compareTaskIdsDescending(a.id, b.id);
		case "title":
			return withDirection(collator.compare(a.title, b.title));
		case "status":
			return withDirection(collator.compare(a.status, b.status));
		case "priority":
			return withDirection(
				getPriorityRank(a.priority, availablePriorities) - getPriorityRank(b.priority, availablePriorities),
			);
		case "ordinal":
			return compareOptionalNumbers(a.ordinal, b.ordinal, sortDirection);
		case "milestone":
			return withDirection(
				collator.compare(getMilestoneLabel(a.milestone, milestones), getMilestoneLabel(b.milestone, milestones)),
			);
		case "created":
			return compareOptionalNumbers(
				parseStoredUtcDate(a.createdDate)?.getTime(),
				parseStoredUtcDate(b.createdDate)?.getTime(),
				sortDirection,
			);
	}
}

export function sortDisplayTasks(
	tasks: Task[],
	sortColumn: TaskSortColumn,
	sortDirection: SortDirection,
	availablePriorities: string[] | undefined,
	milestones: Milestone[],
): Task[] {
	const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

	return [...tasks].sort((a, b) => {
		const result = compareTasks(a, b, sortColumn, sortDirection, availablePriorities, milestones, collator);
		if (result !== 0) return result;
		return sortColumn === "ordinal" ? compareTaskIds(a.id, b.id) : compareTaskIdsDescending(a.id, b.id);
	});
}
