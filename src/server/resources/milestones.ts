import { t } from "elysia";
import { MilestoneWorkflow, MilestoneWorkflowError } from "../../core/milestone-workflow.ts";
import { collectMilestoneAliasKeys } from "../../core/milestones.ts";
import { parseDueDate } from "../validation.ts";
import { type ResourceDependencies, scopedResource } from "./api.ts";
import { errorSchema, milestoneSchema } from "./schemas.ts";

const params = t.Object({ id: t.String() });
const body = t.Object(
	{
		title: t.Optional(t.String()),
		description: t.Optional(t.String()),
		dueDate: t.Optional(t.Union([t.String(), t.Null()])),
		updateTasks: t.Optional(t.Boolean()),
		taskHandling: t.Optional(t.Union([t.Literal("clear"), t.Literal("keep"), t.Literal("reassign")])),
		reassignTo: t.Optional(t.String()),
	},
	{ additionalProperties: true },
);
// Preserve an array long enough for the handler to return the documented 400 instead of cleaning it into {}.
const deletionBody = t.Union([body, t.Array(t.Never())]);
export function milestonesResource({ services }: ResourceDependencies) {
	const app = scopedResource(services, "milestones");
	const fail = (error: unknown, context: string) => {
		const status =
			error instanceof MilestoneWorkflowError
				? error.code === "NOT_FOUND"
					? 404
					: error.code === "VALIDATION_ERROR"
						? 400
						: 500
				: 500;
		if (status === 500) console.error(context, error);
		return {
			status,
			body: {
				error: error instanceof Error ? error.message : context,
				code: error instanceof MilestoneWorkflowError ? error.code : "INTERNAL_ERROR",
			},
		};
	};
	app.get(
		"/api/milestones",
		async ({ core }) => {
			try {
				return await core.filesystem.listMilestones();
			} catch (error) {
				console.error("Error listing milestones:", error);
				return [];
			}
		},
		{ response: t.Array(milestoneSchema) },
	);
	app.get(
		"/api/milestones/archived",
		async ({ core }) => {
			try {
				return await core.filesystem.listArchivedMilestones();
			} catch (error) {
				console.error("Error listing milestones:", error);
				return [];
			}
		},
		{ response: t.Array(milestoneSchema) },
	);
	app.post(
		"/api/milestones",
		async ({ body: input, core, set }) => {
			try {
				const title = input.title?.trim() ?? "";
				if (!title) {
					set.status = 400;
					return { error: "Milestone title is required" };
				}
				const due = parseDueDate(input.dueDate, false);
				if ("error" in due) {
					set.status = 400;
					return { error: due.error };
				}
				const duplicate = (await core.filesystem.listMilestones()).some((item) => {
					const keys = new Set([...collectMilestoneAliasKeys(item.id), ...collectMilestoneAliasKeys(item.title)]);
					return [...collectMilestoneAliasKeys(title)].some((key) => keys.has(key));
				});
				if (duplicate) {
					set.status = 400;
					return { error: "A milestone with this title or ID already exists" };
				}
				const value = await core.filesystem.createMilestone(title, input.description, due.value ?? undefined);
				set.status = 201;
				return value;
			} catch (error) {
				console.error("Error creating milestone:", error);
				set.status = 500;
				return { error: "Failed to create milestone" };
			}
		},
		{ body, response: { 201: milestoneSchema, 400: errorSchema, 500: errorSchema } },
	);
	app.get(
		"/api/milestones/:id",
		async ({ params, core, set }) => {
			try {
				const value = await core.filesystem.loadMilestone(params.id);
				if (value) return value;
				set.status = 404;
				return { error: "Milestone not found" };
			} catch {
				set.status = 404;
				return { error: "Milestone not found" };
			}
		},
		{ params, response: { 200: milestoneSchema, 404: errorSchema } },
	);
	app.put(
		"/api/milestones/:id",
		async ({ params, body: input, core, set }) => {
			try {
				const title = input.title?.trim() ?? "";
				const due = parseDueDate(input.dueDate, true);
				if ("error" in due) {
					set.status = 400;
					return { error: due.error };
				}
				if (!title) {
					set.status = 400;
					return { error: "Milestone title is required" };
				}
				const result = await new MilestoneWorkflow(core).rename({
					from: params.id,
					to: title,
					updateTasks: typeof input.updateTasks === "boolean" ? input.updateTasks : true,
					dueDate: "dueDate" in input ? (due.value ?? null) : undefined,
				});
				return {
					success: true,
					milestone: result.milestone,
					message:
						result.titleChanged || result.dueDateChanged
							? `Renamed milestone "${result.source.title}" (${result.source.id}) → "${result.milestone.title}" (${result.milestone.id}).`
							: `Milestone "${result.source.title}" (${result.source.id}) is already named "${result.source.title}". No changes made.`,
				};
			} catch (error) {
				const failure = fail(error, "Error updating milestone");
				set.status = failure.status;
				return failure.body;
			}
		},
		{
			params,
			body,
			response: {
				200: t.Object({ success: t.Boolean(), milestone: milestoneSchema, message: t.String() }),
				400: errorSchema,
				404: errorSchema,
				409: errorSchema,
				500: errorSchema,
			},
		},
	);
	app.delete(
		"/api/milestones/:id",
		async ({ params, body: input, core, set }) => {
			try {
				if (!input || typeof input !== "object" || Array.isArray(input)) {
					set.status = 400;
					return { error: "Request body must be a JSON object", code: "VALIDATION_ERROR" };
				}
				const taskHandling =
					input.taskHandling === undefined
						? "clear"
						: input.taskHandling === "clear" || input.taskHandling === "keep" || input.taskHandling === "reassign"
							? input.taskHandling
							: null;
				if (!taskHandling) {
					set.status = 400;
					return { error: "taskHandling must be clear, keep, or reassign" };
				}
				const result = await new MilestoneWorkflow(core).remove({
					name: params.id,
					taskHandling,
					reassignTo: typeof input.reassignTo === "string" ? input.reassignTo : undefined,
				});
				return {
					success: true,
					message: `Removed milestone "${result.milestone.title}" (${result.milestone.id}).`,
				};
			} catch (error) {
				const failure = fail(error, "Error removing milestone");
				set.status = failure.status;
				return failure.body;
			}
		},
		{
			params,
			body: deletionBody,
			response: {
				200: t.Object({ success: t.Boolean(), message: t.String() }),
				400: errorSchema,
				404: errorSchema,
				409: errorSchema,
				500: errorSchema,
			},
		},
	);
	app.post(
		"/api/milestones/:id/archive",
		async ({ params, core, set }) => {
			try {
				const result = await core.archiveMilestone(params.id);
				if (!result.success) {
					set.status = 404;
					return { error: "Milestone not found" };
				}
				return { success: true, milestone: result.milestone ?? null };
			} catch (error) {
				console.error("Error archiving milestone:", error);
				set.status = 500;
				return { error: error instanceof Error ? error.message : "Failed to archive milestone" };
			}
		},
		{
			params,
			response: {
				200: t.Object({ success: t.Boolean(), milestone: t.Union([milestoneSchema, t.Null()]) }),
				404: errorSchema,
				500: errorSchema,
			},
		},
	);
	return app;
}
