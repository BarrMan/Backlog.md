import { useCallback } from "react";
import type { Task } from "../../types";
import { resolveTaskById } from "../../utils/task-id";
import { apiClient, type ReorderTaskPayload } from "../lib/api";

interface BoardTaskMutationsOptions {
	tasks: Task[];
	onRefreshData?: () => Promise<void>;
	onTasksUpdated?: (tasks: Task[], requestTask: Task) => void;
	onError: (message: string | null) => void;
}

export function useBoardTaskMutations({ tasks, onRefreshData, onTasksUpdated, onError }: BoardTaskMutationsOptions) {
	const handleTaskUpdate = useCallback(
		async (taskId: string, updates: Partial<Task>) => {
			try {
				await apiClient.updateTask(taskId, updates);
				await onRefreshData?.();
				onError(null);
			} catch (error) {
				onError(error instanceof Error ? error.message : "Failed to update task");
			}
		},
		[onError, onRefreshData],
	);

	const handleTaskReorder = useCallback(
		async (payload: ReorderTaskPayload) => {
			try {
				const resolution = resolveTaskById(tasks, payload.taskId);
				const result = await apiClient.reorderTask(payload);
				if (resolution.status === "found" && onTasksUpdated)
					onTasksUpdated(result.changedTasks ?? [result.task], resolution.task);
				else await onRefreshData?.();
				onError(null);
			} catch (error) {
				onError(error instanceof Error ? error.message : "Failed to reorder task");
			}
		},
		[onError, onRefreshData, onTasksUpdated, tasks],
	);

	return { handleTaskUpdate, handleTaskReorder };
}
