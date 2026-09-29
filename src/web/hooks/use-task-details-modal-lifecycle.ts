import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from "react";
import type { TaskDetail } from "../../core/task-detail";
import type { Task } from "../../types";

type Mode = "preview" | "edit" | "create";

export function useTaskDetailsModalLifecycle({
	task,
	isOpen,
	isCreateMode,
	modeRef,
	previousTaskId,
	previousIsOpen,
	preserveEditModeAfterCommentRefresh,
	syncForm,
	setCommentSaving,
	setCommentsChanged,
	setMode,
	setError,
}: {
	task?: Task | TaskDetail;
	isOpen: boolean;
	isCreateMode: boolean;
	modeRef: MutableRefObject<Mode>;
	previousTaskId: MutableRefObject<string>;
	previousIsOpen: MutableRefObject<boolean>;
	preserveEditModeAfterCommentRefresh: MutableRefObject<boolean>;
	syncForm: (preserveDirtyFields: boolean) => void;
	setCommentSaving: Dispatch<SetStateAction<boolean>>;
	setCommentsChanged: Dispatch<SetStateAction<boolean>>;
	setMode: Dispatch<SetStateAction<Mode>>;
	setError: Dispatch<SetStateAction<string | null>>;
}) {
	useEffect(() => {
		const nextTaskId = task?.id ?? "";
		const sameOpenModalRefresh = isOpen && previousIsOpen.current && previousTaskId.current === nextTaskId;
		const shouldPreserveEditMode =
			!isCreateMode &&
			sameOpenModalRefresh &&
			(modeRef.current === "edit" || preserveEditModeAfterCommentRefresh.current);

		syncForm(sameOpenModalRefresh);
		setCommentSaving(false);
		setCommentsChanged(false);
		setMode(
			sameOpenModalRefresh
				? shouldPreserveEditMode
					? "edit"
					: isCreateMode
						? "create"
						: modeRef.current
				: isCreateMode
					? "create"
					: "preview",
		);
		preserveEditModeAfterCommentRefresh.current = false;
		previousTaskId.current = nextTaskId;
		previousIsOpen.current = isOpen;
		setError(null);
	}, [
		task,
		isOpen,
		isCreateMode,
		modeRef,
		previousTaskId,
		previousIsOpen,
		preserveEditModeAfterCommentRefresh,
		syncForm,
		setCommentSaving,
		setCommentsChanged,
		setMode,
		setError,
	]);
}
