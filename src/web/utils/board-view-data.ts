import type { Task } from "../../types";
import { labelsToLower } from "../../utils/label-filter";
import { normalizePriorityValue } from "../../utils/priority-config";
import { matchesProjectFilter } from "../../utils/project-config";
import { matchesTaskTypeFilter } from "../../utils/task-type-config";
import { canonicalizeMilestone } from "./milestone-aliases";

export function hasBoardFilters(filters: {
	assignee: string;
	labels: string[];
	priority: string;
	type: string;
	project: string;
}) {
	return Boolean(filters.assignee || filters.labels.length || filters.priority || filters.type || filters.project);
}

function matchesMilestone(
	task: Task,
	milestone: string | null | undefined,
	canonicalMilestone: string | undefined,
	milestoneAliases: Map<string, string>,
) {
	return !milestone || canonicalizeMilestone(task.milestone, milestoneAliases) === canonicalMilestone;
}

function matchesAssignee(task: Task, assignee: string) {
	if (assignee === "__unassigned__") return !task.assignee?.some((value) => value.trim());
	return !assignee || task.assignee.some((value) => value.trim() === assignee);
}

function matchesLabels(task: Task, selectedLabels: Set<string>) {
	return !selectedLabels.size || labelsToLower(task.labels).some((label) => selectedLabels.has(label));
}

function matchesMetadata(
	task: Task,
	filters: { priority: string; type: string; project: string },
	normalizedPriority: string | undefined,
) {
	return (
		(!filters.priority || normalizePriorityValue(task.priority) === normalizedPriority) &&
		(!filters.type || matchesTaskTypeFilter(task.type, filters.type)) &&
		(!filters.project || matchesProjectFilter(task.project, filters.project))
	);
}

export function filterBoardTasks(
	tasks: Task[],
	filters: {
		assignee: string;
		labels: string[];
		priority: string;
		type: string;
		project: string;
		milestone?: string | null;
	},
	milestoneAliases: Map<string, string>,
) {
	const normalizedLabels = filters.labels.map((label) => label.trim()).filter(Boolean);
	const selectedLabels = new Set(labelsToLower(normalizedLabels));
	const normalizedPriority = normalizePriorityValue(filters.priority);
	const canonicalMilestone = canonicalizeMilestone(filters.milestone, milestoneAliases);
	return tasks.filter(
		(task) =>
			matchesMilestone(task, filters.milestone, canonicalMilestone, milestoneAliases) &&
			matchesAssignee(task, filters.assignee) &&
			matchesLabels(task, selectedLabels) &&
			matchesMetadata(task, filters, normalizedPriority),
	);
}
