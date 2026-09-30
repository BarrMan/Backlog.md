import { useMemo, useState } from "react";
import type { Decision } from "../../types";
import { apiClient } from "../lib/api";
import { sanitizeUrlTitle } from "../utils/urlHelpers";
import { useDocumentDetailLifecycle } from "./use-document-detail-lifecycle";
import { useDocumentDetailSaveFeedback } from "./use-document-detail-save-feedback";

const stripIdPrefix = (id: string): string => (id.startsWith("decision-") ? id.replace("decision-", "") : id);
const addDecisionPrefix = (id: string): string => (id.startsWith("decision-") ? id : `decision-${id}`);

export function useDecisionDetail(decisions: Decision[], onRefreshData: () => Promise<void>) {
	const [content, setContent] = useState("");
	const [originalContent, setOriginalContent] = useState("");
	const [decisionTitle, setDecisionTitle] = useState("");
	const [originalDecisionTitle, setOriginalDecisionTitle] = useState("");
	const { isSaving, showSaveSuccess, save, showSuccess, dismissSuccess } = useDocumentDetailSaveFeedback((error) =>
		console.error("Failed to save decision:", error),
	);
	const adapter = useMemo(
		() => ({
			prefix: addDecisionPrefix,
			fetch: apiClient.fetchDecision.bind(apiClient),
			onLoad: (next: Decision) => {
				setContent(next.rawContent || "");
				setOriginalContent(next.rawContent || "");
				setDecisionTitle(next.title || "");
				setOriginalDecisionTitle(next.title || "");
			},
			onFallback: (next: Decision) => {
				setDecisionTitle(next.title || "");
				setOriginalDecisionTitle(next.title || "");
			},
			onNew: () => {
				setDecisionTitle("");
				setOriginalDecisionTitle("");
				setContent("");
				setOriginalContent("");
			},
			logError: (next: unknown) => console.error("Failed to load decision:", next),
		}),
		[],
	);
	const {
		id,
		title,
		navigate,
		entity: decision,
		isLoading,
		isEditing,
		setIsEditing,
		isNew: isNewDecision,
		setIsNew: setIsNewDecision,
		error,
	} = useDocumentDetailLifecycle({
		items: decisions,
		adapter,
	});

	const handleSave = async () => {
		if (!decisionTitle.trim()) {
			console.error("Decision title is required");
			return;
		}
		await save(async () => {
			if (isNewDecision) {
				const decision = await apiClient.createDecision(decisionTitle);
				await onRefreshData();
				showSuccess();
				setIsEditing(false);
				setIsNewDecision(false);
				navigate(`/decisions/${stripIdPrefix(decision.id)}/${sanitizeUrlTitle(decisionTitle)}`);
				return;
			}
			if (!id) return;
			await apiClient.updateDecision(addDecisionPrefix(id), content);
			await onRefreshData();
			showSuccess();
			setIsEditing(false);
			navigate(`/decisions/${id}/${sanitizeUrlTitle(decisionTitle)}`);
		});
	};

	const handleCancelEdit = () => {
		if (isNewDecision) navigate("/decisions");
		else {
			setContent(originalContent);
			setDecisionTitle(originalDecisionTitle);
			setIsEditing(false);
		}
	};

	return {
		id,
		decision,
		isLoading,
		isEditing,
		setIsEditing,
		error,
		content,
		setContent,
		decisionTitle,
		setDecisionTitle,
		isSaving,
		showSaveSuccess,
		dismissSuccess,
		handleSave,
		handleCancelEdit,
		hasChanges: content !== originalContent || decisionTitle !== originalDecisionTitle,
		titleFallback: decision?.title || (title ? decodeURIComponent(title) : `Decision ${id}`),
	};
}
