import { describe, expect, test } from "bun:test";
import type { Core } from "../core/backlog.ts";
import type { Task } from "../types/index.ts";
import { Board } from "../ui/board/board.ts";
import { BoardActions } from "../ui/board/board-actions.ts";

const task = (id: string, status: string, ordinal: number): Task => ({
	id,
	title: id,
	status,
	ordinal,
	assignee: [],
	createdDate: "2025-01-01",
	labels: [],
	dependencies: [],
});

function core(overrides: Record<string, unknown> = {}): Core {
	return {
		filesystem: {
			loadConfig: async () => ({ autoCommit: false }),
			saveConfig: async () => {},
		},
		createTaskFromInput: async (input: { title: string }) => ({ task: task("NEW", "To Do", 3), filePath: input.title }),
		reorderTask: async () => ({ updatedTask: task("A", "Done", 1), changedTasks: [task("A", "Done", 1)] }),
		moveTasksToStatus: async () => ({ movedTasks: [], changedTasks: [], failures: [] }),
		...overrides,
	} as unknown as Core;
}

describe("board actions", () => {
	test("freezes a commit before awaiting persistence and merges it into the latest corpus", async () => {
		let release!: () => void;
		const persisted = new Promise<void>((resolve) => {
			release = resolve;
		});
		const board = new Board({ tasks: [task("A", "To Do", 1), task("B", "Done", 2)], statuses: ["To Do", "Done"] });
		board.beginMove();
		board.moveToAdjacentLane("next");
		const actions = new BoardActions(
			board,
			core({
				reorderTask: async () => {
					await persisted;
					return { updatedTask: task("A", "Done", 1), changedTasks: [task("A", "Done", 1)] };
				},
			}),
		);
		const saving = actions.confirmMove();
		expect(board.isWritePending).toBe(true);
		expect(board.beginMove()).toBe("blocked");
		board.update([task("A", "To Do", 1), task("C", "Done", 2), task("B", "Done", 3)]);
		release();
		expect(await saving).toMatchObject({ status: "saved", commit: { orderedTaskIds: ["A", "B"] } });
		expect(board.lanes.find((lane) => lane.status === "Done")?.tasks.map((item) => item.id)).toEqual(["A", "C", "B"]);
		expect(board.isWritePending).toBe(false);
	});

	test("reports partial batch failures while retaining successful task updates", async () => {
		const board = new Board({ tasks: [task("A", "To Do", 1), task("B", "To Do", 2)], statuses: ["To Do", "Done"] });
		board.beginMove();
		board.toggleRecruit();
		board.moveToAdjacentLane("next");
		const actions = new BoardActions(
			board,
			core({
				moveTasksToStatus: async () => ({
					movedTasks: [task("A", "Done", 1)],
					changedTasks: [task("A", "Done", 1)],
					failures: [{ taskId: "B", reason: "locked" }],
				}),
			}),
		);
		expect(await actions.confirmMove()).toMatchObject({ status: "partial", failures: [{ taskId: "B" }] });
		expect(board.lanes.find((lane) => lane.status === "Done")?.tasks.map((item) => item.id)).toEqual(["A"]);
	});

	test("rolls back an optimistic hide-empty setting when persistence fails", async () => {
		const board = new Board({ tasks: [task("A", "To Do", 1)], statuses: ["To Do", "Done"] });
		const actions = new BoardActions(
			board,
			core({
				filesystem: {
					loadConfig: async () => ({ autoCommit: false }),
					saveConfig: async () => {
						throw new Error("disk full");
					},
				},
			}),
		);
		const saving = actions.setHideEmptyColumns(true);
		expect(board.hideEmptyColumns).toBe(true);
		expect(await saving).toMatchObject({ status: "failed", error: { message: "disk full" } });
		expect(board.hideEmptyColumns).toBe(false);
	});

	test("tracks creation writes until settle and adds non-draft tasks", async () => {
		let release!: () => void;
		const created = new Promise<void>((resolve) => {
			release = resolve;
		});
		const board = new Board({ tasks: [task("A", "To Do", 1)], statuses: ["To Do"] });
		const actions = new BoardActions(
			board,
			core({
				createTaskFromInput: async () => {
					await created;
					return { task: task("B", "To Do", 2) };
				},
			}),
		);
		const creating = actions.createTask({ title: "B" });
		let settled = false;
		void actions.settle().then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		expect((await creating).id).toBe("B");
		await actions.settle();
		expect(board.lanes[0]?.tasks.map((item) => item.id)).toEqual(["A", "B"]);
	});
});
