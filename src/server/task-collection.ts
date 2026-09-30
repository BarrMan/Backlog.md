import type { Core } from "../core/backlog.ts";
import { formatValidPriorityValues, resolvePriorityValue } from "../utils/priority-config.ts";
import { formatValidStatuses, getCanonicalStatuses } from "../utils/status.ts";
import { isAmbiguousTaskIdError } from "../utils/task-path.ts";
import { collectDelimitedSearchParams } from "./transport.ts";

type TaskCollectionQuery = Parameters<Core["queryTasks"]>[0];
type TaskCollectionServices = { ready(): Promise<void>; wasReady(): boolean };

async function resolveTaskCollectionQuery(
	url: URL,
	core: Core,
	refreshCrossBranch: boolean,
): Promise<Response | TaskCollectionQuery> {
	const config = await core.filesystem.loadConfig();
	const priorityParam = url.searchParams.get("priority") || undefined;
	const priority = priorityParam ? resolvePriorityValue(priorityParam, config) : undefined;
	if (priorityParam && !priority)
		return Response.json(
			{ error: `Invalid priority filter. Valid values are: ${formatValidPriorityValues(config)}` },
			{ status: 400 },
		);
	const excluded = collectDelimitedSearchParams(url, [
		"excludeStatus",
		"exclude-status",
		"excludeStatuses",
		"exclude-statuses",
	]);
	let excludeStatus: string[] | undefined;
	if (excluded.length) {
		const value = await getCanonicalStatuses(excluded, core);
		if (value.invalid.length)
			return Response.json(
				{
					error: `Invalid excludeStatus filter: ${value.invalid.join(", ")}. Valid statuses are: ${formatValidStatuses(value.validStatuses)}`,
				},
				{ status: 400 },
			);
		excludeStatus = value.values.length ? value.values : undefined;
	}
	const parent = url.searchParams.get("parent") || undefined;
	let parentTaskId: string | undefined;
	if (parent) {
		try {
			const value =
				(await core.getTask(parent, { refreshCrossBranch })) ??
				(await core.getTask(/^[a-zA-Z]+-/i.test(parent) ? parent : `task-${parent}`, {
					refreshCrossBranch: false,
				}));
			if (!value)
				return Response.json(
					{ error: `Parent task ${/^[a-zA-Z]+-/i.test(parent) ? parent : `task-${parent}`} not found` },
					{ status: 404 },
				);
			parentTaskId = value.id;
		} catch (error) {
			if (isAmbiguousTaskIdError(error)) return Response.json({ error: error.message }, { status: 409 });
			throw error;
		}
	}
	const labels = [
		...url.searchParams.getAll("label"),
		...url.searchParams.getAll("labels"),
		...(url.searchParams.get("labels")?.split(",") ?? []),
	]
		.map((value) => value.trim())
		.filter(Boolean);
	return {
		filters: {
			status: url.searchParams.get("status") || undefined,
			excludeStatus,
			assignee: url.searchParams.get("assignee") || undefined,
			priority,
			parentTaskId,
			labels: labels.length ? labels : undefined,
		},
		includeCrossBranch: url.searchParams.get("crossBranch") !== "false",
		refreshCrossBranch: parent ? false : refreshCrossBranch,
	};
}

export async function listTaskCollection(
	request: Request,
	core: Core,
	services: TaskCollectionServices,
): Promise<Response> {
	const refreshCrossBranch = services.wasReady();
	await services.ready();
	const query = await resolveTaskCollectionQuery(new URL(request.url), core, refreshCrossBranch);
	return query instanceof Response ? query : Response.json(await core.queryTasks(query));
}
