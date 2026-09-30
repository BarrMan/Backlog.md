import { useEffect, useRef, useState } from "react";
import type { BacklogConfig, Milestone, Task } from "../../../types";
import { formatDependencyCleanupMessage } from "../../../utils/dependency-graph";
import { SuccessToast } from "../../components/SuccessToast";
import TaskDetailsModal from "../../components/TaskDetailsModal";
import type { TaskModalState } from "../../hooks/task-route-modal";
import { apiClient, readMovedFailureState } from "../../lib/api";

const NOTICE_DURATION_MS = 4000;

type Props = {
	modal: TaskModalState;
	closeModal: () => void;
	tasks: Task[];
	statuses: string[];
	milestones: string[];
	milestoneEntities: Milestone[];
	archivedMilestones: Milestone[];
	config: BacklogConfig | null;
	availableTypes: string[];
	availableProjects: string[];
	onNavigateToTask: (task: Task) => void;
	refreshData: () => Promise<void>;
};

function modalSession(modal: TaskModalState) {
	return modal.kind === "closed" ? null : modal.session;
}

export function TaskModalLifecycle({
	modal,
	closeModal,
	tasks,
	statuses,
	milestones,
	milestoneEntities,
	archivedMilestones,
	config,
	availableTypes,
	availableProjects,
	onNavigateToTask,
	refreshData,
}: Props) {
	const [taskConfirmation, setTaskConfirmation] = useState<{ task: Task; isDraft: boolean } | null>(null);
	const [dependencyCleanupNotice, setDependencyCleanupNotice] = useState<string | null>(null);
	const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const confirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mountedRef = useRef(true);
	const modalRef = useRef(modal);
	modalRef.current = modal;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
			if (confirmationTimerRef.current) clearTimeout(confirmationTimerRef.current);
		};
	}, []);

	const isCurrent = (session: number) => mountedRef.current && modalSession(modalRef.current) === session;
	const editingTask = modal.kind === "detail" ? modal.value : null;
	const isDraftMode = modal.kind === "closed" ? false : modal.isDraft;

	const reportDependencyCleanup = (taskId: string, cleanedTaskIds: string[] | undefined) => {
		const message = formatDependencyCleanupMessage(taskId, cleanedTaskIds ?? []);
		if (!message) return;
		if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
		setDependencyCleanupNotice(message);
		cleanupTimerRef.current = setTimeout(() => {
			cleanupTimerRef.current = null;
			setDependencyCleanupNotice(null);
		}, NOTICE_DURATION_MS);
	};

	const submitTask = async (taskData: Partial<Task>) => {
		if (modal.kind !== "create") return;
		const { isDraft, session } = modal;
		const createdTask = await apiClient.createTask({
			...taskData,
			...(isDraft ? { status: "Draft" } : {}),
		} as Omit<Task, "id" | "createdDate">);
		await refreshData();
		if (!isCurrent(session)) return;
		if (confirmationTimerRef.current) clearTimeout(confirmationTimerRef.current);
		setTaskConfirmation({ task: createdTask, isDraft });
		confirmationTimerRef.current = setTimeout(() => {
			confirmationTimerRef.current = null;
			setTaskConfirmation(null);
		}, NOTICE_DURATION_MS);
	};

	const archiveTask = async () => {
		if (!editingTask) return;
		if (modal.kind !== "detail") return;
		const { id } = editingTask;
		const { session } = modal;
		try {
			const { cleanedTaskIds } = await apiClient.archiveTask(id);
			if (isCurrent(session)) {
				reportDependencyCleanup(id, cleanedTaskIds);
				closeModal();
			}
			await refreshData();
		} catch (error) {
			console.error("Failed to archive task:", error);
			if (!readMovedFailureState(error, "archiveState")) return;
			if (isCurrent(session)) {
				closeModal();
				try {
					window.alert(
						"The task was archived, but cleanup failed and references may be stale. Check the tasks that referenced it before retrying.",
					);
				} catch {
					// A blocked dialog must not take the refresh down with it.
				}
			}
			await refreshData();
		}
	};

	return (
		<>
			<TaskDetailsModal
				key={modalSession(modal) ?? "closed"}
				task={editingTask || undefined}
				isOpen={modal.kind === "create" || editingTask !== null}
				onClose={closeModal}
				onSaved={refreshData}
				onSubmit={submitTask}
				onArchive={editingTask ? archiveTask : undefined}
				onDependencyCleanup={reportDependencyCleanup}
				availableStatuses={isDraftMode ? ["Draft", ...statuses] : statuses}
				availableTasks={tasks}
				onNavigateToTask={onNavigateToTask}
				availableMilestones={milestones}
				availablePriorities={config?.priorities}
				availableTypes={availableTypes}
				availableProjects={availableProjects}
				milestoneEntities={milestoneEntities}
				archivedMilestoneEntities={archivedMilestones}
				isDraftMode={isDraftMode}
				definitionOfDoneDefaults={config?.definitionOfDone ?? []}
				defaultAssignee={config?.defaultAssignee}
				dateFormat={config?.dateFormat}
			/>
			{dependencyCleanupNotice && (
				<SuccessToast message={dependencyCleanupNotice} onDismiss={() => setDependencyCleanupNotice(null)} />
			)}
			{taskConfirmation && (
				<SuccessToast
					message={`${taskConfirmation.isDraft ? "Draft" : "Task"} "${taskConfirmation.task.title}" created successfully! (${taskConfirmation.task.id.replace("task-", "")})`}
					onDismiss={() => setTaskConfirmation(null)}
					icon={
						<svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					}
				/>
			)}
		</>
	);
}
