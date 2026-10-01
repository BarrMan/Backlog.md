import { describe, expect, it } from "bun:test";
import { list } from "neo-neo-bblessed";
import { adaptListRemoval } from "../ui/list-removal-adapter.ts";
import { createScreen } from "../ui/tui.ts";

type RenderedList = ReturnType<typeof list> & {
	children: Array<{ parent: unknown }>;
	items: Array<{ parent: unknown }>;
	ritems: string[];
};

function withTtyScreen(run: (screen: ReturnType<typeof createScreen>) => void): void {
	const originalIsTTY = process.stdout.isTTY;
	if (process.stdout.isTTY === false)
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
	const screen = createScreen({ smartCSR: false });
	try {
		run(screen);
	} finally {
		if (process.stdout.isTTY !== originalIsTTY)
			Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
		screen.destroy();
	}
}

describe("blessed list removal adapter", () => {
	it("keeps list items, child nodes, and selection synchronized through shrink and grow cycles", () => {
		withTtyScreen((screen) => {
			const tree = list({ parent: screen, interactive: true }) as RenderedList;
			adaptListRemoval(tree);

			for (let cycle = 0; cycle < 3; cycle += 1) {
				tree.setItems(["To Do", "Done (1)", "Completed task"]);
				tree.select(2);
				const removed = tree.items.slice(1) as Array<{ parent: unknown }>;
				tree.setItems(["Done (0)"]);

				expect(tree.items).toHaveLength(1);
				expect(tree.ritems).toEqual(["Done (0)"]);
				expect(tree.children).toEqual(tree.items);
				expect(tree.selected).toBe(0);
				for (const item of removed) {
					expect(item.parent).toBeNull();
					expect(tree.children).not.toContain(item);
				}

				tree.setItems(["To Do", "Done (1)", "Completed task"]);
				expect(tree.items).toHaveLength(3);
				expect(tree.ritems).toEqual(["To Do", "Done (1)", "Completed task"]);
				expect(tree.children).toEqual(tree.items);
				expect(tree.selected).toBeGreaterThanOrEqual(0);
				expect(tree.selected).toBeLessThan(tree.items.length);
			}
		});
	});
});
