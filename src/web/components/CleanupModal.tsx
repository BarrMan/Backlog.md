import type React from "react";
import { useCleanupModal } from "../hooks/use-cleanup-modal";
import Modal from "./Modal";
import StoredDate from "./StoredDate";

interface CleanupModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: (movedCount: number) => void;
	dateFormat?: string;
}

const AGE_OPTIONS = [
	{ label: "1 day", value: 1 },
	{ label: "1 week", value: 7 },
	{ label: "2 weeks", value: 14 },
	{ label: "3 weeks", value: 21 },
	{ label: "1 month", value: 30 },
	{ label: "3 months", value: 90 },
	{ label: "1 year", value: 365 },
];

const CleanupModal: React.FC<CleanupModalProps> = ({ isOpen, onClose, onSuccess, dateFormat }) => {
	const state = useCleanupModal(onClose, onSuccess);

	return (
		<Modal isOpen={isOpen} onClose={state.close} title="Clean Up Completed Tasks" maxWidthClass="max-w-3xl">
			<div className="space-y-6">
				<AgeSelector state={state} />
				{state.error && (
					<div className="rounded-md bg-red-100 dark:bg-red-900/40 p-3">
						<p className="text-sm text-red-700 dark:text-red-200">{state.error}</p>
					</div>
				)}
				<CleanupPreview state={state} dateFormat={dateFormat} />
				{state.showConfirmation && state.previewCount > 0 && <CleanupConfirmation count={state.previewCount} />}
				<CleanupActions state={state} />
			</div>
		</Modal>
	);
};

type CleanupState = ReturnType<typeof useCleanupModal>;
const AgeSelector = ({ state }: { state: CleanupState }) => (
	<div>
		<p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
			Move tasks to completed folder if they are older than:
		</p>
		<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
			{AGE_OPTIONS.map((option) => (
				<button
					type="button"
					key={option.value}
					onClick={() => state.selectAge(option.value)}
					disabled={state.isLoadingPreview || state.isExecuting}
					className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${state.selectedAge === option.value ? "bg-blue-500 dark:bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"} disabled:opacity-50`}
				>
					{option.label}
				</button>
			))}
		</div>
		<p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
			Tasks will be moved to the backlog/completed/ folder and removed from the board
		</p>
	</div>
);
const CleanupPreview = ({ state, dateFormat }: { state: CleanupState; dateFormat?: string }) => {
	if (state.isLoadingPreview)
		return <div className="text-center py-4 text-gray-600 dark:text-gray-400">Loading preview...</div>;
	if (state.selectedAge === null || state.showConfirmation) return null;
	if (!state.previewCount)
		return (
			<div className="text-center py-8 text-gray-500 dark:text-gray-400">
				No tasks found that are older than {AGE_OPTIONS.find((option) => option.value === state.selectedAge)?.label}.
			</div>
		);
	return (
		<div>
			<h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
				Found {state.previewCount} task{state.previewCount !== 1 ? "s" : ""} to clean up:
			</h3>
			<ul className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md divide-y divide-gray-200 dark:divide-gray-700">
				{state.previewTasks.slice(0, 10).map((task) => (
					<li key={task.id} className="px-4 py-3">
						<p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
						<p className="text-xs text-gray-500 dark:text-gray-400">
							{task.id} • <StoredDate value={task.updatedDate || task.createdDate} dateFormat={dateFormat} />
						</p>
					</li>
				))}
				{state.previewCount > 10 && (
					<li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 italic">
						... and {state.previewCount - 10} more
					</li>
				)}
			</ul>
		</div>
	);
};
const CleanupConfirmation = ({ count }: { count: number }) => (
	<div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4">
		<h3 className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">Confirm Cleanup</h3>
		<p className="text-sm text-amber-700 dark:text-amber-300">
			Are you sure you want to move {count} task{count !== 1 ? "s" : ""} to the completed folder? These tasks will be
			moved to backlog/completed/ and removed from the board.
		</p>
	</div>
);
const CleanupActions = ({ state }: { state: CleanupState }) => (
	<div className="flex justify-end gap-3">
		<button
			type="button"
			onClick={state.close}
			disabled={state.isExecuting}
			className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors duration-200"
		>
			Cancel
		</button>
		{state.selectedAge !== null &&
			state.previewCount > 0 &&
			(!state.showConfirmation ? (
				<button
					type="button"
					onClick={() => state.setShowConfirmation(true)}
					disabled={state.isLoadingPreview || state.isExecuting}
					className="px-4 py-2 text-sm font-medium text-white bg-blue-500 dark:bg-blue-600 rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-50 transition-colors duration-200"
				>
					Continue
				</button>
			) : (
				<button
					type="button"
					onClick={state.execute}
					disabled={state.isExecuting}
					className="px-4 py-2 text-sm font-medium text-white bg-red-500 dark:bg-red-600 rounded-md hover:bg-red-600 dark:hover:bg-red-700 disabled:opacity-50 transition-colors duration-200"
				>
					{state.isExecuting
						? "Moving Tasks..."
						: `Move ${state.previewCount} Task${state.previewCount !== 1 ? "s" : ""}`}
				</button>
			))}
	</div>
);

export default CleanupModal;
