import { isAbsolute } from "node:path";
import { Elysia, t } from "elysia";
import { TaskArchiveStatusError } from "../../core/backlog.ts";
import { loadTaskDetail } from "../../core/task-detail.ts";
import { isCreateLockError, isTaskLockError } from "../../file-system/operations.ts";
import { isAmbiguousIdError } from "../../utils/entity-id.ts";
import { resolveMilestoneInputFromFilesystem } from "../../utils/milestone-storage.ts";
import { DRAFT_PREFIX, extractAnyPrefix } from "../../utils/prefix-config.ts";
import { getValidStatuses } from "../../utils/status.ts";
import { isValidTaskId } from "../../utils/task-id.ts";
import { isAmbiguousTaskIdError, LOCAL_TASK_LOOKUP_HINT } from "../../utils/task-path.ts";
import { listTaskCollection } from "../task-collection.ts";
import { demotionFailureCause, movedState } from "../transport.ts";
import { normalizeAcceptanceCriteriaItems, parseDueDate, parseTaskUpdate } from "../validation.ts";
import type { ResourceDependencies } from "./api.ts";

const params = t.Object({ id: t.String() });
const body = t.Object(
	{
		title: t.Optional(t.Any()),
		dueDate: t.Optional(t.Any()),
		milestone: t.Optional(t.Any()),
		project: t.Optional(t.Any()),
		status: t.Optional(t.Any()),
		priority: t.Optional(t.Any()),
		taskId: t.Optional(t.Any()),
		taskIds: t.Optional(t.Any()),
		targetStatus: t.Optional(t.Any()),
		targetMilestone: t.Optional(t.Any()),
		orderedTaskIds: t.Optional(t.Any()),
		age: t.Optional(t.Any()),
		fingerprint: t.Optional(t.Any()),
		acceptanceCriteriaItems: t.Optional(t.Any()),
		definitionOfDoneAdd: t.Optional(t.Any()),
		disableDefinitionOfDoneDefaults: t.Optional(t.Any()),
	},
	{ additionalProperties: true },
);
const draft = (id: string) => extractAnyPrefix(id) === DRAFT_PREFIX;
const webError = (message: string) =>
	message.replace(
		LOCAL_TASK_LOOKUP_HINT,
		"Task lookups read only the local working copy; a task that exists only on another branch cannot be referenced yet.",
	);
export function tasksResource({ core, services, publishData }: ResourceDependencies): Elysia {
	const app = new Elysia({ name: "tasks" });
	const milestone = (id: string) => resolveMilestoneInputFromFilesystem(id, core.filesystem);
	const moved = (cleanedTaskIds: string[]) => {
		publishData();
		return Response.json({ success: true, cleanedTaskIds });
	};
	const detail = async (id: string) => {
		if (!isValidTaskId(id)) return Response.json({ error: `Invalid task ID: ${id}` }, { status: 400 });
		try {
			const value = draft(id) ? await core.filesystem.loadDraft(id) : await core.getTask(id);
			return value ?? Response.json({ error: `Task ${id} not found` }, { status: 404 });
		} catch (error) {
			if (isAmbiguousTaskIdError(error))
				return Response.json(
					{
						error: error.candidates.some((path) => !isAbsolute(path))
							? `Task ID ${id} is ambiguous. Repair duplicate task IDs before opening it.`
							: error.message,
					},
					{ status: 409 },
				);
			if (isAmbiguousIdError(error)) return Response.json({ error: error.message }, { status: 409 });
			throw error;
		}
	};
	app.get("/api/tasks", ({ request }) => listTaskCollection(request, core, services), {
		query: t.Object({}, { additionalProperties: true }),
	});
	app.post(
		"/api/tasks",
		async ({ body: input }) => {
			if (typeof input.title !== "string" || !input.title.trim())
				return Response.json({ error: "Title is required" }, { status: 400 });
			const due = parseDueDate(input.dueDate, false);
			if ("error" in due) return Response.json({ error: due.error }, { status: 400 });
			try {
				const created = await core.createTaskFromInput({
					...input,
					title: input.title,
					dueDate: due.value ?? undefined,
					milestone: typeof input.milestone === "string" ? await milestone(input.milestone) : undefined,
					acceptanceCriteria: normalizeAcceptanceCriteriaItems(input.acceptanceCriteriaItems),
					definitionOfDoneAdd: Array.isArray(input.definitionOfDoneAdd)
						? input.definitionOfDoneAdd.map((item) => String(item ?? "").trim()).filter(Boolean)
						: [],
					disableDefinitionOfDoneDefaults: Boolean(input.disableDefinitionOfDoneDefaults),
				});
				return Response.json(created.task, { status: 201 });
			} catch (error) {
				return Response.json(
					{ error: webError(error instanceof Error ? error.message : "Failed to create task") },
					{ status: isCreateLockError(error) ? 409 : 400 },
				);
			}
		},
		{ body },
	);
	const get = async (id: string) => {
		const value = await detail(id);
		if (value instanceof Response) return value;
		await services.ready();
		return Response.json(await loadTaskDetail(core, value, { includeCrossBranch: true }));
	};
	app.get("/api/task/:id", ({ params }) => get(params.id), { params });
	app.get("/api/tasks/:id", ({ params }) => get(params.id), { params });
	app.put(
		"/api/tasks/:id",
		async ({ params, body: input }) => {
			const parsed = parseTaskUpdate(input);
			if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
			if (typeof parsed.value.milestone === "string") parsed.value.milestone = await milestone(parsed.value.milestone);
			try {
				return Response.json(
					draft(params.id)
						? (await core.editTaskOrDraft(params.id, parsed.value)).task
						: await core.updateTaskFromInput(params.id, parsed.value),
				);
			} catch (error) {
				const state = movedState(error, "demotionState");
				if (state) {
					publishData();
					return Response.json(
						{
							error: webError(error instanceof Error ? error.message : "Failed to update task"),
							demotionState: state,
							...(demotionFailureCause(error) && { demotionFailureCause: demotionFailureCause(error) }),
						},
						{ status: 500 },
					);
				}
				return Response.json(
					{ error: webError(error instanceof Error ? error.message : "Failed to update task") },
					{ status: isAmbiguousIdError(error) || isAmbiguousTaskIdError(error) || isTaskLockError(error) ? 409 : 400 },
				);
			}
		},
		{ params, body },
	);
	app.delete(
		"/api/tasks/:id",
		async ({ params }) => {
			try {
				const result = await core.archiveTask(params.id);
				return result.success
					? moved(result.cleanedTaskIds)
					: Response.json({ error: "Task not found" }, { status: 404 });
			} catch (error) {
				if (error instanceof TaskArchiveStatusError) return Response.json({ error: error.message }, { status: 400 });
				if (isAmbiguousTaskIdError(error)) return Response.json({ error: error.message }, { status: 409 });
				throw error;
			}
		},
		{ params },
	);
	app.post(
		"/api/tasks/:id/complete",
		async ({ params }) => {
			try {
				if (!(await core.completeTask(params.id))) return Response.json({ error: "Task not found" }, { status: 404 });
				publishData();
				return Response.json({ success: true });
			} catch (error) {
				return Response.json(
					{ error: error instanceof Error ? error.message : "Failed to complete task" },
					{ status: isAmbiguousTaskIdError(error) ? 409 : 500 },
				);
			}
		},
		{ params },
	);
	app.post(
		"/api/tasks/:id/demote",
		async ({ params }) => {
			try {
				const result = await core.demoteTask(params.id);
				return result.success
					? moved(result.cleanedTaskIds)
					: Response.json({ error: "Task not found" }, { status: 404 });
			} catch (error) {
				const state = movedState(error, "demotionState");
				if (state) publishData();
				return Response.json(
					{
						error: error instanceof Error ? error.message : "Failed to demote task",
						...(state && { demotionState: state }),
						...(demotionFailureCause(error) && { demotionFailureCause: demotionFailureCause(error) }),
					},
					{ status: isAmbiguousTaskIdError(error) || isCreateLockError(error) || isTaskLockError(error) ? 409 : 500 },
				);
			}
		},
		{ params },
	);
	app.get("/api/statuses", () => getValidStatuses(core).then(Response.json));
	app.get("/api/drafts", async () => {
		try {
			return Response.json(await core.filesystem.listDrafts());
		} catch {
			return Response.json([]);
		}
	});
	app.post(
		"/api/drafts/:id/promote",
		async ({ params }) => {
			try {
				return (await core.promoteDraft(params.id))
					? Response.json({ success: true })
					: Response.json({ error: "Draft not found" }, { status: 404 });
			} catch (error) {
				return Response.json(
					{
						error:
							isCreateLockError(error) || isAmbiguousIdError(error) || isTaskLockError(error)
								? (error as Error).message
								: "Failed to promote draft",
					},
					{ status: isCreateLockError(error) || isAmbiguousIdError(error) || isTaskLockError(error) ? 409 : 500 },
				);
			}
		},
		{ params },
	);
	app.post(
		"/api/tasks/reorder",
		async ({ body: input }) => {
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
					return Response.json(
						{ error: "Missing required fields: taskId, targetStatus, and orderedTaskIds" },
						{ status: 400 },
					);
				const result = await core.reorderTask({
					taskId,
					targetStatus,
					orderedTaskIds,
					targetMilestone,
					commitMessage: `Reorder tasks in ${targetStatus}`,
				});
				return Response.json({ success: true, task: result.updatedTask, changedTasks: result.changedTasks });
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to reorder task";
				return Response.json(
					{ error: message },
					{
						status: isAmbiguousTaskIdError(error)
							? 409
							: message.includes("exists in branch") ||
									message.includes("not found") ||
									message.includes("Missing required")
								? 400
								: 500,
					},
				);
			}
		},
		{ body },
	);
	app.post(
		"/api/tasks/move",
		async ({ body: input }) => {
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
					return Response.json({ error: "Missing required fields: taskIds and targetStatus" }, { status: 400 });
				const result = await core.moveTasksToStatus({
					taskIds,
					targetStatus,
					targetMilestone,
					commitMessage: `Move ${taskIds.length} tasks to ${targetStatus}`,
				});
				return Response.json({
					success: result.failures.length === 0,
					tasks: result.movedTasks,
					changedTasks: result.changedTasks,
					failures: result.failures,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to move tasks";
				return Response.json({ error: message }, { status: message.includes("required") ? 400 : 500 });
			}
		},
		{ body },
	);
	function parseCleanupAge(value: unknown): { age: number } | { error: string } {
		const age = Number.parseInt(String(value ?? ""), 10);
		if (value === undefined || value === null || value === "") return { error: "Missing age parameter" };
		if (Number.isNaN(age) || age < 0) return { error: "Invalid age parameter" };
		return { age };
	}

	app.get(
		"/api/tasks/cleanup",
		async ({ query }) => {
			const result = parseCleanupAge(query.age);
			if ("error" in result) return Response.json(result, { status: 400 });
			try {
				const tasks = await core.getTerminalStatusTasksByAge(result.age);
				return Response.json({
					count: tasks.length,
					tasks: tasks.map(({ id, title, updatedDate, createdDate }) => ({ id, title, updatedDate, createdDate })),
				});
			} catch (error) {
				console.error("Error getting cleanup preview:", error);
				return Response.json({ error: "Failed to get cleanup preview" }, { status: 500 });
			}
		},
		{ query: t.Object({ age: t.Optional(t.String()) }) },
	);
	app.post(
		"/api/tasks/cleanup/execute",
		async ({ body: input }) => {
			const result = parseCleanupAge(input.age);
			if ("error" in result) return Response.json(result, { status: 400 });
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
				publishData();
				return Response.json({
					success: true,
					movedCount,
					totalCount: tasks.length,
					failedTasks: failedTasks.length ? failedTasks : undefined,
					message: tasks.length
						? `Moved ${movedCount} of ${tasks.length} tasks to completed folder`
						: "No tasks to clean up",
				});
			} catch (error) {
				console.error("Error executing cleanup:", error);
				return Response.json({ error: "Failed to execute cleanup" }, { status: 500 });
			}
		},
		{ body },
	);
	app.get("/api/tasks/duplicates", async () => {
		try {
			await services.ready();
			return Response.json(await core.previewDuplicateTaskIdRepair());
		} catch (error) {
			return Response.json({ error: String(error) }, { status: 500 });
		}
	});
	app.post(
		"/api/tasks/duplicates",
		async ({ body: input }) => {
			try {
				const fingerprint = typeof input.fingerprint === "string" ? input.fingerprint.trim() : "";
				if (!fingerprint) return Response.json({ error: "A repair preview fingerprint is required." }, { status: 400 });
				return Response.json(await core.repairDuplicateTaskIds(fingerprint));
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return Response.json({ error: message }, { status: message.includes("changed after the preview") ? 409 : 400 });
			}
		},
		{ body },
	);
	return app;
}
