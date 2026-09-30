import { formatBrowserShortcut, formatBrowserShortcutAriaKeys } from "../lib/keyboard-shortcuts";

type ModalActionProps = {
	mode: "preview" | "edit" | "create";
	isCreateMode: boolean;
	isFromOtherBranch: boolean;
	isFinalStatus: boolean;
	canDemote: boolean;
	saving: boolean;
	demoting: boolean;
	onComplete: () => void;
	onDemote: () => void;
	onEdit: () => void;
	onCancel: () => void;
	onSave: () => void;
};

const buttonClass =
	"inline-flex items-center rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200";

function PreviewActions({
	isFinalStatus,
	isCreateMode,
	isFromOtherBranch,
	canDemote,
	demoting,
	onComplete,
	onDemote,
	onEdit,
}: Pick<
	ModalActionProps,
	| "isFinalStatus"
	| "isCreateMode"
	| "isFromOtherBranch"
	| "canDemote"
	| "demoting"
	| "onComplete"
	| "onDemote"
	| "onEdit"
>) {
	const canEdit = !isCreateMode && !isFromOtherBranch;
	return (
		<>
			{isFinalStatus && canEdit && (
				<button
					type="button"
					onClick={onComplete}
					disabled={demoting}
					className={`${buttonClass} px-3 py-2 sm:px-4 text-white bg-emerald-600 dark:bg-emerald-700 hover:bg-emerald-700 dark:hover:bg-emerald-800 focus:ring-emerald-500 dark:focus:ring-emerald-400`}
					title={`Move off the board, preserving the record and dependency links (${formatBrowserShortcut("completeTask")})`}
					aria-keyshortcuts={formatBrowserShortcutAriaKeys("completeTask")}
				>
					<span className="sm:hidden">Complete</span>
					<span className="hidden sm:inline">Move to completed</span>
				</button>
			)}
			{canDemote && (
				<button
					type="button"
					onClick={onDemote}
					disabled={demoting}
					className={`${buttonClass} px-3 py-2 sm:px-4 text-white bg-amber-500 dark:bg-amber-600 hover:bg-amber-600 dark:hover:bg-amber-700 focus:ring-amber-500 dark:focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50`}
					title="Move task to drafts"
				>
					{demoting ? (
						"Demoting..."
					) : (
						<>
							<span className="sm:hidden">Demote</span>
							<span className="hidden sm:inline">Demote to draft</span>
						</>
					)}
				</button>
			)}
			{canEdit && (
				<button
					type="button"
					onClick={onEdit}
					disabled={demoting}
					className={`${buttonClass} px-3 py-2 sm:px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-blue-500 dark:focus:ring-blue-400`}
					title={`Edit (${formatBrowserShortcut("startTaskEdit")})`}
					aria-keyshortcuts={formatBrowserShortcutAriaKeys("startTaskEdit")}
				>
					<svg aria-hidden="true" className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
						/>
					</svg>
					Edit
				</button>
			)}
		</>
	);
}

function EditActions({
	isCreateMode,
	saving,
	demoting,
	onCancel,
	onSave,
}: Pick<ModalActionProps, "isCreateMode" | "saving" | "demoting" | "onCancel" | "onSave">) {
	const saveLabel = isCreateMode ? "Create" : "Save";
	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={onCancel}
				disabled={demoting}
				className={`${buttonClass} px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-blue-500 dark:focus:ring-blue-400`}
				title={`Cancel (${formatBrowserShortcut("cancelTaskEdit")})`}
				aria-keyshortcuts={formatBrowserShortcutAriaKeys("cancelTaskEdit")}
			>
				<svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
				</svg>
				Cancel
			</button>
			<button
				type="button"
				onClick={onSave}
				disabled={saving || demoting}
				className={`${buttonClass} px-4 py-2 text-white bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50`}
				title={`${saveLabel} (${formatBrowserShortcut("saveTaskEdit")})`}
				aria-keyshortcuts={formatBrowserShortcutAriaKeys("saveTaskEdit")}
			>
				{saving ? `${saveLabel}ing...` : saveLabel}
			</button>
		</div>
	);
}

export function TaskDetailsModalActions(props: ModalActionProps) {
	return (
		<div className="flex flex-nowrap items-center justify-end gap-2">
			{props.mode === "preview" ? <PreviewActions {...props} /> : <EditActions {...props} />}
		</div>
	);
}
