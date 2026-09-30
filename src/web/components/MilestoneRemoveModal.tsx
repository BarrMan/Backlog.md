import type React from "react";
import type { Milestone, MilestoneBucket } from "../../types";
import Modal from "./Modal";

interface MilestoneRemoveModalProps {
	bucket: MilestoneBucket | null;
	taskHandling: "clear" | "reassign";
	reassignTo: string;
	options: Milestone[];
	error: string | null;
	isRemoving: boolean;
	onClose: () => void;
	onTaskHandlingChange: (value: "clear" | "reassign") => void;
	onReassignToChange: (value: string) => void;
	onRemove: () => void;
}

const MilestoneRemoveModal: React.FC<MilestoneRemoveModalProps> = ({
	bucket,
	taskHandling,
	reassignTo,
	options,
	error,
	isRemoving,
	onClose,
	onTaskHandlingChange,
	onReassignToChange,
	onRemove,
}) => {
	const canReassign = options.length > 0;
	return (
		<Modal isOpen={bucket !== null} onClose={onClose} title="Remove milestone" maxWidthClass="max-w-md">
			<div className="space-y-4">
				<p className="text-sm text-gray-600 dark:text-gray-300">
					Remove milestone &quot;{bucket?.label ?? ""}&quot; and choose what happens to its tasks.
				</p>
				<div className="space-y-3">
					<label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 px-3 py-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">
						<input
							type="radio"
							name="remove-milestone-task-handling"
							checked={taskHandling === "clear"}
							onChange={() => onTaskHandlingChange("clear")}
							className="mt-0.5"
						/>
						<span>
							<span className="block font-medium text-gray-900 dark:text-gray-100">Leave tasks unassigned</span>
							<span className="block text-xs text-gray-500 dark:text-gray-400">
								Clear this milestone from matching local tasks.
							</span>
						</span>
					</label>
					<label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 px-3 py-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">
						<input
							type="radio"
							name="remove-milestone-task-handling"
							checked={taskHandling === "reassign"}
							disabled={!canReassign}
							onChange={() => onTaskHandlingChange("reassign")}
							className="mt-0.5"
						/>
						<span className="flex-1">
							<span className="block font-medium text-gray-900 dark:text-gray-100">Reassign tasks</span>
							<select
								value={reassignTo}
								onChange={(event) => onReassignToChange(event.target.value)}
								disabled={taskHandling !== "reassign" || !canReassign}
								className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							>
								{options.map((milestone) => (
									<option key={milestone.id} value={milestone.id}>
										{milestone.title}
									</option>
								))}
							</select>
						</span>
					</label>
				</div>
				{error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onRemove}
						disabled={isRemoving || (taskHandling === "reassign" && !reassignTo)}
						className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
					>
						{isRemoving ? "Removing..." : "Remove milestone"}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default MilestoneRemoveModal;
