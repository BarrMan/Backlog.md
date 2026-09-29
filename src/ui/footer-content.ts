import { formatKeymap } from "./keymap.ts";

/**
 * Footer shortcut hints for the two task views.
 *
 * Letters are uppercase key indicators, not Shift chords: `[T]` means "press the T key".
 * The bound key is the lowercase letter (some actions also bind an explicit `S-` variant,
 * which is how Shift+letter is delivered). Filter letters are listed in the same order the
 * filter header renders its controls (status, type, project, priority, milestone, labels).
 * The project filter (`V`) is only bound when the project configures `projects:`, so it is
 * listed only when it is actually available, matching the help popup.
 */
function filterKeys(before: string[], projectKey: string, after: string[], hasProjects: boolean): string {
	return [...before, ...(hasProjects ? [projectKey] : []), ...after].join("/");
}

export function getBoardFooterContent(options: { hasProjects?: boolean } = {}): string {
	const keys = filterKeys(
		[formatKeymap("board", "filterType")],
		formatKeymap("board", "filterProject"),
		[
			formatKeymap("board", "filterPriority"),
			formatKeymap("board", "filterMilestone"),
			formatKeymap("board", "filterLabels"),
		],
		options.hasProjects ?? false,
	);
	return ` {cyan-fg}[${formatKeymap("board", "switchView")}]{/} View | {cyan-fg}[${formatKeymap("board", "workspace")}]{/} Workspace | {cyan-fg}[${formatKeymap("board", "create")}]{/} New | {cyan-fg}[${formatKeymap("board", "search")}]{/} Search | {cyan-fg}[${keys}]{/} Filter | {cyan-fg}[${formatKeymap("board", "navPrevious")}/${formatKeymap("board", "navNext")}/${formatKeymap("board", "navUp")}${formatKeymap("board", "navDown")}]{/} Nav | {cyan-fg}[${formatKeymap("board", "open")}]{/} Details | {cyan-fg}[${formatKeymap("board", "edit")}/${formatKeymap("board", "move")}/${formatKeymap("board", "complete")}/${formatKeymap("board", "archive")}]{/} Edit/Move/Comp/Arch | {cyan-fg}[${formatKeymap("board", "copy")}]{/} Yank | {cyan-fg}[${formatKeymap("shared", "help")}]{/} Help | {cyan-fg}[${formatKeymap("shared", "quitWithoutEscape")}]{/} Quit`;
}

export function getTaskListFooterContent(options: { hasProjects?: boolean } = {}): string {
	const keys = filterKeys(
		[formatKeymap("taskList", "filterStatus"), formatKeymap("taskList", "filterType")],
		formatKeymap("taskList", "filterProject"),
		[
			formatKeymap("taskList", "filterPriority"),
			formatKeymap("taskList", "filterMilestone"),
			formatKeymap("taskList", "filterLabels"),
		],
		options.hasProjects ?? false,
	);
	return ` {cyan-fg}[${formatKeymap("shared", "tab")}]{/} View | {cyan-fg}[${formatKeymap("shared", "search")}]{/} Search | {cyan-fg}[${keys}]{/} Filter | {cyan-fg}[${formatKeymap("shared", "up")}${formatKeymap("shared", "down")}]{/} Nav | {cyan-fg}[${formatKeymap("taskList", "edit")}/${formatKeymap("taskList", "complete")}/${formatKeymap("taskList", "archive")}]{/} Edit/Comp/Arch | {cyan-fg}[${formatKeymap("taskList", "copy")}]{/} Yank | {cyan-fg}[${formatKeymap("shared", "help")}]{/} Help | {cyan-fg}[${formatKeymap("shared", "quitWithoutEscape")}]{/} Quit`;
}

function visibleLength(value: string): number {
	return value.replace(/\{[^{}]+\}/g, "").length;
}

function joinSegments(segments: string[], leadingSpace: boolean): string {
	const joined = segments.join(" | ");
	return leadingSpace ? ` ${joined}` : joined;
}

export function formatFooterContent(
	content: string,
	terminalWidth: number,
): {
	content: string;
	height: 1 | 2;
} {
	const trimmed = content.trim();
	if (!trimmed) {
		return { content: "", height: 1 };
	}

	const segments = trimmed.split(/\s+\|\s+/).filter((segment) => segment.length > 0);
	if (segments.length <= 1) {
		return { content, height: 1 };
	}

	const availableWidth = Math.max(20, terminalWidth - 1);
	const leadingSpace = content.startsWith(" ");
	const singleLine = joinSegments(segments, leadingSpace);

	if (visibleLength(singleLine) <= availableWidth) {
		return { content: singleLine, height: 1 };
	}

	// Progressive wrapping: keep extending line 1 until adding the next section
	// would overflow available width, then place all remaining sections on line 2.
	let splitAt = 1;
	let firstLine = joinSegments(segments.slice(0, splitAt), leadingSpace);
	for (let index = 1; index < segments.length; index += 1) {
		const candidate = joinSegments(segments.slice(0, index + 1), leadingSpace);
		if (visibleLength(candidate) > availableWidth) {
			break;
		}
		splitAt = index + 1;
		firstLine = candidate;
	}

	if (splitAt >= segments.length) {
		return { content: firstLine, height: 1 };
	}

	const secondLine = joinSegments(segments.slice(splitAt), leadingSpace);
	return { content: `${firstLine}\n${secondLine}`, height: 2 };
}
