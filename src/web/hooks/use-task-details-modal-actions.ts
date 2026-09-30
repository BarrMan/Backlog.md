import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef, useState } from "react";
import type { Task } from "../../types";
import { buildDefinitionOfDonePayload, type TaskUpdatePayload } from "../components/task-details-form";
import { apiClient, NetworkError, readDemotionFailureCause, readMovedFailureState } from "../lib/api";

type Mode = "preview" | "edit" | "create";

type SaveFields = {
	title: string;
	description: string;
	plan: string;
	notes: string;
	finalSummary: string;
	criteria: NonNullable<Task["acceptanceCriteriaItems"]>;
	definitionOfDone: NonNullable<Task["definitionOfDoneItems"]>;
	status: string;
	assignee: string[];
	labels: string[];
	priority: string;
	taskType: string;
	project: string;
	dependencies: string[];
	milestone: string;
	dueDate: string;
};

const errorMessage = (error: unknown, fallback?: string) =>
	error instanceof Error
		? error.message
		: typeof error === "object" && error !== null && "error" in error
			? String(error.error)
			: typeof error === "string"
				? error
				: (fallback ?? String(error));

const demotionWarning = (state: string, cause: string | null) =>
	state === "moved"
		? cause === "cleanup"
			? "The task was moved to drafts, but removing references from dependent tasks failed. Some dependent tasks may still reference it. The view was refreshed; check those tasks before retrying."
			: cause === "commit"
				? "The task was moved to drafts, but recording the Git commit failed. The view was refreshed; verify the draft before retrying."
				: "The task was moved to drafts, but a later step failed. The view was refreshed; verify the draft and dependent tasks before retrying."
		: "The demotion encountered a filesystem failure and may have left both task and draft copies. The view was refreshed; inspect them before retrying.";

export function useTaskDetailsModalActions({
	task,
	isOpen,
	isCreateMode,
	isFromOtherBranch,
	canDemote,
	fields,
	createModeAssignee,
	definitionOfDoneDefaults,
	onSubmit,
	onSaved,
	onClose,
	onDependencyCleanup,
	setMode,
	setError,
	setDisplayComments,
	setCommentBody,
	setCommentAuthor,
	setCommentsChanged,
	preserveEditModeAfterCommentRefresh,
}: {
	task?: Task;
	isOpen: boolean;
	isCreateMode: boolean;
	isFromOtherBranch: boolean;
	canDemote: boolean;
	fields: SaveFields & { commentBody: string; commentAuthor: string };
	createModeAssignee: string[];
	definitionOfDoneDefaults?: string[];
	onSubmit?: (taskData: Partial<Task>) => Promise<void>;
	onSaved?: () => Promise<void> | void;
	onClose: () => void;
	onDependencyCleanup?: (taskId: string, cleanedTaskIds: string[]) => void;
	setMode: Dispatch<SetStateAction<Mode>>;
	setError: Dispatch<SetStateAction<string | null>>;
	setDisplayComments: (value: NonNullable<Task["comments"]>) => void;
	setCommentBody: (value: string) => void;
	setCommentAuthor: (value: string) => void;
	setCommentsChanged: Dispatch<SetStateAction<boolean>>;
	preserveEditModeAfterCommentRefresh: MutableRefObject<boolean>;
}) {
	const lifecycleKey = [
		isOpen ? "open" : "closed",
		task?.id,
		task?.source,
		task?.branch,
		isCreateMode ? "create" : "edit",
	].join("\0");
	const lifecycleRef = useRef({ key: lifecycleKey, epoch: 0, mounted: true });
	if (lifecycleRef.current.key !== lifecycleKey) {
		lifecycleRef.current = { key: lifecycleKey, epoch: lifecycleRef.current.epoch + 1, mounted: true };
	}
	const activeDemotionRequest = useRef<number | null>(null);
	const demotionRequestRef = useRef(0);
	const [saving, setSaving] = useState(false);
	const [commentSaving, setCommentSaving] = useState(false);
	const [demoting, setDemoting] = useState(false);

	useEffect(() => {
		if (lifecycleRef.current.key !== lifecycleKey) return;
		lifecycleRef.current.mounted = true;
		activeDemotionRequest.current = null;
		setSaving(false);
		setCommentSaving(false);
		setDemoting(false);
	}, [lifecycleKey]);

	useEffect(
		() => () => {
			lifecycleRef.current.epoch += 1;
			lifecycleRef.current.mounted = false;
			activeDemotionRequest.current = null;
		},
		[],
	);

	const isCurrent = (requestEpoch: number) =>
		lifecycleRef.current.mounted && lifecycleRef.current.epoch === requestEpoch;
	const buildSavePayload = (): TaskUpdatePayload => {
		const payload: TaskUpdatePayload = {
			title: fields.title.trim(),
			description: fields.description,
			implementationPlan: fields.plan,
			implementationNotes: fields.notes,
			finalSummary: fields.finalSummary,
			acceptanceCriteriaItems: fields.criteria,
			status: fields.status,
			...(isCreateMode && fields.assignee.length === 0 && createModeAssignee.length === 0
				? {}
				: { assignee: fields.assignee }),
			labels: fields.labels,
			priority: fields.priority === "" ? undefined : fields.priority,
			dependencies: fields.dependencies,
			milestone: fields.milestone.trim() || undefined,
			dueDate: fields.dueDate.trim() || (isCreateMode ? undefined : null),
		};
		if (isCreateMode) {
			payload.type = fields.taskType;
			payload.project = fields.project.trim() || undefined;
		}
		return Object.assign(
			payload,
			buildDefinitionOfDonePayload({
				task,
				definitionOfDone: fields.definitionOfDone,
				definitionOfDoneDefaults,
				isCreateMode,
			}),
		);
	};

	const save = async () => {
		if (demoting) return;
		if (isCreateMode && !fields.title.trim()) {
			setError("Title is required");
			return;
		}
		const requestEpoch = lifecycleRef.current.epoch;
		setSaving(true);
		setError(null);
		try {
			const payload = buildSavePayload();
			if (isCreateMode) await saveCreatedTask(payload, requestEpoch);
			else await saveExistingTask(payload, requestEpoch);
		} catch (error) {
			if (isCurrent(requestEpoch)) setError(errorMessage(error, "Failed to save task"));
		} finally {
			if (isCurrent(requestEpoch)) setSaving(false);
		}
	};

	const saveCreatedTask = async (payload: TaskUpdatePayload, requestEpoch: number) => {
		if (!onSubmit) return;
		await onSubmit({ ...payload, dueDate: payload.dueDate ?? undefined } as Partial<Task>);
		if (isCurrent(requestEpoch)) onClose();
	};

	const saveExistingTask = async (payload: TaskUpdatePayload, requestEpoch: number) => {
		if (!task) return;
		await apiClient.updateTask(task.id, payload);
		if (!isCurrent(requestEpoch)) return;
		setMode("preview");
		await onSaved?.();
		if (isCurrent(requestEpoch)) setCommentsChanged(false);
	};

	const addComment = async () => {
		if (demoting || !task || isFromOtherBranch) return;
		const body = fields.commentBody.trim();
		const author = fields.commentAuthor.trim();
		if (!body) return;
		if (/^\s*---\s*$/m.test(body.replace(/\r\n/g, "\n"))) {
			setError("Comment body cannot contain standalone '---' delimiter lines.");
			return;
		}
		if (author && /^\s*---\s*$/m.test(author.replace(/\r\n/g, "\n"))) {
			setError("Comment author cannot contain standalone '---' delimiter lines.");
			return;
		}
		const requestEpoch = lifecycleRef.current.epoch;
		setCommentSaving(true);
		setError(null);
		preserveEditModeAfterCommentRefresh.current = true;
		try {
			const updatedTask = await apiClient.updateTask(task.id, {
				commentsAppend: [body],
				...(author && { commentAuthor: author }),
			});
			if (!isCurrent(requestEpoch)) return;
			setDisplayComments(updatedTask.comments ?? []);
			setCommentsChanged(true);
			setCommentBody("");
			setCommentAuthor("");
		} catch (error) {
			if (isCurrent(requestEpoch)) {
				preserveEditModeAfterCommentRefresh.current = false;
				setError(errorMessage(error));
			}
		} finally {
			if (isCurrent(requestEpoch)) setCommentSaving(false);
		}
	};

	const complete = async () => {
		if (
			demoting ||
			!task ||
			!window.confirm(
				"Move this task off the board to completed storage? Its record and dependency links will be preserved.",
			)
		)
			return;
		const requestEpoch = lifecycleRef.current.epoch;
		try {
			await apiClient.completeTask(task.id);
			if (!isCurrent(requestEpoch)) return;
			await onSaved?.();
			if (isCurrent(requestEpoch)) onClose();
		} catch (error) {
			if (isCurrent(requestEpoch)) setError(errorMessage(error));
		}
	};

	const demote = async () => {
		if (
			!task ||
			!canDemote ||
			activeDemotionRequest.current ||
			!window.confirm(`Demote "${task.title}" to draft? It will be moved to the drafts folder.`)
		)
			return;
		const request = ++demotionRequestRef.current;
		const requestEpoch = lifecycleRef.current.epoch;
		activeDemotionRequest.current = request;
		const isCurrentRequest = () => activeDemotionRequest.current === request && isCurrent(requestEpoch);
		const refreshAndCloseWithWarning = async (message: string) => {
			window.dispatchEvent(new window.Event("drafts-updated"));
			try {
				await onSaved?.();
			} catch (error) {
				console.error("Task was demoted, but refreshing the Web UI failed", error);
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
				await onSaved?.();
			} catch {
				await refreshAndCloseWithWarning(
					"The task was moved to drafts, but refreshing the view failed. Close this dialog and verify the draft before retrying.",
				);
				return;
			}
			if (isCurrentRequest()) onClose();
		} catch (error) {
			if (!isCurrentRequest()) return;
			const state = readMovedFailureState(error, "demotionState");
			if (state) {
				await refreshAndCloseWithWarning(demotionWarning(state, readDemotionFailureCause(error)));
			} else if (error instanceof NetworkError) {
				await refreshAndCloseWithWarning(
					"The demotion request may have succeeded, but its response was lost. Check the task and drafts views before retrying.",
				);
			} else {
				setError(errorMessage(error));
			}
		} finally {
			if (isCurrentRequest()) {
				activeDemotionRequest.current = null;
				setDemoting(false);
			}
		}
	};

	return { saving, commentSaving, demoting, resetCommentSaving: setCommentSaving, save, addComment, complete, demote };
}
