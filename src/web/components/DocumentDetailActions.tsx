import EditableMarkdownActions from "./EditableMarkdownActions";

interface DocumentDetailActionsProps {
	isEditing: boolean;
	showEdit?: boolean;
	onEdit: () => void;
	onCancel: () => void;
	onSave: () => void;
	hasChanges: boolean;
	isSaving: boolean;
}

export default function DocumentDetailActions({
	isEditing,
	showEdit = true,
	onEdit,
	onCancel,
	onSave,
	hasChanges,
	isSaving,
}: DocumentDetailActionsProps) {
	if (isEditing) {
		return <EditableMarkdownActions onCancel={onCancel} onSave={onSave} hasChanges={hasChanges} isSaving={isSaving} />;
	}
	if (!showEdit) return null;
	return (
		<button onClick={onEdit} className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200">
			<svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
			</svg>
			Edit
		</button>
	);
}
