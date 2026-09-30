import { describe, expect, test } from "bun:test";
import type { Task } from "../types/index.ts";
import { moveTargetToAdjacentColumn } from "../ui/board/interaction.ts";
import { TaskViewerSession } from "../ui/task-viewer-session.ts";
import { UnifiedViewSession } from "../ui/unified/session.ts";

const task = (id: string): Task => ({
	id,
	title: id,
	status: "To Do",
	assignee: [],
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
});

describe("UI state owners", () => {
	test("clamps adjacent board move targets without mutating the source state", () => {
		const target = moveTargetToAdjacentColumn(["To Do", "In Progress", "Done"], "In Progress", 4, "next", (status) =>
			status === "Done" ? 2 : 0,
		);
		expect(target).toEqual({ status: "Done", index: 2 });
		expect(moveTargetToAdjacentColumn(["To Do"], "To Do", 0, "previous", () => 0)).toBeUndefined();
	});

	test("rejects stale viewer selection refreshes", () => {
		const firstTask = task("BACK-1");
		const session = new TaskViewerSession(
			[firstTask],
			{
				search: "",
				status: [],
				excludeStatus: [],
				taskTypes: [],
				projects: [],
				priority: "",
				labels: [],
				milestone: "",
				labelMatch: "any",
			},
			firstTask,
			Object.assign((value: string) => value, {
				resolveExactId: () => undefined,
				resolveExactTitle: () => undefined,
				resolveId: () => undefined,
			}),
			() => ({ tasks: [firstTask], completedTasks: [], statuses: ["To Do"] }),
		);
		const first = session.beginSelectionRefresh();
		session.select(task("BACK-2"));
		expect(session.isCurrentSelectionRefresh(first)).toBeFalse();
		const second = session.beginSelectionRefresh();
		expect(session.isCurrentSelectionRefresh(first)).toBeFalse();
		expect(session.isCurrentSelectionRefresh(second)).toBeTrue();
		expect(session.selected.id).toBe("BACK-2");
	});

	test("removes viewer tasks from the filtering corpus", () => {
		const firstTask = task("BACK-1");
		const secondTask = task("BACK-2");
		const session = new TaskViewerSession(
			[firstTask, secondTask],
			{
				search: "",
				status: [],
				excludeStatus: [],
				taskTypes: [],
				projects: [],
				priority: "",
				labels: [],
				milestone: "",
				labelMatch: "any",
			},
			firstTask,
			Object.assign((value: string) => value, {
				resolveExactId: () => undefined,
				resolveExactTitle: () => undefined,
				resolveId: () => undefined,
			}),
			() => ({ tasks: [firstTask, secondTask], completedTasks: [], statuses: ["To Do"] }),
		);

		expect(
			session.removeTask("BACK-1", {
				search: "",
				status: [],
				excludeStatus: [],
				taskTypes: [],
				projects: [],
				priority: "",
				labels: [],
				milestone: "",
				labelMatch: "any",
			}),
		).toBeTrue();
		expect(session.getTasks().map((item) => item.id)).toEqual(["BACK-2"]);
		expect(session.filteredTasks.map((item) => item.id)).toEqual(["BACK-2"]);
	});

	test("unified session publishes watcher snapshots to the active view", () => {
		const firstTask = task("BACK-1");
		const session = new UnifiedViewSession([firstTask], firstTask, {
			searchQuery: "",
			statusFilter: [],
			excludeStatus: [],
			typeFilter: [],
			projectFilter: [],
			priorityFilter: "",
			labelFilter: [],
			milestoneFilter: "",
		});
		const updates: string[] = [];
		const unsubscribe = session.subscribeTasks((snapshot) =>
			updates.push(snapshot.tasks.map((item) => item.id).join(",")),
		);
		session.applyTaskUpdate({ type: "upsert", task: task("BACK-2") });
		session.selectTask(task("BACK-2"));
		unsubscribe();
		expect(updates).toEqual(["BACK-1", "BACK-1,BACK-2", "BACK-1,BACK-2"]);
	});
});
