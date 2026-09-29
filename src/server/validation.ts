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
const TASK_ARRAY_FIELDS = ["labels", "assignee", "dependencies", "references", "modifiedFiles"] as const;
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
	if (Array.isArray(updates.commentsAppend)) {
		const author =
			typeof updates.commentAuthor === "string" && updates.commentAuthor.trim()
				? updates.commentAuthor.trim()
				: undefined;
		input.appendComments = updates.commentsAppend
			.map((body) => ({ body: String(body ?? "").trim(), ...(author && { author }) }))
			.filter((comment) => comment.body);
	}
	if (Array.isArray(updates.acceptanceCriteriaItems))
		input.acceptanceCriteria = normalizeAcceptanceCriteriaItems(updates.acceptanceCriteriaItems);
	if (Array.isArray(updates.definitionOfDoneAdd))
		input.addDefinitionOfDone = updates.definitionOfDoneAdd
			.map((item) => ({ text: String(item ?? "").trim(), checked: false }))
			.filter((item) => item.text);
	return { value: input };
}

export type DocumentInput = { content: string; title?: string; path?: string | null; type?: string; tags?: string[] };

export function parseDocumentUpdate(body: unknown): ValidationResult<DocumentInput> {
	if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid request payload" };
	const value = body as Record<string, unknown>;
	if (typeof value.content !== "string") return { error: "Document content is required" };
	if (value.title !== undefined && (typeof value.title !== "string" || !value.title.trim()))
		return { error: "Document title cannot be empty" };
	if (value.path !== undefined && value.path !== null && typeof value.path !== "string")
		return { error: "Document path must be a string or null." };
	if (value.type !== undefined && typeof value.type !== "string") return { error: "Document type must be a string." };
	if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string")))
		return { error: "Document tags must be an array of strings." };
	return {
		value: {
			content: value.content,
			...(typeof value.title === "string" && { title: value.title.trim() }),
			...(value.path !== undefined && { path: value.path as string | null }),
			...(typeof value.type === "string" && { type: value.type }),
			...(Array.isArray(value.tags) && {
				tags: Array.from(new Set(value.tags.map((tag) => tag.trim()).filter(Boolean))),
			}),
		},
	};
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
