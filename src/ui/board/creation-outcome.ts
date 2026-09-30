import type { Task } from "../../types/index.ts";

export function getCreatedTaskBoardOutcome(
	task: Task,
	visible: boolean,
): { focusTaskId?: string; message: string; tone: "green" | "yellow" } {
	if (task.status.trim().toLowerCase() === "draft") {
		return {
			message: `Created ${task.id} as a draft. Drafts are not shown on the task board.`,
			tone: "yellow",
		};
	}
	if (!visible) {
		return {
			message: `Created ${task.id}, but it is hidden by the current board filters.`,
			tone: "yellow",
		};
	}
	return { focusTaskId: task.id, message: `Created ${task.id}.`, tone: "green" };
}
