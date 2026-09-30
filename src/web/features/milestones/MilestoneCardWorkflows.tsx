import type { Milestone, MilestoneBucket } from "../../../types";
import MilestoneFormModal from "../../components/MilestoneFormModal";
import MilestoneRemoveModal from "../../components/MilestoneRemoveModal";
import { useMilestoneArchive } from "./use-milestone-archive";
import { useMilestoneEdit } from "./use-milestone-edit";
import { useMilestoneRemove } from "./use-milestone-remove";

const MilestoneCardWorkflows = ({
	bucket,
	milestoneEntities,
	onRefreshData,
}: {
	bucket: MilestoneBucket;
	milestoneEntities: Milestone[];
	onRefreshData?: () => Promise<void>;
}) => {
	const edit = useMilestoneEdit(milestoneEntities, onRefreshData);
	const remove = useMilestoneRemove(milestoneEntities, onRefreshData);
	const archive = useMilestoneArchive(onRefreshData);
	const disabled = archive.archivingKey !== null || edit.isSaving || remove.isRemoving;
	return (
		<>
			<button
				type="button"
				onClick={() => edit.open(bucket)}
				disabled={disabled}
				className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 disabled:opacity-60"
			>
				{edit.isSaving ? "Saving..." : "Edit"}
			</button>
			<button
				type="button"
				onClick={() => remove.open(bucket)}
				disabled={disabled}
				className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 disabled:opacity-60"
			>
				{remove.isRemoving ? "Removing..." : "Remove"}
			</button>
			<button
				type="button"
				onClick={() => archive.archive(bucket)}
				disabled={disabled}
				className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 disabled:opacity-60"
			>
				{archive.archivingKey === bucket.key ? "Archiving..." : "Archive"}
			</button>
			<MilestoneFormModal
				isOpen={edit.bucket !== null}
				title="Edit milestone"
				name={edit.name}
				dueDate={edit.dueDate}
				error={edit.error}
				isSaving={edit.isSaving}
				submitLabel="Save"
				nameId="edit-milestone-name"
				onClose={edit.close}
				onNameChange={edit.setName}
				onDueDateChange={edit.setDueDate}
				onSubmit={edit.submit}
			/>
			<MilestoneRemoveModal
				bucket={remove.bucket}
				taskHandling={remove.taskHandling}
				reassignTo={remove.reassignTo}
				options={remove.options}
				error={remove.error}
				isRemoving={remove.isRemoving}
				onClose={remove.close}
				onTaskHandlingChange={remove.setTaskHandling}
				onReassignToChange={remove.setReassignTo}
				onRemove={remove.submit}
			/>
		</>
	);
};

export default MilestoneCardWorkflows;
