import type React from "react";
import Modal from "./Modal";

interface MilestoneFormModalProps {
	isOpen: boolean;
	title: string;
	name: string;
	dueDate: string;
	error: string | null;
	isSaving: boolean;
	submitLabel: string;
	nameId: string;
	namePlaceholder?: string;
	onClose: () => void;
	onNameChange: (value: string) => void;
	onDueDateChange: (value: string) => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

const MilestoneFormModal: React.FC<MilestoneFormModalProps> = ({
	isOpen,
	title,
	name,
	dueDate,
	error,
	isSaving,
	submitLabel,
	nameId,
	namePlaceholder,
	onClose,
	onNameChange,
	onDueDateChange,
	onSubmit,
}) => (
	<Modal isOpen={isOpen} onClose={onClose} title={title} maxWidthClass="max-w-md">
		<form onSubmit={onSubmit} className="space-y-4">
			<div className="space-y-2">
				<label htmlFor={nameId} className="text-sm font-medium text-gray-900 dark:text-gray-100">
					Milestone name
				</label>
				<input
					id={nameId}
					type="text"
					value={name}
					onChange={(event) => onNameChange(event.target.value)}
					placeholder={namePlaceholder}
					className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
				{error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
			</div>
			<div className="space-y-2">
				<label htmlFor={`${nameId}-due-date`} className="text-sm font-medium text-gray-900 dark:text-gray-100">
					Due
				</label>
				<input
					id={`${nameId}-due-date`}
					type="date"
					value={dueDate}
					onChange={(event) => onDueDateChange(event.target.value)}
					className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
			</div>
			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={onClose}
					disabled={isSaving}
					className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={isSaving || !name.trim()}
					className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
				>
					{isSaving ? "Saving..." : submitLabel}
				</button>
			</div>
		</form>
	</Modal>
);

export default MilestoneFormModal;
