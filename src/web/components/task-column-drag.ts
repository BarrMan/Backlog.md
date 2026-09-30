import type { Task } from "../../types";

export type DropPosition = { index: number; position: "before" | "after" | "self" } | null;

export function getDropOrderedTaskIds(tasks: Task[], droppedTaskId: string, dropPosition: DropPosition): string[] {
	const tasksWithoutDropped = tasks.filter((task) => task.id !== droppedTaskId);
	if (!dropPosition) return [...tasksWithoutDropped.map((task) => task.id), droppedTaskId];

	const baseIndex = dropPosition.position === "after" ? dropPosition.index + 1 : dropPosition.index;
	const insertIndex = tasks
		.slice(0, Math.min(baseIndex, tasks.length))
		.filter((task) => task.id !== droppedTaskId).length;
	const orderedTaskIds = tasksWithoutDropped.map((task) => task.id);
	orderedTaskIds.splice(insertIndex, 0, droppedTaskId);
	return orderedTaskIds;
}

export function isUnchangedColumnOrder(
	tasks: Task[],
	orderedTaskIds: string[],
	sourceStatus: string,
	targetStatus: string,
): boolean {
	return (
		sourceStatus === targetStatus &&
		orderedTaskIds.length === tasks.length &&
		orderedTaskIds.every((taskId, index) => taskId === tasks[index]?.id)
	);
}
