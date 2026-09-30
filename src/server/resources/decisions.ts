import { Elysia, t } from "elysia";
import { isAmbiguousIdError } from "../../utils/entity-id.ts";
import type { ResourceDependencies } from "./api.ts";

const params = t.Object({ id: t.String() });
export function decisionsResource({ core, services }: ResourceDependencies): Elysia {
	const app = new Elysia({ name: "decisions" });
	const get = async (id: string) => {
		try {
			const value = await core.filesystem.loadDecision(id);
			return value ? Response.json(value) : Response.json({ error: "Decision not found" }, { status: 404 });
		} catch (error) {
			if (isAmbiguousIdError(error)) return Response.json({ error: error.message }, { status: 409 });
			console.error("Error loading decision:", error);
			return Response.json({ error: "Decision not found" }, { status: 404 });
		}
	};
	app.get("/api/decisions", async () => {
		try {
			return Response.json(
				(await services.store())
					.getDecisions()
					.map(({ id, title, status, date, context, decision, consequences, alternatives }) => ({
						id,
						title,
						status,
						date,
						context,
						decision,
						consequences,
						alternatives,
					})),
			);
		} catch (error) {
			console.error("Error listing decisions:", error);
			return Response.json([]);
		}
	});
	app.post(
		"/api/decisions",
		async ({ body }) => {
			try {
				return Response.json(await core.createDecisionWithTitle(body.title), { status: 201 });
			} catch (error) {
				console.error("Error creating decision:", error);
				return Response.json({ error: "Failed to create decision" }, { status: 500 });
			}
		},
		{ body: t.Object({ title: t.String() }) },
	);
	app.get("/api/decision/:id", ({ params }) => get(params.id), { params });
	app.get("/api/decisions/:id", ({ params }) => get(params.id), { params });
	app.put(
		"/api/decisions/:id",
		async ({ params, body }) => {
			try {
				await core.updateDecisionFromContent(params.id, body);
				return Response.json({ success: true });
			} catch (error) {
				if (isAmbiguousIdError(error)) return Response.json({ error: error.message }, { status: 409 });
				if (error instanceof Error && error.message.includes("not found"))
					return Response.json({ error: "Decision not found" }, { status: 404 });
				console.error("Error updating decision:", error);
				return Response.json({ error: "Failed to update decision" }, { status: 500 });
			}
		},
		{ params, body: t.String() },
	);
	return app;
}
