import type React from "react";
import type { Task } from "../../types";
import { useTaskCardDrag } from "../hooks/use-task-card-drag";
import { formatBrowserShortcutAriaKeys, matchesBrowserShortcut } from "../lib/keyboard-shortcuts";
import { getAcceptanceCriteriaProgressCounts } from "./AcceptanceCriteriaProgress";
import { TaskCardContent } from "./task-card-content";

interface TaskCardProps {
	task: Task;
	onUpdate: (taskId: string, updates: Partial<Task>) => void;
	onEdit: (task: Task) => void;
	onDragStart?: () => void;
	onDragEnd?: () => void;
	status?: string;
	laneId?: string;
	availableTypes?: string[];
	availableProjects?: string[];
	dateFormat?: string;
	isSelected?: boolean;
	selectionCount?: number;
	onSelect?: (event: { shiftKey: boolean }) => void;
	isSelectionDragging?: boolean;
	onSelectionDragChange?: (active: boolean) => void;
}

function priorityBorder(priority?: string): string {
	return (
		{
			high: "border-l-4 border-l-red-500 dark:border-l-red-400",
			medium: "border-l-4 border-l-yellow-500 dark:border-l-yellow-400",
			low: "border-l-4 border-l-green-500 dark:border-l-green-400",
		}[priority ?? ""] ?? "border-l-4 border-l-gray-300 dark:border-l-gray-600"
	);
}

function BranchTooltip({ branch }: { branch: string }) {
	return (
		<div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-50 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-md shadow-lg whitespace-nowrap">
			Switch to <span className="font-semibold text-amber-300">{branch}</span> branch to move this task
		</div>
	);
}

const TaskCard: React.FC<TaskCardProps> = (props) => {
	const {
		task,
		onEdit,
		status,
		laneId,
		availableTypes,
		availableProjects,
		dateFormat,
		isSelected = false,
		selectionCount = 0,
		onSelect,
		isSelectionDragging = false,
	} = props;
	const drag = useTaskCardDrag({
		task,
		status,
		laneId,
		isSelected,
		selectionCount,
		onSelect,
		onDragStart: props.onDragStart,
		onDragEnd: props.onDragEnd,
		onSelectionDragChange: props.onSelectionDragChange,
	});
	const progress = getAcceptanceCriteriaProgressCounts(task);
	const accessibleLabel = progress
		? `Open ${task.id}: ${task.title}. Acceptance criteria progress: ${progress.checked} of ${progress.total}`
		: `Open ${task.id}: ${task.title}`;
	const selectOrEdit = (event: React.MouseEvent) => {
		if (onSelect && !drag.isFromOtherBranch && (event.ctrlKey || event.metaKey || event.shiftKey)) {
			event.preventDefault();
			event.stopPropagation();
			onSelect({ shiftKey: event.shiftKey });
			return;
		}
		onEdit(task);
	};
	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (matchesBrowserShortcut(event, "selectTaskCard")) {
			event.preventDefault();
			if (onSelect && !drag.isFromOtherBranch) onSelect({ shiftKey: event.shiftKey });
			return;
		}
		if (matchesBrowserShortcut(event, "activateTaskCard")) {
			event.preventDefault();
			onEdit(task);
		}
	};
	return (
		<div className="relative">
			{drag.showBranchTooltip && drag.isFromOtherBranch && task.branch && <BranchTooltip branch={task.branch} />}
			<button
				type="button"
				className={`bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md p-3 mb-2 transition-all duration-200 ${drag.isFromOtherBranch ? "opacity-75 cursor-not-allowed border-dashed" : "cursor-pointer hover:shadow-md dark:hover:shadow-lg hover:border-stone-500 dark:hover:border-stone-400"} ${priorityBorder(task.priority)} ${drag.isDragging || (isSelected && isSelectionDragging) ? "opacity-50 transform rotate-2 scale-105" : ""} ${isSelected ? "ring-2 ring-blue-500 dark:ring-blue-400 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30" : ""}`}
				aria-pressed={isSelected}
				draggable={!drag.isFromOtherBranch}
				tabIndex={0}
				aria-label={accessibleLabel}
				aria-keyshortcuts={formatBrowserShortcutAriaKeys("activateTaskCard")}
				onDragStart={drag.handleDragStart}
				onDragEnd={drag.handleDragEnd}
				onClick={selectOrEdit}
				onKeyDown={handleKeyDown}
			>
				<TaskCardContent
					task={task}
					isFromOtherBranch={drag.isFromOtherBranch}
					availableTypes={availableTypes}
					availableProjects={availableProjects}
					dateFormat={dateFormat}
				/>
			</button>
		</div>
	);
};

export default TaskCard;
