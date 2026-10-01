import type { Decision, Document, Milestone, ParsedMarkdown, Task } from "../types/index.ts";
import { normalizeDueDate } from "../utils/due-date.ts";
import { normalizePriorityValue } from "../utils/priority-config.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import {
	CHECKLIST_FRONTMATTER_FIELDS,
	COMMENT_FRONTMATTER_FIELDS,
	DECISION_FRONTMATTER_FIELDS,
	DECISION_FRONTMATTER_SCHEMA_VERSION,
	DOCUMENT_FRONTMATTER_FIELDS,
	MILESTONE_FRONTMATTER_FIELDS,
	MILESTONE_FRONTMATTER_SCHEMA_VERSION,
	TASK_FRONTMATTER_FIELDS,
	TASK_FRONTMATTER_SCHEMA_VERSION,
} from "./schema.ts";

export {
	DECISION_FRONTMATTER_SCHEMA_VERSION,
	MILESTONE_FRONTMATTER_SCHEMA_VERSION,
	TASK_FRONTMATTER_SCHEMA_VERSION,
} from "./schema.ts";

export class FrontmatterSchemaError extends Error {}

export class TaskFrontmatterSchemaError extends FrontmatterSchemaError {
	constructor(taskId: string, detail: string) {
		super(`Invalid task frontmatter for ${taskId || "(missing id)"}: ${detail}.`);
		this.name = "TaskFrontmatterSchemaError";
	}
}

export class UnsupportedTaskFrontmatterSchemaError extends FrontmatterSchemaError {
	constructor(taskId: string, version: unknown) {
		super(
			`Task ${taskId || "(missing id)"} uses unsupported task frontmatter schema version ${JSON.stringify(version)}.`,
		);
		this.name = "UnsupportedTaskFrontmatterSchemaError";
	}
}

export class UnsupportedRecordFrontmatterSchemaError extends FrontmatterSchemaError {
	constructor(kind: "decision" | "milestone", id: string, version: unknown) {
		super(
			`${kind[0]?.toUpperCase()}${kind.slice(1)} ${id || "(missing id)"} uses unsupported ${kind} frontmatter schema version ${JSON.stringify(version)}.`,
		);
		this.name = "UnsupportedRecordFrontmatterSchemaError";
	}
}

export function parseMarkdown(content: string): ParsedMarkdown {
	const parsed = parseFrontmatter(content);
	return {
		frontmatter: parsed.data,
		content: parsed.content,
	};
}

export class TaskDependenciesParseError extends Error {
	constructor(taskId: string, entryIndex?: number) {
		const location = entryIndex === undefined ? "the field" : `entry ${entryIndex + 1}`;
		super(
			`Invalid dependencies in task ${taskId || "(missing id)"}: ${location} contains a mapping or nested list. Use a list of task IDs in the task Markdown.`,
		);
		this.name = "TaskDependenciesParseError";
	}
}

function isStructuredDependency(value: unknown): boolean {
	return Array.isArray(value) || Object.prototype.toString.call(value) === "[object Object]";
}

function parseDependencies(value: unknown, taskId: string): string[] {
	if (Array.isArray(value)) {
		const invalidIndex = value.findIndex(isStructuredDependency);
		if (invalidIndex !== -1) throw new TaskDependenciesParseError(taskId, invalidIndex);
		return value.map(String);
	}
	if (isStructuredDependency(value)) throw new TaskDependenciesParseError(taskId);
	return [];
}

function taskList(value: unknown): string[] {
	return Array.isArray(value) ? value.map(String) : [];
}

function optionalTaskValue(value: unknown): string | undefined {
	return value ? String(value) : undefined;
}

function taskAssignees(value: unknown, taskId: string): string[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) throw new TaskFrontmatterSchemaError(taskId, "assignee must be a list");
	return value.map(String);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/;

function dateString(value: unknown, field: string, taskId?: string): string | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
		const detail = `${field} must be a date string in YYYY-MM-DD or YYYY-MM-DD HH:mm format`;
		if (taskId !== undefined) throw new TaskFrontmatterSchemaError(taskId, detail);
		throw new FrontmatterSchemaError(`Invalid frontmatter: ${detail}.`);
	}
	return value;
}

function taskFrontmatterFields(frontmatter: Record<string, unknown>) {
	const id = String(frontmatter[TASK_FRONTMATTER_FIELDS.ID] || "");
	const subtasks = frontmatter[TASK_FRONTMATTER_FIELDS.SUBTASKS];
	return {
		id,
		title: String(frontmatter[TASK_FRONTMATTER_FIELDS.TITLE] || ""),
		status: String(frontmatter[TASK_FRONTMATTER_FIELDS.STATUS] || ""),
		assignee: taskAssignees(frontmatter[TASK_FRONTMATTER_FIELDS.ASSIGNEE], id),
		reporter: optionalTaskValue(frontmatter[TASK_FRONTMATTER_FIELDS.REPORTER]),
		createdDate:
			dateString(frontmatter[TASK_FRONTMATTER_FIELDS.CREATED_DATE], TASK_FRONTMATTER_FIELDS.CREATED_DATE, id) ?? "",
		updatedDate: dateString(
			frontmatter[TASK_FRONTMATTER_FIELDS.UPDATED_DATE],
			TASK_FRONTMATTER_FIELDS.UPDATED_DATE,
			id,
		),
		dueDate: normalizeDueDate(frontmatter[TASK_FRONTMATTER_FIELDS.DUE_DATE], TASK_FRONTMATTER_FIELDS.DUE_DATE),
		labels: taskList(frontmatter[TASK_FRONTMATTER_FIELDS.LABELS]),
		milestone: optionalTaskValue(frontmatter[TASK_FRONTMATTER_FIELDS.MILESTONE]),
		references: taskList(frontmatter[TASK_FRONTMATTER_FIELDS.REFERENCES]),
		documentation: taskList(frontmatter[TASK_FRONTMATTER_FIELDS.DOCUMENTATION]),
		modifiedFiles: taskList(frontmatter[TASK_FRONTMATTER_FIELDS.MODIFIED_FILES]),
		parentTaskId: optionalTaskValue(frontmatter[TASK_FRONTMATTER_FIELDS.PARENT_TASK_ID]),
		subtasks: Array.isArray(subtasks) ? subtasks.map(String) : undefined,
		priority: normalizePriorityValue(
			frontmatter[TASK_FRONTMATTER_FIELDS.PRIORITY] ? String(frontmatter[TASK_FRONTMATTER_FIELDS.PRIORITY]) : undefined,
		),
		type: optionalTaskValue(frontmatter[TASK_FRONTMATTER_FIELDS.TYPE]),
		project: optionalTaskValue(frontmatter[TASK_FRONTMATTER_FIELDS.PROJECT]),
		ordinal:
			frontmatter[TASK_FRONTMATTER_FIELDS.ORDINAL] !== undefined
				? Number(frontmatter[TASK_FRONTMATTER_FIELDS.ORDINAL])
				: undefined,
		onStatusChange: optionalTaskValue(frontmatter[TASK_FRONTMATTER_FIELDS.ON_STATUS_CHANGE]),
		agentConfiguration: frontmatter[TASK_FRONTMATTER_FIELDS.AGENT_CONFIGURATION] as Task["agentConfiguration"],
	};
}

function taskText(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function recordText(frontmatter: Record<string, unknown>, key: string): string | undefined {
	const value = frontmatter[key];
	if (value !== undefined && typeof value !== "string") {
		throw new FrontmatterSchemaError(
			`Invalid record frontmatter for ${String(frontmatter.id || "(missing id)")}: ${key} must be a string.`,
		);
	}
	return value;
}

function taskChecklist(value: unknown, field: string, taskId: string): Task["acceptanceCriteriaItems"] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new TaskFrontmatterSchemaError(taskId, `${field} must be a list`);
	const indices = new Set<number>();
	return value.map((item, position) => {
		if (!item || typeof item !== "object" || Array.isArray(item))
			throw new TaskFrontmatterSchemaError(taskId, `${field} entry ${position + 1} must be a mapping`);
		const entry = item as Record<string, unknown>;
		const text = entry[CHECKLIST_FRONTMATTER_FIELDS.TEXT];
		const checked = entry[CHECKLIST_FRONTMATTER_FIELDS.CHECKED];
		const index = entry[CHECKLIST_FRONTMATTER_FIELDS.INDEX];
		if (typeof text !== "string")
			throw new TaskFrontmatterSchemaError(taskId, `${field} entry ${position + 1} text must be a string`);
		if (typeof checked !== "boolean")
			throw new TaskFrontmatterSchemaError(taskId, `${field} entry ${position + 1} checked must be a boolean`);
		const itemIndex = index === undefined ? position + 1 : index;
		if (typeof itemIndex !== "number" || !Number.isInteger(itemIndex) || itemIndex < 1 || indices.has(itemIndex))
			throw new TaskFrontmatterSchemaError(
				taskId,
				`${field} entry ${position + 1} index must be a unique positive integer`,
			);
		indices.add(itemIndex);
		return { index: itemIndex, text, checked };
	});
}

function taskComments(value: unknown, taskId: string): Task["comments"] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new TaskFrontmatterSchemaError(taskId, "comments must be a list");
	const indices = new Set<number>();
	return value.map((item, position) => {
		if (!item || typeof item !== "object" || Array.isArray(item))
			throw new TaskFrontmatterSchemaError(taskId, `comments entry ${position + 1} must be a mapping`);
		const entry = item as Record<string, unknown>;
		const body = entry[COMMENT_FRONTMATTER_FIELDS.BODY];
		const createdDate = entry[COMMENT_FRONTMATTER_FIELDS.CREATED_DATE];
		const author = entry[COMMENT_FRONTMATTER_FIELDS.AUTHOR];
		const index = entry[COMMENT_FRONTMATTER_FIELDS.INDEX];
		if (typeof body !== "string" || typeof createdDate !== "string")
			throw new TaskFrontmatterSchemaError(
				taskId,
				`comments entry ${position + 1} body and created_date must be strings`,
			);
		if (author !== undefined && typeof author !== "string")
			throw new TaskFrontmatterSchemaError(taskId, `comments entry ${position + 1} author must be a string`);
		const itemIndex = index === undefined ? position + 1 : index;
		if (typeof itemIndex !== "number" || !Number.isInteger(itemIndex) || itemIndex < 1 || indices.has(itemIndex))
			throw new TaskFrontmatterSchemaError(
				taskId,
				`comments entry ${position + 1} index must be a unique positive integer`,
			);
		indices.add(itemIndex);
		return { index: itemIndex, body, createdDate, ...(author ? { author } : {}) };
	});
}

function taskStructuredFrontmatter(frontmatter: Record<string, unknown>, taskId: string) {
	const textFields: readonly string[] = [
		TASK_FRONTMATTER_FIELDS.DESCRIPTION,
		TASK_FRONTMATTER_FIELDS.IMPLEMENTATION_PLAN,
		TASK_FRONTMATTER_FIELDS.IMPLEMENTATION_NOTES,
		TASK_FRONTMATTER_FIELDS.FINAL_SUMMARY,
	];
	for (const [key, value] of Object.entries(frontmatter)) {
		if (textFields.includes(key) && value !== undefined && typeof value !== "string")
			throw new TaskFrontmatterSchemaError(taskId, `${key} must be a string`);
	}
	return {
		description: taskText(frontmatter[TASK_FRONTMATTER_FIELDS.DESCRIPTION]),
		implementationPlan: taskText(frontmatter[TASK_FRONTMATTER_FIELDS.IMPLEMENTATION_PLAN]),
		implementationNotes: taskText(frontmatter[TASK_FRONTMATTER_FIELDS.IMPLEMENTATION_NOTES]),
		comments: taskComments(frontmatter[TASK_FRONTMATTER_FIELDS.COMMENTS], taskId),
		finalSummary: taskText(frontmatter[TASK_FRONTMATTER_FIELDS.FINAL_SUMMARY]),
		acceptanceCriteriaItems: taskChecklist(
			frontmatter[TASK_FRONTMATTER_FIELDS.ACCEPTANCE_CRITERIA],
			TASK_FRONTMATTER_FIELDS.ACCEPTANCE_CRITERIA,
			taskId,
		),
		definitionOfDoneItems: taskChecklist(
			frontmatter[TASK_FRONTMATTER_FIELDS.DEFINITION_OF_DONE],
			TASK_FRONTMATTER_FIELDS.DEFINITION_OF_DONE,
			taskId,
		),
	};
}

export function parseTask(content: string): Task {
	const { frontmatter, content: rawContent } = parseMarkdown(content);
	const fields = taskFrontmatterFields(frontmatter);
	if (frontmatter[TASK_FRONTMATTER_FIELDS.SCHEMA_VERSION] !== TASK_FRONTMATTER_SCHEMA_VERSION)
		throw new UnsupportedTaskFrontmatterSchemaError(fields.id, frontmatter[TASK_FRONTMATTER_FIELDS.SCHEMA_VERSION]);

	return {
		...fields,
		dependencies: parseDependencies(frontmatter[TASK_FRONTMATTER_FIELDS.DEPENDENCIES], fields.id),
		rawContent,
		...taskStructuredFrontmatter(frontmatter, fields.id),
	};
}

export function parseDecision(content: string): Decision {
	const { frontmatter, content: rawContent } = parseMarkdown(content);
	const id = String(frontmatter[DECISION_FRONTMATTER_FIELDS.ID] || "");
	if (frontmatter[DECISION_FRONTMATTER_FIELDS.SCHEMA_VERSION] !== DECISION_FRONTMATTER_SCHEMA_VERSION)
		throw new UnsupportedRecordFrontmatterSchemaError(
			"decision",
			id,
			frontmatter[DECISION_FRONTMATTER_FIELDS.SCHEMA_VERSION],
		);

	return {
		id,
		title: String(frontmatter[DECISION_FRONTMATTER_FIELDS.TITLE] || ""),
		date: dateString(frontmatter[DECISION_FRONTMATTER_FIELDS.DATE], DECISION_FRONTMATTER_FIELDS.DATE) ?? "",
		status: String(frontmatter[DECISION_FRONTMATTER_FIELDS.STATUS] || "proposed") as Decision["status"],
		context: recordText(frontmatter, DECISION_FRONTMATTER_FIELDS.CONTEXT) || "",
		decision: recordText(frontmatter, DECISION_FRONTMATTER_FIELDS.DECISION) || "",
		consequences: recordText(frontmatter, DECISION_FRONTMATTER_FIELDS.CONSEQUENCES) || "",
		alternatives: recordText(frontmatter, DECISION_FRONTMATTER_FIELDS.ALTERNATIVES),
		rawContent, // Raw markdown content without frontmatter
	};
}

export function parseDocument(content: string): Document {
	const { frontmatter, content: rawContent } = parseMarkdown(content);
	const tags = frontmatter[DOCUMENT_FRONTMATTER_FIELDS.TAGS];

	return {
		id: String(frontmatter[DOCUMENT_FRONTMATTER_FIELDS.ID] || ""),
		title: String(frontmatter[DOCUMENT_FRONTMATTER_FIELDS.TITLE] || ""),
		type: String(frontmatter[DOCUMENT_FRONTMATTER_FIELDS.TYPE] || "other") as Document["type"],
		createdDate:
			dateString(frontmatter[DOCUMENT_FRONTMATTER_FIELDS.CREATED_DATE], DOCUMENT_FRONTMATTER_FIELDS.CREATED_DATE) ?? "",
		updatedDate: dateString(
			frontmatter[DOCUMENT_FRONTMATTER_FIELDS.UPDATED_DATE],
			DOCUMENT_FRONTMATTER_FIELDS.UPDATED_DATE,
		),
		rawContent: rawContent.trim(),
		tags: Array.isArray(tags) ? tags.map(String) : undefined,
	};
}

export function parseMilestone(content: string): Milestone {
	const { frontmatter, content: rawContent } = parseMarkdown(content);
	const id = String(frontmatter[MILESTONE_FRONTMATTER_FIELDS.ID] || "");
	if (frontmatter[MILESTONE_FRONTMATTER_FIELDS.SCHEMA_VERSION] !== MILESTONE_FRONTMATTER_SCHEMA_VERSION)
		throw new UnsupportedRecordFrontmatterSchemaError(
			"milestone",
			id,
			frontmatter[MILESTONE_FRONTMATTER_FIELDS.SCHEMA_VERSION],
		);

	return {
		id,
		title: String(frontmatter[MILESTONE_FRONTMATTER_FIELDS.TITLE] || ""),
		dueDate: normalizeDueDate(
			frontmatter[MILESTONE_FRONTMATTER_FIELDS.DUE_DATE],
			MILESTONE_FRONTMATTER_FIELDS.DUE_DATE,
		),
		description: recordText(frontmatter, MILESTONE_FRONTMATTER_FIELDS.DESCRIPTION) || "",
		rawContent,
	};
}
