import { t } from "elysia";
import { TASK_SOURCE } from "../../types/index.ts";

export const errorSchema = t.Object({
	error: t.String(),
	code: t.Optional(t.String()),
});

const acceptanceCriterionSchema = t.Object({
	index: t.Number(),
	text: t.String(),
	checked: t.Boolean(),
});

const taskCommentSchema = t.Object({
	index: t.Number(),
	body: t.String(),
	createdDate: t.String(),
	author: t.Optional(t.String()),
});

const agentPresetSchema = t.Object({
	command: t.String(),
	env: t.Record(t.String(), t.String()),
	prepare: t.String(),
	worktree: t.Boolean(),
	bootstrap: t.Union([
		t.Literal("opencode"),
		t.Literal("claude"),
		t.Literal("codex"),
		t.Literal("gemini"),
		t.Literal("antigravity"),
		t.Literal("prompt"),
	]),
});

export const agentConfigurationSchema = t.Object({
	selectedPreset: t.String(),
	presets: t.Record(t.String(), agentPresetSchema),
});

const taskProperties = {
	id: t.String(),
	title: t.String(),
	status: t.String(),
	assignee: t.Array(t.String()),
	createdDate: t.String(),
	labels: t.Array(t.String()),
	dependencies: t.Array(t.String()),
	reporter: t.Optional(t.String()),
	updatedDate: t.Optional(t.String()),
	dueDate: t.Optional(t.String()),
	milestone: t.Optional(t.String()),
	references: t.Optional(t.Array(t.String())),
	documentation: t.Optional(t.Array(t.String())),
	modifiedFiles: t.Optional(t.Array(t.String())),
	rawContent: t.Optional(t.String()),
	description: t.Optional(t.String()),
	implementationPlan: t.Optional(t.String()),
	implementationNotes: t.Optional(t.String()),
	comments: t.Optional(t.Array(taskCommentSchema)),
	finalSummary: t.Optional(t.String()),
	acceptanceCriteriaItems: t.Optional(t.Array(acceptanceCriterionSchema)),
	definitionOfDoneItems: t.Optional(t.Array(acceptanceCriterionSchema)),
	parentTaskId: t.Optional(t.String()),
	parentTaskTitle: t.Optional(t.String()),
	subtasks: t.Optional(t.Array(t.String())),
	subtaskSummaries: t.Optional(t.Array(t.Object({ id: t.String(), title: t.String() }))),
	priority: t.Optional(t.String()),
	type: t.Optional(t.String()),
	project: t.Optional(t.String()),
	branch: t.Optional(t.String()),
	ordinal: t.Optional(t.Number()),
	filePath: t.Optional(t.String()),
	contentRef: t.Optional(t.String()),
	contentRevision: t.Optional(t.String()),
	lastModified: t.Optional(t.Union([t.String(), t.Date()])),
	source: t.Optional(
		t.Union([
			t.Literal(TASK_SOURCE.LOCAL),
			t.Literal(TASK_SOURCE.REMOTE),
			t.Literal(TASK_SOURCE.COMPLETED),
			t.Literal(TASK_SOURCE.LOCAL_BRANCH),
		]),
	),
	onStatusChange: t.Optional(t.String()),
	agentConfiguration: t.Optional(agentConfigurationSchema),
};

// Search and statistics return full tasks, including detail-only optional fields.
export const taskSchema = t.Object(taskProperties);

export const taskSummarySchema = t.Object({
	id: t.String(),
	title: t.String(),
	status: t.String(),
	assignee: t.Array(t.String()),
	reporter: t.Optional(t.String()),
	createdDate: t.String(),
	updatedDate: t.Optional(t.String()),
	dueDate: t.Optional(t.String()),
	labels: t.Array(t.String()),
	milestone: t.Optional(t.String()),
	dependencies: t.Array(t.String()),
	references: t.Optional(t.Array(t.String())),
	documentation: t.Optional(t.Array(t.String())),
	modifiedFiles: t.Optional(t.Array(t.String())),
	parentTaskId: t.Optional(t.String()),
	parentTaskTitle: t.Optional(t.String()),
	subtasks: t.Optional(t.Array(t.String())),
	subtaskSummaries: t.Optional(t.Array(t.Object({ id: t.String(), title: t.String() }))),
	priority: t.Optional(t.String()),
	type: t.Optional(t.String()),
	project: t.Optional(t.String()),
	branch: t.Optional(t.String()),
	ordinal: t.Optional(t.Number()),
	source: t.Optional(
		t.Union([
			t.Literal(TASK_SOURCE.LOCAL),
			t.Literal(TASK_SOURCE.REMOTE),
			t.Literal(TASK_SOURCE.COMPLETED),
			t.Literal(TASK_SOURCE.LOCAL_BRANCH),
		]),
	),
	acceptanceCriteriaCount: t.Number(),
	checkedAcceptanceCriteriaCount: t.Number(),
	definitionOfDoneCount: t.Number(),
	checkedDefinitionOfDoneCount: t.Number(),
	isReady: t.Boolean(),
});

const dependencyNodeSchema = t.Object({
	id: t.String(),
	title: t.Union([t.String(), t.Null()]),
	status: t.Union([t.String(), t.Null()]),
	state: t.Union([t.Literal("resolved"), t.Literal("ambiguous"), t.Literal("missing")]),
	completed: t.Boolean(),
	dependencyDepth: t.Union([t.Number(), t.Null()]),
	dependentDepth: t.Union([t.Number(), t.Null()]),
});

export const taskDetailSchema = t.Object({
	...taskProperties,
	dependencyGraph: t.Object({
		rootId: t.String(),
		nodes: t.Array(dependencyNodeSchema),
		edges: t.Array(t.Object({ from: t.String(), to: t.String() })),
	}),
	readiness: t.Object({
		isReady: t.Boolean(),
		isBlocked: t.Boolean(),
		blockingDependencies: t.Array(t.String()),
		missingDependencies: t.Array(t.String()),
	}),
});

export const milestoneSchema = t.Object({
	id: t.String(),
	title: t.String(),
	description: t.String(),
	rawContent: t.String(),
	dueDate: t.Optional(t.String()),
});

export const documentSchema = t.Object({
	id: t.String(),
	title: t.String(),
	type: t.Union([t.Literal("readme"), t.Literal("guide"), t.Literal("specification"), t.Literal("other")]),
	createdDate: t.String(),
	rawContent: t.String(),
	updatedDate: t.Optional(t.String()),
	tags: t.Optional(t.Array(t.String())),
	name: t.Optional(t.String()),
	path: t.Optional(t.String()),
	lastModified: t.Optional(t.String()),
});

export const documentListItemSchema = t.Omit(documentSchema, ["rawContent"]);

export const decisionSchema = t.Object({
	id: t.String(),
	title: t.String(),
	date: t.String(),
	status: t.Union([t.Literal("proposed"), t.Literal("accepted"), t.Literal("rejected"), t.Literal("superseded")]),
	context: t.String(),
	decision: t.String(),
	consequences: t.String(),
	rawContent: t.String(),
	alternatives: t.Optional(t.String()),
	path: t.Optional(t.String()),
});

export const decisionUpdateSchema = t.Object({
	title: t.String(),
	context: t.String(),
	decision: t.String(),
	consequences: t.String(),
	alternatives: t.Optional(t.String()),
});

export const decisionListItemSchema = t.Omit(decisionSchema, ["rawContent", "path"]);
