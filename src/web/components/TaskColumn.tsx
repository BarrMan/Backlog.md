import React from "react";
import type { Task, TaskSummary } from "../../types";
import { compareTaskIds, sortByPriority } from "../../utils/task-sorting";
import type { ReorderTaskPayload } from "../lib/api";
import { parseStoredUtcDate } from "../utils/date-display";
import { TaskColumnHeader } from "./task-column-content";
import { createTaskColumnController } from "./task-column-controller";
import type { DropPosition } from "./task-column-drag";
import { TaskColumnTask } from "./task-column-task";
import { getEmptyColumnMessage, getTaskColumnClassName } from "./task-column-view-policy";

interface TaskColumnProps {
	title: string;
	tasks: Array<Task | TaskSummary>;
	onTaskUpdate: (taskId: string, updates: Partial<Task>) => void;
	onEditTask: (task: Task | TaskSummary) => void;
	onTaskReorder?: (payload: ReorderTaskPayload) => void;
	dragSourceStatus?: string | null;
	dragSourceLane?: string | null;
	onDragStart?: (context: { status: string; laneId?: string | null }) => void;
	onDragEnd?: () => void;
	onCleanup?: () => void;
	laneId?: string;
	targetMilestone?: string | null;
	priorityOrder?: string[];
	availableTypes?: string[];
	availableProjects?: string[];
	dateFormat?: string;
	selectedTaskIds?: string[];
	selectionAnchorId?: string | null;
	onToggleTaskSelection?: (taskId: string) => void;
	onSelectTaskRange?: (taskIds: string[]) => void;
	onBatchMove?: (targetStatus: string, targetMilestone?: string | null) => void;
	isSelectionDragging?: boolean;
	onSelectionDragChange?: (active: boolean) => void;
}

type CreatedDateSortDirection = "asc" | "desc";

const getCreatedDateTime = (task: Task): number | null => {
	const parsed = parseStoredUtcDate(task.createdDate ?? "");
	return parsed ? parsed.getTime() : null;
};

const sortByCreatedDate = (tasks: Task[], direction: CreatedDateSortDirection): Task[] => {
	return tasks.slice().sort((a, b) => {
		const aTime = getCreatedDateTime(a);
		const bTime = getCreatedDateTime(b);

		if (aTime === null && bTime === null) {
			return compareTaskIds(a.id, b.id);
		}
		if (aTime === null) {
			return 1;
		}
		if (bTime === null) {
			return -1;
		}
		if (aTime !== bTime) {
			return direction === "asc" ? aTime - bTime : bTime - aTime;
		}
		return compareTaskIds(a.id, b.id);
	});
};

const TaskColumn: React.FC<TaskColumnProps> = ({
	title,
	tasks,
	onTaskUpdate,
	onEditTask,
	onTaskReorder,
	dragSourceStatus,
	dragSourceLane,
	onDragStart,
	onDragEnd,
	onCleanup,
	laneId,
	targetMilestone,
	priorityOrder,
	availableTypes,
	availableProjects,
	dateFormat,
	selectedTaskIds,
	selectionAnchorId,
	onToggleTaskSelection,
	onSelectTaskRange,
	onBatchMove,
	isSelectionDragging,
	onSelectionDragChange,
}) => {
	const [isDragOver, setIsDragOver] = React.useState(false);
	const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null);
	const [dropPosition, setDropPosition] = React.useState<DropPosition>(null);
	const [showMenu, setShowMenu] = React.useState(false);
	const menuRef = React.useRef<HTMLDivElement>(null);
	const columnActionsId = React.useId();
	const canReorderColumn = Boolean(onTaskReorder) && tasks.length > 1 && tasks.every((task) => !task.branch);
	const controller = createTaskColumnController({
		tasks,
		title,
		targetMilestone,
		onTaskReorder,
		onBatchMove,
		selectedTaskIds,
		selectionAnchorId,
		onToggleTaskSelection,
		onSelectTaskRange,
	});

	React.useEffect(() => {
		if (!showMenu) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowMenu(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showMenu]);

	const emitColumnReorder = (orderedTaskIds: string[]) => {
		if (!canReorderColumn) {
			setShowMenu(false);
			return;
		}
		controller.reorder(orderedTaskIds);
		setShowMenu(false);
	};

	const handleSortByPriority = () => {
		emitColumnReorder(sortByPriority(tasks, priorityOrder).map((t) => t.id));
	};

	const handleSortByCreatedDate = (direction: CreatedDateSortDirection) => {
		emitColumnReorder(sortByCreatedDate(tasks, direction).map((t) => t.id));
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
		setDropPosition(null);

		const droppedTaskId = e.dataTransfer.getData("text/plain");
		const sourceStatus = e.dataTransfer.getData("text/status");

		if (droppedTaskId) controller.drop(droppedTaskId, sourceStatus, dropPosition);
	};

	const handleDragEnter = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		// Only set to false if we're leaving the column entirely
		if (!e.currentTarget.contains(e.relatedTarget as Node)) {
			setIsDragOver(false);
			setDropPosition(null);
		}
	};

	const handleDragOverColumn = (e: React.DragEvent) => {
		e.preventDefault();
		// Clear drop position if dragging in empty space
		const target = e.target as HTMLElement;
		if (target === e.currentTarget || target.classList.contains("space-y-3")) {
			setDropPosition(null);
		}
	};

	const isEmpty = tasks.length === 0;

	return (
		<fieldset
			className={getTaskColumnClassName(isEmpty, isDragOver, dragSourceStatus, title, dragSourceLane, laneId)}
			onDrop={handleDrop}
			onDragOver={handleDragOverColumn}
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
		>
			<TaskColumnHeader
				title={title}
				taskCount={tasks.length}
				canReorder={canReorderColumn}
				showMenu={showMenu}
				menuRef={menuRef}
				actionsId={columnActionsId}
				onToggleMenu={() => setShowMenu(!showMenu)}
				onSort={(direction) => (direction === "priority" ? handleSortByPriority() : handleSortByCreatedDate(direction))}
			/>

			<div className="space-y-3">
				{tasks.map((task, index) => (
					<TaskColumnTask
						key={task.id}
						task={task}
						index={index}
						dropPosition={dropPosition}
						onDropPositionChange={setDropPosition}
						draggedTaskId={draggedTaskId}
						onTaskReorder={onTaskReorder}
						selectedTaskIds={selectedTaskIds}
						onTaskUpdate={onTaskUpdate}
						onEditTask={onEditTask}
						onSelect={onToggleTaskSelection ? (shiftKey) => controller.select(task, index, shiftKey) : undefined}
						isSelectionDragging={isSelectionDragging}
						onSelectionDragChange={onSelectionDragChange}
						onDragStart={(taskId) => {
							setDraggedTaskId(taskId);
							onDragStart?.({ status: title, laneId: laneId ?? null });
						}}
						onDragEnd={() => {
							setDraggedTaskId(null);
							setDropPosition(null);
							onDragEnd?.();
						}}
						status={title}
						laneId={laneId}
						availableTypes={availableTypes}
						availableProjects={availableProjects}
						dateFormat={dateFormat}
					/>
				))}

				{/* Drop zone indicator - only show in different columns */}
				{isDragOver && dragSourceStatus !== title && (
					<div className="border-2 border-green-400 dark:border-green-500 border-dashed rounded-md bg-green-50 dark:bg-green-900/20 p-4 text-center transition-colors duration-200">
						<div className="text-green-600 dark:text-green-400 text-sm font-medium transition-colors duration-200">
							Drop task here to change status
						</div>
					</div>
				)}

				{isEmpty && !isDragOver && (
					<div className="text-center py-2 text-gray-400 dark:text-gray-500 text-xs transition-colors duration-200">
						{getEmptyColumnMessage(dragSourceStatus, title)}
					</div>
				)}

				{/* Cleanup button for the configured terminal column */}
				{onCleanup && tasks.length > 0 && (
					<div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
						<button
							type="button"
							onClick={onCleanup}
							className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors duration-200"
							title="Clean up old completed tasks"
						>
							<svg
								aria-hidden="true"
								className="w-4 h-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
								/>
							</svg>
							Clean Up Old Tasks
						</button>
					</div>
				)}
			</div>
		</fieldset>
	);
};

export default TaskColumn;
