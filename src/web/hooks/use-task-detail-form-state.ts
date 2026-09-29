import { useCallback, useMemo, useReducer, useRef } from "react";
import type { TaskDetail } from "../../core/task-detail";
import type { AcceptanceCriterion, Task } from "../../types";
import { buildTaskDetailsFormState, type TaskDetailsFormState } from "../components/task-details-form";

export type TaskDetailFormState = TaskDetailsFormState & {
	commentAuthor: string;
	commentBody: string;
};

type FormField = keyof TaskDetailFormState;

type FormAction =
	| { type: "set"; field: FormField; value: TaskDetailFormState[FormField] }
	| { type: "replace"; state: TaskDetailFormState }
	| { type: "resetEditableContent"; baseline: TaskDetailsFormState }
	| { type: "mergeRefresh"; baseline: TaskDetailsFormState; next: TaskDetailsFormState };

const areJsonEqual = (first: unknown, second: unknown): boolean => JSON.stringify(first) === JSON.stringify(second);

const preserveDirtyRefreshValue = <T>(
	current: T,
	previous: T,
	next: T,
	isEqual: (first: T, second: T) => boolean = Object.is,
): T => (isEqual(current, previous) ? next : current);

export function mergeTaskDetailFormRefresh(
	state: TaskDetailFormState,
	baseline: TaskDetailsFormState,
	next: TaskDetailsFormState,
): TaskDetailFormState {
	return {
		...next,
		...Object.fromEntries(
			(Object.keys(next) as (keyof TaskDetailsFormState)[]).map((field) => [
				field,
				preserveDirtyRefreshValue(
					state[field],
					baseline[field],
					next[field],
					field === "criteria" ||
						field === "definitionOfDone" ||
						field === "assignee" ||
						field === "labels" ||
						field === "dependencies" ||
						field === "references" ||
						field === "modifiedFiles"
						? areJsonEqual
						: undefined,
				),
			]),
		),
		commentAuthor: "",
		commentBody: "",
	};
}

function reducer(state: TaskDetailFormState, action: FormAction): TaskDetailFormState {
	if (action.type === "set") return { ...state, [action.field]: action.value } as TaskDetailFormState;
	if (action.type === "replace") return action.state;
	if (action.type === "mergeRefresh") return mergeTaskDetailFormRefresh(state, action.baseline, action.next);
	return resetTaskDetailEditableContent(state, action.baseline);
}

export function resetTaskDetailEditableContent(
	state: TaskDetailFormState,
	baseline: TaskDetailsFormState,
): TaskDetailFormState {
	return {
		...state,
		title: baseline.title,
		description: baseline.description,
		plan: baseline.plan,
		notes: baseline.notes,
		finalSummary: baseline.finalSummary,
		dueDate: baseline.dueDate,
		criteria: baseline.criteria,
		definitionOfDone: baseline.definitionOfDone,
		commentAuthor: "",
		commentBody: "",
	};
}

function isDirty(state: TaskDetailFormState, baseline: TaskDetailsFormState): boolean {
	return (
		state.title !== baseline.title ||
		state.description !== baseline.description ||
		state.plan !== baseline.plan ||
		state.notes !== baseline.notes ||
		state.finalSummary !== baseline.finalSummary ||
		state.dueDate !== baseline.dueDate ||
		!areJsonEqual(state.criteria, baseline.criteria) ||
		!areJsonEqual(state.definitionOfDone, baseline.definitionOfDone)
	);
}

export function hasCreateModeEntries(state: TaskDetailFormState, createModeAssignee: string[]): boolean {
	return (
		state.title.trim() !== "" ||
		state.taskType.trim() !== "" ||
		state.priority.trim() !== "" ||
		state.project.trim() !== "" ||
		state.milestone.trim() !== "" ||
		state.dueDate.trim() !== "" ||
		!areJsonEqual(state.assignee, createModeAssignee) ||
		state.labels.length > 0 ||
		state.dependencies.length > 0 ||
		state.references.length > 0 ||
		state.modifiedFiles.length > 0
	);
}

export function useTaskDetailFormState({
	task,
	isCreateMode,
	isDraftMode,
	availableStatuses,
	defaultDefinitionOfDone,
	createModeAssignee,
}: {
	task?: Task | TaskDetail;
	isCreateMode: boolean;
	isDraftMode?: boolean;
	availableStatuses?: string[];
	defaultDefinitionOfDone: AcceptanceCriterion[];
	createModeAssignee: string[];
}) {
	const makeSnapshot = useCallback(
		() =>
			buildTaskDetailsFormState({
				task,
				isCreateMode,
				isDraftMode,
				availableStatuses,
				defaultDefinitionOfDone,
				createModeAssignee,
			}),
		[task, isCreateMode, isDraftMode, availableStatuses, defaultDefinitionOfDone, createModeAssignee],
	);
	const baselineRef = useRef<TaskDetailsFormState>(makeSnapshot());
	const [state, dispatch] = useReducer(reducer, baselineRef.current, (baseline) => ({
		...baseline,
		commentAuthor: "",
		commentBody: "",
	}));

	const setField = useCallback(<K extends FormField>(field: K, value: TaskDetailFormState[K]) => {
		dispatch({ type: "set", field, value });
	}, []);

	const sync = useCallback(
		(preserveDirtyFields: boolean) => {
			const next = makeSnapshot();
			if (preserveDirtyFields) {
				dispatch({ type: "mergeRefresh", baseline: baselineRef.current, next });
			} else {
				dispatch({ type: "replace", state: { ...next, commentAuthor: "", commentBody: "" } });
			}
			baselineRef.current = next;
		},
		[makeSnapshot],
	);

	const resetEditableContent = useCallback(() => {
		dispatch({ type: "resetEditableContent", baseline: baselineRef.current });
	}, []);

	return {
		state,
		setField,
		sync,
		resetEditableContent,
		isDirty: useMemo(() => isDirty(state, baselineRef.current), [state]),
	};
}
