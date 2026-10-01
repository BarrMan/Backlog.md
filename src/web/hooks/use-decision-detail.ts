import { useMemo, useState } from "react";
import type { Decision } from "../../types";
import { apiClient } from "../lib/api";
import { sanitizeUrlTitle } from "../utils/urlHelpers";
import { useDocumentDetailLifecycle } from "./use-document-detail-lifecycle";
import { useDocumentDetailSaveFeedback } from "./use-document-detail-save-feedback";

const stripIdPrefix = (id: string): string => (id.startsWith("decision-") ? id.replace("decision-", "") : id);
const addDecisionPrefix = (id: string): string => (id.startsWith("decision-") ? id : `decision-${id}`);

export function useDecisionDetail(decisions: Decision[], onRefreshData: () => Promise<void>) {
	const [context, setContext] = useState("");
	const [originalContext, setOriginalContext] = useState("");
	const [decisionContent, setDecisionContent] = useState("");
	const [originalDecisionContent, setOriginalDecisionContent] = useState("");
	const [consequences, setConsequences] = useState("");
	const [originalConsequences, setOriginalConsequences] = useState("");
	const [alternatives, setAlternatives] = useState("");
	const [originalAlternatives, setOriginalAlternatives] = useState("");
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
				setContext(next.context || "");
				setOriginalContext(next.context || "");
				setDecisionContent(next.decision || "");
				setOriginalDecisionContent(next.decision || "");
				setConsequences(next.consequences || "");
				setOriginalConsequences(next.consequences || "");
				setAlternatives(next.alternatives || "");
				setOriginalAlternatives(next.alternatives || "");
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
				setContext("");
				setOriginalContext("");
				setDecisionContent("");
				setOriginalDecisionContent("");
				setConsequences("");
				setOriginalConsequences("");
				setAlternatives("");
				setOriginalAlternatives("");
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
			await apiClient.updateDecision(addDecisionPrefix(id), {
				title: decisionTitle,
				context,
				decision: decisionContent,
				consequences,
				alternatives: alternatives || undefined,
			});
			await onRefreshData();
			showSuccess();
			setIsEditing(false);
			navigate(`/decisions/${id}/${sanitizeUrlTitle(decisionTitle)}`);
		});
	};

	const handleCancelEdit = () => {
		if (isNewDecision) navigate("/decisions");
		else {
			setContext(originalContext);
			setDecisionContent(originalDecisionContent);
			setConsequences(originalConsequences);
			setAlternatives(originalAlternatives);
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
		context,
		setContext,
		decisionContent,
		setDecisionContent,
		consequences,
		setConsequences,
		alternatives,
		setAlternatives,
		decisionTitle,
		setDecisionTitle,
		isSaving,
		showSaveSuccess,
		dismissSuccess,
		handleSave,
		handleCancelEdit,
		hasChanges:
			context !== originalContext ||
			decisionContent !== originalDecisionContent ||
			consequences !== originalConsequences ||
			alternatives !== originalAlternatives ||
			decisionTitle !== originalDecisionTitle,
		titleFallback: decision?.title || (title ? decodeURIComponent(title) : `Decision ${id}`),
	};
}
