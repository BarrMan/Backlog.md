import { buildKanbanStatusGroups } from "../../../board.ts";
import type { Task } from "../../../types/index.ts";

export type WorkspaceEntry =
	| { kind: "header"; status: string; label: string }
	| { kind: "task"; task: Task; label: string };

export function buildWorkspaceEntries(
	tasks: Task[],
	statuses: string[],
	filter: string,
	collapsed: ReadonlySet<string>,
): WorkspaceEntry[] {
	const { orderedStatuses, groupedTasks } = buildKanbanStatusGroups(tasks, statuses);
	return orderedStatuses.flatMap((status) => {
		if (filter !== "All" && status !== filter) return [];
		const group = groupedTasks.get(status) ?? [];
		const hidden = collapsed.has(status);
		return [
			{ kind: "header" as const, status, label: `${hidden ? "+" : "-"} ${status} (${group.length})` },
			...(!hidden ? group.map((task) => ({ kind: "task" as const, task, label: `  ${task.id}  ${task.title}` })) : []),
		];
	});
}
