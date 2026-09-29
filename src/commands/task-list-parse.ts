import type { OptionValues } from "commander";
import type { Core } from "../index.ts";
import type { TaskListFilter } from "../types/index.ts";
import { parsePositiveIntegerOption } from "../utils/list-window.ts";
import { parseDelimitedStringList } from "../utils/task-builders.ts";
import { canonicalTaskId } from "../utils/task-path.ts";

export type TaskListRequest = {
	filters: TaskListFilter;
	labels: string[];
	searchQuery: string;
	limit?: number;
	parentId?: string;
	parentDisplayId?: string;
	sortField: string;
	ready: boolean;
};

type TaskListNormalizers = {
	statusList: (core: Core, values: string[], optionName: string) => Promise<string[] | null>;
	priority: (core: Core, value: string) => Promise<string | null>;
	types: (core: Core, values: string[], optionName: string) => Promise<string[] | null>;
	projects: (core: Core, values: string[], optionName: string) => Promise<string[] | null>;
};

async function parseTaskListFilters(
	core: Core,
	options: OptionValues,
	normalize: TaskListNormalizers,
): Promise<Pick<TaskListRequest, "filters" | "labels"> | null> {
	if (options.assignee && options.unassigned) {
		console.error("--unassigned cannot be combined with --assignee.");
		process.exitCode = 1;
		return null;
	}
	const filters: TaskListFilter = {};
	if (options.status) filters.status = parseDelimitedStringList(options.status) ?? options.status;
	const excluded = parseDelimitedStringList(options.excludeStatus) ?? [];
	if (excluded.length > 0) {
		const statuses = await normalize.statusList(core, excluded, "exclude-status");
		if (!statuses) return null;
		filters.excludeStatus = statuses;
	}
	if (options.assignee) filters.assignee = options.assignee;
	if (options.unassigned) filters.unassigned = true;
	if (options.milestone) filters.milestone = options.milestone;
	if (options.priority) {
		const priority = await normalize.priority(core, String(options.priority));
		if (!priority) return null;
		filters.priority = priority;
	}
	const types = parseDelimitedStringList(options.type) ?? [];
	if (types.length > 0) {
		const canonicalTypes = await normalize.types(core, types, "type");
		if (!canonicalTypes) return null;
		filters.type = canonicalTypes;
	}
	const projects = parseDelimitedStringList(options.project) ?? [];
	if (projects.length > 0) {
		const canonicalProjects = await normalize.projects(core, projects, "project");
		if (!canonicalProjects) return null;
		filters.project = canonicalProjects;
	}
	const labels = parseDelimitedStringList(options.labels) ?? [];
	if (labels.length > 0) {
		filters.labels = labels;
		filters.labelMatch = "all";
	}
	return { filters, labels };
}

export async function parseTaskListRequest(
	core: Core,
	options: OptionValues,
	sortFields: readonly string[],
	normalize: TaskListNormalizers,
): Promise<TaskListRequest | null> {
	const parsedFilters = await parseTaskListFilters(core, options, normalize);
	if (!parsedFilters) return null;
	const { filters, labels } = parsedFilters;
	let limit: number | undefined;
	if (options.limit !== undefined) {
		const parsedLimit = parsePositiveIntegerOption(options.limit, "--limit", "backlog task list --help");
		if (parsedLimit === null) return null;
		limit = parsedLimit;
	}
	let parentId: string | undefined;
	let parentDisplayId: string | undefined;
	if (options.parent !== undefined) {
		parentId = String(options.parent).trim();
		if (!parentId) {
			console.error("Cannot use an empty value with --parent. Omit the flag to list every task.");
			process.exitCode = 1;
			return null;
		}
		filters.parentTaskId = parentId;
		const config = await core.filesystem.loadConfig();
		parentDisplayId = canonicalTaskId(parentId, config?.prefixes?.task ?? "task");
	}
	const sortField = options.sort ? String(options.sort).toLowerCase() : "priority";
	if (!sortFields.includes(sortField)) {
		console.error(`Invalid sort field: ${options.sort}. Valid values are: ${sortFields.join(", ")}`);
		process.exitCode = 1;
		return null;
	}
	return {
		filters,
		labels,
		searchQuery: typeof options.search === "string" ? options.search.trim() : "",
		limit,
		parentId,
		parentDisplayId,
		sortField,
		ready: Boolean(options.ready),
	};
}
