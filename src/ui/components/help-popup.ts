import type { ScreenInterface } from "neo-neo-bblessed";
import { formatKeymap, keymapKeys } from "../keymap.ts";
import { createPopupChrome, createScrollableViewport } from "./filter-popup.ts";

export type HelpPopupContext = "board" | "task-list";

type Shortcut = {
	key: string;
	desc: string;
};

const BOARD_SHORTCUTS: Shortcut[] = [
	{ key: formatKeymap("shared", "tab"), desc: "Switch View (Kanban/List)" },
	{ key: formatKeymap("board", "workspace"), desc: "Open Workspace" },
	{ key: formatKeymap("board", "create"), desc: "Create a task" },
	{ key: formatKeymap("board", "search"), desc: "Search tasks" },
	{ key: formatKeymap("board", "filterType"), desc: "Filter by Type" },
	{ key: formatKeymap("board", "filterProject"), desc: "Filter by Project" },
	{ key: formatKeymap("board", "filterPriority"), desc: "Filter by Priority" },
	{ key: formatKeymap("board", "filterMilestone"), desc: "Filter by Milestone" },
	{ key: formatKeymap("board", "filterLabels"), desc: "Filter by Labels" },
	{ key: `${formatKeymap("board", "navPrevious")}${formatKeymap("board", "navNext")}`, desc: "Navigate columns" },
	{ key: `${formatKeymap("board", "navUp")}${formatKeymap("board", "navDown")}`, desc: "Navigate tasks" },
	{ key: formatKeymap("board", "open"), desc: "View task details" },
	{ key: formatKeymap("board", "edit"), desc: "Edit task" },
	{
		key: formatKeymap("board", "move"),
		desc: `Move tasks (${formatKeymap("board", "recruit")} selects more in move mode)`,
	},
	{ key: formatKeymap("board", "complete"), desc: "Complete task" },
	{ key: formatKeymap("board", "archive"), desc: "Archive task" },
	{ key: formatKeymap("board", "copy"), desc: "Yank (Copy) task ID" },
	{ key: formatKeymap("board", "toggleHideEmpty"), desc: "Hide/show empty columns" },
	{ key: formatKeymap("shared", "help"), desc: "Show this help menu" },
	{ key: formatKeymap("shared", "quit"), desc: "Quit / Close" },
];

const TASK_LIST_SHORTCUTS: Shortcut[] = [
	{ key: formatKeymap("shared", "tab"), desc: "Switch View (Kanban/List)" },
	{ key: formatKeymap("shared", "search"), desc: "Search tasks" },
	{ key: formatKeymap("taskList", "filterStatus"), desc: "Filter by Status" },
	{ key: formatKeymap("taskList", "filterType"), desc: "Filter by Type" },
	{ key: formatKeymap("taskList", "filterProject"), desc: "Filter by Project" },
	{ key: formatKeymap("taskList", "filterPriority"), desc: "Filter by Priority" },
	{ key: formatKeymap("taskList", "filterMilestone"), desc: "Filter by Milestone" },
	{ key: formatKeymap("taskList", "filterLabels"), desc: "Filter by Labels" },
	{ key: `${formatKeymap("shared", "up")}${formatKeymap("shared", "down")}`, desc: "Navigate tasks" },
	{
		key: `${formatKeymap("taskList", "focusList")}/${formatKeymap("taskList", "focusDetail")}`,
		desc: "Switch between list and details",
	},
	{ key: formatKeymap("list", "select"), desc: "Focus task details" },
	{ key: formatKeymap("taskList", "edit"), desc: "Edit task" },
	{ key: formatKeymap("taskList", "complete"), desc: "Complete task" },
	{ key: formatKeymap("taskList", "archive"), desc: "Archive task" },
	{ key: formatKeymap("taskList", "copy"), desc: "Yank (Copy) task ID" },
	{ key: formatKeymap("shared", "help"), desc: "Show this help menu" },
	{ key: formatKeymap("shared", "quit"), desc: "Quit / Close" },
];

export function getHelpShortcuts(
	context: HelpPopupContext = "board",
	options: { hasProjects?: boolean } = {},
): Shortcut[] {
	const shortcuts = context === "task-list" ? TASK_LIST_SHORTCUTS : BOARD_SHORTCUTS;
	const projectKey = formatKeymap(context === "task-list" ? "taskList" : "board", "filterProject");
	return options.hasProjects ? shortcuts : shortcuts.filter((shortcut) => shortcut.key !== projectKey);
}

/** Popup rows spent on borders, the top spacer and the help line, leaving one row per shortcut. */
const HELP_POPUP_CHROME_ROWS = 4;
const HELP_POPUP_WIDTH = 60;

function getHelpText(scrolls: boolean): string {
	const close = formatKeymap("shared", "cancel");
	return scrolls
		? ` {cyan-fg}[${formatKeymap("shared", "up")}${formatKeymap("shared", "down")}]{/} Scroll | {cyan-fg}[${close}]{/} Close Help`
		: ` {cyan-fg}[${close}]{/} Close Help`;
}

export function getHelpPopupHeight(shortcutCount: number, screenHeight: number): number {
	const boundedScreenHeight = Math.max(1, screenHeight);
	const preferredHeight = Math.max(5, Math.min(shortcutCount + HELP_POPUP_CHROME_ROWS, boundedScreenHeight - 1));
	return Math.min(boundedScreenHeight, preferredHeight);
}

export async function openHelpPopup(
	screen: ScreenInterface,
	context: HelpPopupContext = "board",
	options: { hasProjects?: boolean } = {},
): Promise<void> {
	return new Promise<void>((resolve) => {
		let settled = false;
		const shortcuts = getHelpShortcuts(context, options);
		let popupHeight = getHelpPopupHeight(shortcuts.length, screen.height);
		const { popup, close, reflow } = createPopupChrome({
			screen,
			title: "Keyboard Shortcuts",
			helpText: getHelpText(false),
			width: HELP_POPUP_WIDTH,
			height: popupHeight,
		});

		const content = shortcuts.map((s) => `{cyan-fg}[${s.key.padStart(5)}]{/} ${s.desc}`).join("\n");

		// Terminals too short for every shortcut keep the remaining rows reachable by scrolling.
		const contentBox = createScrollableViewport({
			parent: popup,
			top: 1,
			left: 2,
			right: 2,
			bottom: 1,
			content,
			tags: true,
		});
		const getMaxScrollOffset = () => {
			const visibleRows =
				typeof contentBox.height === "number" ? contentBox.height : popupHeight - HELP_POPUP_CHROME_ROWS;
			return Math.max(0, contentBox.getScrollHeight() - Math.max(1, visibleRows));
		};
		const applyLayout = () => {
			popupHeight = getHelpPopupHeight(shortcuts.length, screen.height);
			reflow(HELP_POPUP_WIDTH, popupHeight);
			// Rendering reparses the content at its new width, producing the exact number of
			// visual rows after tag removal and wrapping.
			screen.render();
			const maxOffset = getMaxScrollOffset();
			contentBox.childBase = Math.min(maxOffset, Math.max(0, contentBox.childBase));
			reflow(HELP_POPUP_WIDTH, popupHeight, getHelpText(maxOffset > 0));
			screen.render();
		};
		const onResize = () => {
			if (!settled) applyLayout();
		};

		const finish = () => {
			if (settled) return;
			settled = true;
			(
				screen as ScreenInterface & {
					removeListener(event: string, listener: (...args: unknown[]) => void): void;
				}
			).removeListener("resize", onResize);
			close();
			screen.render();
			resolve();
		};

		popup.key(keymapKeys("shared", "dismissHelp"), () => {
			finish();
			return false;
		});

		const scrollBy = (delta: number) => {
			const maxOffset = getMaxScrollOffset();
			contentBox.childBase = Math.min(maxOffset, Math.max(0, contentBox.childBase + delta));
			screen.render();
			return false;
		};
		popup.key(keymapKeys("shared", "up"), () => scrollBy(-1));
		popup.key(keymapKeys("shared", "down"), () => scrollBy(1));
		screen.on("resize", onResize);

		setImmediate(() => {
			if (settled) return;
			popup.focus();
			applyLayout();
		});
	});
}
