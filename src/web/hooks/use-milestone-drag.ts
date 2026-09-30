import { useCallback, useRef, useState } from "react";
import type { Task } from "../../types";
import { apiClient } from "../lib/api";

interface UseMilestoneDragOptions {
	onRefreshData?: () => Promise<void>;
}

export const useMilestoneDrag = ({ onRefreshData }: UseMilestoneDragOptions) => {
	const [draggedTask, setDraggedTask] = useState<Task | null>(null);
	const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
	const activeTask = useRef<Task | null>(null);
	const droppingTaskId = useRef<string | null>(null);
	const handleDragStart = useCallback((event: React.DragEvent, task: Task) => {
		activeTask.current = task;
		setDraggedTask(task);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", task.id);
		if (event.currentTarget instanceof HTMLElement) event.currentTarget.style.opacity = "0.5";
	}, []);
	const handleDragEnd = useCallback((event: React.DragEvent) => {
		activeTask.current = null;
		setDraggedTask(null);
		setDropTargetKey(null);
		if (event.currentTarget instanceof HTMLElement) event.currentTarget.style.opacity = "1";
	}, []);
	const handleDragOver = useCallback((event: React.DragEvent, bucketKey: string) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		setDropTargetKey(bucketKey);
	}, []);
	const handleDragLeave = useCallback(() => setDropTargetKey(null), []);
	const handleDrop = useCallback(
		async (event: React.DragEvent, targetMilestone: string | undefined) => {
			event.preventDefault();
			setDropTargetKey(null);
			const task = activeTask.current;
			if (!task || droppingTaskId.current === task.id) return;
			if (task.milestone === targetMilestone) {
				setDraggedTask(null);
				return;
			}
			droppingTaskId.current = task.id;
			try {
				await apiClient.updateTask(task.id, { milestone: targetMilestone });
				if (onRefreshData) await onRefreshData();
			} catch (error) {
				console.error("Failed to update task milestone:", error);
			}
			if (activeTask.current?.id === task.id) {
				activeTask.current = null;
				setDraggedTask(null);
			}
			droppingTaskId.current = null;
		},
		[onRefreshData],
	);

	return { draggedTask, dropTargetKey, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop };
};
