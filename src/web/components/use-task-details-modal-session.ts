import { useMemo } from "react";
import type { TaskDetail } from "../../core/task-detail";
import type { Milestone, Task } from "../../types";
import { useTheme } from "../contexts/ThemeContext";
import { useOptimisticTaskUpdates } from "../hooks/use-optimistic-task-updates";
import { hasCreateModeEntries } from "../hooks/use-task-detail-form-state";
import { useTaskDetailsModalActions } from "../hooks/use-task-details-modal-actions";
import { useTaskDetailsModalLifecycle } from "../hooks/use-task-details-modal-lifecycle";
import { useTaskDetailsModalShortcuts } from "../hooks/use-task-details-modal-shortcuts";
import { localEditableTasks, taskDetailsDerivedState, taskDetailsModalPresentation } from "./task-details-modal-policy";
import { useTaskDetailsModalController } from "./use-task-details-modal-controller";
import { useTaskDetailsModalForm } from "./use-task-details-modal-form";
import { useTaskDetailsModalState } from "./use-task-details-modal-state";

export interface TaskDetailsModalProps {
	task?: Task | TaskDetail;
	isOpen: boolean;
	onClose: () => void;
	onSaved?: () => Promise<void> | void;
	onSubmit?: (taskData: Partial<Task>) => Promise<void>;
	onArchive?: () => Promise<void> | void;
	onDependencyCleanup?: (taskId: string, cleanedTaskIds: string[]) => void;
	availableStatuses?: string[];
	availableTasks?: Task[];
	onNavigateToTask?: (task: Task) => void;
	isDraftMode?: boolean;
	availableMilestones?: string[];
	availablePriorities?: string[];
	availableTypes?: string[];
	availableProjects?: string[];
	milestoneEntities?: Milestone[];
	archivedMilestoneEntities?: Milestone[];
	definitionOfDoneDefaults?: string[];
	defaultAssignee?: string[];
	dateFormat?: string;
}

type TaskDetailsModalSessionProps = TaskDetailsModalProps & {
	availableStatuses: string[];
	availableTasks: Task[];
};

export function useTaskDetailsModalSession({
	task,
	isOpen,
	onClose,
	onSaved,
	onSubmit,
	onArchive,
	onDependencyCleanup,
	availableStatuses,
	availableTasks,
	onNavigateToTask,
	isDraftMode,
	availablePriorities,
	availableTypes,
	availableProjects,
	milestoneEntities,
	archivedMilestoneEntities,
	definitionOfDoneDefaults,
	defaultAssignee,
	dateFormat,
}: TaskDetailsModalSessionProps) {
	const { theme } = useTheme();
	const isCreateMode = !task;
	const isFromOtherBranch = Boolean(task?.branch);
	const isOpenDraft = (task?.status ?? "").trim().toLowerCase() === "draft";
	const { form, changes, createModeAssignee, priorityOptions, typeOptions, projectOptions } = useTaskDetailsModalForm({
		task,
		isCreateMode,
		isDraftMode,
		availableStatuses,
		definitionOfDoneDefaults,
		defaultAssignee,
		availablePriorities,
		availableTypes,
		availableProjects,
	});
	const {
		mode,
		setMode,
		modeRef,
		previousTaskId,
		previousIsOpen,
		error,
		setError,
		commentsChanged,
		setCommentsChanged,
		preserveEditModeAfterCommentRefresh,
	} = useTaskDetailsModalState(task, isOpen, isCreateMode);
	const {
		state: {
			title,
			description,
			plan,
			notes,
			displayComments,
			commentBody,
			commentAuthor,
			finalSummary,
			criteria,
			definitionOfDone,
			status,
			assignee,
			labels,
			priority,
			taskType,
			project,
			dependencies,
			references,
			modifiedFiles,
			milestone,
			dueDate,
		},
		isDirty,
	} = form;
	const { sync: syncForm, resetEditableContent } = form;
	const derived = taskDetailsDerivedState({
		task,
		status,
		dependencies,
		availableTasks,
		availableStatuses,
		typeOptions,
		projectOptions,
		milestoneEntities,
		archivedMilestoneEntities,
		taskType,
		project,
		milestone,
		isDraftMode,
		isOpenDraft,
		isFromOtherBranch,
	});
	const parentTask = derived.parentTask;
	const localAvailableTasks = useMemo(() => localEditableTasks(availableTasks), [availableTasks]);

	const {
		saving,
		commentSaving,
		demoting,
		resetCommentSaving,
		save: handleSave,
		addComment: handleAddComment,
		complete: handleComplete,
		demote: handleDemote,
	} = useTaskDetailsModalActions({
		task,
		isOpen,
		isCreateMode,
		isFromOtherBranch,
		canDemote: derived.canDemote,
		fields: {
			title,
			description,
			plan,
			notes,
			finalSummary,
			criteria,
			definitionOfDone,
			status,
			assignee,
			labels,
			priority,
			taskType,
			project,
			dependencies,
			milestone,
			dueDate,
			commentBody,
			commentAuthor,
		},
		createModeAssignee,
		definitionOfDoneDefaults,
		onSubmit,
		onSaved,
		onClose,
		onDependencyCleanup,
		setMode,
		setError,
		setDisplayComments: changes.displayComments,
		setCommentBody: changes.commentBody,
		setCommentAuthor: changes.commentAuthor,
		setCommentsChanged,
		preserveEditModeAfterCommentRefresh,
	});

	useTaskDetailsModalLifecycle({
		task,
		isOpen,
		isCreateMode,
		modeRef,
		previousTaskId,
		previousIsOpen,
		preserveEditModeAfterCommentRefresh,
		syncForm,
		setCommentSaving: resetCommentSaving,
		setCommentsChanged,
		setMode,
		setError,
	});

	const hasCreateEntries = isCreateMode && hasCreateModeEntries(form.state, createModeAssignee);
	const presentation = taskDetailsModalPresentation({
		task,
		isCreateMode,
		isDraftMode,
		mode,
		isDirty,
		commentBody,
		commentAuthor,
		hasCreateEntries,
		demoting,
	});
	const {
		update: handleInlineMetaUpdate,
		toggleCriterion: handleToggleCriterion,
		toggleDefinitionOfDone: handleToggleDefinitionOfDone,
		updateType: handleTaskTypeChange,
		typeError: typeUpdateError,
		typeUpdating: isTypeUpdating,
	} = useOptimisticTaskUpdates({
		task,
		disabled: demoting || isFromOtherBranch,
		fields: {
			criteria,
			definitionOfDone,
			status,
			assignee,
			labels,
			priority,
			taskType,
			project,
			dependencies,
			references,
			modifiedFiles,
			milestone,
			title,
		},
		setters: changes,
		onSaved,
		setError,
	});
	const controller = useTaskDetailsModalController({
		task,
		isCreateMode,
		demoting,
		isDirty,
		commentsChanged,
		onClose,
		onSaved,
		onArchive,
		resetEditableContent,
		setMode,
		setCommentsChanged,
		hasUnsavedEdits: presentation.hasUnsavedEdits,
		onSave: handleSave,
		onComplete: handleComplete,
		onDemote: handleDemote,
		onAddComment: handleAddComment,
		onToggleCriterion: handleToggleCriterion,
		onToggleDefinitionOfDone: handleToggleDefinitionOfDone,
		onTaskTypeChange: handleTaskTypeChange,
	});

	useTaskDetailsModalShortcuts({
		mode,
		isFinalStatus: derived.isFinalStatus,
		onCancel: controller.cancelEdit,
		onSave: controller.interactions.save,
		onEdit: controller.interactions.edit,
		onComplete: controller.interactions.complete,
	});

	return {
		error,
		demoting,
		modalProps: {
			isOpen,
			onClose: controller.close,
			title: presentation.title,
			disableEscapeClose: presentation.disableEscapeClose,
		},
		actionsProps: {
			mode,
			isCreateMode,
			isFromOtherBranch,
			isFinalStatus: derived.isFinalStatus,
			canDemote: derived.canDemote,
			saving,
			demoting,
			onComplete: controller.interactions.complete,
			onDemote: controller.interactions.demote,
			onEdit: controller.interactions.edit,
			onCancel: controller.cancelEdit,
			onSave: controller.interactions.save,
		},
		contextProps: {
			branch: isFromOtherBranch ? task?.branch : undefined,
			parentTask,
			task,
			availableStatuses,
			onNavigateToTask,
			onConfirmNavigation: controller.interactions.confirmNavigation,
		},
		contentProps: {
			task,
			mode,
			isCreateMode,
			isFromOtherBranch,
			theme,
			state: {
				title,
				description,
				plan,
				notes,
				finalSummary,
				criteria,
				definitionOfDone,
				references,
				modifiedFiles,
				displayComments,
				commentAuthor,
				commentBody,
			},
			availableTasks,
			availableStatuses,
			dependencyGraph: derived.dependencyGraph,
			subtasks: derived.subtasks,
			subtaskProgress: derived.subtaskProgress,
			onNavigateToTask,
			onInlineMetaUpdate: handleInlineMetaUpdate,
			onChange: changes,
			onToggleCriterion: controller.interactions.toggleCriterion,
			onToggleDefinitionOfDone: controller.interactions.toggleDefinitionOfDone,
			onAddComment: controller.interactions.addComment,
			commentSaving,
			dateFormat,
		},
		metadataProps: {
			task,
			mode,
			isFromOtherBranch,
			isOpenDraft,
			state: { title, status, assignee, labels, priority, taskType, project, milestone, dueDate, dependencies },
			availableTasks,
			localAvailableTasks,
			priorityOptions,
			typeOptions,
			projectOptions,
			typeSelectionValue: derived.typeSelectionValue,
			canonicalTypeSelection: derived.canonicalTypeSelection,
			projectSelectionValue: derived.projectSelectionValue,
			canonicalProjectSelection: derived.canonicalProjectSelection,
			milestoneSelectionValue: derived.milestoneSelectionValue,
			hasMilestoneSelection: derived.hasMilestoneSelection,
			milestoneEntities,
			archivedMilestoneEntities,
			shownReadiness: derived.shownReadiness,
			typeUpdateError,
			isTypeUpdating,
			demoting,
			onChange: changes,
			onInlineMetaUpdate: handleInlineMetaUpdate,
			onTaskTypeChange: controller.interactions.updateTaskType,
			onArchive: controller.interactions.archive,
			hasArchiveAction: Boolean(onArchive),
			dateFormat,
		},
		onConfirmNavigation: controller.interactions.confirmNavigation,
	};
}
