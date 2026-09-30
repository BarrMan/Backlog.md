import { useState } from "react";
import { apiClient } from "../lib/api";

interface TaskPreview {
	id: string;
	title: string;
	updatedDate?: string;
	createdDate: string;
}

export function useCleanupModal(onClose: () => void, onSuccess: (movedCount: number) => void) {
	const [selectedAge, setSelectedAge] = useState<number | null>(null);
	const [previewTasks, setPreviewTasks] = useState<TaskPreview[]>([]);
	const [previewCount, setPreviewCount] = useState(0);
	const [isLoadingPreview, setIsLoadingPreview] = useState(false);
	const [isExecuting, setIsExecuting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showConfirmation, setShowConfirmation] = useState(false);

	const reset = () => {
		setSelectedAge(null);
		setPreviewTasks([]);
		setPreviewCount(0);
		setError(null);
		setShowConfirmation(false);
	};
	const clearPreview = () => {
		setPreviewTasks([]);
		setPreviewCount(0);
	};

	const close = () => {
		reset();
		onClose();
	};

	const selectAge = async (age: number) => {
		setSelectedAge(age);
		setError(null);
		setIsLoadingPreview(true);
		try {
			const preview = await apiClient.getCleanupPreview(age);
			setPreviewTasks(preview.tasks);
			setPreviewCount(preview.count);
			setShowConfirmation(false);
		} catch (error) {
			setError(error instanceof Error ? error.message : "Failed to load preview");
			clearPreview();
		} finally {
			setIsLoadingPreview(false);
		}
	};

	const reportExecutionError = (message: string) => setError(message || "Cleanup failed");

	const execute = async () => {
		if (selectedAge === null) return;
		setIsExecuting(true);
		setError(null);
		try {
			const result = await apiClient.executeCleanup(selectedAge);
			if (!result.success) {
				reportExecutionError(result.message);
				return;
			}
			onSuccess(result.movedCount);
			close();
		} catch (error) {
			setError(error instanceof Error ? error.message : "Failed to execute cleanup");
		} finally {
			setIsExecuting(false);
		}
	};

	return {
		selectedAge,
		previewTasks,
		previewCount,
		isLoadingPreview,
		isExecuting,
		error,
		showConfirmation,
		setShowConfirmation,
		selectAge,
		execute,
		close,
	};
}
