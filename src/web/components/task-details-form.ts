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
	const taskValues = (task ?? {}) as Partial<Task>;
	const text = (value?: string) => value || "";
	const items = <T>(value: T[] | undefined, fallback: T[]) => value || fallback;
	return {
		title: text(taskValues.title),
		description: text(taskValues.description),
		plan: text(taskValues.implementationPlan),
		notes: text(taskValues.implementationNotes),
		displayComments: taskValues.comments ?? [],
		finalSummary: text(taskValues.finalSummary),
		criteria: items(taskValues.acceptanceCriteriaItems, []),
		definitionOfDone: items(taskValues.definitionOfDoneItems, isCreateMode ? defaultDefinitionOfDone : []),
		status: isDraftMode ? "Draft" : text(taskValues.status || availableStatuses?.[0] || "To Do"),
		assignee: items(taskValues.assignee, createModeAssignee),
		labels: items(taskValues.labels, []),
		priority: text(taskValues.priority),
		taskType: text(taskValues.type),
		project: text(taskValues.project),
		dependencies: items(taskValues.dependencies, []),
		references: items(taskValues.references, []),
		modifiedFiles: items(taskValues.modifiedFiles, []),
		milestone: text(taskValues.milestone),
		dueDate: text(taskValues.dueDate),
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
	return isCreateMode
		? buildCreateDefinitionOfDonePayload(cleanedCurrent, definitionOfDoneDefaults)
		: buildExistingDefinitionOfDonePayload(task?.definitionOfDoneItems ?? [], cleanedCurrent);
}

function buildCreateDefinitionOfDonePayload(current: AcceptanceCriterion[], defaults: string[]): TaskUpdatePayload {
	const defaultItems = defaults
		.map((text) => text.trim())
		.filter(Boolean)
		.map((text, index) => ({ index: index + 1, text, checked: false }));
	const defaultsMatch = defaultItems.every(
		(item, index) => current[index]?.text === item.text && current[index]?.checked === false,
	);
	const definitionOfDoneAdd = (defaultsMatch ? current.slice(defaultItems.length) : current).map((item) => item.text);
	return {
		...(definitionOfDoneAdd.length > 0 ? { definitionOfDoneAdd } : {}),
		...(!defaultsMatch ? { disableDefinitionOfDoneDefaults: true } : {}),
	};
}

function buildExistingDefinitionOfDonePayload(
	original: AcceptanceCriterion[],
	current: AcceptanceCriterion[],
): TaskUpdatePayload {
	const changes = collectDefinitionOfDoneChanges(original, current);
	return {
		...(changes.additions.length > 0 ? { definitionOfDoneAdd: changes.additions } : {}),
		...(changes.removals.size > 0 ? { definitionOfDoneRemove: Array.from(changes.removals) } : {}),
		...(changes.checks.length > 0 ? { definitionOfDoneCheck: changes.checks } : {}),
		...(changes.unchecks.length > 0 ? { definitionOfDoneUncheck: changes.unchecks } : {}),
	};
}

function collectDefinitionOfDoneChanges(original: AcceptanceCriterion[], current: AcceptanceCriterion[]) {
	const originalByIndex = new Map(original.map((item) => [item.index, item]));
	const currentByIndex = new Map(current.map((item) => [item.index, item]));
	const changes = {
		removals: new Set<number>(),
		additions: [] as string[],
		checks: [] as number[],
		unchecks: [] as number[],
		nextIndex: original.reduce((max, item) => Math.max(max, item.index), 0),
	};
	current.forEach((item) => {
		applyChecklistItemChange(item, originalByIndex, changes);
	});
	original.forEach((item) => {
		if (!currentByIndex.has(item.index)) changes.removals.add(item.index);
	});
	return changes;
}

function applyChecklistItemChange(
	item: AcceptanceCriterion,
	original: Map<number, AcceptanceCriterion>,
	changes: { removals: Set<number>; additions: string[]; checks: number[]; unchecks: number[]; nextIndex: number },
) {
	const previous = original.get(item.index);
	if (!previous || previous.text !== item.text) {
		if (previous) changes.removals.add(item.index);
		changes.additions.push(item.text);
		changes.nextIndex += 1;
		if (item.checked) changes.checks.push(changes.nextIndex);
		return;
	}
	if (previous.checked !== item.checked) (item.checked ? changes.checks : changes.unchecks).push(item.index);
}
