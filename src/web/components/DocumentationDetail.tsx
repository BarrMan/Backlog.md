import type { Document } from "../../types";
import { useDocumentationDetail } from "../hooks/use-documentation-detail";
import DocumentDetailActions from "./DocumentDetailActions";
import {
	DocumentDetailHeader,
	DocumentDetailMetadata,
	DocumentDetailSaveError,
	DocumentDetailSuccessToast,
} from "./DocumentDetailChrome";
import { DocumentDetailGate, EmptyDocumentDetail } from "./DocumentDetailStates";
import EditableDocumentContent from "./EditableDocumentContent";
import ErrorBoundary from "./ErrorBoundary";
import StoredDate from "./StoredDate";

interface DocumentationDetailProps {
	docs: Document[];
	onRefreshData: () => Promise<void>;
	dateFormat?: string;
}

const tagIcon =
	"M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a.997.997 0 01-1.414 0l-7-7A1.997 1.997 0 013 12V7a4 4 0 014-4z";
const collectionIcon =
	"M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 01-2-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012 2v2M7 7h10";
const folderIcon = "M3 7h5l2 2h11v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z";
const calendarIcon =
	"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012 2v2M7 7h10";

export default function DocumentationDetail({ docs, onRefreshData, dateFormat }: DocumentationDetailProps) {
	const detail = useDocumentationDetail(docs, onRefreshData);
	return (
		<DocumentDetailGate
			id={detail.id}
			isLoading={detail.isLoading}
			error={detail.error}
			empty={
				<EmptyDocumentDetail
					kind="document"
					message="Select a document from the sidebar to view its content."
					icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			}
		>
			<ErrorBoundary>
				<div className="h-full bg-white dark:bg-gray-900 flex flex-col transition-colors duration-200">
					<DocumentDetailHeader
						isEditing={detail.isEditing}
						title={detail.docTitle}
						titleFallback={detail.titleFallback}
						titlePlaceholder="Document title"
						onTitleChange={detail.setDocTitle}
						titleChildren={
							<input
								type="text"
								value={detail.docPath}
								onChange={(event) => detail.setDocPath(event.target.value)}
								className="w-full max-w-md bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors duration-200"
								placeholder="guides/setup"
							/>
						}
						metadata={
							<DocumentDetailMetadata
								items={[
									{ icon: tagIcon, content: <span>ID: {detail.document?.id || `doc-${detail.id}`}</span> },
									{ icon: collectionIcon, content: <span>Documentation</span> },
									{
										icon: folderIcon,
										content: <span>{detail.document?.path}</span>,
										visible: Boolean(detail.document?.path),
									},
									{
										icon: calendarIcon,
										content: (
											<span>
												Created: <StoredDate value={detail.document?.createdDate || ""} dateFormat={dateFormat} />
											</span>
										),
										visible: Boolean(detail.document?.createdDate),
									},
								]}
							/>
						}
						actions={
							<DocumentDetailActions
								isEditing={detail.isEditing}
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
						placeholder="Write your documentation here..."
					/>
					<DocumentDetailSaveError error={detail.saveError} onDismiss={() => detail.setSaveError(null)} />
				</div>
				{detail.showSaveSuccess && (
					<DocumentDetailSuccessToast
						message={`Document "${detail.docTitle}" saved successfully!`}
						onDismiss={detail.dismissSuccess}
					/>
				)}
			</ErrorBoundary>
		</DocumentDetailGate>
	);
}
