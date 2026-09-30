import { useEffect } from "react";
import type { Task } from "../../types";
import { resolveTaskById } from "../../utils/task-id";

export function useBoardTaskHighlight(
	highlightTaskId: string | null | undefined,
	tasks: Task[],
	onEditTask: (task: Task) => void,
) {
	useEffect(() => {
		if (!highlightTaskId || tasks.length === 0) return;
		const resolution = resolveTaskById(tasks, highlightTaskId);
		if (resolution.status !== "found") return;
		const timer = setTimeout(() => onEditTask(resolution.task), 100);
		return () => clearTimeout(timer);
	}, [highlightTaskId, tasks, onEditTask]);
}
