interface EditableMarkdownActionsProps {
	onCancel: () => void;
	onSave: () => void;
	hasChanges: boolean;
	isSaving: boolean;
}

export default function EditableMarkdownActions({
	onCancel,
	onSave,
	hasChanges,
	isSaving,
}: EditableMarkdownActionsProps) {
	return (
		<div className="flex items-center space-x-2">
			<button
				type="button"
				onClick={onCancel}
				className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200"
			>
				Cancel
			</button>
			<button
				type="button"
				onClick={onSave}
				disabled={!hasChanges || isSaving}
				className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200 ${
					hasChanges && !isSaving
						? "bg-blue-600 dark:bg-blue-600 text-white hover:bg-blue-700 dark:hover:bg-blue-700 focus:ring-blue-500 dark:focus:ring-blue-400"
						: "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
				}`}
			>
				<svg aria-hidden="true" className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
				</svg>
				{isSaving ? "Saving..." : "Save"}
			</button>
		</div>
	);
}
