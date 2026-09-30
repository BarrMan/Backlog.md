import { useState } from "react";

export function useDocumentDetailSaveFeedback(onError: (error: unknown) => void) {
	const [isSaving, setIsSaving] = useState(false);
	const [showSaveSuccess, setShowSaveSuccess] = useState(false);

	const save = async (operation: () => Promise<void>) => {
		try {
			setIsSaving(true);
			await operation();
		} catch (error) {
			onError(error);
		} finally {
			setIsSaving(false);
		}
	};

	const showSuccess = () => {
		setShowSaveSuccess(true);
		setTimeout(() => setShowSaveSuccess(false), 4000);
	};

	return { isSaving, showSaveSuccess, save, showSuccess, dismissSuccess: () => setShowSaveSuccess(false) };
}
