import { getStatusColor, wrapStatusColor } from "../status-icon.ts";
import type { WorkspaceEntry } from "./model.ts";

export function workspaceRows(entries: WorkspaceEntry[]): string[] {
	return entries.map((entry) =>
		entry.kind === "task"
			? `  {bold}${entry.task.id}{/bold} - ${entry.task.title}`
			: `${entry.label.slice(0, 2)} ${wrapStatusColor(entry.status, getStatusColor(entry.status))}${entry.label.slice(2 + entry.status.length)}`,
	);
}

export function reconciledWorkspaceSelection(
	entries: WorkspaceEntry[],
	previous: WorkspaceEntry | undefined,
	selectedTaskId: string | undefined,
	retainHeader: boolean,
): number {
	const retainedTask = entries.findIndex((entry) => entry.kind === "task" && entry.task.id === selectedTaskId);
	if (retainedTask >= 0) return retainedTask;
	if (retainHeader && previous?.kind === "header") {
		const retainedHeader = entries.findIndex((entry) => entry.kind === "header" && entry.status === previous.status);
		if (retainedHeader >= 0) return retainedHeader;
	}
	const firstTask = entries.findIndex((entry) => entry.kind === "task");
	return firstTask >= 0 ? firstTask : entries.length > 0 ? 0 : -1;
}
