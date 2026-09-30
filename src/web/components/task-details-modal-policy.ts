import type { MouseEvent } from "react";
import { DEFAULT_STATUSES } from "../../constants/index.ts";
import { type TaskDetail, taskDependencyGraph, taskReadiness } from "../../core/task-detail";
import { isLocalEditableTask, type Milestone, type Task } from "../../types";
import { resolveProjectValue } from "../../utils/project-config";
import { findDirectSubtasks, findParentTask, summarizeSubtaskProgress } from "../../utils/task-subtasks";
import { resolveTaskTypeValue } from "../../utils/task-type-config";
import { isTerminalStatus } from "../../utils/terminal-status";
import { resolveMilestoneSelection } from "../utils/milestone-aliases";
import { buildTaskIdIndex, resolveTaskReference } from "../utils/task-id-links";

export function defaultDefinitionOfDone(defaults?: string[]) {
	return (defaults ?? []).map((text, index) => ({ index: index + 1, text, checked: false }));
}

export function createModeAssignee(isCreateMode: boolean, defaultAssignee?: string[]) {
	return isCreateMode ? (defaultAssignee ?? []) : [];
}

export function taskDetailsModalPresentation({
	task,
	isCreateMode,
	isDraftMode,
	mode,
	isDirty,
	commentBody,
	commentAuthor,
	hasCreateEntries,
	demoting,
}: {
	task?: Task | TaskDetail;
	isCreateMode: boolean;
	isDraftMode?: boolean;
	mode: "preview" | "edit" | "create";
	isDirty: boolean;
	commentBody: string;
	commentAuthor: string;
	hasCreateEntries: boolean;
	demoting: boolean;
}) {
	const hasUnsavedEdits =
		(mode === "edit" || mode === "create") &&
		(isDirty || commentBody.trim() !== "" || commentAuthor.trim() !== "" || hasCreateEntries);
	return {
		hasUnsavedEdits,
		title: isCreateMode
			? isDraftMode
				? "Create New Draft"
				: "Create New Task"
			: `${task?.id ?? ""} — ${task?.title ?? ""}`,
		disableEscapeClose: mode === "edit" || mode === "create" || demoting,
	};
}

function confirmTaskDetailsNavigation(event: MouseEvent<HTMLElement>, hasUnsavedEdits: boolean) {
	if (!hasUnsavedEdits || event.defaultPrevented || event.button !== 0) return;
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
	if (!link || (link.target && link.target !== "_self")) return;
	const destination = new URL(link.href, window.location.href);
	if (destination.protocol !== "http:" && destination.protocol !== "https:") return;
	// Same-page anchors (markdown heading links) do not unload the form.
	if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
	if (window.confirm("Discard unsaved changes and leave this task?")) return;
	event.preventDefault();
	event.stopPropagation();
}

export function taskDetailsNavigationHandler(hasUnsavedEdits: boolean) {
	return (event: MouseEvent<HTMLElement>) => confirmTaskDetailsNavigation(event, hasUnsavedEdits);
}

export function localEditableTasks(availableTasks: Task[]) {
	const local = availableTasks.filter(isLocalEditableTask);
	const index = buildTaskIdIndex(local);
	return local.filter((candidate) => resolveTaskReference(index, candidate.id) === candidate);
}

export function taskDetailsDerivedState({
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
}: {
	task?: Task | TaskDetail;
	status: string;
	dependencies: string[];
	availableTasks: Task[];
	availableStatuses: string[];
	typeOptions: string[];
	projectOptions: string[];
	milestoneEntities?: Milestone[];
	archivedMilestoneEntities?: Milestone[];
	taskType: string;
	project: string;
	milestone: string;
	isDraftMode?: boolean;
	isOpenDraft: boolean;
	isFromOtherBranch: boolean;
}) {
	const canonicalTypeSelection = resolveTaskTypeValue(taskType, typeOptions);
	const canonicalProjectSelection = resolveProjectValue(project, projectOptions);
	const milestoneSelectionValue = resolveMilestoneSelection(
		milestone,
		milestoneEntities ?? [],
		archivedMilestoneEntities ?? [],
	);
	const readiness = taskReadiness(task);
	return {
		canonicalTypeSelection,
		typeSelectionValue: canonicalTypeSelection ?? taskType,
		canonicalProjectSelection,
		projectSelectionValue: canonicalProjectSelection ?? project,
		milestoneSelectionValue,
		hasMilestoneSelection: (milestoneEntities ?? []).some((entity) => entity.id === milestoneSelectionValue),
		dependencyGraph: taskDependencyGraph(task),
		shownReadiness: isShownReadiness(readiness, dependencies, task, status),
		parentTask: task ? findParentTask(task, availableTasks) : null,
		subtasks: task ? findDirectSubtasks(task, availableTasks) : [],
		subtaskProgress: task ? summarizeSubtaskProgress(task, availableTasks, availableStatuses) : null,
		isFinalStatus: isTerminalStatus(status, availableStatuses.length ? availableStatuses : DEFAULT_STATUSES),
		canDemote: Boolean(
			task &&
				!isDraftMode &&
				!isOpenDraft &&
				isLocalEditableTask(task) &&
				task.source !== "completed" &&
				!isFromOtherBranch,
		),
	};
}

function isShownReadiness(
	readiness: ReturnType<typeof taskReadiness>,
	dependencies: string[],
	task: Task | TaskDetail | undefined,
	status: string,
) {
	if (!readiness || (!readiness.isReady && !readiness.isBlocked) || dependencies.length === 0) return null;
	return dependencies.join(",") === (task?.dependencies ?? []).join(",") && status === (task?.status ?? "")
		? readiness
		: null;
}
