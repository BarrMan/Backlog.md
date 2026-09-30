import type { Core } from "../core/backlog.ts";
import type { SearchPriorityFilter, SearchResultType } from "../types/index.ts";
import { formatValidPriorityValues, resolvePriorityValue } from "../utils/priority-config.ts";
import {
	formatValidProjectValues,
	getProjectValues,
	noProjectsConfiguredMessage,
	resolveProjectValues,
} from "../utils/project-config.ts";
import { formatValidStatuses, getCanonicalStatuses } from "../utils/status.ts";

type SearchFilters = {
	status?: string | string[];
	excludeStatus?: string | string[];
	priority?: SearchPriorityFilter | SearchPriorityFilter[];
	project?: string | string[];
	assignee?: string | string[];
	labels?: string | string[];
	modifiedFiles?: string | string[];
};

export type SearchRequest = { query?: string; limit?: number; types?: SearchResultType[]; filters: SearchFilters };
export type SearchParseResult = { value: SearchRequest } | { error: string };
type SearchError = { error: string };

const EXCLUDE_STATUS_PARAMS = ["excludeStatus", "exclude-status", "excludeStatuses", "exclude-statuses"];
const SEARCH_TYPES: SearchResultType[] = ["task", "document", "decision"];

function collect(url: URL, names: string[], split = false): string[] {
	const values = names.flatMap((name) => url.searchParams.getAll(name));
	return split ? values.flatMap((value) => value.split(",")) : values;
}

function oneOrMany(values: string[]): string | string[] | undefined {
	const normalized = values.map((value) => value.trim()).filter(Boolean);
	return normalized.length === 0 ? undefined : normalized.length === 1 ? normalized[0] : normalized;
}

function parseLimit(url: URL): SearchError | { value: number | undefined } {
	const limit = url.searchParams.get("limit");
	if (!limit) return { value: undefined };
	const value = Number.parseInt(limit, 10);
	return Number.isNaN(value) || value <= 0 ? { error: "limit must be a positive integer" } : { value };
}

function parseTypes(url: URL): SearchError | { value: SearchResultType[] | undefined } {
	const values = collect(url, ["type", "types"]);
	if (values.length === 0) return { value: undefined };
	const types = values
		.map((value) => value.toLowerCase())
		.filter((value): value is SearchResultType => SEARCH_TYPES.includes(value as SearchResultType));
	return types.length === 0 ? { error: "type must be task, document, or decision" } : { value: types };
}

async function parseConfiguredFilters(url: URL, core: Core): Promise<SearchError | { value: SearchFilters }> {
	const filters: SearchFilters = {};
	const statuses = collect(url, ["status"]);
	if (statuses.length > 0) filters.status = statuses.length === 1 ? statuses[0] : statuses;
	const configured = await parseConfiguredValues(url, core);
	if ("error" in configured) return configured;
	Object.assign(filters, configured.value);
	filters.assignee = oneOrMany(collect(url, ["assignee", "assignees"], true));
	filters.labels = oneOrMany(collect(url, ["label", "labels"], true));
	filters.modifiedFiles = oneOrMany(collect(url, ["modifiedFile", "modifiedFiles"], true));
	return { value: filters };
}

async function parseConfiguredValues(url: URL, core: Core): Promise<SearchError | { value: SearchFilters }> {
	const excluded = await parseExcludedStatuses(url, core);
	if ("error" in excluded) return excluded;
	const configured = await parsePriorityAndProject(url, core);
	if ("error" in configured) return configured;
	return { value: { ...excluded.value, ...configured.value } };
}

async function parseExcludedStatuses(url: URL, core: Core): Promise<SearchError | { value: SearchFilters }> {
	const excluded = collect(url, EXCLUDE_STATUS_PARAMS, true)
		.map((value) => value.trim())
		.filter(Boolean);
	if (excluded.length === 0) return { value: {} };
	const { values, invalid, validStatuses } = await getCanonicalStatuses(excluded, core);
	if (invalid.length > 0)
		return {
			error: `Invalid excludeStatus filter: ${invalid.join(", ")}. Valid statuses are: ${formatValidStatuses(validStatuses)}`,
		};
	return { value: { excludeStatus: values.length === 1 ? values[0] : values } };
}

async function parsePriorityAndProject(url: URL, core: Core): Promise<SearchError | { value: SearchFilters }> {
	const priorities = collect(url, ["priority"]);
	const projects = collect(url, ["project"]);
	if (priorities.length === 0 && projects.length === 0) return { value: {} };
	const config = await core.filesystem.loadConfig();
	const priority = parsePriorities(priorities, config);
	if ("error" in priority) return priority;
	const project = parseProjects(projects, config, core.filesystem.configFilePath);
	if ("error" in project) return project;
	return { value: { ...priority.value, ...project.value } };
}

function parsePriorities(
	values: string[],
	config: Parameters<typeof resolvePriorityValue>[1],
): SearchError | { value: SearchFilters } {
	if (values.length === 0) return { value: {} };
	const resolved = values.map((value) => resolvePriorityValue(value, config));
	const invalid = values[resolved.findIndex((value) => !value)];
	if (invalid) return { error: `Unsupported priority '${invalid}'. Use ${formatValidPriorityValues(config)}.` };
	const priority = resolved.filter((value): value is SearchPriorityFilter => Boolean(value));
	return { value: { priority: priority.length === 1 ? priority[0] : priority } };
}

function parseProjects(
	values: string[],
	config: Parameters<typeof resolveProjectValues>[1],
	configPath: string,
): SearchError | { value: SearchFilters } {
	if (values.length === 0) return { value: {} };
	if (getProjectValues(config).length === 0) return { error: noProjectsConfiguredMessage(configPath) };
	const { values: resolved, invalid } = resolveProjectValues(values, config);
	if (invalid.length > 0)
		return { error: `Unsupported project '${invalid[0]}'. Use ${formatValidProjectValues(config)}.` };
	return { value: { project: resolved.length === 1 ? resolved[0] : resolved } };
}

export async function parseSearchRequest(url: URL, core: Core): Promise<SearchParseResult> {
	const limit = parseLimit(url);
	if ("error" in limit) return limit;
	const types = parseTypes(url);
	if ("error" in types) return types;
	const filters = await parseConfiguredFilters(url, core);
	if ("error" in filters) return filters;
	return {
		value: {
			query: url.searchParams.get("query") ?? undefined,
			limit: limit.value,
			types: types.value,
			filters: filters.value,
		},
	};
}
