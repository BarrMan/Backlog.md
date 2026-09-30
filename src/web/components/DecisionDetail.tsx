import type { Decision } from "../../types";
import { useDecisionDetail } from "../hooks/use-decision-detail";
import DocumentDetailActions from "./DocumentDetailActions";
import {
	DocumentDetailHeader,
	DocumentDetailMetadata,
	DocumentDetailStatus,
	DocumentDetailSuccessToast,
} from "./DocumentDetailChrome";
import { DocumentDetailGate, EmptyDocumentDetail } from "./DocumentDetailStates";
import EditableDocumentContent from "./EditableDocumentContent";
import ErrorBoundary from "./ErrorBoundary";
import StoredDate from "./StoredDate";

interface DecisionDetailProps {
	decisions: Decision[];
	onRefreshData: () => Promise<void>;
	dateFormat?: string;
}

const tagIcon =
	"M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a.997.997 0 01-1.414 0l-7-7A1.997 1.997 0 013 12V7a4 4 0 014-4z";
const collectionIcon =
	"M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 01-2-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012 2v2M7 7h10";
const calendarIcon =
	"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012 2v2M7 7h10";
const statusIcon = "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z";

export default function DecisionDetail({ decisions, onRefreshData, dateFormat }: DecisionDetailProps) {
	const detail = useDecisionDetail(decisions, onRefreshData);
	return (
		<DocumentDetailGate
			id={detail.id}
			isLoading={detail.isLoading}
			error={detail.error}
			empty={
				<EmptyDocumentDetail
					kind="decision"
					message="Select a decision from the sidebar to view its content."
					icon="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
				/>
			}
		>
			<ErrorBoundary>
				<div className="h-full bg-white dark:bg-gray-900 flex flex-col transition-colors duration-200">
					<DocumentDetailHeader
						isEditing={detail.isEditing}
						title={detail.decisionTitle}
						titleFallback={detail.titleFallback}
						titlePlaceholder="Decision title"
						onTitleChange={detail.setDecisionTitle}
						metadata={
							<DocumentDetailMetadata
								items={[
									{ icon: tagIcon, content: <span>ID: {detail.decision?.id}</span> },
									{ icon: collectionIcon, content: <span>Decision</span> },
									{
										icon: calendarIcon,
										content: (
											<span>
												Date: <StoredDate value={detail.decision?.date || ""} dateFormat={dateFormat} />
											</span>
										),
										visible: Boolean(detail.decision?.date),
									},
									{
										icon: statusIcon,
										content: <DocumentDetailStatus status={detail.decision?.status} />,
										visible: Boolean(detail.decision?.status),
									},
								]}
							/>
						}
						actions={
							<DocumentDetailActions
								isEditing={detail.isEditing}
								showEdit={false}
								onEdit={() => detail.setIsEditing(true)}
								onCancel={detail.handleCancelEdit}
								onSave={detail.handleSave}
								hasChanges={detail.hasChanges}
								isSaving={detail.isSaving}
							/>
						}
					/>
					<EditableDocumentContent
						value={detail.content}
						onChange={detail.setContent}
						isEditing={detail.isEditing}
						placeholder="Write your decision documentation here..."
					/>
				</div>
				{detail.showSaveSuccess && (
					<DocumentDetailSuccessToast
						message={`Decision "${detail.decisionTitle}" saved successfully!`}
						onDismiss={detail.dismissSuccess}
					/>
				)}
			</ErrorBoundary>
		</DocumentDetailGate>
	);
}
