import { describe, expect, it } from "bun:test";
import { formatBrowserShortcut, formatBrowserShortcutAriaKeys, matchesBrowserShortcut } from "./keyboard-shortcuts.ts";

const keyEvent = (
	key: string,
	modifiers: Partial<Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey">> = {},
) => ({
	key,
	metaKey: false,
	ctrlKey: false,
	altKey: false,
	shiftKey: false,
	...modifiers,
});

describe("browser keyboard shortcuts", () => {
	it("matches primary modifiers on macOS and other platforms", () => {
		expect(matchesBrowserShortcut(keyEvent("k", { metaKey: true }), "focusSearch")).toBe(true);
		expect(matchesBrowserShortcut(keyEvent("K", { ctrlKey: true }), "focusSearch")).toBe(true);
		expect(matchesBrowserShortcut(keyEvent("k"), "focusSearch")).toBe(false);
	});

	it("preserves modifier combinations for each policy", () => {
		expect(matchesBrowserShortcut(keyEvent("e"), "startTaskEdit")).toBe(true);
		expect(matchesBrowserShortcut(keyEvent("e", { shiftKey: true }), "startTaskEdit")).toBe(true);
		expect(matchesBrowserShortcut(keyEvent("e", { altKey: true }), "startTaskEdit")).toBe(false);
		expect(matchesBrowserShortcut(keyEvent("e", { ctrlKey: true }), "startTaskEdit")).toBe(false);
		expect(matchesBrowserShortcut(keyEvent("k", { ctrlKey: true, altKey: true }), "focusSearch")).toBe(true);
		expect(matchesBrowserShortcut(keyEvent("k", { metaKey: true, shiftKey: true }), "focusSearch")).toBe(true);
		expect(matchesBrowserShortcut(keyEvent("Enter", { ctrlKey: true }), "commitChip")).toBe(false);
		expect(matchesBrowserShortcut(keyEvent("Enter", { shiftKey: true }), "selectTaskCard")).toBe(true);
		expect(matchesBrowserShortcut(keyEvent("Enter", { altKey: true, shiftKey: true }), "selectTaskCard")).toBe(false);
		expect(matchesBrowserShortcut(keyEvent("Escape", { ctrlKey: true }), "closeModal")).toBe(true);
	});

	it("formats the search hint for the active platform", () => {
		expect(formatBrowserShortcut("focusSearch", "MacIntel")).toBe("⌘K");
		expect(formatBrowserShortcut("focusSearch", "Win32")).toBe("Ctrl+K");
		expect(formatBrowserShortcut("focusSearch", "")).toBe("⌘K");
	});

	it("uses configured ARIA key labels", () => {
		expect(formatBrowserShortcutAriaKeys("activateTaskCard")).toBe("Enter Space");
		expect(formatBrowserShortcutAriaKeys("startTaskEdit")).toBe("e");
		expect(formatBrowserShortcutAriaKeys("saveTaskEdit")).toBe("Control+s Meta+s");
	});
});
