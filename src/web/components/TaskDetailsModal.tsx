import { DEFAULT_STATUSES } from "../../constants/index.ts";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLocalEditableTask, type AcceptanceCriterion, type Milestone, type Task, type TaskComment } from "../../types";
import { type TaskDetail, taskDependencyGraph, taskReadiness } from "../../core/task-detail";
import Modal from "./Modal";
import { apiClient, NetworkError, readDemotionFailureCause, readMovedFailureState } from "../lib/api";
import { useTheme } from "../contexts/ThemeContext";
import { resolveProjectValue } from "../../utils/project-config";
import { resolveTaskTypeValue } from "../../utils/task-type-config";
import { buildTaskIdIndex, resolveTaskReference } from "../utils/task-id-links";
import { findDirectSubtasks, findParentTask, summarizeSubtaskProgress } from "../../utils/task-subtasks.ts";
import { isTerminalStatus } from "../../utils/terminal-status.ts";
import { createUrlPath } from "../utils/urlHelpers";
import {
  buildDefinitionOfDonePayload,
  type TaskUpdatePayload,
} from "./task-details-form";
import { hasCreateModeEntries, useTaskDetailFormState } from "../hooks/use-task-detail-form-state";
import { useTaskDetailsModalLifecycle } from "../hooks/use-task-details-modal-lifecycle";
import { useTaskDetailsModalShortcuts } from "../hooks/use-task-details-modal-shortcuts";
import { resolveMilestoneSelection } from "../utils/milestone-aliases";
import { useOptimisticTaskUpdates } from "../hooks/use-optimistic-task-updates";
import { TaskDetailsModalActions } from "./TaskDetailsModalActions";
import { useTaskMetadataOptions } from "../hooks/use-task-metadata-options";
import { HierarchyChevron, HierarchyStatusBadge, TaskDetailsContent } from "./TaskDetailsContent";
import { TaskDetailsMetadata } from "./TaskDetailsMetadata";

interface Props {
  task?: Task | TaskDetail; // Optional for create mode
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => Promise<void> | void; // refresh callback
  onSubmit?: (taskData: Partial<Task>) => Promise<void>; // For creating new tasks
  onArchive?: () => Promise<void> | void; // For archiving tasks
  onDependencyCleanup?: (taskId: string, cleanedTaskIds: string[]) => void; // Reports records that lost a reference
  availableStatuses?: string[]; // Available statuses for new tasks
  availableTasks?: Task[]; // Shared task corpus for dependency selection
  onNavigateToTask?: (task: Task) => void; // Opens another task, preserving close/back context
  isDraftMode?: boolean; // Whether creating a draft
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

type Mode = "preview" | "edit" | "create";

// Shared empty defaults. A `= []` default parameter allocates a fresh array on every render, so
// every memo and effect keyed on it re-runs each time; combined with a state update in that chain
// the modal spins until React aborts with "Maximum update depth exceeded".
const EMPTY_STATUSES: string[] = [];
const EMPTY_TASKS: Task[] = [];

const containsCommentDelimiterLine = (value: string): boolean => /^\s*---\s*$/m.test(value.replace(/\r\n/g, "\n"));

export const TaskDetailsModal: React.FC<Props> = ({
  task,
  isOpen,
  onClose,
  onSaved,
  onSubmit,
  onArchive,
  onDependencyCleanup,
  availableStatuses = EMPTY_STATUSES,
  availableTasks = EMPTY_TASKS,
  onNavigateToTask,
  availableMilestones: _availableMilestones,
  availablePriorities,
  availableTypes,
  availableProjects,
  milestoneEntities,
  archivedMilestoneEntities,
  isDraftMode,
  definitionOfDoneDefaults,
  defaultAssignee,
  dateFormat,
}) => {
  const { theme } = useTheme();
  const isCreateMode = !task;
  const isFromOtherBranch = Boolean(task?.branch);
  // Promoting a draft replaces it with a new task ID, which the Drafts page does through its own
  // Promote action, so the popup shows the draft status without turning the field into a second one.
  const isOpenDraft = (task?.status ?? "").trim().toLowerCase() === "draft";
  const demotionIdentity = [isOpen ? "open" : "closed", task?.id, task?.source, task?.branch, isOpenDraft ? "draft" : "task"].join("\0");
  const demotionIdentityRef = useRef(demotionIdentity);
  demotionIdentityRef.current = demotionIdentity;
  const [mode, setMode] = useState<Mode>(isCreateMode ? "create" : "preview");
  const modeRef = useRef(mode);
  const previousTaskId = useRef(task?.id ?? "");
  const previousIsOpen = useRef(isOpen);
  const activeDemotionRequest = useRef<{ identity: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [demoting, setDemoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [commentSaving, setCommentSaving] = useState(false);
  const [commentsChanged, setCommentsChanged] = useState(false);
  const preserveEditModeAfterCommentRefresh = useRef(false);
  const defaultDefinitionOfDone = useMemo(
    () => (definitionOfDoneDefaults ?? []).map((text, index) => ({ index: index + 1, text, checked: false })),
    [definitionOfDoneDefaults],
  );
  // Create mode starts with the configured defaultAssignee already in the field, as ordinary
  // removable chips, so emptying it says "unassigned" instead of "no opinion".
  const createModeAssignee = useMemo(
    () => (isCreateMode ? (defaultAssignee ?? []) : []),
    [isCreateMode, defaultAssignee],
  );
  const { priorityOptions, typeOptions, projectOptions } = useTaskMetadataOptions({ availablePriorities, availableTypes, availableProjects });

  const form = useTaskDetailFormState({ task, isCreateMode, isDraftMode, availableStatuses, defaultDefinitionOfDone, createModeAssignee });
  const { state: { title, description, plan, notes, displayComments, commentBody, commentAuthor, finalSummary, criteria, definitionOfDone, status, assignee, labels, priority, taskType, project, dependencies, references, modifiedFiles, milestone, dueDate }, isDirty } = form;
  const { sync: syncForm, resetEditableContent } = form;
  const setTitle = (value: string) => form.setField("title", value);
  const setDescription = (value: string) => form.setField("description", value);
  const setPlan = (value: string) => form.setField("plan", value);
  const setNotes = (value: string) => form.setField("notes", value);
  const setDisplayComments = (value: TaskComment[]) => form.setField("displayComments", value);
  const setCommentBody = (value: string) => form.setField("commentBody", value);
  const setCommentAuthor = (value: string) => form.setField("commentAuthor", value);
  const setFinalSummary = (value: string) => form.setField("finalSummary", value);
  const setCriteria = (value: AcceptanceCriterion[]) => form.setField("criteria", value);
  const setDefinitionOfDone = (value: AcceptanceCriterion[]) => form.setField("definitionOfDone", value);
  const setStatus = (value: string) => form.setField("status", value);
  const setAssignee = (value: string[]) => form.setField("assignee", value);
  const setLabels = (value: string[]) => form.setField("labels", value);
  const setPriority = (value: string) => form.setField("priority", value);
  const setTaskType = (value: string) => form.setField("taskType", value);
  const setProject = (value: string) => form.setField("project", value);
  const setDependencies = (value: string[]) => form.setField("dependencies", value);
  const setReferences = (value: string[]) => form.setField("references", value);
  const setModifiedFiles = (value: string[]) => form.setField("modifiedFiles", value);
  const setMilestone = (value: string) => form.setField("milestone", value);
  const setDueDate = (value: string) => form.setField("dueDate", value);
  const canonicalTypeSelection = resolveTaskTypeValue(taskType, typeOptions);
  const typeSelectionValue = canonicalTypeSelection ?? taskType;
  const canonicalProjectSelection = resolveProjectValue(project, projectOptions);
  const projectSelectionValue = canonicalProjectSelection ?? project;
  const milestoneSelectionValue = resolveMilestoneSelection(milestone, milestoneEntities ?? [], archivedMilestoneEntities ?? []);
  const hasMilestoneSelection = (milestoneEntities ?? []).some((milestoneEntity) => milestoneEntity.id === milestoneSelectionValue);

  // Both derived at read time and delivered with the task itself, so there is nothing to resolve
  // or fetch here: the verdict the modal shows is the one every other surface shows.
  const dependencyGraph = taskDependencyGraph(task);
  const readiness = taskReadiness(task);
  // The verdict answers for the status and the dependencies it was read with, and it belongs to the
  // Dependencies card, so it is shown only while all of that still describes what is on screen. An
  // optimistic edit that has not come back yet - including one whose save failed and left the shown
  // status ahead of the record - shows no badge rather than a claim about what it replaced.
  const shownReadiness =
    readiness &&
    (readiness.isReady || readiness.isBlocked) &&
    dependencies.length > 0 &&
    dependencies.join(",") === (task?.dependencies ?? []).join(",") &&
    status === (task?.status ?? "")
      ? readiness
      : null;

  // Dependency validation stays local-only (see BACK-623), so the picker must only suggest what a
  // save can accept: a cross-branch task is rejected, and so is a canonically ambiguous ID that more
  // than one local file claims. The index drops those collisions already, so a task survives only
  // when it is the one its own canonical ID resolves to.
  const localAvailableTasks = useMemo(() => {
    const local = availableTasks.filter(isLocalEditableTask);
    const index = buildTaskIdIndex(local);
    return local.filter((candidate) => resolveTaskReference(index, candidate.id) === candidate);
  }, [availableTasks]);

  // Hierarchy is derived from the shared corpus rather than the task payload: the single-task
  // API does not carry parent/subtask fields, while the list the modal already receives does.
  const parentTask = useMemo(
    () => (task ? findParentTask(task, availableTasks) : null),
    [task, availableTasks],
  );

  const subtasks = useMemo(
    () => (task ? findDirectSubtasks(task, availableTasks) : []),
    [task, availableTasks],
  );

  const subtaskProgress = useMemo(
    () => (task ? summarizeSubtaskProgress(task, availableTasks, availableStatuses) : null),
    [task, availableTasks, availableStatuses],
  );

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(
    () => () => {
      activeDemotionRequest.current = null;
    },
    [],
  );

  useEffect(() => {
    activeDemotionRequest.current = null;
    setDemoting(false);
  }, [demotionIdentity]);

  useTaskDetailsModalLifecycle({
    task,
    isOpen,
    isCreateMode,
    modeRef,
    previousTaskId,
    previousIsOpen,
    preserveEditModeAfterCommentRefresh,
    syncForm,
    setCommentSaving,
    setCommentsChanged,
    setMode,
    setError,
  });

  const refreshAfterCommentChange = useCallback(() => {
    if (!commentsChanged) return;
    setCommentsChanged(false);
    if (onSaved) void onSaved();
  }, [commentsChanged, onSaved]);

  const hasCommentDraft = commentBody.trim() !== "" || commentAuthor.trim() !== "";
  // Nothing is persisted while creating, so any entered field is unsaved work.
  const hasCreateEntries = isCreateMode && hasCreateModeEntries(form.state, createModeAssignee);
  const hasUnsavedEdits =
    (mode === "edit" || mode === "create") && (isDirty || hasCommentDraft || hasCreateEntries);

  // Links inside the modal (dependency chips, auto-linked task IDs in markdown) leave this
  // task behind, so they ask the same question closing does before the navigation happens.
  const confirmNavigationAwayFromEdits = (event: React.MouseEvent<HTMLElement>) => {
    if (!hasUnsavedEdits || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link) return;
    if (link.target && link.target !== "_self") return;
    const destination = new URL(link.href, window.location.href);
    if (destination.protocol !== "http:" && destination.protocol !== "https:") return;
    // Same-page anchors (markdown heading links) do not unload the form.
    if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
    if (window.confirm("Discard unsaved changes and leave this task?")) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleCancelEdit = () => {
    if (demoting) return;
    if (isDirty) {
      const confirmDiscard = window.confirm("Discard unsaved changes?");
      if (!confirmDiscard) return;
    }
    if (isCreateMode) {
      // In create mode, close the modal on cancel
      onClose();
    } else {
      resetEditableContent();
      setMode("preview");
      refreshAfterCommentChange();
    }
  };

  const handleSave = async () => {
    if (demoting) return;
    setSaving(true);
    setError(null);

    // Validation for create mode
    if (isCreateMode && !title.trim()) {
      setError("Title is required");
      setSaving(false);
      return;
    }

    try {
      const taskData: TaskUpdatePayload = {
        title: title.trim(),
        description,
        implementationPlan: plan,
        implementationNotes: notes,
        finalSummary,
        acceptanceCriteriaItems: criteria,
        status,
        // Create starts with the configured defaultAssignee in the field, so what the field
        // holds is what the user meant: empty is an explicit "unassigned". Only a project
        // without a default has nothing to remove, so there a blank field still omits the
        // field. On edit an explicit empty list clears the assignees.
        ...(isCreateMode && assignee.length === 0 && createModeAssignee.length === 0 ? {} : { assignee }),
        labels,
        priority: priority === "" ? undefined : priority,
        dependencies,
        milestone: milestone.trim().length > 0 ? milestone.trim() : undefined,
        dueDate: dueDate.trim().length > 0 ? dueDate.trim() : isCreateMode ? undefined : null,
      };

      // Like type, project is only sent from the create form. On edit the sidebar select
      // persists immediately through handleInlineMetaUpdate, so including it here would
      // re-send a value the form never showed -- clearing a stale project when none are
      // configured, or failing the whole save when the stored value is no longer valid.
      if (isCreateMode) {
        taskData.type = taskType;
        taskData.project = project.trim().length > 0 ? project.trim() : undefined;
      }

      if (isCreateMode && onSubmit) {
        Object.assign(taskData, buildDefinitionOfDonePayload({ task, definitionOfDone, definitionOfDoneDefaults, isCreateMode }));
        // Create new task
        await onSubmit({ ...taskData, dueDate: taskData.dueDate ?? undefined } as Partial<Task>);
        // Only close if successful (no error thrown)
        onClose();
      } else if (task) {
        Object.assign(taskData, buildDefinitionOfDonePayload({ task, definitionOfDone, definitionOfDoneDefaults, isCreateMode }));
        // Update existing task
        await apiClient.updateTask(task.id, taskData);
        setMode("preview");
        if (onSaved) await onSaved();
        setCommentsChanged(false);
      }
    } catch (err) {
      // Extract and display the error message from API response
      let errorMessage = 'Failed to save task';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null && 'error' in err) {
        errorMessage = String((err as any).error);
      } else if (typeof err === 'string') {
        errorMessage = err;
      }

      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const { update: handleInlineMetaUpdate, toggleCriterion: handleToggleCriterion, toggleDefinitionOfDone: handleToggleDefinitionOfDone, updateType: handleTaskTypeChange, typeError: typeUpdateError, typeUpdating: isTypeUpdating } = useOptimisticTaskUpdates({
    task: task as Task | undefined,
    disabled: demoting || isFromOtherBranch,
    fields: { criteria, definitionOfDone, status, assignee, labels, priority, taskType, project, dependencies, references, modifiedFiles, milestone, title },
    setters: { criteria: setCriteria, definitionOfDone: setDefinitionOfDone, status: setStatus, assignee: setAssignee, labels: setLabels, priority: setPriority, taskType: setTaskType, project: setProject, dependencies: setDependencies, references: setReferences, modifiedFiles: setModifiedFiles, milestone: setMilestone, title: setTitle },
    onSaved,
    setError,
  });

  const handleAddComment = async () => {
    if (demoting) return;
    if (!task || isFromOtherBranch) return;
    const body = commentBody.trim();
    if (!body) return;
    const author = commentAuthor.trim();
    if (containsCommentDelimiterLine(body)) {
      setError("Comment body cannot contain standalone '---' delimiter lines.");
      return;
    }
    if (author && containsCommentDelimiterLine(author)) {
      setError("Comment author cannot contain standalone '---' delimiter lines.");
      return;
    }
    setCommentSaving(true);
    setError(null);
    preserveEditModeAfterCommentRefresh.current = true;
    try {
      const updatedTask = await apiClient.updateTask(task.id, {
        commentsAppend: [body],
        ...(author.length > 0 && { commentAuthor: author }),
      });
      setDisplayComments(updatedTask.comments ?? []);
      setCommentsChanged(true);
      setCommentBody("");
      setCommentAuthor("");
    } catch (err) {
      preserveEditModeAfterCommentRefresh.current = false;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommentSaving(false);
    }
  };

  // labels handled via ChipInput; no textarea parsing

	const handleComplete = async () => {
		if (demoting) return;
		if (!task) return;
		if (!window.confirm("Move this task off the board to completed storage? Its record and dependency links will be preserved.")) return;
		try {
			await apiClient.completeTask(task.id);
			if (onSaved) await onSaved();
			onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
		}
	};

	const handleDemote = async () => {
		if (!task || !canDemote || activeDemotionRequest.current !== null) return;
		if (!window.confirm(`Demote "${task.title}" to draft? It will be moved to the drafts folder.`)) return;

		const request = { identity: demotionIdentity };
		activeDemotionRequest.current = request;
		const isCurrentRequest = () =>
			activeDemotionRequest.current === request && demotionIdentityRef.current === request.identity;
		const finishWithRefreshWarning = async (message: string) => {
			window.dispatchEvent(new window.Event("drafts-updated"));
			try {
				if (onSaved) await onSaved();
			} catch (refreshError) {
				console.error("Task was demoted, but refreshing the Web UI failed", refreshError);
			}
			if (!isCurrentRequest()) return;
			try {
				window.alert(message);
			} catch {
				setError(message);
			}
			onClose();
		};
		setDemoting(true);
		setError(null);
		try {
			const { cleanedTaskIds } = await apiClient.demoteTask(task.id);
			if (!isCurrentRequest()) return;
			onDependencyCleanup?.(task.id, cleanedTaskIds);
			try {
				window.dispatchEvent(new window.Event("drafts-updated"));
				if (onSaved) await onSaved();
			} catch {
				await finishWithRefreshWarning(
					"The task was moved to drafts, but refreshing the view failed. Close this dialog and verify the draft before retrying.",
				);
				return;
			}
			if (!isCurrentRequest()) return;
			onClose();
		} catch (err) {
			if (!isCurrentRequest()) return;
			const demotionFailureState = readMovedFailureState(err, "demotionState");
			if (demotionFailureState) {
				const demotionFailureCause = readDemotionFailureCause(err);
				const message =
					demotionFailureState === "moved"
						? demotionFailureCause === "cleanup"
							? "The task was moved to drafts, but removing references from dependent tasks failed. Some dependent tasks may still reference it. The view was refreshed; check those tasks before retrying."
							: demotionFailureCause === "commit"
								? "The task was moved to drafts, but recording the Git commit failed. The view was refreshed; verify the draft before retrying."
								: "The task was moved to drafts, but a later step failed. The view was refreshed; verify the draft and dependent tasks before retrying."
						: "The demotion encountered a filesystem failure and may have left both task and draft copies. The view was refreshed; inspect them before retrying.";
				await finishWithRefreshWarning(message);
				return;
			}
			if (err instanceof NetworkError) {
				await finishWithRefreshWarning(
					"The demotion request may have succeeded, but its response was lost. Check the task and drafts views before retrying.",
				);
				return;
			}
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			if (isCurrentRequest()) {
				activeDemotionRequest.current = null;
				setDemoting(false);
			}
		}
	};

  const handleArchive = async () => {
    if (demoting) return;
    if (!task || !onArchive) return;
    if (!window.confirm(`Archive "${task.title}"? Use Archive for canceled, duplicate, or invalid work. Incoming dependencies and task references will be removed.`)) return;
    await onArchive();
  };

	const isFinalStatus = isTerminalStatus(status, availableStatuses.length ? availableStatuses : DEFAULT_STATUSES);
	const canDemote = Boolean(
		task && !isDraftMode && !isOpenDraft && isLocalEditableTask(task) && task.source !== "completed" && !isFromOtherBranch,
	);
  const displayId = task?.id ?? "";

  useTaskDetailsModalShortcuts({
    mode,
    isFinalStatus,
    onCancel: handleCancelEdit,
    onSave: () => void handleSave(),
    onEdit: () => setMode("edit"),
    onComplete: () => void handleComplete(),
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
		if (demoting) return;
        // When in edit mode, confirm closing if dirty
        if (mode === "edit" && isDirty) {
          if (!window.confirm("Discard unsaved changes and close?")) return;
        }
        refreshAfterCommentChange();
        onClose();
      }}
      title={isCreateMode ? (isDraftMode ? "Create New Draft" : "Create New Task") : `${displayId} — ${task.title}`}
      maxWidthClass="max-w-5xl"
      disableEscapeClose={mode === "edit" || mode === "create" || demoting}
      actions={<TaskDetailsModalActions mode={mode} isCreateMode={isCreateMode} isFromOtherBranch={isFromOtherBranch} isFinalStatus={isFinalStatus} canDemote={canDemote} saving={saving} demoting={demoting} onComplete={() => void handleComplete()} onDemote={() => void handleDemote()} onEdit={() => setMode("edit")} onCancel={handleCancelEdit} onSave={() => void handleSave()} />}
    >
      {error && (
        <div role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

		<fieldset disabled={demoting} className="contents" aria-busy={demoting}>
      {/* Cross-branch task indicator */}
      {isFromOtherBranch && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg text-amber-800 dark:text-amber-200">
          <svg className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <div className="flex-1">
            <span className="font-medium">Read-only:</span> This task exists in the <span className="font-semibold">{task?.branch}</span> branch. Switch to that branch to edit it.
          </div>
        </div>
      )}

      {parentTask && task && (
        <nav
          aria-label="Task hierarchy"
          className="mb-4"
          data-task-hierarchy
          onClickCapture={confirmNavigationAwayFromEdits}
        >
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
            <li className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Parent
            </li>
            <li className="min-w-0 max-w-full">
              <button
                type="button"
                onClick={() => onNavigateToTask?.(parentTask)}
                disabled={!onNavigateToTask}
                data-parent-task-id={parentTask.id}
                data-parent-task-href={createUrlPath('/tasks', parentTask.id, parentTask.title)}
                className="group inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1 text-left text-gray-700 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-default disabled:hover:bg-transparent dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white"
                aria-label={`Open parent task ${parentTask.id}: ${parentTask.title} (${parentTask.status})`}
              >
                <span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {parentTask.id}
                </span>
                <span className="min-w-0 break-words font-medium">{parentTask.title}</span>
                <HierarchyStatusBadge status={parentTask.status} statuses={availableStatuses} />
              </button>
            </li>
            <li aria-hidden="true">
              <HierarchyChevron />
            </li>
            <li aria-current="page" className="font-mono text-xs text-gray-500 dark:text-gray-400">
              {task.id}
            </li>
          </ol>
        </nav>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" onClickCapture={confirmNavigationAwayFromEdits}>
        <TaskDetailsContent
          task={task}
          mode={mode}
          isCreateMode={isCreateMode}
          isFromOtherBranch={isFromOtherBranch}
          theme={theme}
          state={{ title, description, plan, notes, finalSummary, criteria, definitionOfDone, references, modifiedFiles, displayComments, commentAuthor, commentBody }}
          availableTasks={availableTasks}
          availableStatuses={availableStatuses}
          dependencyGraph={dependencyGraph}
          subtasks={subtasks}
          subtaskProgress={subtaskProgress}
          onNavigateToTask={onNavigateToTask}
          onInlineMetaUpdate={handleInlineMetaUpdate}
          onChange={{ title: setTitle, description: setDescription, plan: setPlan, notes: setNotes, finalSummary: setFinalSummary, criteria: setCriteria, definitionOfDone: setDefinitionOfDone, commentAuthor: setCommentAuthor, commentBody: setCommentBody }}
          onToggleCriterion={(index, checked) => void handleToggleCriterion(index, checked)}
          onToggleDefinitionOfDone={(index, checked) => void handleToggleDefinitionOfDone(index, checked)}
          onAddComment={() => void handleAddComment()}
          commentSaving={commentSaving}
          dateFormat={dateFormat}
        />

        <TaskDetailsMetadata
          task={task as Task | undefined}
          mode={mode}
          isFromOtherBranch={isFromOtherBranch}
          isOpenDraft={isOpenDraft}
          state={{ title, status, assignee, labels, priority, taskType, project, milestone, dueDate, dependencies }}
          availableTasks={availableTasks}
          localAvailableTasks={localAvailableTasks}
          priorityOptions={priorityOptions}
          typeOptions={typeOptions}
          projectOptions={projectOptions}
          typeSelectionValue={typeSelectionValue}
          canonicalTypeSelection={canonicalTypeSelection}
          projectSelectionValue={projectSelectionValue}
          canonicalProjectSelection={canonicalProjectSelection}
          milestoneSelectionValue={milestoneSelectionValue}
          hasMilestoneSelection={hasMilestoneSelection}
          milestoneEntities={milestoneEntities}
          archivedMilestoneEntities={archivedMilestoneEntities}
          shownReadiness={shownReadiness}
          typeUpdateError={typeUpdateError}
          isTypeUpdating={isTypeUpdating}
          demoting={demoting}
          onChange={{ title: setTitle, milestone: setMilestone, dueDate: setDueDate }}
          onInlineMetaUpdate={handleInlineMetaUpdate}
          onTaskTypeChange={(value) => void handleTaskTypeChange(value)}
          onArchive={() => void handleArchive()}
          hasArchiveAction={Boolean(onArchive)}
          dateFormat={dateFormat}
        />
	      </div>
		</fieldset>
    </Modal>
  );
};

export default TaskDetailsModal;
