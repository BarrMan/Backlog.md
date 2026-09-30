import { Elysia, t } from "elysia";
import { parseSearchRequest } from "../search.ts";
import type { ResourceDependencies } from "./api.ts";

export function searchResource({ core, services }: ResourceDependencies) {
	return new Elysia({ name: "search" }).get(
		"/api/search",
		async ({ request }) => {
			try {
				const parsed = await parseSearchRequest(new URL(request.url), core);
				if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
				const wasReady = services.wasReady();
				const search = await services.search();
				if (wasReady && (!parsed.value.types || parsed.value.types.includes("task")))
					await core.refreshTasksForTaskRead();
				return Response.json(search.search(parsed.value));
			} catch (error) {
				console.error("Error performing search:", error);
				return Response.json({ error: "Search failed" }, { status: 500 });
			}
		},
		{ query: t.Object({}, { additionalProperties: true }) },
	);
}
