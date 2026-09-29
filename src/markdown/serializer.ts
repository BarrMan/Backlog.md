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

function taskFrontmatter(task: Task): Record<string, unknown> {
	return {
		id: task.id,
		title: task.title,
		status: task.status,
		assignee: task.assignee,
		...(task.reporter && { reporter: task.reporter }),
		created_date: task.createdDate,
		...(task.updatedDate && { updated_date: task.updatedDate }),
		...(task.dueDate && { due_date: task.dueDate }),
		labels: task.labels,
		...(task.milestone && { milestone: task.milestone }),
		dependencies: task.dependencies,
		...(task.references && task.references.length > 0 && { references: task.references }),
		...(task.documentation && task.documentation.length > 0 && { documentation: task.documentation }),
		...(task.modifiedFiles && task.modifiedFiles.length > 0 && { modified_files: task.modifiedFiles }),
		...(task.parentTaskId && { parent_task_id: task.parentTaskId }),
		...(task.subtasks && task.subtasks.length > 0 && { subtasks: task.subtasks }),
		...(task.priority && { priority: task.priority }),
		...(task.type && { type: task.type }),
		...(task.project && { project: task.project }),
		...(task.ordinal !== undefined && { ordinal: task.ordinal }),
		...(task.onStatusChange && { onStatusChange: task.onStatusChange }),
		...(task.agentConfiguration && { agentConfiguration: task.agentConfiguration }),
	};
}

function serializeMarkdownRecord(
	content: string,
	frontmatter: Record<string, unknown>,
	ensureBlankLine = false,
): string {
	const serialized = stringifyFrontmatter(content, frontmatter);
	return ensureBlankLine ? serialized.replace(/^(---\n(?:.*\n)*?---)\n(?!$)/, "$1\n\n") : serialized;
}

export function serializeTask(task: Task): string {
	normalizeAssignee(task);
	const frontmatter = taskFrontmatter(task);

	let contentBody = task.rawContent ?? "";
	const rawContent = task.rawContent ?? "";
	if (
		typeof task.description === "string" &&
		task.description.trim() !== "" &&
		sectionChanged(rawContent, "description", task.description)
	) {
		contentBody = updateTaskDescription(contentBody, task.description);
	}
	if (Array.isArray(task.acceptanceCriteriaItems)) {
		const existingCriteria = AcceptanceCriteriaManager.parseAllCriteria(task.rawContent ?? "");
		if (
			task.acceptanceCriteriaItems.length === 0 ||
			!checklistItemsEqual(existingCriteria, task.acceptanceCriteriaItems)
		) {
			contentBody = AcceptanceCriteriaManager.updateContent(contentBody, task.acceptanceCriteriaItems);
		}
	}
	if (Array.isArray(task.definitionOfDoneItems)) {
		const existingDefinitionOfDone = DefinitionOfDoneManager.parseAllCriteria(task.rawContent ?? "");
		if (
			task.definitionOfDoneItems.length === 0 ||
			!checklistItemsEqual(existingDefinitionOfDone, task.definitionOfDoneItems)
		) {
			contentBody = DefinitionOfDoneManager.updateContent(contentBody, task.definitionOfDoneItems);
		}
	}
	if (
		typeof task.implementationPlan === "string" &&
		sectionChanged(rawContent, "implementationPlan", task.implementationPlan)
	) {
		contentBody = updateTaskImplementationPlan(contentBody, task.implementationPlan);
	}
	if (
		typeof task.implementationNotes === "string" &&
		sectionChanged(rawContent, "implementationNotes", task.implementationNotes)
	) {
		contentBody = updateTaskImplementationNotes(contentBody, task.implementationNotes);
	}
	if (Array.isArray(task.comments)) {
		const existingComments = CommentsManager.parseAllComments(task.rawContent ?? "");
		const hasExistingComments = existingComments.length > 0;
		if ((task.comments.length > 0 || hasExistingComments) && !commentItemsEqual(existingComments, task.comments)) {
			contentBody = updateTaskComments(contentBody, task.comments);
		}
	}
	if (typeof task.finalSummary === "string" && sectionChanged(rawContent, "finalSummary", task.finalSummary)) {
		contentBody = updateTaskFinalSummary(contentBody, task.finalSummary);
	}

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
