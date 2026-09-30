import type { Core } from "../../core/backlog.ts";
import type { BacklogConfig, LabelMatchMode, Task } from "../../types/index.ts";
import { hasAnyPrefix } from "../../utils/prefix-config.ts";
import { getPriorityOptions, normalizePriorityValue, type PriorityOption } from "../../utils/priority-config.ts";
import { getProjectValues, resolveProjectValues } from "../../utils/project-config.ts";
import { getTaskTypeValues, resolveTaskTypeValues } from "../../utils/task-type-config.ts";

const DEFAULT_TASK_VIEWER_STATUSES = ["To Do", "In Progress", "Done"];

export type TaskViewerConfiguration = {
	statuses: string[];
	labels: string[];
	priorityOptions: PriorityOption[];
	configuredTaskTypes: string[];
	configuredProjects: string[];
	dateFormat: string | undefined;
	projectName: string | undefined;
};

export type TaskViewerInitialFilterOptions = {
	searchQuery?: string;
	statusFilter?: string | string[];
	excludeStatus?: string[];
	typeFilter?: string[];
	projectFilter?: string[];
	priorityFilter?: string;
	milestoneFilter?: string;
	labelFilter?: string[];
	labelMatch?: LabelMatchMode;
	limit?: number;
	readyFilter?: boolean;
};

export type TaskViewerInitialFilters = {
	searchQuery: string;
	statusFilter: string[];
	excludeStatusFilter: string[];
	taskTypeFilter: string[];
	projectFilter: string[];
	priorityFilter: string;
	labelFilter: string[];
	milestoneFilter: string;
	labelMatch: LabelMatchMode;
	taskLimit: number | undefined;
	filtersActive: boolean;
};

function normalizeTaskViewerConfiguration(config: BacklogConfig | null): TaskViewerConfiguration {
	return {
		statuses: config?.statuses ?? DEFAULT_TASK_VIEWER_STATUSES,
		labels: config?.labels ?? [],
		priorityOptions: getPriorityOptions(config),
		configuredTaskTypes: getTaskTypeValues(config),
		configuredProjects: getProjectValues(config),
		dateFormat: config?.dateFormat,
		projectName: config?.projectName,
	};
}

async function loadTaskViewerConfiguration(core: Core): Promise<TaskViewerConfiguration> {
	return normalizeTaskViewerConfiguration(await core.filesystem.loadConfig());
}

function normalizeViewerStatusFilter(statusFilter: string | string[] | undefined, statuses: string[]): string[] {
	if (!statusFilter) return [];
	const requestedStatuses = new Set(
		(Array.isArray(statusFilter) ? statusFilter : [statusFilter]).map((status) => status.trim().toLowerCase()),
	);
	return statuses.filter((status) => requestedStatuses.has(status.toLowerCase()));
}

function normalizeViewerLabelFilter(labelFilter: string[] | undefined, availableLabels: string[]): string[] {
	const availableLabelsByName = new Set(availableLabels.map((label) => label.toLowerCase()));
	return (labelFilter ?? []).filter((label) => availableLabelsByName.has(label.toLowerCase()));
}

function hasTaskViewerInitialFilters(
	filters: Omit<TaskViewerInitialFilters, "filtersActive">,
	readyFilter: boolean | undefined,
) {
	return Boolean(
		filters.searchQuery ||
			filters.statusFilter.length ||
			filters.excludeStatusFilter.length ||
			filters.taskTypeFilter.length ||
			filters.projectFilter.length ||
			filters.priorityFilter ||
			filters.labelFilter.length ||
			filters.milestoneFilter ||
			readyFilter ||
			filters.taskLimit !== undefined,
	);
}

export function normalizeTaskViewerInitialFilters(
	options: TaskViewerInitialFilterOptions,
	configuration: Pick<TaskViewerConfiguration, "statuses" | "configuredTaskTypes" | "configuredProjects">,
	availableLabels: string[],
): TaskViewerInitialFilters {
	const filters = {
		searchQuery: options.searchQuery ?? "",
		statusFilter: normalizeViewerStatusFilter(options.statusFilter, configuration.statuses),
		excludeStatusFilter: [...(options.excludeStatus ?? [])],
		taskTypeFilter: resolveTaskTypeValues(options.typeFilter ?? [], configuration.configuredTaskTypes).values,
		projectFilter: resolveProjectValues(options.projectFilter ?? [], configuration.configuredProjects).values,
		priorityFilter: normalizePriorityValue(options.priorityFilter) ?? "",
		labelFilter: normalizeViewerLabelFilter(options.labelFilter, availableLabels),
		milestoneFilter: options.milestoneFilter ?? "",
		labelMatch: options.labelMatch ?? "any",
		taskLimit: options.limit,
	};
	return { ...filters, filtersActive: hasTaskViewerInitialFilters(filters, options.readyFilter) };
}

export async function loadTaskViewerData(
	core: Core,
	providedTasks: Task[] | undefined,
): Promise<
	{ allTasks: Task[]; contentStore: Awaited<ReturnType<Core["getContentStore"]>> | null } & TaskViewerConfiguration
> {
	const configuration = await loadTaskViewerConfiguration(core);
	if (providedTasks) {
		return {
			allTasks: providedTasks.filter((task) => task.id?.trim() && hasAnyPrefix(task.id)),
			contentStore: null,
			...configuration,
		};
	}
	const contentStore = await core.getContentStore();
	return {
		allTasks: (await core.queryTasks()).filter((task) => task.id?.trim() && hasAnyPrefix(task.id)),
		contentStore,
		...configuration,
	};
}
