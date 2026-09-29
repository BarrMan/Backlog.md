import type { OptionValues } from "commander";
import type { Core } from "../index.ts";
import type { TaskListFilter } from "../types/index.ts";
import { taskIdsEqual } from "../utils/task-path.ts";
import { sortTasks } from "../utils/task-sorting.ts";
import type { TaskListRequest } from "./task-list-parse.ts";
import { resolveTaskListParent } from "./task-list-query.ts";

export async function runTaskListProjectView(
	core: Core,
	request: TaskListRequest,
	options: OptionValues,
): Promise<void> {
	const values = (value: string | string[] | undefined): string[] =>
		Array.isArray(value) ? value : value ? [value] : [];
	const activeFilters: string[] = [];
	if (options.status) activeFilters.push(`Status: ${options.status}`);
	if (request.filters.excludeStatus)
		activeFilters.push(`Exclude status: ${values(request.filters.excludeStatus).join(", ")}`);
	if (options.assignee) activeFilters.push(`Assignee: ${options.assignee}`);
	if (options.unassigned) activeFilters.push("Unassigned");
	if (request.ready) activeFilters.push("Ready");
	if (request.parentId) activeFilters.push(`Parent: ${request.parentDisplayId}`);
	if (options.milestone) activeFilters.push(`Milestone: ${options.milestone}`);
	if (request.filters.priority) activeFilters.push(`Priority: ${request.filters.priority}`);
	if (request.filters.type) activeFilters.push(`Type: ${values(request.filters.type).join(", ")}`);
	if (request.filters.project) activeFilters.push(`Project: ${values(request.filters.project).join(", ")}`);
	if (request.labels.length > 0) activeFilters.push(`Labels: ${request.labels.join(", ")}`);
	if (request.searchQuery) activeFilters.push(`Search: ${request.searchQuery}`);
	if (request.limit !== undefined) activeFilters.push(`Limit: ${request.limit}`);
	if (options.sort) activeFilters.push(`Sort: ${options.sort}`);
	const { runUnifiedView } = await import("../ui/unified-view.ts");
	const loaderFilters: TaskListFilter = {};
	if (options.assignee) loaderFilters.assignee = options.assignee;
	if (options.unassigned) loaderFilters.unassigned = true;
	if (request.parentId) loaderFilters.parentTaskId = request.parentId;
	const prefiltersDisplayList = Object.keys(loaderFilters).length > 0;
	await runUnifiedView({
		core,
		initialView: "task-list",
		tasksLoader: async (updateProgress) => {
			updateProgress("Loading configuration...");
			const config = await core.filesystem.loadConfig();
			updateProgress("Loading local tasks...");
			const tasks = await core.queryTasks({
				filters: Object.keys(loaderFilters).length > 0 ? loaderFilters : undefined,
				includeCrossBranch: false,
			});
			const parentId = request.parentId
				? await resolveTaskListParent(core, request.parentId, request.parentDisplayId ?? request.parentId)
				: undefined;
			const sorted = sortTasks(tasks, request.sortField, config?.priorities);
			return {
				tasks: parentId
					? sorted.filter((task) => task.parentTaskId && taskIdsEqual(parentId, task.parentTaskId))
					: sorted,
				statuses: config?.statuses || [],
				readinessTasks: prefiltersDisplayList ? await core.queryTasks({ includeCrossBranch: false }) : undefined,
			};
		},
		filter: {
			status: request.filters.status,
			excludeStatus: request.filters.excludeStatus ? values(request.filters.excludeStatus) : undefined,
			assignee: options.assignee,
			milestone: options.milestone,
			type: request.filters.type ? values(request.filters.type) : undefined,
			project: request.filters.project ? values(request.filters.project) : undefined,
			priority: request.filters.priority,
			sort: options.sort,
			labels: request.labels,
			labelMatch: request.labels.length > 0 ? "all" : undefined,
			searchQuery: request.searchQuery || undefined,
			title: activeFilters.length > 0 ? `Tasks (${activeFilters.join(" • ")})` : "Tasks",
			filterDescription: activeFilters.join(", "),
			parentTaskId: request.parentId,
			limit: request.limit,
			ready: request.ready,
		},
	});
}
