import { type Static, t } from "elysia";
import type { Core, TaskCollectionFilterInput } from "../core/backlog.ts";
import type { ProjectTaskGraph } from "../core/project-task-graph.ts";
import { toTaskSummary } from "../core/task-detail.ts";
import { filterTaskQueryResults } from "../core/task-query-workflow.ts";

const queryValue = () => t.Union([t.String(), t.Array(t.String())]);

function values(value: string | string[]): string[] {
	return (Array.isArray(value) ? value : [value])
		.flatMap((item) => item.split(","))
		.map((item) => item.trim())
		.filter(Boolean);
}

function first(value: string | string[]): string | undefined {
	return (Array.isArray(value) ? value[0] : value) || undefined;
}

const multiValue = () =>
	t.Optional(
		t
			.Transform(queryValue())
			.Decode(values)
			.Encode((value) => value),
	);
const firstValue = () =>
	t.Optional(
		t
			.Transform(queryValue())
			.Decode(first)
			.Encode((value) => value ?? ""),
	);
const crossBranchValue = () =>
	t.Optional(
		t
			.Transform(queryValue())
			.Decode((value) => first(value) !== "false")
			.Encode((value) => String(value)),
	);

export const taskCollectionQuery = t.Object(
	{
		status: firstValue(),
		excludeStatus: multiValue(),
		"exclude-status": multiValue(),
		excludeStatuses: multiValue(),
		"exclude-statuses": multiValue(),
		assignee: firstValue(),
		priority: firstValue(),
		label: multiValue(),
		labels: multiValue(),
		parent: firstValue(),
		crossBranch: crossBranchValue(),
	},
	{ additionalProperties: true },
);

type TaskCollectionQuery = Static<typeof taskCollectionQuery>;

export async function listTaskCollection(queryInput: TaskCollectionQuery, core: Core, graph: ProjectTaskGraph) {
	const filters: TaskCollectionFilterInput = {
		status: queryInput.status,
		excludeStatus: [
			...(queryInput.excludeStatus ?? []),
			...(queryInput["exclude-status"] ?? []),
			...(queryInput.excludeStatuses ?? []),
			...(queryInput["exclude-statuses"] ?? []),
		],
		assignee: queryInput.assignee,
		priority: queryInput.priority,
		labels: [...(queryInput.label ?? []), ...(queryInput.labels ?? [])],
	};
	const resolvedFilters = await core.resolveCollectionFilters(filters);
	if (queryInput.parent) resolvedFilters.parentTaskId = graph.resolveParentTask(queryInput.parent).id;
	const tasks = await filterTaskQueryResults(
		(queryInput.crossBranch ?? true) ? graph.tasks : graph.activeTasks,
		{ filters: resolvedFilters, includeCrossBranch: queryInput.crossBranch ?? true },
		core.filesystem,
	);
	return tasks.map((task) => toTaskSummary(task as (typeof graph.tasks)[number]));
}
