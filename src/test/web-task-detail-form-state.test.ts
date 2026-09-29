import { describe, expect, it } from "bun:test";
import type { TaskDetailsFormState } from "../web/components/task-details-form";
import {
	hasCreateModeEntries,
	mergeTaskDetailFormRefresh,
	resetTaskDetailEditableContent,
	type TaskDetailFormState,
} from "../web/hooks/use-task-detail-form-state";

const baseline: TaskDetailsFormState = {
	title: "Original",
	description: "Original description",
	plan: "",
	notes: "",
	displayComments: [],
	finalSummary: "",
	criteria: [{ index: 1, text: "Review", checked: false }],
	definitionOfDone: [],
	status: "To Do",
	assignee: ["@alex"],
	labels: [],
	priority: "",
	taskType: "",
	project: "",
	dependencies: [],
	references: [],
	modifiedFiles: [],
	milestone: "",
	dueDate: "",
};

const state = (overrides: Partial<TaskDetailFormState> = {}): TaskDetailFormState => ({
	...baseline,
	commentAuthor: "",
	commentBody: "",
	...overrides,
});

describe("task detail form state policy", () => {
	it("preserves locally dirty fields while applying a refreshed task", () => {
		const next = { ...baseline, title: "Server title", description: "Server description", status: "In Progress" };
		expect(
			mergeTaskDetailFormRefresh(state({ description: "Local draft", commentBody: "Comment draft" }), baseline, next),
		).toMatchObject({ title: "Server title", description: "Local draft", status: "In Progress", commentBody: "" });
	});

	it("treats changed create metadata as unsaved work but not the default assignee", () => {
		expect(hasCreateModeEntries(state({ title: "" }), ["@alex"])).toBe(false);
		expect(hasCreateModeEntries(state({ title: "", dependencies: ["BACK-2"] }), ["@alex"])).toBe(true);
		expect(hasCreateModeEntries(state({ title: "", assignee: [] }), ["@alex"])).toBe(true);
	});

	it("cancels editable content without rolling back inline metadata", () => {
		expect(
			resetTaskDetailEditableContent(
				state({ title: "Draft", status: "In Progress", commentBody: "Draft comment" }),
				baseline,
			),
		).toMatchObject({ title: "Original", status: "In Progress", commentBody: "" });
	});
});
