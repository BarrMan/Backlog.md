import type { Core } from "../../core/backlog.ts";
import type { Task } from "../../types/index.ts";
import {
	completeTaskFromTui,
	formatTaskArchivedMessage,
	formatTaskCompletionBlockedMessage,
} from "../task-lifecycle.ts";

export type TaskLifecycleOutcome =
	| { kind: "blocked"; message: string }
	| { kind: "completed"; message: string }
	| { kind: "failed"; message: string };

export async function runTaskLifecycleAction(
	core: Core,
	task: Task,
	action: "complete" | "archive",
): Promise<TaskLifecycleOutcome> {
	if (task.branch) return { kind: "blocked", message: `Cannot ${action} task from branch "${task.branch}".` };
	try {
		const archived = action === "archive" ? await archiveTask(core, task) : undefined;
		const result = archived ? { ...archived, reason: "failed" as const } : await completeTaskFromTui(core, task);
		if (result.success)
			return {
				kind: "completed",
				message: archived
					? formatTaskArchivedMessage(task.id, archived.cleanedTaskIds)
					: `Moved ${task.id} to completed`,
			};
		if (action === "complete" && result.reason === "not-terminal") {
			return { kind: "blocked", message: formatTaskCompletionBlockedMessage(task.id, result.terminalStatus) };
		}
		return { kind: "failed", message: `Failed to ${action} ${task.id}` };
	} catch (error) {
		return {
			kind: "failed",
			message: `Error ${action === "complete" ? "completing" : "archiving"} task: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

async function archiveTask(core: Core, task: Task) {
	const config = await core.filesystem.loadConfig();
	return core.archiveTask(task.id, config?.autoCommit ?? false);
}
