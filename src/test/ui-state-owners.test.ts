import { describe, expect, test } from "bun:test";
import type { Task } from "../types/index.ts";
import { moveTargetToAdjacentColumn } from "../ui/board-interaction.ts";
import { TaskViewerSession } from "../ui/task-viewer-session.ts";

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
		const session = new TaskViewerSession(task("BACK-1"));
		const first = session.beginSelectionRefresh();
		session.select(task("BACK-2"));
		const second = session.beginSelectionRefresh();
		expect(session.isCurrentSelectionRefresh(first)).toBeFalse();
		expect(session.isCurrentSelectionRefresh(second)).toBeTrue();
		expect(session.selected.id).toBe("BACK-2");
	});
});
