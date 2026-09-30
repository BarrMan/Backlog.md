import { useMemo, useState } from "react";
import type { Document } from "../../types";
import { addDocPrefix, getDocumentDirectory } from "../components/documentation-save";
import { apiClient } from "../lib/api";
import { useDocumentDetailLifecycle } from "./use-document-detail-lifecycle";
import { useDocumentDetailSaveFeedback } from "./use-document-detail-save-feedback";
import { useDocumentationDetailSave } from "./use-documentation-detail-save";

export function useDocumentationDetail(docs: Document[], onRefreshData: () => Promise<void>) {
	const [content, setContent] = useState("");
	const [originalContent, setOriginalContent] = useState("");
	const [docTitle, setDocTitle] = useState("");
	const [originalDocTitle, setOriginalDocTitle] = useState("");
	const [docPath, setDocPath] = useState("");
	const [originalDocPath, setOriginalDocPath] = useState("");
	const [saveError, setSaveError] = useState<Error | null>(null);
	const { isSaving, showSaveSuccess, save, showSuccess, dismissSuccess } = useDocumentDetailSaveFeedback((err) => {
		const error = err instanceof Error ? err : new Error("Failed to save document");
		setSaveError(error);
		console.error("Failed to save document:", error);
	});
	const adapter = useMemo(
		() => ({
			prefix: addDocPrefix,
			fetch: apiClient.fetchDoc.bind(apiClient),
			onLoad: (next: Document) => {
				setContent(next.rawContent || "");
				setOriginalContent(next.rawContent || "");
				setDocTitle(next.title || "");
				setOriginalDocTitle(next.title || "");
				setDocPath(getDocumentDirectory(next.path));
				setOriginalDocPath(getDocumentDirectory(next.path));
			},
			onFallback: (next: Document) => {
				setDocTitle(next.title || "");
				setOriginalDocTitle(next.title || "");
				setDocPath(getDocumentDirectory(next.path));
				setOriginalDocPath(getDocumentDirectory(next.path));
			},
			onNew: () => {
				setDocTitle("");
				setOriginalDocTitle("");
				setDocPath("");
				setOriginalDocPath("");
				setContent("");
				setOriginalContent("");
			},
			notFoundError: (prefixedId: string) => new Error(`Document with ID "${prefixedId}" not found`),
			logError: (next: unknown) => console.error("Failed to load document:", next),
		}),
		[],
	);
	const {
		id,
		title,
		navigate,
		entity: document,
		isLoading,
		isEditing,
		setIsEditing,
		isNew: isNewDocument,
		setIsNew: setIsNewDocument,
		error,
	} = useDocumentDetailLifecycle({
		items: docs,
		adapter,
	});

	const handleSave = useDocumentationDetailSave({
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
	});

	const handleCancelEdit = () => {
		if (isNewDocument) navigate("/documentation");
		else {
			setContent(originalContent);
			setDocTitle(originalDocTitle);
			setDocPath(originalDocPath);
			setIsEditing(false);
		}
	};

	return {
		id,
		document,
		isLoading,
		isEditing,
		setIsEditing,
		error,
		content,
		setContent,
		docTitle,
		setDocTitle,
		docPath,
		setDocPath,
		saveError,
		setSaveError,
		isSaving,
		showSaveSuccess,
		dismissSuccess,
		handleSave,
		handleCancelEdit,
		hasChanges: content !== originalContent || docTitle !== originalDocTitle || docPath !== originalDocPath,
		titleFallback: document?.title || (title ? decodeURIComponent(title) : `Document ${id}`),
	};
}
