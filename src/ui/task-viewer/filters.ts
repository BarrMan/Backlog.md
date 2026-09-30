import type { TaskListItem } from "../../core/task-detail.ts";
import type { LabelMatchMode } from "../../types/index.ts";
import type { MilestoneFilterValueResolver } from "../../utils/milestone-filter.ts";
import { applyTaskFilters, type createTaskSearchIndex } from "../../utils/task-search.ts";
import { taskFilterOptions } from "../task-filter-wiring.ts";

export type TaskViewerFilterModel = {
	search: string;
	status: string[];
	excludeStatus: string[];
	taskTypes: string[];
	projects: string[];
	priority: string;
	labels: string[];
	milestone: string;
	labelMatch: LabelMatchMode;
	limit?: number;
};

export function filterTaskViewerTasks(
	tasks: TaskListItem[],
	filters: TaskViewerFilterModel,
	searchIndex: ReturnType<typeof createTaskSearchIndex>,
	resolveMilestoneLabel: MilestoneFilterValueResolver,
	readyFilter = false,
): TaskListItem[] {
	const filtered = applyTaskFilters(
		tasks,
		{ ...taskFilterOptions(filters, filters.labelMatch, resolveMilestoneLabel), excludeStatus: filters.excludeStatus },
		searchIndex,
	) as TaskListItem[];
	const ready = readyFilter ? filtered.filter((task) => task.isReady) : filtered;
	return filters.limit === undefined ? ready : ready.slice(0, filters.limit);
}
