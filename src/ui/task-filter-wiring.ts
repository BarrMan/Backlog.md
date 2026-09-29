import type { ScreenInterface } from "neo-neo-bblessed";
import type { LabelMatchMode } from "../types/index.ts";
import { NO_MILESTONE_FILTER_LABEL, NO_MILESTONE_FILTER_VALUE } from "../utils/milestone-filter.ts";
import type { PriorityOption } from "../utils/priority-config.ts";
import type { TaskFilterOptions } from "../utils/task-search.ts";
import type { FilterControlId, FilterState } from "./components/filter-header.ts";
import { openMultiSelectFilterPopup, openSingleSelectFilterPopup } from "./components/filter-popup.ts";

export function taskFilterHeaderControls(projects: string[]): FilterControlId[] {
	return [
		"search",
		"status",
		"type",
		...(projects.length > 0 ? (["project"] as const) : []),
		"priority",
		"milestone",
		"labels",
	];
}

export function taskFilterOptions(
	filters: FilterState,
	labelMatch: LabelMatchMode = "any",
	resolveMilestoneLabel?: TaskFilterOptions["resolveMilestoneLabel"],
): TaskFilterOptions {
	return {
		query: filters.search,
		status: filters.status.length > 0 ? [...filters.status] : undefined,
		type: filters.taskTypes,
		project: filters.projects,
		priority: filters.priority || undefined,
		labels: filters.labels,
		labelMatch,
		milestone: filters.milestone || undefined,
		resolveMilestoneLabel,
	};
}

export async function openTaskFilterPicker(options: {
	screen: ScreenInterface;
	filterId: Exclude<ReturnType<typeof taskFilterHeaderControls>[number], "search">;
	filters: FilterState;
	statuses: string[];
	taskTypes: string[];
	projects: string[];
	priorityOptions: PriorityOption[];
	labels: string[];
	milestones: string[];
}): Promise<FilterState | null> {
	const { filterId, filters } = options;
	if (filterId === "status") {
		const value = await openMultiSelectFilterPopup({
			screen: options.screen,
			title: "Status Filter",
			items: options.statuses,
			selectedItems: filters.status,
		});
		return value === null ? null : { ...filters, status: value };
	}
	if (filterId === "type") {
		const value = await openMultiSelectFilterPopup({
			screen: options.screen,
			title: "Task Type Filter",
			items: options.taskTypes,
			selectedItems: filters.taskTypes,
		});
		return value === null ? null : { ...filters, taskTypes: value };
	}
	if (filterId === "project") {
		const value = await openMultiSelectFilterPopup({
			screen: options.screen,
			title: "Project Filter",
			items: options.projects,
			selectedItems: filters.projects,
		});
		return value === null ? null : { ...filters, projects: value };
	}
	if (filterId === "labels") {
		const value = await openMultiSelectFilterPopup({
			screen: options.screen,
			title: "Label Filter",
			items: [...options.labels].sort((a, b) => a.localeCompare(b)),
			selectedItems: filters.labels,
		});
		return value === null ? null : { ...filters, labels: value };
	}
	if (filterId === "priority") {
		const value = await openSingleSelectFilterPopup({
			screen: options.screen,
			title: "Priority Filter",
			selectedValue: filters.priority,
			choices: [
				{ label: "All", value: "" },
				...options.priorityOptions.map((priority) => ({ label: priority.label, value: priority.value })),
			],
		});
		return value === null ? null : { ...filters, priority: value };
	}
	const value = await openSingleSelectFilterPopup({
		screen: options.screen,
		title: "Milestone Filter",
		selectedValue: filters.milestone,
		choices: [
			{ label: "All", value: "" },
			{ label: NO_MILESTONE_FILTER_LABEL, value: NO_MILESTONE_FILTER_VALUE },
			...options.milestones.map((milestone) => ({ label: milestone, value: milestone })),
		],
	});
	return value === null ? null : { ...filters, milestone: value };
}
