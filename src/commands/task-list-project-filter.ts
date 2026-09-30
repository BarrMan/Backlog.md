import type { OptionValues } from "commander";
import type { TaskListRequest } from "./task-list-parse.ts";

const values = (value: string | string[] | undefined): string[] =>
	Array.isArray(value) ? value : value ? [value] : [];

export function createProjectViewFilter(request: TaskListRequest, options: OptionValues) {
	const activeFilters = describeProjectViewFilters(request, options);
	return {
		status: request.filters.status,
		excludeStatus: request.filters.excludeStatus ? values(request.filters.excludeStatus) : undefined,
		assignee: options.assignee,
		milestone: options.milestone,
		type: request.filters.type ? values(request.filters.type) : undefined,
		project: request.filters.project ? values(request.filters.project) : undefined,
		priority: request.filters.priority,
		sort: options.sort,
		labels: request.labels,
		labelMatch: request.labels.length > 0 ? ("all" as const) : undefined,
		searchQuery: request.searchQuery || undefined,
		title: activeFilters.length > 0 ? `Tasks (${activeFilters.join(" • ")})` : "Tasks",
		filterDescription: activeFilters.join(", "),
		parentTaskId: request.parentId,
		limit: request.limit,
		ready: request.ready,
	};
}

function describeProjectViewFilters(request: TaskListRequest, options: OptionValues): string[] {
	return [
		[options.status, `Status: ${options.status}`],
		[request.filters.excludeStatus, `Exclude status: ${values(request.filters.excludeStatus).join(", ")}`],
		[options.assignee, `Assignee: ${options.assignee}`],
		[options.unassigned, "Unassigned"],
		[request.ready, "Ready"],
		[request.parentId, `Parent: ${request.parentDisplayId}`],
		[options.milestone, `Milestone: ${options.milestone}`],
		[request.filters.priority, `Priority: ${request.filters.priority}`],
		[request.filters.type, `Type: ${values(request.filters.type).join(", ")}`],
		[request.filters.project, `Project: ${values(request.filters.project).join(", ")}`],
		[request.labels.length > 0, `Labels: ${request.labels.join(", ")}`],
		[request.searchQuery, `Search: ${request.searchQuery}`],
		[request.limit !== undefined, `Limit: ${request.limit}`],
		[options.sort, `Sort: ${options.sort}`],
	].flatMap(([enabled, description]) => (enabled ? [description] : []));
}
