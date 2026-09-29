import { formatBrowserShortcut, formatBrowserShortcutAriaKeys } from "../lib/keyboard-shortcuts";

export function TaskDetailsModalActions({
	mode,
	isCreateMode,
	isFromOtherBranch,
	isFinalStatus,
	canDemote,
	saving,
	demoting,
	onComplete,
	onDemote,
	onEdit,
	onCancel,
	onSave,
}: {
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
}) {
	return <div className="flex flex-nowrap items-center justify-end gap-2">
		{isFinalStatus && mode === "preview" && !isCreateMode && !isFromOtherBranch && <button onClick={onComplete} disabled={demoting} className="inline-flex items-center px-3 py-2 sm:px-4 rounded-lg text-sm font-medium text-white bg-emerald-600 dark:bg-emerald-700 hover:bg-emerald-700 dark:hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200" title={`Move off the board, preserving the record and dependency links (${formatBrowserShortcut("completeTask")})`} aria-keyshortcuts={formatBrowserShortcutAriaKeys("completeTask")}><span className="sm:hidden">Complete</span><span className="hidden sm:inline">Move to completed</span></button>}
		{canDemote && mode === "preview" && <button onClick={onDemote} disabled={demoting} className="inline-flex items-center px-3 py-2 sm:px-4 rounded-lg text-sm font-medium text-white bg-amber-500 dark:bg-amber-600 hover:bg-amber-600 dark:hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50" title="Move task to drafts">{demoting ? "Demoting..." : <><span className="sm:hidden">Demote</span><span className="hidden sm:inline">Demote to draft</span></>}</button>}
		{mode === "preview" && !isCreateMode && !isFromOtherBranch ? <button onClick={onEdit} disabled={demoting} className="inline-flex items-center px-3 py-2 sm:px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200" title={`Edit (${formatBrowserShortcut("startTaskEdit")})`} aria-keyshortcuts={formatBrowserShortcutAriaKeys("startTaskEdit")}><svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>Edit</button> : (mode === "edit" || mode === "create") && <div className="flex items-center gap-2"><button onClick={onCancel} disabled={demoting} className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200" title={`Cancel (${formatBrowserShortcut("cancelTaskEdit")})`} aria-keyshortcuts={formatBrowserShortcutAriaKeys("cancelTaskEdit")}><svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>Cancel</button><button onClick={onSave} disabled={saving || demoting} className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200 disabled:opacity-50" title={`Save (${formatBrowserShortcut("saveTaskEdit")})`} aria-keyshortcuts={formatBrowserShortcutAriaKeys("saveTaskEdit")}><svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>{saving ? "Saving..." : isCreateMode ? "Create" : "Save"}</button></div>}
	</div>;
}
