import type { Task } from "../../types";
import type { ReorderTaskPayload } from "../lib/api";
import { type DropPosition, getDropOrderedTaskIds, isUnchangedColumnOrder } from "./task-column-drag";

type Options = {
	tasks: Task[];
	title: string;
	targetMilestone?: string | null;
	onTaskReorder?: (payload: ReorderTaskPayload) => void;
	onBatchMove?: (status: string, milestone?: string | null) => void;
	selectedTaskIds?: string[];
	selectionAnchorId?: string | null;
	onToggleTaskSelection?: (id: string) => void;
	onSelectTaskRange?: (ids: string[]) => void;
};

export function createTaskColumnController({
	tasks,
	title,
	targetMilestone,
	onTaskReorder,
	onBatchMove,
	selectedTaskIds,
	selectionAnchorId,
	onToggleTaskSelection,
	onSelectTaskRange,
}: Options) {
	const reorder = (orderedTaskIds: string[]) => {
		if (!onTaskReorder) return;
		if (orderedTaskIds.some((id, index) => id !== tasks[index]?.id) && orderedTaskIds[0]) {
			onTaskReorder({
				taskId: orderedTaskIds[0],
				targetStatus: title,
				orderedTaskIds,
				...(targetMilestone !== undefined ? { targetMilestone } : {}),
			});
		}
	};
	return {
		reorder,
		drop: (taskId: string, sourceStatus: string, position: DropPosition) => {
			if (selectedTaskIds && selectedTaskIds.length > 1 && selectedTaskIds.includes(taskId) && onBatchMove) {
				onBatchMove(title, targetMilestone);
				return;
			}
			if (!onTaskReorder) return;
			const orderedTaskIds = getDropOrderedTaskIds(tasks, taskId, position);
			if (!isUnchangedColumnOrder(tasks, orderedTaskIds, sourceStatus, title)) reorder(orderedTaskIds);
		},
		select: (task: Task, index: number, shiftKey: boolean) => {
			const anchorIndex = selectionAnchorId ? tasks.findIndex((candidate) => candidate.id === selectionAnchorId) : -1;
			if (shiftKey && onSelectTaskRange && anchorIndex !== -1) {
				const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
				onSelectTaskRange(
					tasks
						.slice(from, to + 1)
						.filter((candidate) => !candidate.branch)
						.map((candidate) => candidate.id),
				);
				return;
			}
			onToggleTaskSelection?.(task.id);
		},
	};
}
