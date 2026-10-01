import type { Task, TaskCommentInput, TaskUpdateInput } from "../../types/index.ts";
import { formatStoredDate } from "../../utils/date.ts";

type ContentBlockDefinition = {
	field: "implementationPlan" | "implementationNotes" | "finalSummary";
	replacement: "implementationPlan" | "implementationNotes" | "finalSummary";
	additions: "appendImplementationPlan" | "appendImplementationNotes" | "appendFinalSummary";
	clear: "clearImplementationPlan" | "clearImplementationNotes" | "clearFinalSummary";
	clearToEmpty?: boolean;
};

const CONTENT_BLOCKS: ContentBlockDefinition[] = [
	{
		field: "implementationPlan",
		replacement: "implementationPlan",
		additions: "appendImplementationPlan",
		clear: "clearImplementationPlan",
	},
	{
		field: "implementationNotes",
		replacement: "implementationNotes",
		additions: "appendImplementationNotes",
		clear: "clearImplementationNotes",
	},
	{
		field: "finalSummary",
		replacement: "finalSummary",
		additions: "appendFinalSummary",
		clear: "clearFinalSummary",
		clearToEmpty: true,
	},
];

export function applyContentTaskUpdates(task: Task, input: TaskUpdateInput): boolean {
	let mutated = false;
	for (const block of CONTENT_BLOCKS) {
		mutated =
			applyBlock(
				task,
				block.field,
				input[block.replacement],
				input[block.additions],
				input[block.clear],
				block.clearToEmpty,
			) || mutated;
	}
	mutated = applyComments(task, input.appendComments) || mutated;
	return mutated;
}

function applyBlock(
	task: Task,
	field: "implementationPlan" | "implementationNotes" | "finalSummary",
	replacement: string | undefined,
	additions: string[] | undefined,
	clear: boolean | undefined,
	clearToEmpty = false,
): boolean {
	let mutated = false;
	if (clear && task[field] !== undefined) {
		if (clearToEmpty) task[field] = "";
		else delete task[field];
		mutated = true;
	}
	if (typeof replacement === "string" && (task[field] ?? "") !== replacement) {
		task[field] = replacement;
		mutated = true;
	}
	const values = (additions ?? []).map((value) => String(value).trim()).filter(Boolean);
	if (values.length === 0) return mutated;
	const current = (task[field] ?? "").trim();
	task[field] = current ? `${current}\n\n${values.join("\n\n")}` : values.join("\n\n");
	return true;
}

function applyComments(task: Task, additions: Array<TaskCommentInput | string> | undefined): boolean {
	if (!additions?.length) return false;
	const comments = Array.isArray(task.comments) ? task.comments.map((comment) => ({ ...comment })) : [];
	let index = comments.length > 0 ? Math.max(...comments.map((comment) => comment.index)) + 1 : 1;
	const now = formatStoredDate();
	let mutated = false;
	for (const addition of additions) {
		const comment = sanitizeComment(addition);
		if (!comment) continue;
		comments.push({
			index: index++,
			body: comment.body,
			createdDate: comment.createdDate ?? now,
			...(comment.author && { author: comment.author }),
		});
		mutated = true;
	}
	if (mutated) task.comments = comments;
	return mutated;
}

function sanitizeComment(value: TaskCommentInput | string): TaskCommentInput | undefined {
	const body = String(typeof value === "string" ? value : (value.body ?? ""))
		.replace(/\r\n/g, "\n")
		.trim();
	if (!body) return undefined;
	const author =
		typeof value === "string"
			? undefined
			: String(value.author ?? "")
					.replace(/\s+/g, " ")
					.trim();
	const createdDate = typeof value === "string" ? undefined : String(value.createdDate ?? "").trim();
	return { body, ...(author && { author }), ...(createdDate && { createdDate }) };
}
