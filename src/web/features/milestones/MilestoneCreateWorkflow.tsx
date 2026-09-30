import MilestoneFormModal from "../../components/MilestoneFormModal";
import { useMilestoneCreate } from "./use-milestone-create";

const MilestoneCreateWorkflow = ({ onRefreshData }: { onRefreshData?: () => Promise<void> }) => {
	const create = useMilestoneCreate(onRefreshData);
	return (
		<>
			<button
				type="button"
				onClick={create.open}
				className="inline-flex items-center rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 focus:ring-2 focus:ring-blue-400 focus:outline-none focus:ring-offset-2 dark:focus:ring-offset-gray-900"
			>
				+ Add milestone
			</button>
			<MilestoneFormModal
				isOpen={create.isOpen}
				title="Add milestone"
				name={create.name}
				dueDate={create.dueDate}
				error={create.error}
				isSaving={create.isSaving}
				submitLabel="Create"
				nameId="new-milestone-name"
				namePlaceholder="e.g. Release 1.0"
				onClose={create.close}
				onNameChange={create.setName}
				onDueDateChange={create.setDueDate}
				onSubmit={create.submit}
			/>
		</>
	);
};

export default MilestoneCreateWorkflow;
