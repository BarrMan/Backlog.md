import { useEffect } from "react";
import { isEditableKeyboardTarget, matchesBrowserShortcut } from "../lib/keyboard-shortcuts";

export function useTaskDetailsModalShortcuts({
	mode,
	isFinalStatus,
	onCancel,
	onSave,
	onEdit,
	onComplete,
}: {
	mode: "preview" | "edit" | "create";
	isFinalStatus: boolean;
	onCancel: () => void;
	onSave: () => void;
	onEdit: () => void;
	onComplete: () => void;
}) {
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (mode === "edit" && matchesBrowserShortcut(event, "cancelTaskEdit")) {
				event.preventDefault();
				event.stopPropagation();
				onCancel();
				return;
			}
			if (mode === "edit" && matchesBrowserShortcut(event, "saveTaskEdit")) {
				event.preventDefault();
				event.stopPropagation();
				onSave();
				return;
			}
			if (mode !== "preview" || isEditableKeyboardTarget(event.target)) return;
			if (matchesBrowserShortcut(event, "startTaskEdit")) {
				event.preventDefault();
				event.stopPropagation();
				onEdit();
				return;
			}
			if (isFinalStatus && matchesBrowserShortcut(event, "completeTask")) {
				event.preventDefault();
				event.stopPropagation();
				onComplete();
			}
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => window.removeEventListener("keydown", onKey, true);
	}, [mode, isFinalStatus, onCancel, onSave, onEdit, onComplete]);
}
