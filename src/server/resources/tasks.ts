import { isAbsolute } from "node:path";
import { t } from "elysia";
import { type Core, TaskArchiveStatusError } from "../../core/backlog.ts";
import type { ProjectTaskGraph } from "../../core/project-task-graph.ts";
import { isCreateLockError, isTaskLockError } from "../../file-system/operations.ts";
import type { Task } from "../../types/index.ts";
import { isAmbiguousIdError } from "../../utils/entity-id.ts";
import { resolveMilestoneInputFromFilesystem } from "../../utils/milestone-storage.ts";
import { DRAFT_PREFIX, extractAnyPrefix } from "../../utils/prefix-config.ts";
import { getValidStatuses } from "../../utils/status.ts";
import { isValidTaskId } from "../../utils/task-id.ts";
import { isAmbiguousTaskIdError, LOCAL_TASK_LOOKUP_HINT } from "../../utils/task-path.ts";
import { API_ROUTES } from "../api-routes.ts";
import { listTaskCollection, taskCollectionQuery } from "../task-collection.ts";
import { demotionFailureCause, movedState } from "../transport.ts";
import { normalizeAcceptanceCriteriaItems, parseDueDate, parseTaskUpdate } from "../validation.ts";
import { type ResourceDependencies, scopedResource } from "./api.ts";
import { agentConfigurationSchema, taskDetailSchema, taskSchema, taskSummarySchema } from "./schemas.ts";

const params = t.Object({ id: t.String() });
const error = t.Object({
	error: t.String(),
	code: t.Optional(t.String()),
	demotionState: t.Optional(t.Union([t.Literal("moved"), t.Literal("partial")])),
	demotionFailureCause: t.Optional(t.Union([t.Literal("cleanup"), t.Literal("commit")])),
});
const success = t.Object({ success: t.Boolean() }, { additionalProperties: true });
const acceptanceCriterionInput = t.Object({ text: t.String(), checked: t.Optional(t.Boolean()) });
const taskCreateBody = t.Object({
	title: t.Optional(t.String()),
	dueDate: t.Optional(t.String()),
	description: t.Optional(t.String()),
	status: t.Optional(t.String()),
	priority: t.Optional(t.String()),
	type: t.Optional(t.String()),
	project: t.Optional(t.String()),
	ordinal: t.Optional(t.Number()),
	milestone: t.Optional(t.String()),
	labels: t.Optional(t.Array(t.String())),
	assignee: t.Optional(t.Array(t.String())),
	dependencies: t.Optional(t.Array(t.String())),
	references: t.Optional(t.Array(t.String())),
	documentation: t.Optional(t.Array(t.String())),
	modifiedFiles: t.Optional(t.Array(t.String())),
	parentTaskId: t.Optional(t.String()),
	implementationPlan: t.Optional(t.String()),
	implementationNotes: t.Optional(t.String()),
	finalSummary: t.Optional(t.String()),
	acceptanceCriteriaItems: t.Optional(t.Array(acceptanceCriterionInput)),
	definitionOfDoneAdd: t.Optional(t.Array(t.String())),
	disableDefinitionOfDoneDefaults: t.Optional(t.Boolean()),
	rawContent: t.Optional(t.String()),
});
const taskUpdateBody = t.Object({
	title: t.Optional(t.String()),
	dueDate: t.Optional(t.Union([t.String(), t.Null()])),
	description: t.Optional(t.String()),
	status: t.Optional(t.String()),
	priority: t.Optional(t.String()),
	type: t.Optional(t.String()),
	project: t.Optional(t.Union([t.String(), t.Null()])),
	milestone: t.Optional(t.Union([t.String(), t.Null()])),
	labels: t.Optional(t.Array(t.String())),
	addLabels: t.Optional(t.Array(t.String())),
	removeLabels: t.Optional(t.Array(t.String())),
	assignee: t.Optional(t.Array(t.String())),
	ordinal: t.Optional(t.Number()),
	dependencies: t.Optional(t.Array(t.String())),
	addDependencies: t.Optional(t.Array(t.String())),
	removeDependencies: t.Optional(t.Array(t.String())),
	references: t.Optional(t.Array(t.String())),
	addReferences: t.Optional(t.Array(t.String())),
	removeReferences: t.Optional(t.Array(t.String())),
	documentation: t.Optional(t.Array(t.String())),
	addDocumentation: t.Optional(t.Array(t.String())),
	removeDocumentation: t.Optional(t.Array(t.String())),
	modifiedFiles: t.Optional(t.Array(t.String())),
	implementationPlan: t.Optional(t.String()),
	appendImplementationPlan: t.Optional(t.Array(t.String())),
	clearImplementationPlan: t.Optional(t.Boolean()),
	implementationNotes: t.Optional(t.String()),
	appendImplementationNotes: t.Optional(t.Array(t.String())),
	clearImplementationNotes: t.Optional(t.Boolean()),
	commentsAppend: t.Optional(t.Array(t.String())),
	commentAuthor: t.Optional(t.String()),
	finalSummary: t.Optional(t.String()),
	appendFinalSummary: t.Optional(t.Array(t.String())),
	clearFinalSummary: t.Optional(t.Boolean()),
	acceptanceCriteriaItems: t.Optional(t.Array(acceptanceCriterionInput)),
	acceptanceCriteria: t.Optional(t.Array(acceptanceCriterionInput)),
	addAcceptanceCriteria: t.Optional(t.Array(t.Union([t.String(), acceptanceCriterionInput]))),
	removeAcceptanceCriteria: t.Optional(t.Array(t.Number())),
	checkAcceptanceCriteria: t.Optional(t.Array(t.Number())),
	uncheckAcceptanceCriteria: t.Optional(t.Array(t.Number())),
	definitionOfDoneAdd: t.Optional(t.Array(t.String())),
	definitionOfDoneRemove: t.Optional(t.Array(t.Number())),
	definitionOfDoneCheck: t.Optional(t.Array(t.Number())),
	definitionOfDoneUncheck: t.Optional(t.Array(t.Number())),
	rawContent: t.Optional(t.String()),
	agentConfiguration: t.Optional(t.Union([agentConfigurationSchema, t.Null()])),
});
const reorderBody = t.Object({
	taskId: t.Optional(t.String()),
	targetStatus: t.Optional(t.String()),
	orderedTaskIds: t.Optional(t.Array(t.String())),
	targetMilestone: t.Optional(t.Union([t.String(), t.Null()])),
});
const moveBody = t.Object({
	taskIds: t.Optional(t.Array(t.String())),
	targetStatus: t.Optional(t.String()),
	targetMilestone: t.Optional(t.Union([t.String(), t.Null()])),
});
const cleanupBody = t.Object({ age: t.Optional(t.Union([t.String(), t.Number()])) });
const duplicateRepairBody = t.Object({ fingerprint: t.Optional(t.String()) });
const cleanupQuery = t.Object({ age: t.Optional(t.String()) });
const cleanupPreview = t.Object({
	count: t.Number(),
	tasks: t.Array(
		t.Object({ id: t.String(), title: t.String(), updatedDate: t.Optional(t.String()), createdDate: t.String() }),
	),
});
const moved = t.Object({ success: t.Boolean(), cleanedTaskIds: t.Array(t.String()) });
const reorderResult = t.Object({ success: t.Boolean(), task: taskSchema, changedTasks: t.Array(taskSchema) });
const moveResult = t.Object({
	success: t.Boolean(),
	tasks: t.Array(taskSchema),
	changedTasks: t.Array(taskSchema),
	failures: t.Array(t.Object({ taskId: t.String(), reason: t.String() })),
});
const draft = (id: string) => extractAnyPrefix(id) === DRAFT_PREFIX;
const webError = (message: string) =>
	message.replace(
		LOCAL_TASK_LOOKUP_HINT,
		"Task lookups read only the local working copy; a task that exists only on another branch cannot be referenced yet.",
	);
export function tasksResource({ services }: ResourceDependencies) {
	const app = scopedResource(services, "tasks");
	const milestone = (core: Core, id: string) => resolveMilestoneInputFromFilesystem(id, core.filesystem);
	const movedResponse = (cleanedTaskIds: string[]) => ({ success: true, cleanedTaskIds });
	const detail = async (
		core: Core,
		id: string,
	): Promise<{ task: Task } | { status: 400 | 404 | 409; error: string }> => {
		if (!isValidTaskId(id)) return { status: 400 as const, error: `Invalid task ID: ${id}` };
		try {
			const value = draft(id) ? await core.filesystem.loadDraft(id) : await core.getTask(id);
			return value ? { task: value } : { status: 404 as const, error: `Task ${id} not found` };
		} catch (error) {
			if (isAmbiguousTaskIdError(error))
				return {
					status: 409 as const,
					error: error.candidates.some((path) => !isAbsolute(path))
						? `Task ID ${id} is ambiguous. Repair duplicate task IDs before opening it.`
						: error.message,
				};
			if (isAmbiguousIdError(error)) return { status: 409 as const, error: error.message };
			throw error;
		}
	};
	app.get(
		API_ROUTES.TASKS,
		({ query, core, graph }) => {
			if (!graph) throw new Error("Browser services must initialize before accepting requests");
			return listTaskCollection(query, core, graph);
		},
		{
			query: taskCollectionQuery,
			response: { 200: t.Array(taskSummarySchema) },
		},
	);
	app.post(
		API_ROUTES.TASKS,
		async ({ body: input, core, status }) => {
			if (typeof input.title !== "string" || !input.title.trim()) return status(400, { error: "Title is required" });
			const due = parseDueDate(input.dueDate, false);
			if ("error" in due) return status(400, { error: due.error });
			try {
				const created = await core.createTaskFromInput({
					...input,
					title: input.title,
					dueDate: due.value ?? undefined,
					milestone: typeof input.milestone === "string" ? await milestone(core, input.milestone) : undefined,
					acceptanceCriteria: normalizeAcceptanceCriteriaItems(input.acceptanceCriteriaItems),
					definitionOfDoneAdd: Array.isArray(input.definitionOfDoneAdd)
						? input.definitionOfDoneAdd.map((item) => String(item ?? "").trim()).filter(Boolean)
						: [],
					disableDefinitionOfDoneDefaults: Boolean(input.disableDefinitionOfDoneDefaults),
				} as Parameters<Core["createTaskFromInput"]>[0]);
				return status(201, created.task);
			} catch (error) {
				return status(isCreateLockError(error) ? 409 : 400, {
					error: webError(error instanceof Error ? error.message : "Failed to create task"),
				});
			}
		},
		{ body: taskCreateBody, response: { 201: taskSchema, 400: error, 409: error } },
	);
	const get = async (
		core: Core,
		graph: ProjectTaskGraph | undefined,
		id: string,
		set: { status?: number | string },
	) => {
		if (!graph) throw new Error("Browser services must initialize before accepting requests");
		const value = await detail(core, id);
		if ("error" in value) {
			set.status = value.status;
			return { error: value.error };
		}
		return graph.getTaskDetail(value.task);
	};
	const detailResponse = { 200: taskDetailSchema, 400: error, 404: error, 409: error };
	app.get(API_ROUTES.LEGACY_TASK(":id"), ({ params, core, graph, set }) => get(core, graph, params.id, set), {
		params,
		response: detailResponse,
	});
	app.get(API_ROUTES.TASK(":id"), ({ params, core, graph, set }) => get(core, graph, params.id, set), {
		params,
		response: detailResponse,
	});
	app.put(
		API_ROUTES.TASK(":id"),
		async ({ params, body: input, core, scope, status }) => {
			const parsed = parseTaskUpdate(input);
			if ("error" in parsed) return status(400, { error: parsed.error });
			if (typeof parsed.value.milestone === "string")
				parsed.value.milestone = await milestone(core, parsed.value.milestone);
			try {
				return draft(params.id)
					? (await core.editTaskOrDraft(params.id, parsed.value)).task
					: await core.updateTaskFromInput(params.id, parsed.value);
			} catch (error) {
				const state = movedState(error, "demotionState");
				if (state) {
					await services.reconcile(scope);
					return status(500, {
						error: webError(error instanceof Error ? error.message : "Failed to update task"),
						demotionState: state,
						...(demotionFailureCause(error) && { demotionFailureCause: demotionFailureCause(error) }),
					});
				}
				return status(
					isAmbiguousIdError(error) || isAmbiguousTaskIdError(error) || isTaskLockError(error) ? 409 : 400,
					{
						error: webError(error instanceof Error ? error.message : "Failed to update task"),
					},
				);
			}
		},
		{ params, body: taskUpdateBody, response: { 200: taskSchema, 400: error, 409: error, 500: error } },
	);
	app.delete(
		API_ROUTES.TASK(":id"),
		async ({ params, core, status }) => {
			try {
				const result = await core.archiveTask(params.id);
				return result.success ? movedResponse(result.cleanedTaskIds) : status(404, { error: "Task not found" });
			} catch (error) {
				if (error instanceof TaskArchiveStatusError) return status(400, { error: error.message });
				if (isAmbiguousTaskIdError(error)) return status(409, { error: error.message });
				throw error;
			}
		},
		{ params, response: { 200: moved, 400: error, 404: error, 409: error } },
	);
	app.post(
		API_ROUTES.TASK_COMPLETE(":id"),
		async ({ params, core, status }) => {
			try {
				if (!(await core.completeTask(params.id))) return status(404, { error: "Task not found" });
				return { success: true };
			} catch (error) {
				return status(isAmbiguousTaskIdError(error) ? 409 : 500, {
					error: error instanceof Error ? error.message : "Failed to complete task",
				});
			}
		},
		{ params, response: { 200: success, 404: error, 409: error, 500: error } },
	);
	app.post(
		API_ROUTES.TASK_DEMOTE(":id"),
		async ({ params, core, scope, status }) => {
			try {
				const result = await core.demoteTask(params.id);
				return result.success ? movedResponse(result.cleanedTaskIds) : status(404, { error: "Task not found" });
			} catch (error) {
				const state = movedState(error, "demotionState");
				if (state) await services.reconcile(scope);
				return status(isAmbiguousTaskIdError(error) || isCreateLockError(error) || isTaskLockError(error) ? 409 : 500, {
					error: error instanceof Error ? error.message : "Failed to demote task",
					...(state && { demotionState: state }),
					...(demotionFailureCause(error) && { demotionFailureCause: demotionFailureCause(error) }),
				});
			}
		},
		{ params, response: { 200: moved, 404: error, 409: error, 500: error } },
	);
	app.get(API_ROUTES.STATUSES, ({ core }) => getValidStatuses(core), { response: t.Array(t.String()) });
	app.get(
		API_ROUTES.DRAFTS,
		async ({ core }) => {
			try {
				return await core.filesystem.listDrafts();
			} catch {
				return [];
			}
		},
		{ response: t.Array(taskSchema) },
	);
	app.post(
		API_ROUTES.DRAFT_PROMOTE(":id"),
		async ({ params, core, status }) => {
			try {
				return (await core.promoteDraft(params.id)) ? { success: true } : status(404, { error: "Draft not found" });
			} catch (error) {
				return status(isCreateLockError(error) || isAmbiguousIdError(error) || isTaskLockError(error) ? 409 : 500, {
					error:
						isCreateLockError(error) || isAmbiguousIdError(error) || isTaskLockError(error)
							? (error as Error).message
							: "Failed to promote draft",
				});
			}
		},
		{ params, response: { 200: success, 404: error, 409: error, 500: error } },
	);
	app.post(
		API_ROUTES.TASK_REORDER,
		async ({ body: input, core, status }) => {
			try {
				const taskId = typeof input.taskId === "string" ? input.taskId : "";
				const targetStatus = typeof input.targetStatus === "string" ? input.targetStatus : "";
				const orderedTaskIds = Array.isArray(input.orderedTaskIds) ? input.orderedTaskIds : [];
				const targetMilestone =
					typeof input.targetMilestone === "string"
						? input.targetMilestone
						: input.targetMilestone === null
							? null
							: undefined;
				if (!taskId || !targetStatus || !orderedTaskIds.length)
					return status(400, { error: "Missing required fields: taskId, targetStatus, and orderedTaskIds" });
				const result = await core.reorderTask({
					taskId,
					targetStatus,
					orderedTaskIds,
					targetMilestone,
					commitMessage: `Reorder tasks in ${targetStatus}`,
				});
				return { success: true, task: result.updatedTask, changedTasks: result.changedTasks };
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to reorder task";
				return status(
					isAmbiguousTaskIdError(error)
						? 409
						: message.includes("exists in branch") ||
								message.includes("not found") ||
								message.includes("Missing required")
							? 400
							: 500,
					{ error: message },
				);
			}
		},
		{ body: reorderBody, response: { 200: reorderResult, 400: error, 409: error, 500: error } },
	);
	app.post(
		API_ROUTES.TASK_MOVE,
		async ({ body: input, core, status }) => {
			try {
				const taskIds = Array.isArray(input.taskIds)
					? input.taskIds.filter((id): id is string => typeof id === "string")
					: [];
				const targetStatus = typeof input.targetStatus === "string" ? input.targetStatus : "";
				const targetMilestone =
					typeof input.targetMilestone === "string"
						? input.targetMilestone
						: input.targetMilestone === null
							? null
							: undefined;
				if (!taskIds.length || !targetStatus)
					return status(400, { error: "Missing required fields: taskIds and targetStatus" });
				const result = await core.moveTasksToStatus({
					taskIds,
					targetStatus,
					targetMilestone,
					commitMessage: `Move ${taskIds.length} tasks to ${targetStatus}`,
				});
				return {
					success: result.failures.length === 0,
					tasks: result.movedTasks,
					changedTasks: result.changedTasks,
					failures: result.failures,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to move tasks";
				return status(message.includes("required") ? 400 : 500, { error: message });
			}
		},
		{ body: moveBody, response: { 200: moveResult, 400: error, 500: error } },
	);
	function parseCleanupAge(value: unknown): { age: number } | { error: string } {
		const age = Number.parseInt(String(value ?? ""), 10);
		if (value === undefined || value === null || value === "") return { error: "Missing age parameter" };
		if (Number.isNaN(age) || age < 0) return { error: "Invalid age parameter" };
		return { age };
	}

	app.get(
		API_ROUTES.TASK_CLEANUP,
		async ({ query, core, status }) => {
			const result = parseCleanupAge(query.age);
			if ("error" in result) return status(400, result);
			try {
				const tasks = await core.getTerminalStatusTasksByAge(result.age);
				return {
					count: tasks.length,
					tasks: tasks.map(({ id, title, updatedDate, createdDate }) => ({ id, title, updatedDate, createdDate })),
				};
			} catch (error) {
				console.error("Error getting cleanup preview:", error);
				return status(500, { error: "Failed to get cleanup preview" });
			}
		},
		{ query: cleanupQuery, response: { 200: cleanupPreview, 400: error, 500: error } },
	);
	app.post(
		API_ROUTES.TASK_CLEANUP_EXECUTE,
		async ({ body: input, core, status }) => {
			const result = parseCleanupAge(input.age);
			if ("error" in result) return status(400, result);
			try {
				const tasks = await core.getTerminalStatusTasksByAge(result.age);
				let movedCount = 0;
				const failedTasks: string[] = [];
				for (const task of tasks)
					try {
						if (await core.completeTask(task.id)) movedCount++;
						else failedTasks.push(task.id);
					} catch {
						failedTasks.push(task.id);
					}
				return {
					success: true,
					movedCount,
					totalCount: tasks.length,
					failedTasks: failedTasks.length ? failedTasks : undefined,
					message: tasks.length
						? `Moved ${movedCount} of ${tasks.length} tasks to completed folder`
						: "No tasks to clean up",
				};
			} catch (error) {
				console.error("Error executing cleanup:", error);
				return status(500, { error: "Failed to execute cleanup" });
			}
		},
		{
			body: cleanupBody,
			response: {
				200: t.Object({
					success: t.Boolean(),
					movedCount: t.Number(),
					totalCount: t.Number(),
					failedTasks: t.Optional(t.Array(t.String())),
					message: t.String(),
				}),
				400: error,
				500: error,
			},
		},
	);
	app.get(
		API_ROUTES.TASK_DUPLICATES,
		async ({ core, status }) => {
			try {
				return await core.previewDuplicateTaskIdRepair();
			} catch (error) {
				return status(500, { error: String(error) });
			}
		},
		{
			response: {
				200: t.Object(
					{ fingerprint: t.String(), groups: t.Array(t.Object({}, { additionalProperties: true })) },
					{ additionalProperties: true },
				),
				500: error,
			},
		},
	);
	app.post(
		API_ROUTES.TASK_DUPLICATES,
		async ({ body: input, core, status }) => {
			try {
				const fingerprint = typeof input.fingerprint === "string" ? input.fingerprint.trim() : "";
				if (!fingerprint) return status(400, { error: "A repair preview fingerprint is required." });
				return await core.repairDuplicateTaskIds(fingerprint);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return status(message.includes("changed after the preview") ? 409 : 400, { error: message });
			}
		},
		{
			body: duplicateRepairBody,
			response: {
				200: t.Object({}, { additionalProperties: true }),
				400: error,
				409: error,
			},
		},
	);
	return app;
}
