import type { AcceptanceCriterion, Decision, Document, Task } from "../types/index.ts";
import { normalizeAssignee } from "../utils/assignee.ts";
import { stringifyFrontmatter } from "./frontmatter.ts";
import {
	AcceptanceCriteriaManager,
	CommentsManager,
	DefinitionOfDoneManager,
	getStructuredSections,
	updateStructuredSections,
} from "./structured-sections.ts";

function normalizeOptionalText(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function sectionChanged(
	rawContent: string,
	key: keyof ReturnType<typeof getStructuredSections>,
	nextValue: string,
): boolean {
	const existing = normalizeOptionalText(getStructuredSections(rawContent)[key]);
	return existing !== normalizeOptionalText(nextValue);
}

function checklistItemsEqual(left: AcceptanceCriterion[], right: AcceptanceCriterion[]): boolean {
	if (left.length !== right.length) return false;
	return left.every((item, index) => {
		const other = right[index];
		return other?.index === item.index && other.checked === item.checked && other.text === item.text;
	});
}

function commentItemsEqual(left: Task["comments"], right: Task["comments"]): boolean {
	const leftComments = left ?? [];
	const rightComments = right ?? [];
	if (leftComments.length !== rightComments.length) return false;
	return leftComments.every((item, index) => {
		const other = rightComments[index];
		return (
			other?.index === item.index &&
			other.body === item.body &&
			other.createdDate === item.createdDate &&
			other.author === item.author
		);
	});
}

interface TaskFrontmatterField {
	key: string;
	property: keyof Task;
	mode?: "truthy" | "nonempty" | "defined";
}

const taskFrontmatterFields: readonly TaskFrontmatterField[] = [
	{ key: "id", property: "id" },
	{ key: "title", property: "title" },
	{ key: "status", property: "status" },
	{ key: "assignee", property: "assignee" },
	{ key: "reporter", property: "reporter", mode: "truthy" },
	{ key: "created_date", property: "createdDate" },
	{ key: "updated_date", property: "updatedDate", mode: "truthy" },
	{ key: "due_date", property: "dueDate", mode: "truthy" },
	{ key: "labels", property: "labels" },
	{ key: "milestone", property: "milestone", mode: "truthy" },
	{ key: "dependencies", property: "dependencies" },
	{ key: "references", property: "references", mode: "nonempty" },
	{ key: "documentation", property: "documentation", mode: "nonempty" },
	{ key: "modified_files", property: "modifiedFiles", mode: "nonempty" },
	{ key: "parent_task_id", property: "parentTaskId", mode: "truthy" },
	{ key: "subtasks", property: "subtasks", mode: "nonempty" },
	{ key: "priority", property: "priority", mode: "truthy" },
	{ key: "type", property: "type", mode: "truthy" },
	{ key: "project", property: "project", mode: "truthy" },
	{ key: "ordinal", property: "ordinal", mode: "defined" },
	{ key: "onStatusChange", property: "onStatusChange", mode: "truthy" },
	{ key: "agentConfiguration", property: "agentConfiguration", mode: "truthy" },
];

function taskFrontmatter(task: Task): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {};
	for (const field of taskFrontmatterFields) {
		const value = task[field.property];
		if (field.mode === "truthy" && !value) continue;
		if (field.mode === "nonempty" && (!Array.isArray(value) || value.length === 0)) continue;
		if (field.mode === "defined" && value === undefined) continue;
		frontmatter[field.key] = value;
	}
	return frontmatter;
}

function serializeMarkdownRecord(
	content: string,
	frontmatter: Record<string, unknown>,
	ensureBlankLine = false,
): string {
	const serialized = stringifyFrontmatter(content, frontmatter);
	return ensureBlankLine ? serialized.replace(/^(---\n(?:.*\n)*?---)\n(?!$)/, "$1\n\n") : serialized;
}

interface TextSectionUpdate {
	key: EditableTaskSection;
	requireContent?: boolean;
	update: (content: string, value: string) => string;
}

interface ChecklistManager {
	parseAllCriteria(content: string): AcceptanceCriterion[];
	updateContent(content: string, items: AcceptanceCriterion[]): string;
}

interface ChecklistSectionUpdate {
	key: "acceptanceCriteriaItems" | "definitionOfDoneItems";
	manager: ChecklistManager;
}

const taskTextSections = {
	description: { key: "description", requireContent: true, update: updateTaskDescription },
	implementationPlan: { key: "implementationPlan", update: updateTaskImplementationPlan },
	implementationNotes: { key: "implementationNotes", update: updateTaskImplementationNotes },
	finalSummary: { key: "finalSummary", update: updateTaskFinalSummary },
} satisfies Record<EditableTaskSection, TextSectionUpdate>;

const checklistSectionUpdates: readonly ChecklistSectionUpdate[] = [
	{ key: "acceptanceCriteriaItems", manager: AcceptanceCriteriaManager },
	{ key: "definitionOfDoneItems", manager: DefinitionOfDoneManager },
];

function updateTextSection(content: string, rawContent: string, task: Task, section: TextSectionUpdate): string {
	const value = task[section.key];
	if (
		typeof value !== "string" ||
		(section.requireContent && value.trim() === "") ||
		!sectionChanged(rawContent, section.key, value)
	) {
		return content;
	}
	return section.update(content, value);
}

export function serializeTask(task: Task): string {
	normalizeAssignee(task);
	const frontmatter = taskFrontmatter(task);

	let contentBody = task.rawContent ?? "";
	const rawContent = task.rawContent ?? "";
	contentBody = updateTextSection(contentBody, rawContent, task, taskTextSections.description);
	for (const section of checklistSectionUpdates) {
		const items = task[section.key];
		if (
			Array.isArray(items) &&
			(items.length === 0 || !checklistItemsEqual(section.manager.parseAllCriteria(rawContent), items))
		) {
			contentBody = section.manager.updateContent(contentBody, items);
		}
	}
	contentBody = updateTextSection(contentBody, rawContent, task, taskTextSections.implementationPlan);
	contentBody = updateTextSection(contentBody, rawContent, task, taskTextSections.implementationNotes);
	if (Array.isArray(task.comments)) {
		const existingComments = CommentsManager.parseAllComments(rawContent);
		const hasExistingComments = existingComments.length > 0;
		if ((task.comments.length > 0 || hasExistingComments) && !commentItemsEqual(existingComments, task.comments)) {
			contentBody = updateTaskComments(contentBody, task.comments);
		}
	}
	contentBody = updateTextSection(contentBody, rawContent, task, taskTextSections.finalSummary);
	return serializeMarkdownRecord(contentBody, frontmatter, true);
}

export function serializeDecision(decision: Decision): string {
	const frontmatter = {
		id: decision.id,
		title: decision.title,
		date: decision.date,
		status: decision.status,
	};

	let content = `## Context\n\n${decision.context}\n\n`;
	content += `## Decision\n\n${decision.decision}\n\n`;
	content += `## Consequences\n\n${decision.consequences}`;

	if (decision.alternatives) {
		content += `\n\n## Alternatives\n\n${decision.alternatives}`;
	}

	return serializeMarkdownRecord(content, frontmatter);
}

export function serializeDocument(document: Document): string {
	const frontmatter = {
		id: document.id,
		title: document.title,
		type: document.type,
		created_date: document.createdDate,
		...(document.updatedDate && { updated_date: document.updatedDate }),
		...(document.tags && document.tags.length > 0 && { tags: document.tags }),
	};

	return serializeMarkdownRecord(document.rawContent, frontmatter);
}

type EditableTaskSection = "description" | "implementationPlan" | "implementationNotes" | "finalSummary";

function updateTaskSection(content: string, section: EditableTaskSection, value: string): string {
	return updateStructuredSections(content, { ...getStructuredSections(content), [section]: value });
}

function updateTaskImplementationPlan(content: string, plan: string): string {
	return updateTaskSection(content, "implementationPlan", plan);
}

export function updateTaskImplementationNotes(content: string, notes: string): string {
	return updateTaskSection(content, "implementationNotes", notes);
}

function updateTaskFinalSummary(content: string, summary: string): string {
	return updateTaskSection(content, "finalSummary", summary);
}

function updateTaskComments(content: string, comments: NonNullable<Task["comments"]>): string {
	return CommentsManager.updateContent(content, comments);
}

export function updateTaskDescription(content: string, description: string): string {
	return updateTaskSection(content, "description", description);
}
