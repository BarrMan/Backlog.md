import type { ScreenInterface } from "neo-neo-bblessed";
import type { LabelMatchMode } from "../types/index.ts";
import { NO_MILESTONE_FILTER_LABEL, NO_MILESTONE_FILTER_VALUE } from "../utils/milestone-filter.ts";
import type { PriorityOption } from "../utils/priority-config.ts";
import type { TaskFilterOptions } from "../utils/task-search.ts";
import type { FilterControlId, FilterHeader, FilterState } from "./components/filter-header.ts";
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

export function focusTaskFilterControl(header: FilterHeader, filterId: FilterControlId): void {
	const controls: Record<FilterControlId, () => void> = {
		search: () => header.focusSearch(),
		status: () => header.focusStatus(),
		type: () => header.focusType(),
		project: () => header.focusProject(),
		priority: () => header.focusPriority(),
		milestone: () => header.focusMilestone(),
		labels: () => header.focusLabels(),
	};
	controls[filterId]();
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
	const multiSelect = getMultiSelectFilterOptions(options, filterId);
	if (multiSelect) {
		const value = await openMultiSelectFilterPopup({ screen: options.screen, ...multiSelect });
		return value === null ? null : { ...filters, [multiSelect.field]: value };
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

function getMultiSelectFilterOptions(
	options: Parameters<typeof openTaskFilterPicker>[0],
	filterId: Parameters<typeof openTaskFilterPicker>[0]["filterId"],
): {
	title: string;
	items: string[];
	selectedItems: string[];
	field: "status" | "taskTypes" | "projects" | "labels";
} | null {
	const policies = {
		status: { title: "Status Filter", items: options.statuses, selectedItems: options.filters.status, field: "status" },
		type: {
			title: "Task Type Filter",
			items: options.taskTypes,
			selectedItems: options.filters.taskTypes,
			field: "taskTypes",
		},
		project: {
			title: "Project Filter",
			items: options.projects,
			selectedItems: options.filters.projects,
			field: "projects",
		},
		labels: {
			title: "Label Filter",
			items: [...options.labels].sort((a, b) => a.localeCompare(b)),
			selectedItems: options.filters.labels,
			field: "labels",
		},
	} as const;
	return filterId in policies ? policies[filterId as keyof typeof policies] : null;
}
