import { buildKanbanStatusGroups } from "../../../board.ts";
import type { Task } from "../../../types/index.ts";
import { compareTaskIds } from "../../../utils/task-sorting.ts";
import { formatUtcDateForDisplay } from "../../../utils/utc-date-display.ts";
import { formatAcceptanceCriteriaProgress } from "../../acceptance-criteria-progress.ts";
import { formatProjectBadge } from "../../project.ts";
import { getStatusIcon } from "../../status-icon.ts";
import { formatTaskTypeBadge } from "../../task-type.ts";
import { stripBlessedFgTags } from "../../utils/strip-tags.ts";

export type ColumnData = {
	status: string;
	tasks: Task[];
};

function isDoneStatus(status: string): boolean {
	const normalized = status.trim().toLowerCase();
	return normalized === "done" || normalized === "completed" || normalized === "complete";
}

function buildColumnTasks(status: string, items: Task[], byId: Map<string, Task>): Task[] {
	const topLevel: Task[] = [];
	const childrenByParent = new Map<string, Task[]>();
	const sorted = items.slice().sort((a, b) => {
		if (typeof a.ordinal === "number" && typeof b.ordinal === "number" && a.ordinal !== b.ordinal) {
			return a.ordinal - b.ordinal;
		}
		if (typeof a.ordinal === "number" && typeof b.ordinal !== "number") return -1;
		if (typeof b.ordinal === "number" && typeof a.ordinal !== "number") return 1;
		return isDoneStatus(status) ? compareTaskIds(b.id, a.id) : compareTaskIds(a.id, b.id);
	});

	for (const task of sorted) {
		const parent = task.parentTaskId ? byId.get(task.parentTaskId) : undefined;
		if (parent && parent.status === task.status) {
			const children = childrenByParent.get(parent.id) ?? [];
			children.push(task);
			childrenByParent.set(parent.id, children);
		} else {
			topLevel.push(task);
		}
	}

	return topLevel.flatMap((task) => [
		task,
		...(childrenByParent.get(task.id) ?? []).sort((a, b) => compareTaskIds(a.id, b.id)),
	]);
}

export function prepareBoardColumns(tasks: Task[], statuses: string[]): ColumnData[] {
	const { orderedStatuses, groupedTasks } = buildKanbanStatusGroups(tasks, statuses);
	const byId = new Map<string, Task>(tasks.map((task) => [task.id, task]));
	return orderedStatuses.map((status) => ({
		status,
		tasks: buildColumnTasks(status, groupedTasks.get(status) ?? [], byId),
	}));
}

export function formatTaskListItem(
	task: Task,
	isMoving = false,
	availableWidth = Number.POSITIVE_INFINITY,
	dateFormat?: string,
	configuredProjects?: string[],
): string {
	const assignee = task.assignee?.[0]
		? ` {cyan-fg}${task.assignee[0].startsWith("@") ? task.assignee[0] : `@${task.assignee[0]}`}{/}`
		: "";
	const labels = task.labels?.length ? ` {yellow-fg}[${task.labels.join(", ")}]{/}` : "";
	const dueDate = task.dueDate ? ` {gray-fg}(due ${formatUtcDateForDisplay(task.dueDate, { dateFormat })}){/}` : "";
	const type = formatTaskTypeBadge(task.type);
	const project = formatProjectBadge(task.project, configuredProjects);
	const branch = (task as Task & { branch?: string }).branch;
	const progress = formatAcceptanceCriteriaProgress(task, availableWidth);
	const content = `${progress ? `${progress} ` : ""}{bold}${task.id}{/bold}${type ? ` ${type}` : ""}${project ? ` ${project}` : ""}${dueDate} - ${task.title}${assignee}${labels}${branch ? ` {green-fg}(${branch}){/}` : ""}`;
	if (isMoving) return `{magenta-fg}► ${content}{/}`;
	return branch ? `{gray-fg}${content}{/}` : content;
}

export function buildRenderedTaskListItems(
	tasks: Task[],
	movingTaskIds?: ReadonlySet<string>,
	availableWidth = Number.POSITIVE_INFINITY,
	dateFormat?: string,
	configuredProjects?: string[],
): { rich: string[]; plain: string[] } {
	const rich = tasks.map((task) =>
		formatTaskListItem(task, movingTaskIds?.has(task.id) ?? false, availableWidth, dateFormat, configuredProjects),
	);
	return { rich, plain: rich.map(stripBlessedFgTags) };
}

export function formatColumnLabel(status: string, count: number): string {
	return `\u00A0${getStatusIcon(status)} ${status || "No Status"} (${count})\u00A0`;
}

export function filterVisibleColumns(data: ColumnData[], hideEmptyColumns: boolean, isMoving: boolean): ColumnData[] {
	if (!hideEmptyColumns || isMoving) return data;
	const nonEmpty = data.filter((column) => column.tasks.length > 0);
	return nonEmpty.length > 0 ? nonEmpty : data;
}

export function shouldRebuildColumns(current: ColumnData[], next: ColumnData[]): boolean {
	return (
		current.length !== next.length ||
		next.some(
			(column, index) =>
				current[index]?.status !== column.status ||
				current[index]?.tasks.some((task, taskIndex) => task.id !== column.tasks[taskIndex]?.id) ||
				current[index]?.tasks.length !== column.tasks.length,
		)
	);
}

export function upsertBoardTask(tasks: readonly Task[], task: Task): Task[] {
	const existingIndex = tasks.findIndex((candidate) => candidate.id === task.id);
	if (existingIndex === -1) return [...tasks, task];
	const next = [...tasks];
	next[existingIndex] = task;
	return next;
}
