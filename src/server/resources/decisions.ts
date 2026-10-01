import { t } from "elysia";
import type { Core } from "../../core/backlog.ts";
import { isAmbiguousIdError } from "../../utils/entity-id.ts";
import { API_ROUTES } from "../api-routes.ts";
import { type ResourceDependencies, scopedResource } from "./api.ts";
import { decisionListItemSchema, decisionSchema, decisionUpdateSchema, errorSchema } from "./schemas.ts";

const params = t.Object({ id: t.String() });
export function decisionsResource({ services }: ResourceDependencies) {
	const app = scopedResource(services, "decisions");
	const get = async (core: Core, id: string, set: { status?: number | string }) => {
		try {
			const value = await core.filesystem.loadDecision(id);
			if (value) return value;
			set.status = 404;
			return { error: "Decision not found" };
		} catch (error) {
			if (isAmbiguousIdError(error)) throw error;
			console.error("Error loading decision:", error);
			set.status = 404;
			return { error: "Decision not found" };
		}
	};
	app.get(
		API_ROUTES.DECISIONS,
		async ({ core, set }) => {
			try {
				return (await core.filesystem.listDecisions()).map(
					({ id, title, status, date, context, decision, consequences, alternatives }) => ({
						id,
						title,
						status,
						date,
						context,
						decision,
						consequences,
						alternatives,
					}),
				);
			} catch (error) {
				console.error("Error listing decisions:", error);
				set.status = 200;
				return [];
			}
		},
		{ response: t.Array(decisionListItemSchema) },
	);
	app.post(
		API_ROUTES.DECISIONS,
		async ({ body, core, set }) => {
			try {
				set.status = 201;
				return await core.createDecisionWithTitle(body.title);
			} catch (error) {
				console.error("Error creating decision:", error);
				set.status = 500;
				return { error: "Failed to create decision" };
			}
		},
		{ body: t.Object({ title: t.String() }), response: { 201: decisionSchema, 500: errorSchema } },
	);
	app.get(API_ROUTES.LEGACY_DECISION(":id"), ({ params, core, set }) => get(core, params.id, set), {
		params,
		response: { 200: decisionSchema, 404: errorSchema, 409: errorSchema },
	});
	app.get(API_ROUTES.DECISION(":id"), ({ params, core, set }) => get(core, params.id, set), {
		params,
		response: { 200: decisionSchema, 404: errorSchema, 409: errorSchema },
	});
	app.put(
		API_ROUTES.DECISION(":id"),
		async ({ params, body, core, set }) => {
			try {
				const existing = await core.filesystem.loadDecision(params.id);
				if (!existing) {
					set.status = 404;
					return { error: "Decision not found" };
				}
				await core.createDecision({ ...existing, ...body });
				return { success: true };
			} catch (error) {
				if (isAmbiguousIdError(error)) throw error;
				if (error instanceof Error && error.message.includes("not found")) {
					set.status = 404;
					return { error: "Decision not found" };
				}
				console.error("Error updating decision:", error);
				set.status = 500;
				return { error: "Failed to update decision" };
			}
		},
		{
			params,
			body: decisionUpdateSchema,
			response: { 200: t.Object({ success: t.Boolean() }), 404: errorSchema, 409: errorSchema, 500: errorSchema },
		},
	);
	return app;
}
