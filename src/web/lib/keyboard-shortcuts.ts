type BrowserShortcutModifiers = "hasPrimary" | "any" | "noPrimaryOrAlt" | "hasSelectionModifier";

type BrowserShortcutDefinition = {
	keys: string[];
	modifiers: BrowserShortcutModifiers;
	label: string;
	ariaKeyShortcuts?: string;
};

export const BROWSER_SHORTCUTS = {
	focusSearch: { keys: ["k"], modifiers: "hasPrimary", label: "K" },
	closeModal: { keys: ["Escape"], modifiers: "any", label: "Escape" },
	cancelTaskEdit: { keys: ["Escape"], modifiers: "any", label: "Escape" },
	saveTaskEdit: { keys: ["s"], modifiers: "hasPrimary", label: "S" },
	startTaskEdit: { keys: ["e"], modifiers: "noPrimaryOrAlt", label: "E" },
	completeTask: { keys: ["c"], modifiers: "noPrimaryOrAlt", label: "C" },
	confirmTaskTitle: { keys: ["Enter"], modifiers: "noPrimaryOrAlt", label: "Enter" },
	clearBoardSelection: { keys: ["Escape"], modifiers: "any", label: "Escape" },
	commitChip: { keys: ["Enter", ","], modifiers: "noPrimaryOrAlt", label: "Enter or comma" },
	removeLastChip: { keys: ["Backspace"], modifiers: "noPrimaryOrAlt", label: "Backspace" },
	nextDependencySuggestion: { keys: ["ArrowDown"], modifiers: "noPrimaryOrAlt", label: "Arrow down" },
	previousDependencySuggestion: { keys: ["ArrowUp"], modifiers: "noPrimaryOrAlt", label: "Arrow up" },
	commitDependency: { keys: ["Enter", ","], modifiers: "noPrimaryOrAlt", label: "Enter or comma" },
	dismissDependencySuggestions: { keys: ["Escape"], modifiers: "noPrimaryOrAlt", label: "Escape" },
	activateTaskCard: {
		keys: ["Enter", " "],
		modifiers: "noPrimaryOrAlt",
		label: "Enter or Space",
		ariaKeyShortcuts: "Enter Space",
	},
	selectTaskCard: {
		keys: ["Enter", " "],
		modifiers: "hasSelectionModifier",
		label: "Enter or Space",
		ariaKeyShortcuts: "Enter Space",
	},
} satisfies Record<string, BrowserShortcutDefinition>;

type BrowserShortcut = keyof typeof BROWSER_SHORTCUTS;
type KeyboardEventLike = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

export function matchesBrowserShortcut(event: KeyboardEventLike, shortcut: BrowserShortcut): boolean {
	const definition = BROWSER_SHORTCUTS[shortcut];
	if (!definition.keys.some((key) => event.key.toLowerCase() === key.toLowerCase())) return false;
	if (definition.modifiers === "hasPrimary") return event.metaKey || event.ctrlKey;
	if (definition.modifiers === "noPrimaryOrAlt") return !event.metaKey && !event.ctrlKey && !event.altKey;
	if (definition.modifiers === "hasSelectionModifier")
		return !event.altKey && (event.metaKey || event.ctrlKey || event.shiftKey);
	return true;
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
	// Events can originate in a separate window (for example, an isolated jsdom realm).
	return (
		typeof (target as Element | null)?.closest === "function" &&
		(target as Element).closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
	);
}

export function formatBrowserShortcut(
	shortcut: BrowserShortcut,
	platform = typeof navigator === "undefined" ? "" : navigator.platform,
): string {
	const definition = BROWSER_SHORTCUTS[shortcut];
	if (definition.modifiers !== "hasPrimary") return definition.label;
	const usesApplePrimary = platform === "" || /mac|iphone|ipad|ipod/i.test(platform);
	return `${usesApplePrimary ? "⌘" : "Ctrl+"}${definition.label}`;
}

export function formatBrowserShortcutAriaKeys(shortcut: BrowserShortcut): string | undefined {
	const definition = BROWSER_SHORTCUTS[shortcut];
	if ("ariaKeyShortcuts" in definition && definition.ariaKeyShortcuts) return definition.ariaKeyShortcuts;
	const keys = definition.keys.map((key) => (key === " " ? "Space" : key));
	if (definition.modifiers === "hasPrimary") {
		return ["Control", "Meta"].flatMap((modifier) => keys.map((key) => `${modifier}+${key}`)).join(" ");
	}
	return keys.join(" ");
}
