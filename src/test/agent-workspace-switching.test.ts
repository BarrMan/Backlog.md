import { describe, expect, it } from "bun:test";
import { TUIRenderer } from "../ui/board/tui-renderer.ts";
import { createScreen } from "../ui/tui.ts";

type Widget = {
	emit(event: string, ...args: unknown[]): boolean;
	children: unknown[];
	destroy(): void;
};

function press(screen: Widget, name: string, character = ""): void {
	const key = { name, full: name };
	screen.emit("keypress", character, key);
	screen.emit(`key ${name}`, character, key);
}

describe("agent workspace Board handoff", () => {
	it("hands the selected card to Workspace without closing the hosted Board", async () => {
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget;
		let selectedTaskId: string | undefined;
		try {
			const board = new TUIRenderer(
				[
					{
						id: "BACK-723",
						title: "Native tmux windows",
						status: "To Do",
						assignee: [],
						createdDate: "2026-10-01",
						labels: [],
						dependencies: [],
					},
				],
				["To Do"],
				"horizontal",
				20,
				{
					screen: screen as never,
					preserveScreen: true,
					keepWorkspaceOpen: true,
					onWorkspacePress: async (task) => {
						selectedTaskId = task?.id;
					},
				},
			).run();
			await Bun.sleep(20);
			press(screen, "S-b", "B");
			await Bun.sleep(20);

			expect(selectedTaskId).toBe("BACK-723");
			expect(screen.children.length).toBeGreaterThan(0);
			press(screen, "q", "q");
			await board;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
		}
	});

	it("detaches a hosted Board without tearing down its UI", async () => {
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget;
		let detachCalls = 0;
		try {
			void new TUIRenderer(
				[
					{
						id: "BACK-723",
						title: "Native tmux windows",
						status: "To Do",
						assignee: [],
						createdDate: "2026-10-01",
						labels: [],
						dependencies: [],
					},
				],
				["To Do"],
				"horizontal",
				20,
				{
					screen: screen as never,
					preserveScreen: true,
					onDetach: async () => {
						detachCalls += 1;
					},
				},
			).run();
			await Bun.sleep(20);
			press(screen, "q", "q");
			await Bun.sleep(20);

			expect(detachCalls).toBe(1);
			expect(screen.children.length).toBeGreaterThan(0);
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
		}
	});
});
