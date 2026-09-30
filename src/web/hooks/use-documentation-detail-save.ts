import { useCallback } from "react";
import { saveDocumentation } from "../components/documentation-save";
import { sanitizeUrlTitle } from "../utils/urlHelpers";

interface DocumentationDetailSaveOptions {
	id?: string;
	isNewDocument: boolean;
	docTitle: string;
	docPath: string;
	originalDocTitle: string;
	originalDocPath: string;
	content: string;
	onRefreshData: () => Promise<void>;
	navigate: (path: string) => void;
	save: (operation: () => Promise<void>) => Promise<void>;
	showSuccess: () => void;
	setIsEditing: (isEditing: boolean) => void;
	setIsNewDocument: (isNew: boolean) => void;
	setDocTitle: (title: string) => void;
	setOriginalDocTitle: (title: string) => void;
	setDocPath: (path: string) => void;
	setOriginalDocPath: (path: string) => void;
	setSaveError: (error: Error | null) => void;
}

export function useDocumentationDetailSave({
	id,
	isNewDocument,
	docTitle,
	docPath,
	originalDocTitle,
	originalDocPath,
	content,
	onRefreshData,
	navigate,
	save,
	showSuccess,
	setIsEditing,
	setIsNewDocument,
	setDocTitle,
	setOriginalDocTitle,
	setDocPath,
	setOriginalDocPath,
	setSaveError,
}: DocumentationDetailSaveOptions) {
	return useCallback(async () => {
		if (!docTitle.trim()) {
			setSaveError(new Error("Document title is required"));
			return;
		}
		await save(async () => {
			setSaveError(null);
			const saved = await saveDocumentation({
				id,
				isNew: isNewDocument,
				title: docTitle,
				path: docPath,
				originalTitle: originalDocTitle,
				originalPath: originalDocPath,
				content,
			});
			if (!saved) return;
			await onRefreshData();
			showSuccess();
			setIsEditing(false);
			setIsNewDocument(false);
			setDocTitle(saved.title);
			setOriginalDocTitle(saved.title);
			setDocPath(saved.path);
			setOriginalDocPath(saved.path);
			navigate(`/documentation/${saved.id}/${sanitizeUrlTitle(saved.title)}`);
		});
	}, [
		id,
		docTitle,
		docPath,
		originalDocTitle,
		originalDocPath,
		content,
		isNewDocument,
		onRefreshData,
		navigate,
		save,
		showSuccess,
		setIsEditing,
		setIsNewDocument,
		setDocTitle,
		setOriginalDocTitle,
		setDocPath,
		setOriginalDocPath,
		setSaveError,
	]);
}
