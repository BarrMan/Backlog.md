import { useCallback } from "react";
import type { Task } from "../../types";
import { taskDetailsNavigationHandler } from "./task-details-modal-policy";

export function useTaskDetailsModalController({
	task,
	isCreateMode,
	demoting,
	isDirty,
	commentsChanged,
	onClose,
	onSaved,
	onArchive,
	resetEditableContent,
	setMode,
	setCommentsChanged,
	hasUnsavedEdits,
	onSave,
	onComplete,
	onDemote,
	onAddComment,
	onToggleCriterion,
	onToggleDefinitionOfDone,
	onTaskTypeChange,
}: {
	task?: Task;
	isCreateMode: boolean;
	demoting: boolean;
	isDirty: boolean;
	commentsChanged: boolean;
	onClose: () => void;
	onSaved?: () => Promise<void> | void;
	onArchive?: () => Promise<void> | void;
	resetEditableContent: () => void;
	setMode: (mode: "preview" | "edit") => void;
	setCommentsChanged: (changed: boolean) => void;
	hasUnsavedEdits: boolean;
	onSave: () => Promise<void> | void;
	onComplete: () => Promise<void> | void;
	onDemote: () => Promise<void> | void;
	onAddComment: () => Promise<void> | void;
	onToggleCriterion: (index: number, checked: boolean) => Promise<void> | void;
	onToggleDefinitionOfDone: (index: number, checked: boolean) => Promise<void> | void;
	onTaskTypeChange: (value: string) => Promise<void> | void;
}) {
	const refreshAfterCommentChange = useCallback(() => {
		if (!commentsChanged) return;
		setCommentsChanged(false);
		if (onSaved) void onSaved();
	}, [commentsChanged, onSaved, setCommentsChanged]);
	const cancelEdit = () => {
		if (demoting || (isDirty && !window.confirm("Discard unsaved changes?"))) return;
		if (isCreateMode) onClose();
		else {
			resetEditableContent();
			setMode("preview");
			refreshAfterCommentChange();
		}
	};
	const close = () => {
		if (demoting || (isDirty && !isCreateMode && !window.confirm("Discard unsaved changes and close?"))) return;
		refreshAfterCommentChange();
		onClose();
	};
	const archive = async () => {
		if (
			demoting ||
			!task ||
			!onArchive ||
			!window.confirm(
				`Archive "${task.title}"? Use Archive for canceled, duplicate, or invalid work. Incoming dependencies and task references will be removed.`,
			)
		)
			return;
		await onArchive();
	};
	return {
		refreshAfterCommentChange,
		cancelEdit,
		close,
		archive,
		interactions: {
			confirmNavigation: taskDetailsNavigationHandler(hasUnsavedEdits),
			edit: () => setMode("edit"),
			save: () => void onSave(),
			complete: () => void onComplete(),
			demote: () => void onDemote(),
			addComment: () => void onAddComment(),
			toggleCriterion: (index: number, checked: boolean) => void onToggleCriterion(index, checked),
			toggleDefinitionOfDone: (index: number, checked: boolean) => void onToggleDefinitionOfDone(index, checked),
			updateTaskType: (value: string) => void onTaskTypeChange(value),
			archive: () => void archive(),
		},
	};
}
