import type { TaskUpdateInput } from "../types/index.ts";
import { normalizeDueDate } from "../utils/due-date.ts";
import { getTaskPrefixError } from "../utils/prefix-config.ts";

export type ValidationResult<T> = { value: T } | { error: string };

const TASK_STRING_FIELDS = [
	"title",
	"description",
	"status",
	"priority",
	"type",
	"implementationPlan",
	"implementationNotes",
	"finalSummary",
] as const;
const TASK_ARRAY_FIELDS = [
	"labels",
	"addLabels",
	"removeLabels",
	"assignee",
	"dependencies",
	"addDependencies",
	"removeDependencies",
	"references",
	"addReferences",
	"removeReferences",
	"documentation",
	"addDocumentation",
	"removeDocumentation",
	"modifiedFiles",
	"appendImplementationPlan",
	"appendImplementationNotes",
	"appendFinalSummary",
	"removeAcceptanceCriteria",
	"checkAcceptanceCriteria",
	"uncheckAcceptanceCriteria",
] as const;
const TASK_INDEX_FIELDS = [
	["definitionOfDoneRemove", "removeDefinitionOfDone"],
	["definitionOfDoneCheck", "checkDefinitionOfDone"],
	["definitionOfDoneUncheck", "uncheckDefinitionOfDone"],
] as const;

function copyFields<T extends readonly string[]>(
	input: TaskUpdateInput,
	body: Record<string, unknown>,
	fields: T,
): void {
	for (const field of fields)
		if (typeof body[field] === "string") input[field as keyof TaskUpdateInput] = body[field] as never;
}

function copyArrayFields(input: TaskUpdateInput, body: Record<string, unknown>): void {
	for (const field of TASK_ARRAY_FIELDS) if (Array.isArray(body[field])) input[field] = body[field] as never;
}

function copyIndexFields(input: TaskUpdateInput, body: Record<string, unknown>): string | undefined {
	for (const [field, target] of TASK_INDEX_FIELDS) {
		const indices = body[field];
		if (indices === undefined) continue;
		if (!Array.isArray(indices) || indices.some((value) => typeof value !== "number" || !Number.isFinite(value)))
			return `${field} must be an array of finite numbers.`;
		input[target] = indices;
	}
}

function copyTaskComments(input: TaskUpdateInput, body: Record<string, unknown>): void {
	if (!Array.isArray(body.commentsAppend)) return;
	const author =
		typeof body.commentAuthor === "string" && body.commentAuthor.trim() ? body.commentAuthor.trim() : undefined;
	input.appendComments = body.commentsAppend
		.map((body) => ({ body: String(body ?? "").trim(), ...(author && { author }) }))
		.filter((comment) => comment.body);
}

function copyTaskChecklistFields(input: TaskUpdateInput, body: Record<string, unknown>): void {
	if (Array.isArray(body.acceptanceCriteriaItems))
		input.acceptanceCriteria = normalizeAcceptanceCriteriaItems(body.acceptanceCriteriaItems);
	else if (Array.isArray(body.acceptanceCriteria))
		input.acceptanceCriteria = body.acceptanceCriteria as TaskUpdateInput["acceptanceCriteria"];
	if (Array.isArray(body.addAcceptanceCriteria)) input.addAcceptanceCriteria = body.addAcceptanceCriteria as never;
	if (Array.isArray(body.definitionOfDoneAdd))
		input.addDefinitionOfDone = body.definitionOfDoneAdd
			.map((item) => ({ text: String(item ?? "").trim(), checked: false }))
			.filter((item) => item.text);
}

function copyTaskUpdateFlags(input: TaskUpdateInput, body: Record<string, unknown>): void {
	for (const field of ["clearImplementationPlan", "clearImplementationNotes", "clearFinalSummary"] as const)
		if (typeof body[field] === "boolean") input[field] = body[field];
	if (typeof body.rawContent === "string") input.rawContent = body.rawContent;
	if (body.agentConfiguration === null || (body.agentConfiguration && typeof body.agentConfiguration === "object"))
		input.agentConfiguration = body.agentConfiguration as TaskUpdateInput["agentConfiguration"];
}

export function parseDueDate(value: unknown, clearable: boolean): ValidationResult<string | null | undefined> {
	if (value === undefined) return { value: undefined };
	if (value === null) return clearable ? { value: null } : { error: "Due date must be a string." };
	if (typeof value !== "string") return { error: `Due date must be a string${clearable ? " or null" : ""}.` };
	try {
		return { value: normalizeDueDate(value, "Due date") };
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

export function normalizeAcceptanceCriteriaItems(value: unknown): Array<{ text: string; checked: boolean }> {
	if (!Array.isArray(value)) return [];
	return value
		.map((item: { text?: string; checked?: boolean }) => ({
			text: String(item?.text ?? "").trim(),
			checked: Boolean(item?.checked),
		}))
		.filter((item) => item.text.length > 0);
}

export function parseTaskUpdate(body: unknown): ValidationResult<TaskUpdateInput & { milestone?: string | null }> {
	if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Request body must be an object." };
	const updates = body as Record<string, unknown>;
	const dueDate = parseDueDate(updates.dueDate, true);
	if ("error" in dueDate) return dueDate;
	const input: TaskUpdateInput & { milestone?: string | null } = {};
	const indexError = copyIndexFields(input, updates);
	if (indexError) return { error: indexError };
	copyFields(input, updates, TASK_STRING_FIELDS);
	if ("dueDate" in updates) input.dueDate = dueDate.value ?? null;
	if (typeof updates.project === "string" || updates.project === null) input.project = updates.project;
	if (typeof updates.milestone === "string" || updates.milestone === null) input.milestone = updates.milestone;
	copyArrayFields(input, updates);
	copyTaskComments(input, updates);
	copyTaskChecklistFields(input, updates);
	copyTaskUpdateFlags(input, updates);
	return { value: input };
}

export type DocumentInput = { content: string; title?: string; path?: string | null; type?: string; tags?: string[] };

function documentFieldError(value: Record<string, unknown>): string | undefined {
	if (value.title !== undefined && (typeof value.title !== "string" || !value.title.trim()))
		return "Document title cannot be empty";
	if (value.path !== undefined && value.path !== null && typeof value.path !== "string")
		return "Document path must be a string or null.";
	if (value.type !== undefined && typeof value.type !== "string") return "Document type must be a string.";
	if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string")))
		return "Document tags must be an array of strings.";
}

function documentInput(value: Record<string, unknown>): DocumentInput {
	return {
		content: value.content as string,
		...(typeof value.title === "string" && { title: value.title.trim() }),
		...(value.path !== undefined && { path: value.path as string | null }),
		...(typeof value.type === "string" && { type: value.type }),
		...(Array.isArray(value.tags) && {
			tags: Array.from(new Set(value.tags.map((tag) => tag.trim()).filter(Boolean))),
		}),
	};
}

export function parseDocumentUpdate(body: unknown): ValidationResult<DocumentInput> {
	if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid request payload" };
	const value = body as Record<string, unknown>;
	if (typeof value.content !== "string") return { error: "Document content is required" };
	const error = documentFieldError(value);
	return error ? { error } : { value: documentInput(value) };
}

export function parseInitInput(body: unknown): ValidationResult<Record<string, unknown> & { projectName: string }> {
	if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Project name is required" };
	const value = body as Record<string, unknown>;
	const projectName = typeof value.projectName === "string" ? value.projectName.trim() : "";
	if (!projectName) return { error: "Project name is required" };
	const prefixError = getTaskPrefixError(
		typeof (value.advancedConfig as Record<string, unknown> | undefined)?.taskPrefix === "string"
			? ((value.advancedConfig as Record<string, unknown>).taskPrefix as string)
			: "",
	);
	return prefixError ? { error: prefixError } : { value: { ...value, projectName } };
}
