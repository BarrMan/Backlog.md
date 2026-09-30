import { useCallback, useEffect, useState } from "react";
import type { Task } from "../../types";
import { resolveTaskById } from "../../utils/task-id";
import { apiClient } from "../lib/api";
import { isEditableKeyboardTarget, matchesBrowserShortcut } from "../lib/keyboard-shortcuts";
import { sortTasksForStatus } from "../lib/lanes";
import { canonicalizeMilestone } from "../utils/milestone-aliases";

type BoardSelectionOptions = {
	tasks: Task[];
	statuses: string[];
	milestoneAliases: Map<string, string>;
	onTasksUpdated?: (tasks: Task[], requestTask: Task) => void;
	onRefreshData?: () => Promise<void>;
	onError: (message: string | null) => void;
	onTaskSelected?: (taskId: string) => void;
	visibleTaskIds: Set<string>;
};

export function useBoardSelection({
	tasks,
	statuses,
	milestoneAliases,
	onTasksUpdated,
	onRefreshData,
	onError,
	onTaskSelected,
	visibleTaskIds,
}: BoardSelectionOptions) {
	const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
	const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
	const [isSelectionDragging, setIsSelectionDragging] = useState(false);
	const [batchMoveStatus, setBatchMoveStatus] = useState("");
	const clearSelection = useCallback(() => {
		setSelectedTaskIds([]);
		setSelectionAnchorId(null);
		setIsSelectionDragging(false);
	}, []);
	const toggleTaskSelection = useCallback(
		(taskId: string) => {
			onTaskSelected?.(taskId);
			setSelectedTaskIds((previous) =>
				previous.includes(taskId) ? previous.filter((id) => id !== taskId) : [...previous, taskId],
			);
			setSelectionAnchorId(taskId);
		},
		[onTaskSelected],
	);
	const selectTaskRange = useCallback(
		(taskIds: string[]) => {
			for (const taskId of taskIds) onTaskSelected?.(taskId);
			setSelectedTaskIds((previous) => [...previous, ...taskIds.filter((taskId) => !previous.includes(taskId))]);
		},
		[onTaskSelected],
	);

	useEffect(() => {
		if (selectedTaskIds.length === 0) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (matchesBrowserShortcut(event, "clearBoardSelection") && !isEditableKeyboardTarget(event.target)) {
				event.preventDefault();
				clearSelection();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [selectedTaskIds.length, clearSelection]);

	useEffect(() => {
		setSelectedTaskIds((previous) => {
			const next = previous.filter((taskId) => visibleTaskIds.has(taskId));
			return next.length === previous.length ? previous : next;
		});
		setSelectionAnchorId((previous) => (previous && visibleTaskIds.has(previous) ? previous : null));
	}, [visibleTaskIds]);

	const handleBatchMove = async (targetStatus: string, targetMilestone?: string | null) => {
		if (selectedTaskIds.length === 0 || !targetStatus) return;
		const resolutions = selectedTaskIds.map((taskId) => {
			const resolution = resolveTaskById(tasks, taskId);
			return { taskId, task: resolution.status === "found" ? resolution.task : undefined };
		});
		const selectedTasks = resolutions.flatMap(({ task }) => (task ? [task] : []));
		const orderedTasks = statuses.flatMap((status) =>
			sortTasksForStatus(
				selectedTasks.filter((task) => task.status === status),
				status,
			),
		);
		const orderedIds = new Set(orderedTasks.map((task) => task.id));
		const taskIds = [
			...orderedTasks.map((task) => task.id),
			...resolutions.filter(({ task }) => !task || !orderedIds.has(task.id)).map(({ taskId }) => taskId),
		];
		const unchanged =
			selectedTasks.length === taskIds.length &&
			selectedTasks.every(
				(task) =>
					task.status === targetStatus &&
					(targetMilestone === undefined ||
						canonicalizeMilestone(task.milestone, milestoneAliases) ===
							canonicalizeMilestone(targetMilestone, milestoneAliases)),
			);
		if (unchanged) return;

		const requestTask = selectedTasks[0];
		clearSelection();
		setBatchMoveStatus("");
		try {
			const result = await apiClient.moveTasks({
				taskIds,
				targetStatus,
				...(targetMilestone !== undefined ? { targetMilestone } : {}),
			});
			onError(
				result.failures.length > 0
					? `Could not move ${result.failures.length} of ${taskIds.length} tasks. ${result.failures.map((failure) => `${failure.taskId}: ${failure.reason}`).join(" ")}`
					: null,
			);
			const movedTasks = result.changedTasks ?? result.tasks;
			if (requestTask && onTasksUpdated && movedTasks.length > 0) onTasksUpdated(movedTasks, requestTask);
			else if (onRefreshData) await onRefreshData();
		} catch (error) {
			onError(error instanceof Error ? error.message : "Failed to move tasks");
		}
	};

	return {
		batchMoveStatus,
		clearSelection,
		handleBatchMove,
		isSelectionDragging,
		selectTaskRange,
		selectedTaskIds,
		selectionAnchorId,
		setBatchMoveStatus,
		setIsSelectionDragging,
		toggleTaskSelection,
	};
}
