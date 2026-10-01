import { describe, expect, it } from "bun:test";
import { FooterSearch } from "../ui/components/footer-search.ts";
import { createScreen } from "../ui/tui.ts";

type Widget = { emit(event: string, ...args: unknown[]): boolean; destroy(): void; focused?: Widget };
type Input = Widget & { getValue(): string; left: number; setValue(value: string): void; width: number };
type FooterWidgets = { hints: Geometry; input: Input; prompt: Geometry };
type Geometry = { getContent(): string; hidden: boolean; left: number; width: number };

function press(screen: Widget, name: string, character?: string): void {
	const key = { name, full: name };
	screen.emit("keypress", character, key);
}

function waitForInputListener(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

function createFooter(initialQuery = "", screenWidth = 80) {
	const screen = createScreen({ smartCSR: false }) as unknown as Widget;
	Object.defineProperty(screen, "width", { configurable: true, value: screenWidth, writable: true });
	let query = initialQuery;
	const changes: string[] = [];
	const calls: string[] = [];
	const footer = new FooterSearch({
		screen: screen as never,
		content: () => " [/] Search ",
		query: () => query,
		onQueryChange: (value) => {
			query = value;
			changes.push(value);
		},
		onSubmit: () => {
			calls.push("submit");
		},
		onCancel: () => {
			calls.push("cancel");
		},
	});
	const input = (footer as unknown as { input: Input }).input;
	return { screen, footer, input, changes, calls, query: () => query };
}

describe("FooterSearch", () => {
	it("submits the current live query and exits editing", async () => {
		const fixture = createFooter();
		try {
			fixture.footer.focus();
			expect((fixture.footer as unknown as { prompt: Geometry }).prompt.getContent()).toBe(" / ");
			await waitForInputListener();
			press(fixture.input, "a", "a");
			press(fixture.input, "enter", "\n");
			expect(fixture.query()).toBe("a");
			expect(fixture.changes).toContain("a");
			expect(fixture.calls).toEqual(["submit"]);
			expect(fixture.footer.isEditing).toBe(false);
			const hints = (fixture.footer as unknown as { hints: Geometry }).hints;
			expect(hints.hidden).toBe(false);
			expect(hints.getContent()).toContain("Search");
		} finally {
			fixture.footer.destroy();
			fixture.screen.destroy();
		}
	});

	it("edits at the cursor with real textbox keypresses", async () => {
		const fixture = createFooter();
		try {
			fixture.footer.focus();
			await waitForInputListener();
			press(fixture.input, "a", "a");
			press(fixture.input, "b", "b");
			press(fixture.input, "c", "c");
			press(fixture.input, "left");
			press(fixture.input, "left");
			press(fixture.input, "x", "X");
			press(fixture.input, "backspace");
			press(fixture.input, "delete");
			press(fixture.input, "home");
			press(fixture.input, "z", "Z");
			press(fixture.input, "paste", "hi");
			press(fixture.input, "end");
			press(fixture.input, "!", "!");

			expect(fixture.input.getValue()).toBe("Zhiac!");
			expect(fixture.query()).toBe("Zhiac!");
			expect(fixture.changes).toEqual(["a", "ab", "abc", "aXbc", "abc", "ac", "Zac", "Zhiac", "Zhiac!"]);

			press(fixture.input, "enter", "\n");
			expect(fixture.calls).toEqual(["submit"]);
			expect(fixture.footer.isEditing).toBe(false);
		} finally {
			fixture.footer.destroy();
			fixture.screen.destroy();
		}
	});

	it("renders full-width shortcuts and a disjoint search input", () => {
		const fixture = createFooter();
		try {
			fixture.footer.render();
			const widgets = fixture.footer as unknown as FooterWidgets;
			expect(widgets.hints.left).toBe(0);
			expect(widgets.hints.width).toBe(80);

			fixture.footer.focus();
			expect(widgets.prompt.getContent()).toBe(" / ");
			expect(widgets.prompt.left).toBe(0);
			expect(widgets.prompt.width).toBe(Bun.stringWidth(widgets.prompt.getContent()));
			expect(widgets.input.left).toBe(widgets.prompt.width);
			expect(widgets.input.width).toBe(80 - widgets.prompt.width);
		} finally {
			fixture.footer.destroy();
			fixture.screen.destroy();
		}
	});

	it("keeps a usable input in a narrow viewport", () => {
		const fixture = createFooter("", 2);
		try {
			fixture.footer.focus();
			const widgets = fixture.footer as unknown as FooterWidgets;
			expect(widgets.prompt.width).toBe(1);
			expect(widgets.input.left).toBe(widgets.prompt.width);
			expect(widgets.input.width).toBe(1);
		} finally {
			fixture.footer.destroy();
			fixture.screen.destroy();
		}
	});

	it("restores the pre-edit query on Escape", async () => {
		const fixture = createFooter("before");
		try {
			fixture.footer.focus();
			await waitForInputListener();
			press(fixture.input, "a", "a");
			press(fixture.input, "escape", "\u001b");
			expect(fixture.query()).toBe("before");
			expect(fixture.calls).toEqual(["cancel"]);
			expect(fixture.footer.isEditing).toBe(false);
			const hints = (fixture.footer as unknown as { hints: Geometry }).hints;
			expect(hints.hidden).toBe(false);
			expect(hints.getContent()).toContain("Search");
		} finally {
			fixture.footer.destroy();
			fixture.screen.destroy();
		}
	});

	it("commits an empty search", async () => {
		const fixture = createFooter("before");
		try {
			fixture.footer.focus();
			await waitForInputListener();
			for (let index = 0; index < "before".length; index += 1) press(fixture.input, "backspace");
			press(fixture.input, "enter", "\n");
			expect(fixture.query()).toBe("");
			expect(fixture.calls).toEqual(["submit"]);
		} finally {
			fixture.footer.destroy();
			fixture.screen.destroy();
		}
	});
});
