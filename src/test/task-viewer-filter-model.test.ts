import { describe, expect, test } from "bun:test";
import { taskViewerEmptyState } from "../ui/task-viewer-with-search.ts";

const filters = {
	search: "",
	status: [],
	excludeStatus: [],
	taskTypes: [],
	projects: [],
	priority: "",
	labels: [],
	milestone: "",
	labelMatch: "any" as const,
};

describe("task viewer filter model", () => {
	test("distinguishes an empty project from filtered empty results", () => {
		expect(taskViewerEmptyState(filters).list).toBe("{bold}No tasks available{/bold}");
		expect(taskViewerEmptyState({ ...filters, search: "release" }).detail).toContain("Search: {cyan-fg}release{/}");
	});

	test("describes configured filters without requiring a screen", () => {
		const state = taskViewerEmptyState({
			...filters,
			status: ["To Do"],
			labels: ["frontend"],
			milestone: "M1",
		});
		expect(state.list).toContain("Status: {cyan-fg}To Do{/}");
		expect(state.list).toContain("Labels: {yellow-fg}frontend{/}");
		expect(state.list).toContain("Milestone: {magenta-fg}M1{/}");
	});
});
