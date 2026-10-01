import type { OptionValues } from "commander";
import type { Core } from "../../../index.ts";
import type { TaskListFilter } from "../../../types/index.ts";
import { taskIdsEqual } from "../../../utils/task-path.ts";
import { sortTasks } from "../../../utils/task-sorting.ts";
import type { TaskListRequest } from "./list-parse.ts";
import { createProjectViewFilter } from "./list-project-filter.ts";
import { resolveTaskListParent } from "./list-query.ts";

export async function runTaskListProjectView(
	core: Core,
	request: TaskListRequest,
	options: OptionValues,
): Promise<void> {
	const filter = createProjectViewFilter(request, options);
	const { UnifiedViewController } = await import("../../../ui/unified/controller.ts");
	const loaderFilters: TaskListFilter = {};
	if (options.assignee) loaderFilters.assignee = options.assignee;
	if (options.unassigned) loaderFilters.unassigned = true;
	if (request.parentId) loaderFilters.parentTaskId = request.parentId;
	const prefiltersDisplayList = Object.keys(loaderFilters).length > 0;
	await new UnifiedViewController({
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
		filter,
	}).run();
}
