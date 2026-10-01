import type { AcceptanceCriterion, Task, TaskComment } from "../types/index.ts";
import {
	parseMarkdown,
	parseTask,
	TaskFrontmatterSchemaError,
	UnsupportedTaskFrontmatterSchemaError,
} from "./parser.ts";
import { TASK_FRONTMATTER_FIELDS } from "./schema.ts";
import { serializeTask } from "./serializer.ts";

function section(content: string, name: string): string | undefined {
	return content
		.match(new RegExp(`<!-- SECTION:${name}:BEGIN -->\\n?([\\s\\S]*?)\\n?<!-- SECTION:${name}:END -->`))?.[1]
		?.trim();
}

function stringList(value: unknown, field: string, taskId: string): string[] | undefined {
	if (value === undefined) return undefined;
	if (
		!Array.isArray(value) ||
		value.some((entry) => Array.isArray(entry) || (entry !== null && typeof entry === "object"))
	)
		throw new TaskFrontmatterSchemaError(taskId, `${field} must be a flat list`);
	return value.map(String);
}

function stringValue(value: unknown, field: string, taskId: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw new TaskFrontmatterSchemaError(taskId, `${field} must be a string`);
	return value;
}

function validateMarkers(content: string, taskId: string): void {
	for (const [begin, end] of [
		["<!-- SECTION:DESCRIPTION:BEGIN -->", "<!-- SECTION:DESCRIPTION:END -->"],
		["<!-- SECTION:PLAN:BEGIN -->", "<!-- SECTION:PLAN:END -->"],
		["<!-- SECTION:NOTES:BEGIN -->", "<!-- SECTION:NOTES:END -->"],
		["<!-- SECTION:FINAL_SUMMARY:BEGIN -->", "<!-- SECTION:FINAL_SUMMARY:END -->"],
		["<!-- AC:BEGIN -->", "<!-- AC:END -->"],
		["<!-- DOD:BEGIN -->", "<!-- DOD:END -->"],
		["<!-- COMMENTS:BEGIN -->", "<!-- COMMENTS:END -->"],
	] as const) {
		const begins = content.split(begin).length - 1;
		const ends = content.split(end).length - 1;
		if (begins !== ends || begins > 1)
			throw new TaskFrontmatterSchemaError(taskId, `legacy markers ${begin} and ${end} are unbalanced or repeated`);
	}
	if (!content.includes("<!-- SECTION:DESCRIPTION:BEGIN -->"))
		throw new TaskFrontmatterSchemaError(taskId, "missing legacy description section");
}

function checklist(content: string, name: "AC" | "DOD", taskId: string): AcceptanceCriterion[] {
	const body = content.match(new RegExp(`<!-- ${name}:BEGIN -->\\n?([\\s\\S]*?)\\n?<!-- ${name}:END -->`))?.[1];
	if (body === undefined) return [];
	return body
		.split("\n")
		.filter((line) => line.trim())
		.map((line, position) => {
			const item = line.match(/^- \[([ xX])\] #([1-9]\d*) (.+)$/);
			if (!item) throw new TaskFrontmatterSchemaError(taskId, `legacy ${name} entry ${position + 1} is malformed`);
			return { checked: item[1]?.toLowerCase() === "x", index: Number(item[2]), text: item[3] ?? "" };
		});
}

function comments(content: string, taskId: string): TaskComment[] {
	const body = content.match(/<!-- COMMENTS:BEGIN -->\n?([\s\S]*?)\n?<!-- COMMENTS:END -->/)?.[1];
	if (body === undefined) return [];
	const entries = body
		.split(/^---\s*$/m)
		.map((entry) => entry.trim())
		.filter(Boolean);
	if (entries.length % 2 !== 0) throw new TaskFrontmatterSchemaError(taskId, "legacy comments are malformed");
	const result: TaskComment[] = [];
	for (let index = 0; index < entries.length; index += 2) {
		const metadata = entries[index] ?? "";
		const text = entries[index + 1] ?? "";
		const author = metadata.match(/^author:\s*(.+)$/m)?.[1]?.trim();
		const createdDate = metadata.match(/^created:\s*(.+)$/m)?.[1]?.trim() ?? "";
		if (!text || !createdDate)
			throw new TaskFrontmatterSchemaError(taskId, "legacy comments require body and created date");
		result.push({ index: result.length + 1, body: text, createdDate, ...(author ? { author } : {}) });
	}
	return result;
}

function withoutLegacySections(content: string): string {
	return content
		.replace(/## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->[\s\S]*?<!-- SECTION:DESCRIPTION:END -->\n*/g, "")
		.replace(/## Acceptance Criteria\n<!-- AC:BEGIN -->[\s\S]*?<!-- AC:END -->\n*/g, "")
		.replace(/## Definition of Done\n<!-- DOD:BEGIN -->[\s\S]*?<!-- DOD:END -->\n*/g, "")
		.replace(/## Implementation Plan\n\n<!-- SECTION:PLAN:BEGIN -->[\s\S]*?<!-- SECTION:PLAN:END -->\n*/g, "")
		.replace(/## Implementation Notes\n\n<!-- SECTION:NOTES:BEGIN -->[\s\S]*?<!-- SECTION:NOTES:END -->\n*/g, "")
		.replace(
			/## Final Summary\n\n<!-- SECTION:FINAL_SUMMARY:BEGIN -->[\s\S]*?<!-- SECTION:FINAL_SUMMARY:END -->\n*/g,
			"",
		)
		.replace(/## Comments\n\n<!-- COMMENTS:BEGIN -->[\s\S]*?<!-- COMMENTS:END -->\n*/g, "")
		.trim();
}

/** Converts only a selected, retired section-backed task; normal reads remain schema-strict. */
export function migrateLegacyTask(content: string): string {
	const { frontmatter, content: body } = parseMarkdown(content);
	const id = String(frontmatter.id || "");
	if (frontmatter[TASK_FRONTMATTER_FIELDS.SCHEMA_VERSION] !== undefined)
		throw new UnsupportedTaskFrontmatterSchemaError(id, frontmatter[TASK_FRONTMATTER_FIELDS.SCHEMA_VERSION]);
	validateMarkers(body, id);
	const assignee = stringList(frontmatter.assignee, "assignee", id);
	if (assignee === undefined) throw new TaskFrontmatterSchemaError(id, "legacy assignee must be a list");
	const labels = stringList(frontmatter.labels, "labels", id) ?? [];
	const dependencies = stringList(frontmatter.dependencies, "dependencies", id) ?? [];
	const ordinal = frontmatter.ordinal;
	if (ordinal !== undefined && (typeof ordinal !== "number" || !Number.isFinite(ordinal)))
		throw new TaskFrontmatterSchemaError(id, "ordinal must be a finite number");
	const task: Task = {
		id,
		title: String(frontmatter.title || ""),
		status: String(frontmatter.status || ""),
		assignee,
		createdDate: String(frontmatter.created_date || ""),
		updatedDate: frontmatter.updated_date ? String(frontmatter.updated_date) : undefined,
		labels,
		dependencies,
		reporter: stringValue(frontmatter.reporter, "reporter", id),
		dueDate: stringValue(frontmatter.due_date, "due_date", id),
		milestone: stringValue(frontmatter.milestone, "milestone", id),
		references: stringList(frontmatter.references, "references", id),
		documentation: stringList(frontmatter.documentation, "documentation", id),
		modifiedFiles: stringList(frontmatter.modified_files, "modified_files", id),
		parentTaskId: stringValue(frontmatter.parent_task_id, "parent_task_id", id),
		subtasks: stringList(frontmatter.subtasks, "subtasks", id),
		priority: stringValue(frontmatter.priority, "priority", id),
		type: stringValue(frontmatter.type, "type", id),
		project: stringValue(frontmatter.project, "project", id),
		ordinal,
		onStatusChange: stringValue(frontmatter.onStatusChange, "onStatusChange", id),
		agentConfiguration: frontmatter.agentConfiguration as Task["agentConfiguration"],
		description: section(body, "DESCRIPTION") ?? "",
		implementationPlan: section(body, "PLAN"),
		implementationNotes: section(body, "NOTES"),
		finalSummary: section(body, "FINAL_SUMMARY"),
		acceptanceCriteriaItems: checklist(body, "AC", id),
		definitionOfDoneItems: checklist(body, "DOD", id),
		comments: comments(body, id),
		rawContent: withoutLegacySections(body),
	};
	const migrated = serializeTask(task, frontmatter);
	parseTask(migrated);
	return migrated;
}
