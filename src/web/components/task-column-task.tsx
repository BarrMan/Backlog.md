import type React from "react";
import type { Task, TaskSummary } from "../../types";
import type { ReorderTaskPayload } from "../lib/api";
import TaskCard from "./TaskCard";
import type { DropPosition } from "./task-column-drag";

export function TaskColumnTask({
	task,
	index,
	dropPosition,
	onDropPositionChange,
	onDragStart,
	onDragEnd,
	onTaskUpdate,
	onEditTask,
	draggedTaskId,
	onTaskReorder,
	selectedTaskIds,
	onSelect,
	isSelectionDragging,
	onSelectionDragChange,
	status,
	laneId,
	availableTypes,
	availableProjects,
	dateFormat,
}: {
	task: Task | TaskSummary;
	index: number;
	dropPosition: DropPosition;
	onDropPositionChange: (position: DropPosition) => void;
	onDragStart: (taskId: string) => void;
	onDragEnd: () => void;
	onTaskUpdate: (taskId: string, updates: Partial<Task>) => void;
	onEditTask: (task: Task | TaskSummary) => void;
	draggedTaskId: string | null;
	onTaskReorder?: (payload: ReorderTaskPayload) => void;
	selectedTaskIds?: string[];
	onSelect?: (shiftKey: boolean) => void;
	isSelectionDragging?: boolean;
	onSelectionDragChange?: (active: boolean) => void;
	status: string;
	laneId?: string;
	availableTypes?: string[];
	availableProjects?: string[];
	dateFormat?: string;
}) {
	const updateDropPosition = (event: React.DragEvent) => {
		if (!onTaskReorder || !draggedTaskId) return;
		if (selectedTaskIds && selectedTaskIds.length > 1 && selectedTaskIds.includes(draggedTaskId)) return;
		event.preventDefault();
		if (draggedTaskId === task.id) return onDropPositionChange({ index, position: "self" });
		const { top, height } = event.currentTarget.getBoundingClientRect();
		onDropPositionChange({ index, position: event.clientY - top < height / 2 ? "before" : "after" });
	};
	return (
		<fieldset className="relative" onDragOver={updateDropPosition}>
			{dropPosition?.index === index && dropPosition.position === "before" && (
				<div className="h-1 bg-blue-500 rounded-full mb-2 animate-pulse" />
			)}
			<TaskCard
				task={task}
				onUpdate={onTaskUpdate}
				onEdit={onEditTask}
				isSelected={selectedTaskIds?.includes(task.id) ?? false}
				selectionCount={selectedTaskIds?.length ?? 0}
				isSelectionDragging={isSelectionDragging}
				onSelectionDragChange={onSelectionDragChange}
				onSelect={onSelect ? ({ shiftKey }) => onSelect(shiftKey) : undefined}
				onDragStart={() => onDragStart(task.id)}
				onDragEnd={onDragEnd}
				status={status}
				laneId={laneId}
				availableTypes={availableTypes}
				availableProjects={availableProjects}
				dateFormat={dateFormat}
			/>
			{dropPosition?.index === index && dropPosition.position === "after" && (
				<div className="h-1 bg-blue-500 rounded-full mt-2 animate-pulse" />
			)}
		</fieldset>
	);
}
