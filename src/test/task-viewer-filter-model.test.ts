import { describe, expect, test } from "bun:test";
import type { Task } from "../types/index.ts";
import { TaskViewerSession } from "../ui/task-viewer/session.ts";
import { taskViewerEmptyState } from "../ui/task-viewer-with-search.ts";
import { createMilestoneFilterValueResolver } from "../utils/milestone-filter.ts";

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
	test("prepares ready tasks when its corpus is loaded and replaced", () => {
		const blocker: Task = {
			id: "task-1",
			title: "Blocker",
			status: "In Progress",
			assignee: [],
			createdDate: "2026-01-01",
			labels: [],
			dependencies: [],
		};
		const dependent: Task = {
			id: "task-2",
			title: "Dependent",
			status: "To Do",
			assignee: [],
			createdDate: "2026-01-01",
			labels: [],
			dependencies: ["task-1"],
		};
		const session = new TaskViewerSession(
			[blocker, dependent],
			filters,
			blocker,
			createMilestoneFilterValueResolver([]),
			(tasks) => ({ tasks, completedTasks: [], statuses: ["To Do", "In Progress", "Done"] }),
			true,
		);

		expect(session.filteredTasks.map((task) => task.id)).toEqual(["task-1"]);

		const completedBlocker = { ...blocker, status: "Done" };
		session.updateTasks([completedBlocker, dependent], filters);

		expect(session.filteredTasks.map((task) => task.id)).toEqual(["task-2"]);
		expect(session.getTaskDetail(dependent).readiness.isReady).toBe(true);
	});

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
