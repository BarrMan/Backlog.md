import { describe, expect, it } from "bun:test";
import type { Task } from "../types";
import { buildDefinitionOfDonePayload, buildTaskDetailsFormState } from "../web/components/task-details-form";

describe("task details form policy", () => {
	it("builds create defaults without replacing task fields", () => {
		expect(
			buildTaskDetailsFormState({
				isCreateMode: true,
				isDraftMode: true,
				availableStatuses: ["To Do"],
				defaultDefinitionOfDone: [{ index: 1, text: "Review", checked: false }],
				createModeAssignee: ["@alex"],
			}),
		).toMatchObject({ status: "Draft", assignee: ["@alex"], definitionOfDone: [{ text: "Review" }] });
	});

	it("sends only additions after unchanged definition-of-done defaults on create", () => {
		expect(
			buildDefinitionOfDonePayload({
				isCreateMode: true,
				definitionOfDoneDefaults: ["Review"],
				definitionOfDone: [
					{ index: 1, text: "Review", checked: false },
					{ index: 2, text: "Ship", checked: false },
				],
			}),
		).toEqual({ definitionOfDoneAdd: ["Ship"] });
	});

	it("preserves edit checklist replacement and checked-state policy", () => {
		const task = {
			definitionOfDoneItems: [
				{ index: 1, text: "Review", checked: false },
				{ index: 2, text: "Test", checked: true },
			],
		} as Task;
		expect(
			buildDefinitionOfDonePayload({
				task,
				isCreateMode: false,
				definitionOfDone: [
					{ index: 1, text: "Approve", checked: true },
					{ index: 2, text: "Test", checked: false },
				],
			}),
		).toEqual({
			definitionOfDoneAdd: ["Approve"],
			definitionOfDoneRemove: [1],
			definitionOfDoneCheck: [3],
			definitionOfDoneUncheck: [2],
		});
	});
});
