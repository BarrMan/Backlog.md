import { type TaskCorpus, withReadiness } from "../../core/task-detail.ts";
import type { LabelMatchMode, Task } from "../../types/index.ts";
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
	tasks: Task[],
	filters: TaskViewerFilterModel,
	searchIndex: ReturnType<typeof createTaskSearchIndex>,
	resolveMilestoneLabel: MilestoneFilterValueResolver,
	readyTasks?: TaskCorpus,
): Task[] {
	const filtered = applyTaskFilters(
		tasks,
		{ ...taskFilterOptions(filters, filters.labelMatch, resolveMilestoneLabel), excludeStatus: filters.excludeStatus },
		searchIndex,
	);
	const ready = readyTasks ? withReadiness(filtered, readyTasks).filter((task) => task.isReady) : filtered;
	return filters.limit === undefined ? ready : ready.slice(0, filters.limit);
}
