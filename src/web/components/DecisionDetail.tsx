import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../lib/api';
import { type Decision } from '../../types';
import ErrorBoundary from '../components/ErrorBoundary';
import { SuccessToast } from './SuccessToast';
import { sanitizeUrlTitle } from '../utils/urlHelpers';
import StoredDate from './StoredDate';
import EditableDocumentContent, { DocumentDetailTitle } from "./EditableDocumentContent";
import DocumentDetailActions from "./DocumentDetailActions";
import { useDocumentDetailLifecycle } from "../hooks/use-document-detail-lifecycle";
import { DocumentDetailGate, EmptyDocumentDetail } from "./DocumentDetailStates";

// Utility function for ID transformations
const stripIdPrefix = (id: string): string => {
	if (id.startsWith('decision-')) return id.replace('decision-', '');
	return id;
};

// Utility function to add decision prefix for API calls
const addDecisionPrefix = (id: string): string => {
	return id.startsWith('decision-') ? id : `decision-${id}`;
};

interface DecisionDetailProps {
	decisions: Decision[];
	onRefreshData: () => Promise<void>;
	dateFormat?: string;
}

export default function DecisionDetail({ decisions, onRefreshData, dateFormat }: DecisionDetailProps) {
	const { id, title } = useParams<{ id: string; title: string }>();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const [content, setContent] = useState<string>('');
	const [originalContent, setOriginalContent] = useState<string>('');
	const [decisionTitle, setDecisionTitle] = useState<string>('');
	const [originalDecisionTitle, setOriginalDecisionTitle] = useState<string>('');
	const [isSaving, setIsSaving] = useState(false);
	const [showSaveSuccess, setShowSaveSuccess] = useState(false);
	const adapter = useMemo(() => ({
		prefix: addDecisionPrefix,
		fetch: apiClient.fetchDecision.bind(apiClient),
		onLoad: (next: Decision) => {
			setContent(next.rawContent || ""); setOriginalContent(next.rawContent || "");
			setDecisionTitle(next.title || ""); setOriginalDecisionTitle(next.title || "");
		},
		onFallback: (next: Decision) => { setDecisionTitle(next.title || ""); setOriginalDecisionTitle(next.title || ""); },
		onNew: () => { setDecisionTitle(""); setOriginalDecisionTitle(""); setContent(""); setOriginalContent(""); },
		logError: (next: unknown) => console.error("Failed to load decision:", next),
	}), []);
	const { entity: decision, isLoading, isEditing, setIsEditing, isNew: isNewDecision, setIsNew: setIsNewDecision, error } = useDocumentDetailLifecycle({
		id, items: decisions, adapter, editRequested: searchParams.get("edit") === "true",
		consumeEditRequest: () => setSearchParams((params) => { params.delete("edit"); return params; }),
	});

	const handleSave = async () => {
		if (!decisionTitle.trim()) {
			console.error('Decision title is required');
			return;
		}

		try {
			setIsSaving(true);
			
			if (isNewDecision) {
				// Create new decision
				const decision = await apiClient.createDecision(decisionTitle);
				// Refresh data and navigate to the new decision
				await onRefreshData();
				// Show success toast
				setShowSaveSuccess(true);
				setTimeout(() => setShowSaveSuccess(false), 4000);
				// Exit edit mode and navigate to the new decision
				setIsEditing(false);
				setIsNewDecision(false);
				const newId = stripIdPrefix(decision.id);
				navigate(`/decisions/${newId}/${sanitizeUrlTitle(decisionTitle)}`);
			} else {
				// Update existing decision
				if (!id) return;
				await apiClient.updateDecision(addDecisionPrefix(id), content);
				// Refresh data from parent
				await onRefreshData();
				// Show success toast
				setShowSaveSuccess(true);
				setTimeout(() => setShowSaveSuccess(false), 4000);
				// Exit edit mode and navigate to decision detail page (this will load in preview mode)
				setIsEditing(false);
				navigate(`/decisions/${id}/${sanitizeUrlTitle(decisionTitle)}`);
			}
		} catch (error) {
			console.error('Failed to save decision:', error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleEdit = () => {
		setIsEditing(true);
	};

	const handleCancelEdit = () => {
		if (isNewDecision) {
			// Navigate back for new decisions
			navigate('/decisions');
		} else {
			// Revert changes for existing decisions
			setContent(originalContent);
			setDecisionTitle(originalDecisionTitle);
			setIsEditing(false);
		}
	};

	const hasChanges = content !== originalContent || decisionTitle !== originalDecisionTitle;

	const getStatusColor = (status: string) => {
		const colors = {
			'proposed': 'bg-yellow-50 text-yellow-700 border-yellow-200',
			'accepted': 'bg-green-50 text-green-700 border-green-200',
			'rejected': 'bg-red-50 text-red-700 border-red-200',
			'superseded': 'bg-gray-50 text-gray-700 border-gray-200',
		} as const;
		return colors[status.toLowerCase() as keyof typeof colors] || 'bg-gray-50 text-gray-700 border-gray-200';
	};

	return (
		<DocumentDetailGate id={id} isLoading={isLoading} error={error} empty={<EmptyDocumentDetail kind="decision" message="Select a decision from the sidebar to view its content." icon="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />}>
		<ErrorBoundary>
			<div className="h-full bg-white dark:bg-gray-900 flex flex-col transition-colors duration-200">
			{/* Header Section - Confluence/Linear Style */}
			<div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
				<div className="max-w-4xl mx-auto px-8 py-6">
					<div className="flex items-start justify-between mb-6">
						<div className="flex-1">
							<DocumentDetailTitle isEditing={isEditing} value={decisionTitle} fallback={decision?.title || (title ? decodeURIComponent(title) : `Decision ${id}`)} placeholder="Decision title" onChange={setDecisionTitle} />
							<div className="flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">
								<div className="flex items-center space-x-2">
									<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a.997.997 0 01-1.414 0l-7-7A1.997 1.997 0 013 12V7a4 4 0 014-4z" />
									</svg>
									<span>ID: {decision?.id}</span>
								</div>
								<div className="flex items-center space-x-2">
									<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
									</svg>
									<span>Decision</span>
								</div>
								{decision?.date && (
									<div className="flex items-center space-x-2">
										<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
										</svg>
										<span>Date: <StoredDate value={decision.date} dateFormat={dateFormat} /></span>
									</div>
								)}
								{decision?.status && (
									<div className="flex items-center space-x-2">
										<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
										<span 
											className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(decision.status)}`}
										>
											{decision.status.charAt(0).toUpperCase() + decision.status.slice(1)}
										</span>
									</div>
								)}
							</div>
						</div>
						<div className="flex items-center space-x-3 ml-6"><DocumentDetailActions isEditing={isEditing} showEdit={false} onEdit={handleEdit} onCancel={handleCancelEdit} onSave={handleSave} hasChanges={hasChanges} isSaving={isSaving} /></div>
					</div>
				</div>
			</div>

			<EditableDocumentContent
				value={content}
				onChange={setContent}
				isEditing={isEditing}
				placeholder="Write your decision documentation here..."
			/>
			</div>
			
		{/* Save Success Toast */}
		{showSaveSuccess && (
			<SuccessToast
				message={`Decision "${decisionTitle}" saved successfully!`}
				onDismiss={() => setShowSaveSuccess(false)}
				icon={
					<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				}
			/>
		)}
		</ErrorBoundary>
		</DocumentDetailGate>
	);
}
