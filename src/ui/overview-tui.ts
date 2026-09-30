import { box } from "neo-neo-bblessed";
import type { TaskStatistics } from "../core/statistics.ts";
import { formatKeymap, keymapKeys } from "./keymap.ts";
import {
	overviewActivityContent,
	overviewHealthContent,
	overviewPriorityContent,
	overviewStatusContent,
} from "./overview-content.ts";
import { createScreen, formatTuiTitle } from "./tui.ts";

/**
 * Render the project overview in an interactive TUI
 */
export async function renderOverviewTui(statistics: TaskStatistics, projectName: string): Promise<void> {
	// If not in TTY, fall back to plain text output
	if (!process.stdout.isTTY) {
		renderPlainTextOverview(statistics, projectName);
		return;
	}

	return new Promise<void>((resolve) => {
		const screen = createScreen({ title: formatTuiTitle("Overview", projectName) });
		const content = {
			status: overviewStatusContent(statistics, true),
			priority: overviewPriorityContent(statistics, true),
			activity: overviewActivityContent(statistics, true),
			health: overviewHealthContent(statistics, true),
		};

		// Main container
		const container = box({
			parent: screen,
			width: "100%",
			height: "100%",
		});

		// Title
		box({
			parent: container,
			top: 0,
			left: "center",
			width: "shrink",
			height: 3,
			content: `{center}{bold}${projectName} - Project Overview{/bold}{/center}`,
			tags: true,
			style: {},
		});

		// Status Overview Section (Top Left)
		const statusBox = box({
			parent: container,
			top: 3,
			left: 0,
			width: "50%",
			height: "40%",
			border: { type: "line" },
			label: " Status Overview ",
			style: {
				border: { fg: "gray" },
			},
			tags: true,
			scrollable: true,
			alwaysScroll: true,
			keys: true,
			vi: true,
			mouse: true,
		});

		statusBox.setContent(content.status);

		// Priority Breakdown Section (Top Right)
		const priorityBox = box({
			parent: container,
			top: 3,
			left: "50%",
			width: "50%",
			height: "40%",
			border: { type: "line" },
			label: " Priority Breakdown ",
			style: {
				border: { fg: "gray" },
			},
			tags: true,
			scrollable: true,
			alwaysScroll: true,
			keys: true,
			vi: true,
			mouse: true,
		});

		priorityBox.setContent(content.priority);

		// Recent Activity Section (Bottom Left)
		const activityBox = box({
			parent: container,
			top: "43%",
			left: 0,
			width: "50%",
			height: "28%",
			border: { type: "line" },
			label: " Recent Activity ",
			style: {
				border: { fg: "gray" },
			},
			tags: true,
			scrollable: true,
			alwaysScroll: true,
			keys: true,
			vi: true,
			mouse: true,
		});

		activityBox.setContent(content.activity);

		// Project Health Section (Bottom Right)
		const healthBox = box({
			parent: container,
			top: "43%",
			left: "50%",
			width: "50%",
			height: "28%",
			border: { type: "line" },
			label: " Project Health ",
			style: {
				border: { fg: "gray" },
			},
			tags: true,
			scrollable: true,
			alwaysScroll: true,
			keys: true,
			vi: true,
			mouse: true,
		});

		healthBox.setContent(content.health);

		// Instructions at bottom
		box({
			parent: container,
			bottom: 0,
			left: 0,
			width: "100%",
			height: 3,
			content: `{center}Press ${formatKeymap("shared", "quit")} to exit{/center}`,
			tags: true,
			style: {
				fg: "gray",
			},
		});

		// Focus on status box for scrolling
		statusBox.focus();

		// Exit handlers
		screen.key(keymapKeys("shared", "quit"), () => {
			screen.destroy();
			resolve();
		});

		screen.render();
	});
}

/**
 * Render plain text overview for non-TTY environments
 */
function renderPlainTextOverview(statistics: TaskStatistics, projectName: string): void {
	const sections = [
		["Status Overview", overviewStatusContent(statistics, false)],
		["Priority Breakdown", overviewPriorityContent(statistics, false)],
		["Recent Activity", overviewActivityContent(statistics, false)],
		["Project Health", overviewHealthContent(statistics, false)],
	] as const;
	console.log(`\n${projectName} - Project Overview\n${"=".repeat(40)}\n`);
	for (const [title, content] of sections) console.log(`${title}:\n${content}\n`);
	console.log("");
}
