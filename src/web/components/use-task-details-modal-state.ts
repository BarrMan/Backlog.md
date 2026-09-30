import { useEffect, useRef, useState } from "react";
import type { TaskDetail } from "../../core/task-detail";
import type { Task } from "../../types";

type TaskDetailsModalMode = "preview" | "edit" | "create";

export function useTaskDetailsModalState(task: Task | TaskDetail | undefined, isOpen: boolean, isCreateMode: boolean) {
	const [mode, setMode] = useState<TaskDetailsModalMode>(isCreateMode ? "create" : "preview");
	const modeRef = useRef(mode);
	const previousTaskId = useRef(task?.id ?? "");
	const previousIsOpen = useRef(isOpen);
	const [error, setError] = useState<string | null>(null);
	const [commentsChanged, setCommentsChanged] = useState(false);
	const preserveEditModeAfterCommentRefresh = useRef(false);

	useEffect(() => {
		modeRef.current = mode;
	}, [mode]);

	return {
		mode,
		setMode,
		modeRef,
		previousTaskId,
		previousIsOpen,
		error,
		setError,
		commentsChanged,
		setCommentsChanged,
		preserveEditModeAfterCommentRefresh,
	};
}
