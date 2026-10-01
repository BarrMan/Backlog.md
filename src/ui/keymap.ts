/**
 * TUI-only default bindings. These are deliberately in-memory defaults: a persisted
 * user keybinding format is product configuration and needs a separate decision.
 */
export const uiKeymap = {
	shared: {
		quit: ["q", "escape", "C-c"],
		cancel: ["escape", "q"],
		confirm: ["enter", "y", "Y"],
		decline: ["escape", "n", "N"],
		help: ["?"],
		up: ["up"],
		down: ["down"],
		previous: ["left"],
		next: ["right"],
		pageUp: ["pageup"],
		pageDown: ["pagedown"],
		first: ["home"],
		last: ["end"],
		activate: ["enter", "space"],
		search: ["/"],
		find: ["C-f"],
		backspace: ["backspace"],
		delete: ["delete"],
		deleteWord: ["C-w"],
		tab: ["tab"],
		previousTab: ["S-tab"],
		escape: ["escape"],
		quitWithoutEscape: ["q", "C-c"],
		dismissHelp: ["escape", "q", "?"],
	},
	board: {
		search: ["/", "C-f"],
		workspace: ["S-b"],
		create: ["n", "N"],
		filterType: ["t", "T"],
		filterProject: ["v", "V"],
		filterPriority: ["p", "P"],
		filterMilestone: ["i", "I"],
		filterLabels: ["f", "F"],
		edit: ["e", "E", "S-e"],
		copy: ["y", "Y"],
		complete: ["c", "C"],
		archive: ["a", "A"],
		open: ["enter"],
		navPrevious: ["left", "h"],
		navNext: ["right", "l"],
		navUp: ["up"],
		navUpVim: ["k"],
		navDown: ["down"],
		navDownVim: ["j"],
		pageUp: ["pageup", "C-u"],
		pageDown: ["pagedown", "C-d"],
		first: ["home"],
		last: ["end"],
		moveHighlightUp: ["S-up"],
		moveHighlightDown: ["S-down"],
		moveHighlight: ["S-up", "S-down"],
		move: ["m"],
		recruit: ["M", "S-m"],
		switchView: ["tab"],
		toggleHideEmpty: ["S-h"],
	},
	taskList: {
		filterStatus: ["s", "S"],
		filterType: ["t", "T"],
		filterProject: ["v", "V"],
		filterPriority: ["p", "P"],
		filterMilestone: ["i", "I"],
		filterLabels: ["l", "L"],
		edit: ["e", "E", "S-e"],
		copy: ["y", "Y"],
		complete: ["c", "C"],
		archive: ["a", "A"],
		focusDetail: ["right", "l"],
		focusList: ["left", "h"],
		focusListEscape: ["escape"],
		detailUp: ["up"],
		detailUpVim: ["k"],
		detailPageUp: ["pageup", "b"],
		detailPageDown: ["pagedown", "space"],
		detailFirst: ["home", "g"],
		detailLast: ["end", "G"],
	},
	list: {
		up: ["up"],
		upVim: ["k"],
		down: ["down"],
		downVim: ["j"],
		pageUp: ["pageup", "C-u"],
		pageDown: ["pagedown", "C-d"],
		first: ["home"],
		last: ["end"],
		toggle: ["space"],
		select: ["enter"],
		search: ["/"],
		cancel: ["escape", "q", "C-c"],
	},
	workspace: {
		save: ["C-s"],
		close: ["escape"],
		details: ["space"],
		focusDetails: ["right", "l"],
		open: ["enter"],
		edit: ["e", "enter"],
		history: ["s"],
		board: ["S-b"],
		newTask: ["n", "N"],
		inlineInput: ["tab"],
		toggleWorktree: ["space"],
		up: ["up"],
		down: ["down"],
		search: ["/"],
		handoff: ["h"],
		config: ["p"],
	},
} as const;

/** Compact established labels for bindings whose terminal notation is more verbose. */
const uiKeymapLabels: Partial<Record<`${KeymapContext}.${string}`, string>> = {
	"board.moveHighlight": "Shift+↑↓",
	"board.recruit": "Shift+M",
	"board.toggleHideEmpty": "H",
};

export type KeymapContext = keyof typeof uiKeymap;
export type KeymapAction<C extends KeymapContext> = keyof (typeof uiKeymap)[C];

export function keymapKeys<C extends KeymapContext>(context: C, action: KeymapAction<C>): string[] {
	return [...(uiKeymap[context][action] as readonly string[])];
}

/** Human-facing form for a binding, including blessed's Ctrl/Shift notation. */
export function formatKey(key: string): string {
	const aliases: Record<string, string> = {
		escape: "Esc",
		enter: "Enter",
		space: "Space",
		pageup: "PgUp",
		pagedown: "PgDn",
		home: "Home",
		end: "End",
		left: "←",
		right: "→",
		up: "↑",
		down: "↓",
		tab: "Tab",
	};
	if (aliases[key]) return aliases[key];
	if (key.startsWith("C-")) return `Ctrl+${key.slice(2).toUpperCase()}`;
	if (key.startsWith("S-")) return `Shift+${key.slice(2).toUpperCase()}`;
	return key.length === 1 ? key.toUpperCase() : key;
}

export function formatKeymap<C extends KeymapContext>(context: C, action: KeymapAction<C>): string {
	return uiKeymapLabels[`${context}.${String(action)}`] ?? formatKey(keymapKeys(context, action)[0] ?? "");
}

type BlessedKeyEvent = {
	name?: string;
	full?: string;
	sequence?: string;
	ctrl?: boolean;
	shift?: boolean;
	meta?: boolean;
};

function keyEventNames(key: BlessedKeyEvent): string[] {
	const modifier = key.ctrl ? "C" : key.shift ? "S" : key.meta ? "M" : undefined;
	const name = key.name ?? key.sequence;
	const fullIsModified = /^(?:C|S|M)-/.test(key.full ?? "");
	const names = modifier && name ? [`${modifier}-${name}`] : [];
	if (key.full && (!modifier || fullIsModified || key.full !== name)) names.push(key.full);
	if (!modifier && name) names.push(name);
	return [...new Set(names)];
}

/** Match either blessed's emitted key object or a registered key name. */
export function matchesKey(keys: readonly string[], key: BlessedKeyEvent): boolean {
	return keyEventNames(key).some((name) => keys.includes(name));
}
