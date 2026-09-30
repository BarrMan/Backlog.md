import { Elysia, t } from "elysia";
import { MilestoneWorkflow, MilestoneWorkflowError } from "../../core/milestone-workflow.ts";
import { collectMilestoneAliasKeys } from "../../core/milestones.ts";
import { parseDueDate } from "../validation.ts";
import type { ResourceDependencies } from "./api.ts";

const params = t.Object({ id: t.String() });
const body = t.Object(
	{
		title: t.Optional(t.Any()),
		description: t.Optional(t.Any()),
		dueDate: t.Optional(t.Any()),
		updateTasks: t.Optional(t.Any()),
		taskHandling: t.Optional(t.Any()),
		reassignTo: t.Optional(t.Any()),
	},
	{ additionalProperties: true },
);
const mutationBody = t.Union([body, t.Array(t.Any())]);
export function milestonesResource({ core, publishData }: ResourceDependencies): Elysia {
	const app = new Elysia({ name: "milestones" });
	const fail = (error: unknown, context: string) => {
		const validation =
			error instanceof Error &&
			(error.message === "Request body must be valid JSON." || error.message === "Request body must be a JSON object.");
		const status = validation
			? 400
			: error instanceof MilestoneWorkflowError
				? error.code === "NOT_FOUND"
					? 404
					: error.code === "VALIDATION_ERROR"
						? 400
						: 500
				: 500;
		if (status === 500) console.error(context, error);
		return Response.json(
			{
				error: error instanceof Error ? error.message : context,
				code: error instanceof MilestoneWorkflowError ? error.code : validation ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
			},
			{ status },
		);
	};
	app.get("/api/milestones", async () => {
		try {
			return Response.json(await core.filesystem.listMilestones());
		} catch (error) {
			console.error("Error listing milestones:", error);
			return Response.json([]);
		}
	});
	app.get("/api/milestones/archived", async () => {
		try {
			return Response.json(await core.filesystem.listArchivedMilestones());
		} catch (error) {
			console.error("Error listing milestones:", error);
			return Response.json([]);
		}
	});
	app.post(
		"/api/milestones",
		async ({ body: input }) => {
			try {
				const title = typeof input.title === "string" ? input.title.trim() : "";
				if (!title) return Response.json({ error: "Milestone title is required" }, { status: 400 });
				const due = parseDueDate(input.dueDate, false);
				if ("error" in due) return Response.json({ error: due.error }, { status: 400 });
				const duplicate = (await core.filesystem.listMilestones()).some((item) => {
					const keys = new Set([...collectMilestoneAliasKeys(item.id), ...collectMilestoneAliasKeys(item.title)]);
					return [...collectMilestoneAliasKeys(title)].some((key) => keys.has(key));
				});
				if (duplicate)
					return Response.json({ error: "A milestone with this title or ID already exists" }, { status: 400 });
				const value = await core.filesystem.createMilestone(title, input.description, due.value ?? undefined);
				publishData("milestones");
				return Response.json(value, { status: 201 });
			} catch (error) {
				console.error("Error creating milestone:", error);
				return Response.json({ error: "Failed to create milestone" }, { status: 500 });
			}
		},
		{ body },
	);
	app.get(
		"/api/milestones/:id",
		async ({ params }) => {
			try {
				const value = await core.filesystem.loadMilestone(params.id);
				return value ? Response.json(value) : Response.json({ error: "Milestone not found" }, { status: 404 });
			} catch {
				return Response.json({ error: "Milestone not found" }, { status: 404 });
			}
		},
		{ params },
	);
	app.put(
		"/api/milestones/:id",
		async ({ params, body: input }) => {
			try {
				const title = typeof input.title === "string" ? input.title.trim() : "";
				const due = parseDueDate(input.dueDate, true);
				if ("error" in due) return Response.json({ error: due.error }, { status: 400 });
				if (!title) return Response.json({ error: "Milestone title is required" }, { status: 400 });
				const result = await new MilestoneWorkflow(core).rename({
					from: params.id,
					to: title,
					updateTasks: typeof input.updateTasks === "boolean" ? input.updateTasks : true,
					dueDate: "dueDate" in input ? (due.value ?? null) : undefined,
				});
				publishData("milestones");
				return Response.json({
					success: true,
					milestone: result.milestone,
					message:
						result.titleChanged || result.dueDateChanged
							? `Renamed milestone "${result.source.title}" (${result.source.id}) → "${result.milestone.title}" (${result.milestone.id}).`
							: `Milestone "${result.source.title}" (${result.source.id}) is already named "${result.source.title}". No changes made.`,
				});
			} catch (error) {
				return fail(error, "Error updating milestone");
			}
		},
		{ params, body },
	);
	app.delete(
		"/api/milestones/:id",
		async ({ params, body: input }) => {
			try {
				if (Array.isArray(input))
					throw new MilestoneWorkflowError("Request body must be a JSON object.", "VALIDATION_ERROR");
				const taskHandling =
					input.taskHandling === undefined
						? "clear"
						: input.taskHandling === "clear" || input.taskHandling === "keep" || input.taskHandling === "reassign"
							? input.taskHandling
							: null;
				if (!taskHandling)
					return Response.json({ error: "taskHandling must be clear, keep, or reassign" }, { status: 400 });
				const result = await new MilestoneWorkflow(core).remove({
					name: params.id,
					taskHandling,
					reassignTo: typeof input.reassignTo === "string" ? input.reassignTo : undefined,
				});
				publishData("milestones");
				return Response.json({
					success: true,
					message: `Removed milestone "${result.milestone.title}" (${result.milestone.id}).`,
				});
			} catch (error) {
				return fail(error, "Error removing milestone");
			}
		},
		{ params, body: mutationBody },
	);
	app.post(
		"/api/milestones/:id/archive",
		async ({ params }) => {
			try {
				const result = await core.archiveMilestone(params.id);
				if (!result.success) return Response.json({ error: "Milestone not found" }, { status: 404 });
				publishData("milestones");
				return Response.json({ success: true, milestone: result.milestone ?? null });
			} catch (error) {
				console.error("Error archiving milestone:", error);
				return Response.json(
					{ error: error instanceof Error ? error.message : "Failed to archive milestone" },
					{ status: 500 },
				);
			}
		},
		{ params },
	);
	return app;
}
