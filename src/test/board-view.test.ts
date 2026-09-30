import { afterEach, describe, expect, test } from "bun:test";
import type { BoxInterface } from "neo-neo-bblessed";
import type { Task } from "../types/index.ts";
import { Board } from "../ui/board/board.ts";
import { BoardView } from "../ui/board/board-view.ts";
import { createScreen } from "../ui/tui.ts";

function task(id: string, status: string): Task {
	return {
		id,
		title: id,
		status,
		assignee: [],
		createdDate: "2026-01-01",
		labels: [],
		dependencies: [],
	};
}

describe("BoardView", () => {
	const screens: Array<{ destroy(): void }> = [];

	afterEach(() => {
		for (const screen of screens.splice(0)) screen.destroy();
	});

	test("composes lanes from the Board projection and selects through Board", () => {
		const screen = createScreen({ smartCSR: false });
		screens.push(screen);
		const board = new Board({
			tasks: [task("BACK-1", "Todo"), task("BACK-2", "Done")],
			statuses: ["Todo", "Done"],
		});
		const view = new BoardView(screen as unknown as BoxInterface, {
			board,
			getTerminalWidth: () => 80,
			projects: [],
			isInteractionBlocked: () => false,
			isRendering: () => false,
			onBoardFocus: () => undefined,
			onRender: () => undefined,
		});

		view.render();
		expect(view.lanes.map((lane) => lane.status)).toEqual(["Todo", "Done"]);

		view.select(1, 0);
		expect(board.selectedLane?.status).toBe("Done");
		expect(board.selectedTask?.id).toBe("BACK-2");
		view.destroy();
	});

	test("rebuilds its widgets when the Board projection changes", () => {
		const screen = createScreen({ smartCSR: false });
		screens.push(screen);
		const board = new Board({ tasks: [task("BACK-1", "Todo")], statuses: ["Todo"] });
		const view = new BoardView(screen as unknown as BoxInterface, {
			board,
			getTerminalWidth: () => 80,
			projects: [],
			isInteractionBlocked: () => false,
			isRendering: () => false,
			onBoardFocus: () => undefined,
			onRender: () => undefined,
		});

		view.render();
		const original = view.lanes[0];
		board.update([task("BACK-1", "Todo"), task("BACK-2", "Done")], ["Todo", "Done"]);
		view.render();

		expect(view.lanes).toHaveLength(2);
		expect(view.lanes[0]).not.toBe(original);
		view.destroy();
	});
});
