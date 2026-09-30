import type { Task } from "../../types/index.ts";

type TaskEditorResult = { reason?: string; task?: Task; changed: boolean };

const editorFailureMessages: Record<string, string | ((taskId: string, branch?: string) => string)> = {
	read_only: (_taskId, branch) => ` {red-fg}Task is read-only${branch ? ` in branch ${branch}` : ""}.{/}`,
	editor_failed: " {red-fg}Editor exited with an error; task was not modified.{/}",
	not_found: (taskId) => ` {red-fg}Task ${taskId} was not found on this branch.{/}`,
	identity_conflict:
		" {red-fg}File identity is inconsistent; make the frontmatter id match the filename, then retry.{/}",
	unreadable: " {red-fg}Could not read the saved file; fix its YAML/markdown syntax.{/}",
	ambiguous: " {red-fg}Numeric draft id is shared by multiple files; rename or fix their ids, then retry.{/}",
};

export function taskEditorFailureMessage(result: TaskEditorResult, selectedTaskId: string): string | null {
	const message = result.reason ? editorFailureMessages[result.reason] : undefined;
	if (!message) return null;
	return typeof message === "function" ? message(selectedTaskId, result.task?.branch) : message;
}

export function replaceTaskByIdentity(tasks: Task[], replacement: Task): boolean {
	const index = tasks.findIndex(
		(task) =>
			(replacement.filePath !== undefined && task.filePath !== undefined && task.filePath === replacement.filePath) ||
			task.id === replacement.id,
	);
	if (index < 0) return false;
	tasks[index] = replacement;
	return true;
}
