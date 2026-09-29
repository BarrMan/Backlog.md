import type { TaskDetail } from "../../core/task-detail";
import type { AcceptanceCriterion, Task, TaskComment } from "../../types";

export type TaskUpdatePayload = Omit<Partial<Task>, "dueDate" | "project"> & {
	dueDate?: string | null;
	project?: string | null;
	definitionOfDoneAdd?: string[];
	definitionOfDoneRemove?: number[];
	definitionOfDoneCheck?: number[];
	definitionOfDoneUncheck?: number[];
	disableDefinitionOfDoneDefaults?: boolean;
	commentsAppend?: string[];
	commentAuthor?: string;
};

export type TaskDetailsFormState = {
	title: string;
	description: string;
	plan: string;
	notes: string;
	displayComments: TaskComment[];
	finalSummary: string;
	criteria: AcceptanceCriterion[];
	definitionOfDone: AcceptanceCriterion[];
	status: string;
	assignee: string[];
	labels: string[];
	priority: string;
	taskType: string;
	project: string;
	dependencies: string[];
	references: string[];
	modifiedFiles: string[];
	milestone: string;
	dueDate: string;
};

export function buildTaskDetailsFormState({
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
}): TaskDetailsFormState {
	return {
		title: task?.title || "",
		description: task?.description || "",
		plan: task?.implementationPlan || "",
		notes: task?.implementationNotes || "",
		displayComments: task?.comments ?? [],
		finalSummary: task?.finalSummary || "",
		criteria: task?.acceptanceCriteriaItems || [],
		definitionOfDone: task?.definitionOfDoneItems || (isCreateMode ? defaultDefinitionOfDone : []),
		status: isDraftMode ? "Draft" : task?.status || availableStatuses?.[0] || "To Do",
		assignee: task?.assignee || createModeAssignee,
		labels: task?.labels || [],
		priority: task?.priority || "",
		taskType: task?.type || "",
		project: task?.project || "",
		dependencies: task?.dependencies || [],
		references: task?.references || [],
		modifiedFiles: task?.modifiedFiles || [],
		milestone: task?.milestone || "",
		dueDate: task?.dueDate || "",
	};
}

function normalizeChecklistItems(items: AcceptanceCriterion[]): AcceptanceCriterion[] {
	return items.map((item) => ({ ...item, text: item.text.trim() })).filter((item) => item.text.length > 0);
}

export function buildDefinitionOfDonePayload({
	task,
	definitionOfDone,
	definitionOfDoneDefaults = [],
	isCreateMode,
}: {
	task?: Task | TaskDetail;
	definitionOfDone: AcceptanceCriterion[];
	definitionOfDoneDefaults?: string[];
	isCreateMode: boolean;
}): TaskUpdatePayload {
	const cleanedCurrent = normalizeChecklistItems(definitionOfDone);
	if (isCreateMode) {
		const defaults = definitionOfDoneDefaults.map((item) => item.trim()).filter((item) => item.length > 0);
		const defaultItems = defaults.map((text, index) => ({ index: index + 1, text, checked: false }));
		const defaultsMatch =
			cleanedCurrent.length >= defaultItems.length &&
			defaultItems.every(
				(item, index) => cleanedCurrent[index]?.text === item.text && cleanedCurrent[index]?.checked === false,
			);
		const definitionOfDoneAdd = (defaultsMatch ? cleanedCurrent.slice(defaultItems.length) : cleanedCurrent).map(
			(item) => item.text,
		);
		return {
			...(definitionOfDoneAdd.length > 0 ? { definitionOfDoneAdd } : {}),
			...(!defaultsMatch ? { disableDefinitionOfDoneDefaults: true } : {}),
		};
	}

	const original = task?.definitionOfDoneItems ?? [];
	const originalByIndex = new Map(original.map((item) => [item.index, item]));
	const currentByIndex = new Map(cleanedCurrent.map((item) => [item.index, item]));
	const removals = new Set<number>();
	const additions: string[] = [];
	const checks: number[] = [];
	const unchecks: number[] = [];
	let nextIndex = original.reduce((max, item) => Math.max(max, item.index), 0);

	for (const item of cleanedCurrent) {
		const originalItem = originalByIndex.get(item.index);
		if (!originalItem || originalItem.text !== item.text) {
			if (originalItem) removals.add(item.index);
			additions.push(item.text);
			nextIndex += 1;
			if (item.checked) checks.push(nextIndex);
			continue;
		}
		if (originalItem.checked !== item.checked) {
			(item.checked ? checks : unchecks).push(item.index);
		}
	}
	for (const item of original) {
		if (!currentByIndex.has(item.index)) removals.add(item.index);
	}
	return {
		...(additions.length > 0 ? { definitionOfDoneAdd: additions } : {}),
		...(removals.size > 0 ? { definitionOfDoneRemove: Array.from(removals) } : {}),
		...(checks.length > 0 ? { definitionOfDoneCheck: checks } : {}),
		...(unchecks.length > 0 ? { definitionOfDoneUncheck: unchecks } : {}),
	};
}
