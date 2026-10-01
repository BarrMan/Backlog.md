import { type TaskDetail, taskDependencyGraph, taskReadiness } from "../../core/task-detail.ts";
import { formatDependencyGraphLines, formatDependencyNodeTuiLabel } from "../../formatters/dependency-graph-text.ts";
import {
	buildAcceptanceCriteriaItems,
	formatDateForDisplay,
	formatDefinitionOfDoneChecklist,
} from "../../formatters/task-plain-text.ts";
import type { Task } from "../../types/index.ts";
import { formatPriorityLabel, normalizePriorityValue } from "../../utils/priority-config.ts";
import { formatReadinessBlockers } from "../../utils/readiness.ts";
import { formatAcceptanceCriteriaProgress } from "../acceptance-criteria-progress.ts";
import { formatChecklistItem } from "../checklist.ts";
import { transformCodePaths } from "../code-path.ts";
import { formatHeading } from "../heading.ts";
import { formatProjectBadge } from "../project.ts";
import { formatStatusWithIcon, getStatusColor, getStatusIcon, wrapStatusColor } from "../status-icon.ts";
import { TASK_FIELD_LABELS } from "../task-labels.ts";
import { formatTaskTypeBadge } from "../task-type.ts";

export interface TaskDetailContentOptions {
	resolveMilestoneLabel?: (milestone: string) => string;
	dateFormat?: string;
	configuredProjects?: string[];
}

type DetailMetadataField =
	| { kind: "date"; label: string; value: string | undefined; dateFormat: string | undefined }
	| { kind: "people"; label: string; value: string[] | undefined }
	| { kind: "text"; value: string | undefined };

function formatDetailMetadataField(field: DetailMetadataField): string | undefined {
	switch (field.kind) {
		case "date":
			return metadataDate(field.label, field.value, field.dateFormat);
		case "people":
			return metadataPeople(field.label, field.value);
		case "text":
			return field.value;
	}
}

function getPriorityDisplay(priority?: string): string {
	switch (normalizePriorityValue(priority)) {
		case "high":
			return " {red-fg}●{/}";
		case "medium":
			return " {yellow-fg}●{/}";
		case "low":
			return " {green-fg}●{/}";
		default:
			return "";
	}
}

export function formatTaskViewerListItem(
	task: Task,
	availableWidth = Number.POSITIVE_INFINITY,
	dateFormat?: string,
	configuredProjects?: string[],
): string {
	const progress = formatAcceptanceCriteriaProgress(task, availableWidth);
	const status = progress ? getStatusIcon(task.status) : formatStatusWithIcon(task.status);
	const assigneeText = task.assignee?.length
		? ` {cyan-fg}${task.assignee[0]?.startsWith("@") ? task.assignee[0] : `@${task.assignee[0]}`}{/}`
		: "";
	const labelsText = task.labels?.length ? ` {yellow-fg}[${task.labels.join(", ")}]{/}` : "";
	const typeBadge = formatTaskTypeBadge(task.type);
	const projectBadge = formatProjectBadge(task.project, configuredProjects);
	const dueDateText = task.dueDate ? ` {gray-fg}(due ${formatDateForDisplay(task.dueDate, { dateFormat })}){/}` : "";
	const branch = (task as Task & { branch?: string }).branch;
	const content = `${wrapStatusColor(status, getStatusColor(task.status))}${progress ? ` ${progress}` : ""} {bold}${task.id}{/bold}${typeBadge ? ` ${typeBadge}` : ""}${projectBadge ? ` ${projectBadge}` : ""}${dueDateText} - ${task.title}${getPriorityDisplay(task.priority)}${assigneeText}${labelsText}${branch ? ` {green-fg}(${branch}){/}` : ""}`;
	return branch ? `{gray-fg}${content}{/}` : content;
}

function metadataDate(label: string, date: string | undefined, dateFormat: string | undefined): string | undefined {
	return date ? `{bold}${label}:{/bold} ${formatDateForDisplay(date, { dateFormat })}` : undefined;
}

function metadataPeople(label: string, people: string[] | undefined): string | undefined {
	return people?.length
		? `{bold}${label}:{/bold} {cyan-fg}${people.map((person) => (person.startsWith("@") ? person : `@${person}`)).join(", ")}{/}`
		: undefined;
}

function identityMetadataFields(task: Task | TaskDetail, dateFormat: string | undefined): DetailMetadataField[] {
	return [
		{
			kind: "date",
			label: "Updated",
			value: task.updatedDate !== task.createdDate ? task.updatedDate : undefined,
			dateFormat,
		},
		{ kind: "date", label: "Due", value: task.dueDate, dateFormat },
		{
			kind: "text",
			value: task.priority
				? `{bold}Priority:{/bold} ${formatPriorityLabel(task.priority)}${getPriorityDisplay(task.priority)}`
				: undefined,
		},
		{ kind: "text", value: task.type ? `{bold}Type:{/bold} ${formatTaskTypeBadge(task.type)}` : undefined },
		{ kind: "people", label: TASK_FIELD_LABELS.ASSIGNEE, value: task.assignee },
		{
			kind: "text",
			value: task.labels?.length
				? `{bold}Labels:{/bold} ${task.labels.map((label) => `{yellow-fg}[${label}]{/}`).join(" ")}`
				: undefined,
		},
		{ kind: "people", label: TASK_FIELD_LABELS.REPORTER, value: task.reporter ? [task.reporter] : undefined },
	];
}

function workflowMetadataFields(
	task: Task | TaskDetail,
	resolveMilestoneLabel: ((milestone: string) => string) | undefined,
	configuredProjects: string[] | undefined,
): DetailMetadataField[] {
	return [
		{
			kind: "text",
			value:
				task.project && configuredProjects?.length
					? `{bold}Project:{/bold} ${formatProjectBadge(task.project, configuredProjects)}`
					: undefined,
		},
		{
			kind: "text",
			value: task.milestone
				? `{bold}Milestone:{/bold} {magenta-fg}${resolveMilestoneLabel?.(task.milestone) ?? task.milestone}{/}`
				: undefined,
		},
		{
			kind: "text",
			value: task.parentTaskId
				? `{bold}Parent:{/bold} {blue-fg}${task.parentTaskTitle ? `${task.parentTaskId} - ${task.parentTaskTitle}` : task.parentTaskId}{/}`
				: undefined,
		},
		{
			kind: "text",
			value: task.subtasks?.length
				? `{bold}Subtasks:{/bold} ${task.subtasks.length} task${task.subtasks.length > 1 ? "s" : ""}`
				: undefined,
		},
	];
}

function detailMetadata(task: Task | TaskDetail, options: TaskDetailContentOptions): string[] {
	const { resolveMilestoneLabel, dateFormat, configuredProjects } = options;
	const metadata = [`{bold}Created:{/bold} ${formatDateForDisplay(task.createdDate, { dateFormat })}`];
	const fields = [
		...identityMetadataFields(task, dateFormat),
		...workflowMetadataFields(task, resolveMilestoneLabel, configuredProjects),
	];
	metadata.push(...fields.map(formatDetailMetadataField).filter((value): value is string => Boolean(value)));
	const readiness = task.dependencies?.length ? taskReadiness(task) : undefined;
	if (readiness?.isReady) metadata.push("{bold}Readiness:{/bold} {green-fg}✓ Ready to start{/}");
	if (readiness?.isBlocked)
		metadata.push(`{bold}Readiness:{/bold} {yellow-fg}● ${formatReadinessBlockers(readiness)}{/}`);
	if (task.modifiedFiles?.length) metadata.push(`{bold}Modified files:{/bold} ${task.modifiedFiles.join(", ")}`);
	return metadata;
}

function textDetailSection(heading: string, value: string | undefined, empty?: string): string[] {
	const text = value?.trim();
	return !text && !empty ? [] : [formatHeading(heading, 2), text ? transformCodePaths(text) : (empty ?? ""), ""];
}

function checklistDetailSection(
	heading: string,
	items: Array<{ text: string; checked: boolean }>,
	empty: string,
): string[] {
	const content = items.length
		? items
				.map((item) =>
					formatChecklistItem(
						{ text: transformCodePaths(item.text), checked: item.checked },
						{ padding: " ", checkedSymbol: "{green-fg}✓{/}", uncheckedSymbol: "{gray-fg}○{/}" },
					),
				)
				.join("\n")
		: `{gray-fg}${empty}{/}`;
	return [formatHeading(heading, 2), content, ""];
}

function referenceDetailSection(heading: string, values: string[] | undefined): string[] {
	if (!values?.length) return [];
	return [
		formatHeading(heading, 2),
		values
			.map(
				(value) =>
					`  {${value.startsWith("http://") || value.startsWith("https://") ? "cyan" : "yellow"}-fg}${value}{/}`,
			)
			.join("\n"),
		"",
	];
}

export function generateDetailContent(task: Task | TaskDetail, options: TaskDetailContentOptions = {}) {
	const headerContent = [
		` ${wrapStatusColor(formatStatusWithIcon(task.status), getStatusColor(task.status))} {bold}{blue-fg}${task.id}{/blue-fg}{/bold} - ${task.title}`,
	];
	const branch = (task as Task & { branch?: string }).branch;
	if (branch)
		headerContent.push(
			` {yellow-fg}⚠ Read-only:{/} This task exists in branch {green-fg}${branch}{/}. Switch to that branch to edit it.`,
		);
	const dependencyGraph = taskDependencyGraph(task);
	const dependencyGraphLines = dependencyGraph
		? formatDependencyGraphLines(dependencyGraph, { formatLabel: formatDependencyNodeTuiLabel })
		: [];
	const bodyContent = [
		formatHeading("Details", 2),
		detailMetadata(task, options).join("\n"),
		"",
		...(dependencyGraphLines.length ? [formatHeading("Dependency Graph", 2), dependencyGraphLines.join("\n"), ""] : []),
		...textDetailSection(TASK_FIELD_LABELS.DESCRIPTION, task.description, "{gray-fg}No description provided{/}"),
		...referenceDetailSection(TASK_FIELD_LABELS.REFERENCES, task.references),
		...referenceDetailSection("Documentation", task.documentation),
		...checklistDetailSection(
			TASK_FIELD_LABELS.ACCEPTANCE_CRITERIA,
			buildAcceptanceCriteriaItems(task),
			"No acceptance criteria defined",
		),
		...checklistDetailSection(
			TASK_FIELD_LABELS.DEFINITION_OF_DONE,
			formatDefinitionOfDoneChecklist(task),
			"No Definition of Done items defined",
		),
		...textDetailSection(TASK_FIELD_LABELS.IMPLEMENTATION_PLAN, task.implementationPlan),
		...textDetailSection(TASK_FIELD_LABELS.IMPLEMENTATION_NOTES, task.implementationNotes),
	];
	const comments = (task.comments ?? []).filter((comment) => comment.body.trim().length > 0);
	if (comments.length) {
		bodyContent.push(formatHeading("Comments", 2));
		for (const comment of comments) {
			const parts = [
				`#${comment.index}`,
				comment.author,
				comment.createdDate ? formatDateForDisplay(comment.createdDate, { dateFormat: options.dateFormat }) : undefined,
			].filter(Boolean);
			bodyContent.push(`{bold}${parts.join(" - ")}{/bold}`, transformCodePaths(comment.body.trim()), "");
		}
	}
	const finalSummary = task.finalSummary?.trim();
	if (finalSummary)
		bodyContent.push(formatHeading(TASK_FIELD_LABELS.FINAL_SUMMARY, 2), transformCodePaths(finalSummary), "");
	return { headerContent, bodyContent };
}
