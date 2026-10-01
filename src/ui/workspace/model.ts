import { buildKanbanStatusGroups } from "../../board.ts";
import type { AcceptanceCriterion, Task } from "../../types/index.ts";

export type DraftField =
	| "title"
	| "description"
	| "acceptanceCriteria"
	| "implementationPlan"
	| "implementationNotes"
	| "finalSummary";

export interface WorkspaceDraft {
	values: Record<DraftField, string>;
	cursor: Partial<Record<DraftField, { x: number; y: number }>>;
	baseline: Record<DraftField, string>;
}

export type WorkspaceEntry =
	| { kind: "header"; status: string; label: string }
	| { kind: "task"; task: Task; label: string };

function taskFieldValues(task: Task): Record<DraftField, string> {
	return {
		title: task.title,
		description: task.description ?? "",
		acceptanceCriteria: criteriaText(task.acceptanceCriteriaItems),
		implementationPlan: task.implementationPlan ?? "",
		implementationNotes: task.implementationNotes ?? "",
		finalSummary: task.finalSummary ?? "",
	};
}

export function createWorkspaceDraft(task: Task): WorkspaceDraft {
	const values = taskFieldValues(task);
	return { values: { ...values }, baseline: values, cursor: {} };
}

/** Applies in-pane edits without changing the task retained by the workspace selection. */
export function taskWithWorkspaceDraft(task: Task, draft?: WorkspaceDraft): Task {
	if (!draft) return task;
	return {
		...task,
		title: draft.values.title,
		description: draft.values.description,
		acceptanceCriteriaItems: parseAcceptanceCriteria(draft.values.acceptanceCriteria).map((item, index) => ({
			...item,
			index: index + 1,
		})),
		implementationPlan: draft.values.implementationPlan,
		implementationNotes: draft.values.implementationNotes,
		finalSummary: draft.values.finalSummary,
	};
}

function criteriaText(criteria: AcceptanceCriterion[] | undefined): string {
	return (criteria ?? []).map((item) => `${item.checked ? "[x]" : "[ ]"} ${item.text}`).join("\n");
}

export function parseAcceptanceCriteria(value: string): Array<{ text: string; checked: boolean }> {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const match = line.match(/^\[(x| )\]\s*(.*)$/i);
			return { checked: match?.[1]?.toLowerCase() === "x", text: (match?.[2] ?? line).trim() };
		})
		.filter((item) => item.text.length > 0);
}

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

export function changedTaskFields(draft: WorkspaceDraft, latest: Task): Partial<Record<DraftField, string>> {
	const latestValues = taskFieldValues(latest);
	const changed: Partial<Record<DraftField, string>> = {};
	for (const field of Object.keys(draft.values) as DraftField[]) {
		if (draft.values[field] !== draft.baseline[field]) {
			if (latestValues[field] !== draft.baseline[field]) throw new Error(`${field} changed outside this workspace.`);
			changed[field] = draft.values[field];
		}
	}
	return changed;
}
