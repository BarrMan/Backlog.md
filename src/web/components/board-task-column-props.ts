import type { ComponentProps } from "react";
import type TaskColumn from "./TaskColumn";

export type BoardTaskColumnProps = Pick<
	ComponentProps<typeof TaskColumn>,
	| "onTaskUpdate"
	| "onEditTask"
	| "onTaskReorder"
	| "dragSourceStatus"
	| "dragSourceLane"
	| "onDragStart"
	| "onDragEnd"
	| "onCleanup"
	| "priorityOrder"
	| "availableTypes"
	| "availableProjects"
	| "dateFormat"
	| "selectedTaskIds"
	| "selectionAnchorId"
	| "onToggleTaskSelection"
	| "onSelectTaskRange"
	| "onBatchMove"
	| "isSelectionDragging"
	| "onSelectionDragChange"
>;

export type BoardTaskSelectionProps = Pick<
	BoardTaskColumnProps,
	| "selectedTaskIds"
	| "selectionAnchorId"
	| "onToggleTaskSelection"
	| "onSelectTaskRange"
	| "onBatchMove"
	| "isSelectionDragging"
	| "onSelectionDragChange"
>;
