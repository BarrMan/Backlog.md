import { t } from "elysia";
import { parseSearchRequest } from "../search.ts";
import { type ResourceDependencies, scopedResource } from "./api.ts";
import { decisionSchema, documentSchema, errorSchema, taskSchema } from "./schemas.ts";

const searchMatchSchema = t.Object({
	key: t.Optional(t.String()),
	indices: t.Array(t.Tuple([t.Number(), t.Number()])),
	value: t.Optional(t.Any()),
});
const searchResultSchema = t.Union([
	t.Object({
		type: t.Literal("task"),
		score: t.Union([t.Number(), t.Null()]),
		task: taskSchema,
		matches: t.Optional(t.Array(searchMatchSchema)),
	}),
	t.Object({
		type: t.Literal("document"),
		score: t.Union([t.Number(), t.Null()]),
		document: documentSchema,
		matches: t.Optional(t.Array(searchMatchSchema)),
	}),
	t.Object({
		type: t.Literal("decision"),
		score: t.Union([t.Number(), t.Null()]),
		decision: decisionSchema,
		matches: t.Optional(t.Array(searchMatchSchema)),
	}),
]);

export function searchResource({ services }: ResourceDependencies) {
	const app = scopedResource(services, "search");
	return app.get(
		"/api/search",
		async ({ request, core, set }) => {
			try {
				const parsed = await parseSearchRequest(new URL(request.url), core);
				if ("error" in parsed) {
					set.status = 400;
					return { error: parsed.error };
				}
				return await core.searchPersistently(parsed.value);
			} catch (error) {
				console.error("Error performing search:", error);
				set.status = 500;
				return { error: "Search failed" };
			}
		},
		{
			query: t.Object({}, { additionalProperties: true }),
			response: { 200: t.Array(searchResultSchema), 400: errorSchema, 500: errorSchema },
		},
	);
}
