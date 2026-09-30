import { FALLBACK_STATUS } from "../constants/index.ts";
import { type BacklogConfig, EntityType, type Task, type TaskCreateInput } from "../types/index.ts";
import { normalizeDueDate } from "../utils/due-date.ts";
import { buildDefinitionOfDoneItems, normalizeStringList, parseDelimitedStringList } from "../utils/task-builders.ts";
import { assertSectionInputsSafe } from "./task-update/index.ts";

export type PreparedTaskCreationInput = {
	title: string;
	isDraft: boolean;
	requestedParentTaskId: string | undefined;
	entityType: EntityType;
	labels: string[];
	assignees: string[];
	dependencies: string[];
	references: string[];
	documentation: string[];
	modifiedFiles: string[];
	dueDate: string | undefined;
	acceptanceCriteriaItems: Array<{ index: number; text: string; checked: boolean }>;
};

export function prepareTaskCreationInput(input: TaskCreateInput): PreparedTaskCreationInput {
	if (!input.title || input.title.trim().length === 0) throw new Error("Title is required to create a task.");
	assertSectionInputsSafe(input);
	if (
		input.ordinal !== undefined &&
		(typeof input.ordinal !== "number" || !Number.isFinite(input.ordinal) || input.ordinal < 0)
	) {
		throw new Error("Ordinal must be a non-negative number.");
	}
	const isDraft = input.status?.trim().toLowerCase() === "draft";
	return {
		title: input.title.trim(),
		isDraft,
		requestedParentTaskId: input.parentTaskId?.trim(),
		entityType: isDraft ? EntityType.Draft : EntityType.Task,
		labels: normalizeStringList(input.labels) ?? [],
		assignees: normalizeStringList(input.assignee) ?? [],
		dependencies: parseDelimitedStringList(input.dependencies) ?? [],
		references: normalizeStringList(input.references) ?? [],
		documentation: normalizeStringList(input.documentation) ?? [],
		modifiedFiles: normalizeStringList(input.modifiedFiles) ?? [],
		dueDate: normalizeDueDate(input.dueDate, "Due date"),
		acceptanceCriteriaItems: Array.isArray(input.acceptanceCriteria)
			? input.acceptanceCriteria
					.map((criterion, index) => ({
						index: index + 1,
						text: String(criterion.text ?? "").trim(),
						checked: Boolean(criterion.checked),
					}))
					.filter((criterion) => criterion.text.length > 0)
			: [],
	};
}

function field(name: string, value: unknown): [string, unknown][] {
	return value === undefined ? [] : [[name, value]];
}

function nonEmptyString(value: string | undefined): string | undefined {
	return value?.trim() || undefined;
}

function nonEmptyList<T>(value: T[] | undefined): T[] | undefined {
	return value?.length ? value : undefined;
}

function createdTaskOptionalFields(
	input: TaskCreateInput,
	prepared: PreparedTaskCreationInput,
	resolved: Parameters<typeof buildCreatedTask>[3],
	definitionOfDoneItems: Task["definitionOfDoneItems"] | undefined,
): Partial<Task> {
	return Object.fromEntries([
		...field("dueDate", prepared.dueDate),
		...field("parentTaskId", nonEmptyString(resolved.parentTaskId)),
		...field("priority", nonEmptyString(resolved.priority)),
		...field("type", nonEmptyString(resolved.type)),
		...field("project", nonEmptyString(resolved.project)),
		...field("ordinal", resolved.ordinal),
		...field("milestone", nonEmptyString(input.milestone)),
		...field("description", input.description),
		...field("implementationPlan", input.implementationPlan),
		...field("implementationNotes", input.implementationNotes),
		...field("finalSummary", input.finalSummary),
		...field("acceptanceCriteriaItems", nonEmptyList(prepared.acceptanceCriteriaItems)),
		...field("definitionOfDoneItems", nonEmptyList(definitionOfDoneItems)),
	]) as Partial<Task>;
}

export function buildCreatedTask(
	input: TaskCreateInput,
	prepared: PreparedTaskCreationInput,
	config: BacklogConfig | null,
	resolved: {
		id: string;
		parentTaskId: string | undefined;
		dependencies: string[];
		status: string;
		priority: string | undefined;
		type: string | undefined;
		project: string | undefined;
		ordinal: number | undefined;
		createdDate: string;
	},
): Task {
	const definitionOfDoneItems = buildDefinitionOfDoneItems({
		defaults: config?.definitionOfDone,
		add: input.definitionOfDoneAdd,
		disableDefaults: input.disableDefinitionOfDoneDefaults,
	});
	const assignee =
		input.assignee === undefined ? (normalizeStringList(config?.defaultAssignee) ?? []) : prepared.assignees;
	return {
		id: resolved.id,
		title: prepared.title,
		status: prepared.isDraft ? "Draft" : resolved.status || config?.defaultStatus || FALLBACK_STATUS,
		assignee,
		labels: prepared.labels,
		dependencies: resolved.dependencies,
		references: prepared.references,
		documentation: prepared.documentation,
		modifiedFiles: prepared.modifiedFiles,
		rawContent: input.rawContent ?? "",
		createdDate: resolved.createdDate,
		...createdTaskOptionalFields(input, prepared, resolved, definitionOfDoneItems),
	};
}
