import type { TaskUpdateInput } from "../types/index.ts";
import type { TaskEditArgs } from "../types/task-edit-args.ts";
import { normalizeStringList } from "./task-builders.ts";

function sanitizeStringArray(values: string[] | undefined): string[] | undefined {
	if (!values) return undefined;
	const trimmed = values.map((value) => String(value).trim()).filter((value) => value.length > 0);
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve a clearable list field: blank-only values are a no-op, an explicit empty array clears the list.
 */
function sanitizeClearableStringArray(values: string[] | undefined): string[] | undefined {
	if (values === undefined) return undefined;
	return sanitizeStringArray(values) ?? (values.length === 0 ? [] : undefined);
}

function sanitizeAppend(values: string[] | undefined): string[] | undefined {
	const sanitized = sanitizeStringArray(values);
	if (!sanitized) {
		return undefined;
	}
	return sanitized;
}

function toAcceptanceCriteriaEntries(values: string[] | undefined) {
	if (values === undefined) return undefined;
	const trimmed = values.map((value) => String(value).trim()).filter((value) => value.length > 0);
	return trimmed.map((text, index) => ({ text, checked: false, index: index + 1 }));
}

function normalizeChecklistAdditions(values: string[]): { text: string; checked: false }[] {
	return values
		.map((text) => String(text).trim())
		.filter((text) => text.length > 0)
		.map((text) => ({ text, checked: false }));
}

function assignStringFields(updateInput: TaskUpdateInput, args: TaskEditArgs): void {
	for (const field of ["title", "description", "status", "priority", "type", "project"] as const) {
		const value = args[field];
		if (typeof value === "string") updateInput[field] = value;
	}
}

function assignClearableValue(
	updateInput: TaskUpdateInput,
	field: "dueDate" | "milestone",
	value: string | null | undefined,
): void {
	if (value === null) updateInput[field] = null;
	else if (typeof value === "string") updateInput[field] = value.trim().length > 0 ? value : null;
}

function assignSanitizedList(
	updateInput: TaskUpdateInput,
	field:
		| "labels"
		| "addLabels"
		| "removeLabels"
		| "assignee"
		| "dependencies"
		| "references"
		| "addReferences"
		| "removeReferences"
		| "documentation"
		| "addDocumentation"
		| "removeDocumentation"
		| "modifiedFiles",
	values: string[] | undefined,
	clearable = false,
): void {
	const sanitized = clearable ? sanitizeClearableStringArray(values) : sanitizeStringArray(values);
	if (sanitized) updateInput[field] = sanitized;
}

function assignChecklistMutations(
	updateInput: TaskUpdateInput,
	args: TaskEditArgs,
	additionField: "acceptanceCriteriaAdd" | "definitionOfDoneAdd",
	outputField: "addAcceptanceCriteria" | "addDefinitionOfDone",
	mutations: ReadonlyArray<
		readonly [
			(
				| "acceptanceCriteriaRemove"
				| "definitionOfDoneRemove"
				| "acceptanceCriteriaCheck"
				| "definitionOfDoneCheck"
				| "acceptanceCriteriaUncheck"
				| "definitionOfDoneUncheck"
			),
			(
				| "removeAcceptanceCriteria"
				| "removeDefinitionOfDone"
				| "checkAcceptanceCriteria"
				| "checkDefinitionOfDone"
				| "uncheckAcceptanceCriteria"
				| "uncheckDefinitionOfDone"
			),
		]
	>,
): void {
	const additions = args[additionField];
	if (Array.isArray(additions) && additions.length > 0) {
		const normalized = normalizeChecklistAdditions(additions);
		if (normalized.length > 0) updateInput[outputField] = normalized;
	}
	for (const [inputField, outputField] of mutations) {
		const values = args[inputField] as number[] | undefined;
		if (Array.isArray(values) && values.length > 0) {
			updateInput[outputField] = [...values];
		}
	}
}

function assignTaskLists(updateInput: TaskUpdateInput, args: TaskEditArgs): void {
	if (typeof args.ordinal === "number") updateInput.ordinal = args.ordinal;
	const labels = normalizeStringList(args.labels);
	if (labels) updateInput.labels = labels;
	else if (args.labels?.length === 0) updateInput.labels = [];
	assignSanitizedList(updateInput, "addLabels", args.addLabels);
	assignSanitizedList(updateInput, "removeLabels", args.removeLabels);
	assignSanitizedList(updateInput, "assignee", args.assignee, true);
	assignSanitizedList(updateInput, "dependencies", args.dependencies, true);
	assignSanitizedList(updateInput, "references", args.references, true);
	assignSanitizedList(updateInput, "addReferences", args.addReferences);
	assignSanitizedList(updateInput, "removeReferences", args.removeReferences);
	assignSanitizedList(updateInput, "documentation", args.documentation, true);
	assignSanitizedList(updateInput, "addDocumentation", args.addDocumentation);
	assignSanitizedList(updateInput, "removeDocumentation", args.removeDocumentation);
	assignSanitizedList(updateInput, "modifiedFiles", args.modifiedFiles);
}

function assignTaskSections(updateInput: TaskUpdateInput, args: TaskEditArgs): void {
	const planSet = args.planSet ?? args.implementationPlan;
	if (typeof planSet === "string") updateInput.implementationPlan = planSet;
	const planAppends = sanitizeAppend(args.planAppend);
	if (planAppends) updateInput.appendImplementationPlan = planAppends;
	if (args.planClear) updateInput.clearImplementationPlan = true;
	const notesSet = args.notesSet ?? args.implementationNotes;
	if (typeof notesSet === "string") updateInput.implementationNotes = notesSet;
	const notesAppends = sanitizeAppend(args.notesAppend);
	if (notesAppends) updateInput.appendImplementationNotes = notesAppends;
	if (args.notesClear) updateInput.clearImplementationNotes = true;
	const commentsAppends = sanitizeAppend(args.commentsAppend);
	if (commentsAppends) {
		const author =
			typeof args.commentAuthor === "string" && args.commentAuthor.trim().length > 0
				? args.commentAuthor.trim()
				: undefined;
		updateInput.appendComments = commentsAppends.map((body) => ({ body, ...(author && { author }) }));
	}
	if (typeof args.finalSummary === "string") updateInput.finalSummary = args.finalSummary;
	const finalSummaryAppends = sanitizeAppend(args.finalSummaryAppend);
	if (finalSummaryAppends) updateInput.appendFinalSummary = finalSummaryAppends;
	if (args.finalSummaryClear) updateInput.clearFinalSummary = true;
	const criteriaSet = toAcceptanceCriteriaEntries(args.acceptanceCriteriaSet);
	if (criteriaSet) updateInput.acceptanceCriteria = criteriaSet;
}

export function buildTaskUpdateInput(args: TaskEditArgs): TaskUpdateInput {
	const updateInput: TaskUpdateInput = {};

	assignStringFields(updateInput, args);
	assignClearableValue(updateInput, "dueDate", args.dueDate);
	assignClearableValue(updateInput, "milestone", args.milestone);

	assignTaskLists(updateInput, args);
	assignTaskSections(updateInput, args);

	assignChecklistMutations(updateInput, args, "acceptanceCriteriaAdd", "addAcceptanceCriteria", [
		["acceptanceCriteriaRemove", "removeAcceptanceCriteria"],
		["acceptanceCriteriaCheck", "checkAcceptanceCriteria"],
		["acceptanceCriteriaUncheck", "uncheckAcceptanceCriteria"],
	]);
	assignChecklistMutations(updateInput, args, "definitionOfDoneAdd", "addDefinitionOfDone", [
		["definitionOfDoneRemove", "removeDefinitionOfDone"],
		["definitionOfDoneCheck", "checkDefinitionOfDone"],
		["definitionOfDoneUncheck", "uncheckDefinitionOfDone"],
	]);

	return updateInput;
}
