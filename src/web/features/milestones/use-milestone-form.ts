import { useCallback, useState } from "react";
import { useMilestoneFeedback } from "./feedback";

export const useMilestoneForm = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [name, setName] = useState("");
	const [dueDate, setDueDate] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const { clear } = useMilestoneFeedback();
	const reset = useCallback(() => {
		setName("");
		setDueDate("");
		setError(null);
	}, []);
	const open = useCallback(
		(initialName = "", initialDueDate = "") => {
			clear();
			setName(initialName);
			setDueDate(initialDueDate);
			setError(null);
			setIsOpen(true);
		},
		[clear],
	);
	const close = useCallback(() => {
		if (isSaving) return;
		setIsOpen(false);
		reset();
	}, [isSaving, reset]);
	const begin = useCallback(() => {
		if (isSaving) return false;
		setIsSaving(true);
		setError(null);
		clear();
		return true;
	}, [clear, isSaving]);
	const complete = useCallback(() => {
		setIsOpen(false);
		reset();
		setIsSaving(false);
	}, [reset]);
	const fail = useCallback((cause: unknown, fallback: string) => {
		setError(cause instanceof Error ? cause.message : fallback);
		setIsSaving(false);
	}, []);

	return { isOpen, name, dueDate, error, isSaving, open, close, setName, setDueDate, setError, begin, complete, fail };
};
