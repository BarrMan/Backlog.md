import type React from "react";
import type { Task } from "../../types";
import Modal from "./Modal";
import { TaskDetailsContent } from "./TaskDetailsContent";
import { TaskDetailsContext } from "./TaskDetailsContext";
import { TaskDetailsMetadata } from "./TaskDetailsMetadata";
import { TaskDetailsModalActions } from "./TaskDetailsModalActions";
import { type TaskDetailsModalProps, useTaskDetailsModalSession } from "./use-task-details-modal-session";

const EMPTY_STATUSES: string[] = [];
const EMPTY_TASKS: Task[] = [];

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({
	availableStatuses = EMPTY_STATUSES,
	availableTasks = EMPTY_TASKS,
	...props
}) => {
	const session = useTaskDetailsModalSession({ ...props, availableStatuses, availableTasks });
	return (
		<Modal
			{...session.modalProps}
			maxWidthClass="max-w-5xl"
			actions={<TaskDetailsModalActions {...session.actionsProps} />}
		>
			{session.error && (
				<div role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
					{session.error}
				</div>
			)}
			<fieldset disabled={session.demoting} className="contents" aria-busy={session.demoting}>
				<TaskDetailsContext {...session.contextProps} />
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6" onClickCapture={session.onConfirmNavigation}>
					<TaskDetailsContent {...session.contentProps} />
					<TaskDetailsMetadata {...session.metadataProps} />
				</div>
			</fieldset>
		</Modal>
	);
};

export default TaskDetailsModal;
