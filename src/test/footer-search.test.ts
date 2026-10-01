import { describe, expect, it } from "bun:test";
import { FooterSearch } from "../ui/components/footer-search.ts";
import { createScreen } from "../ui/tui.ts";

type Widget = { emit(event: string, ...args: unknown[]): boolean; destroy(): void; focused?: Widget };
type Input = Widget & { setValue(value: string): void };
type Prompt = { getContent(): string };

function press(screen: Widget, name: string, character = ""): void {
	const key = { name, full: name };
	screen.emit("keypress", character, key);
	screen.emit(`key ${name}`, character, key);
}

function createFooter(initialQuery = "") {
	const screen = createScreen({ smartCSR: false }) as unknown as Widget;
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
			expect((fixture.footer as unknown as { prompt: Prompt }).prompt.getContent()).toBe(" / Search: ");
			fixture.input.setValue("a");
			press(fixture.input, "a", "a");
			await Promise.resolve();
			fixture.input.emit("submit", "a");
			expect(fixture.query()).toBe("a");
			expect(fixture.changes).toContain("a");
			expect(fixture.calls).toEqual(["submit"]);
			expect(fixture.footer.isEditing).toBe(false);
		} finally {
			fixture.footer.destroy();
			fixture.screen.destroy();
		}
	});

	it("restores the pre-edit query on Escape", async () => {
		const fixture = createFooter("before");
		try {
			fixture.footer.focus();
			fixture.input.setValue("after");
			press(fixture.input, "a", "a");
			await Promise.resolve();
			press(fixture.input, "escape", "\u001b");
			expect(fixture.query()).toBe("before");
			expect(fixture.calls).toEqual(["cancel"]);
			expect(fixture.footer.isEditing).toBe(false);
		} finally {
			fixture.footer.destroy();
			fixture.screen.destroy();
		}
	});

	it("commits an empty search", () => {
		const fixture = createFooter("before");
		try {
			fixture.footer.focus();
			fixture.input.setValue("");
			press(fixture.input, "backspace");
			fixture.input.emit("submit", "");
			expect(fixture.query()).toBe("");
			expect(fixture.calls).toEqual(["submit"]);
		} finally {
			fixture.footer.destroy();
			fixture.screen.destroy();
		}
	});
});
