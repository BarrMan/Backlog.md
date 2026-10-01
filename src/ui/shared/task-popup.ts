import { stdout as output } from "node:process";
import type { BoxInterface, ScreenInterface, ScrollableTextInterface } from "neo-neo-bblessed";
import { box, line, scrollabletext } from "neo-neo-bblessed";
import type { Task } from "../../types/index.ts";
import { keymapKeys } from "../keymap.ts";
import { generateDetailContent } from "../task-viewer/detail-content.ts";
import { addScrollKeys } from "../tui.ts";

export async function createTaskPopup(
	screen: ScreenInterface,
	task: Task,
	resolveMilestoneLabel?: (milestone: string) => string,
	dateFormat?: string,
	configuredProjects?: string[],
): Promise<{
	background: BoxInterface;
	popup: BoxInterface;
	contentArea: ScrollableTextInterface;
	close: () => void;
} | null> {
	if (output.isTTY === false) return null;
	const popup = box({
		parent: screen,
		top: "center",
		left: "center",
		width: "85%",
		height: "80%",
		border: "line",
		style: { border: { fg: "gray" } },
		keys: true,
		tags: true,
		autoPadding: true,
	});
	const background = box({
		parent: screen,
		top: Number(popup.top ?? 0) - 1,
		left: Number(popup.left ?? 0) - 2,
		width: Number(popup.width ?? 0) + 4,
		height: Number(popup.height ?? 0) + 2,
		style: { bg: "black" },
	});
	popup.setFront?.();
	const { headerContent, bodyContent } = generateDetailContent(task, {
		resolveMilestoneLabel,
		dateFormat,
		configuredProjects,
	});
	const availableWidth = (typeof popup.width === "number" ? popup.width : 80) - 6;
	const headerHeight = headerContent.reduce(
		(count, header) => count + Math.max(1, Math.ceil(header.replace(/\{[^}]+\}/g, "").length / availableWidth)),
		0,
	);
	box({
		parent: popup,
		top: 0,
		left: 1,
		right: 1,
		height: headerHeight,
		tags: true,
		wrap: true,
		padding: { left: 1, right: 1 },
		content: headerContent.join("\n"),
	});
	line({ parent: popup, top: headerHeight, left: 1, right: 1, orientation: "horizontal", style: { fg: "gray" } });
	box({
		parent: popup,
		content: ` ${keymapKeys("shared", "escape")[0]} `,
		top: -1,
		right: 1,
		width: 5,
		height: 1,
		style: { inverse: true, bold: true },
	});
	const contentArea = scrollabletext({
		parent: popup,
		top: headerHeight + 1,
		left: 1,
		right: 1,
		bottom: 1,
		keys: true,
		vi: true,
		mouse: true,
		tags: true,
		wrap: true,
		padding: { left: 1, right: 1 },
		content: bodyContent.join("\n"),
		scrollbar: { ch: " ", inverse: true },
		style: { scrollbar: { bg: "gray" } },
	});
	addScrollKeys(contentArea, screen);
	const close = () => {
		popup.destroy();
		background.destroy();
		screen.render();
	};
	popup.key(keymapKeys("shared", "quit"), () => {
		close();
		return false;
	});
	contentArea.on("focus", () => {
		const style = popup.style as { border?: { fg?: string } };
		style.border = { ...(style.border ?? {}), fg: "yellow" };
		screen.render();
	});
	contentArea.on("blur", () => {
		const style = popup.style as { border?: { fg?: string } };
		style.border = { ...(style.border ?? {}), fg: "gray" };
		screen.render();
	});
	contentArea.key(keymapKeys("shared", "escape"), () => {
		close();
		return false;
	});
	setImmediate(() => contentArea.focus());
	return { background, popup, contentArea, close };
}
