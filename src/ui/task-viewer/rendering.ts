import { stdout as output } from "node:process";
import type { BoxInterface, LineInterface, ScreenInterface, ScrollableTextInterface } from "neo-neo-bblessed";
import { box, line, scrollabletext } from "neo-neo-bblessed";
import { type TaskCorpus, toTaskDetail } from "../../core/task-detail.ts";
import type { Task } from "../../types/index.ts";
import type { MilestoneFilterValueResolver } from "../../utils/milestone-filter.ts";
import type { BoundaryNavigationKey } from "../components/generic-list.ts";
import { keymapKeys } from "../keymap.ts";
import { addScrollKeys } from "../tui.ts";
import { generateDetailContent } from "./detail-content.ts";
import { shouldMoveFromDetailBoundaryToSearch } from "./navigation.ts";

type PaneFocus = "list" | "detail";
type DetailPaneFocus = "filters" | PaneFocus;

type DetailPaneConfiguration = {
	screen: ScreenInterface;
	getFocus: () => DetailPaneFocus;
	setFocus: (focus: DetailPaneFocus) => void;
	setActivePane: (pane: "list" | "detail" | "none") => void;
	updateHelpBar: () => void;
	focusTaskList: () => void;
	focusSearch: () => void;
	clearPendingSearchWrap: () => void;
};

type TaskViewerRenderingOptions = {
	screen: ScreenInterface;
	container: BoxInterface;
	getHeaderHeight: () => number;
	startupWarning?: string;
	screenTitle: string;
	projectName: string;
	dateFormat: string;
	configuredProjects: string[];
	resolveMilestoneLabel: MilestoneFilterValueResolver;
	getSelectedTask: () => Task;
	resolveDependencyCorpus: () => TaskCorpus;
	getNoResultsMessage: () => string | null;
	getFocus: () => DetailPaneFocus;
	setFocus: (focus: DetailPaneFocus) => void;
	focusTaskList: () => void;
	focusSearch: () => void;
	clearPendingSearchWrap: () => void;
	updateHelpBar: () => void;
};

export function createStartupWarningBar(parent: BoxInterface, message: string): BoxInterface {
	return box({
		parent,
		bottom: 1,
		left: 0,
		width: "100%",
		height: 1,
		tags: true,
		wrap: false,
		content: ` {yellow-fg}${message}{/}`,
	});
}

function configureTaskViewerDetailPane(boxInstance: ScrollableTextInterface, configuration: DetailPaneConfiguration) {
	const scrollable = boxInstance as unknown as {
		scroll?: (offset: number) => void;
		setScroll?: (offset: number) => void;
		setScrollPerc?: (perc: number) => void;
		getScroll?: () => number;
	};
	const pageAmount = () => {
		const height = typeof boxInstance.height === "number" ? boxInstance.height : 0;
		return height > 0 ? Math.max(1, height - 3) : 0;
	};
	const moveUpFromDetail = (key: BoundaryNavigationKey) => {
		if (!shouldMoveFromDetailBoundaryToSearch(scrollable.getScroll?.() ?? 0, key)) return true;
		configuration.clearPendingSearchWrap();
		configuration.focusSearch();
		return false;
	};
	const moveByPage = (direction: -1 | 1) => {
		const delta = pageAmount();
		if (delta > 0) {
			scrollable.scroll?.(direction * delta);
			configuration.screen.render();
		}
		return false;
	};

	boxInstance.key(keymapKeys("taskList", "detailUp"), () => moveUpFromDetail("arrow"));
	boxInstance.key(keymapKeys("taskList", "detailUpVim"), () => moveUpFromDetail("vim"));
	boxInstance.key(keymapKeys("taskList", "detailPageUp"), () => moveByPage(-1));
	boxInstance.key(keymapKeys("taskList", "detailPageDown"), () => moveByPage(1));
	boxInstance.key(keymapKeys("taskList", "detailFirst"), () => {
		scrollable.setScroll?.(0);
		configuration.screen.render();
		return false;
	});
	boxInstance.key(keymapKeys("taskList", "detailLast"), () => {
		scrollable.setScrollPerc?.(100);
		configuration.screen.render();
		return false;
	});
	boxInstance.on("focus", () => {
		configuration.setFocus("detail");
		configuration.setActivePane("detail");
		configuration.updateHelpBar();
		configuration.screen.render();
	});
	boxInstance.on("blur", () => {
		const currentFocus = configuration.getFocus();
		if (currentFocus !== "detail") {
			configuration.setActivePane(currentFocus === "list" ? "list" : "none");
			configuration.screen.render();
		}
	});
	boxInstance.key(keymapKeys("taskList", "focusList"), () => {
		configuration.focusTaskList();
		return false;
	});
	boxInstance.key(keymapKeys("taskList", "focusListEscape"), () => {
		configuration.focusTaskList();
		return false;
	});
	if (configuration.getFocus() === "detail") setImmediate(() => boxInstance.focus());
}

/** Owns task-viewer widget construction, pane layout, and detail rendering. */
export class TaskViewerRendering {
	readonly taskListPane: BoxInterface;
	readonly detailPane: BoxInterface;
	readonly helpBar: BoxInterface;
	private readonly warningBar: BoxInterface | null;
	private headerDetailBox: BoxInterface | undefined;
	private divider: LineInterface | undefined;
	private detailBox: ScrollableTextInterface | undefined;

	constructor(private readonly options: TaskViewerRenderingOptions) {
		this.taskListPane = box({
			parent: options.container,
			top: options.getHeaderHeight(),
			left: 0,
			width: "40%",
			height: `100%-${options.getHeaderHeight() + 1}`,
			border: { type: "line" },
			style: { border: { fg: "gray" } },
			label: "\u00A0Tasks (0)\u00A0",
		});
		this.detailPane = box({
			parent: options.container,
			top: options.getHeaderHeight(),
			left: "40%",
			right: 0,
			height: `100%-${options.getHeaderHeight() + 1}`,
			border: { type: "line" },
			style: { border: { fg: "gray" } },
			label: "\u00A0Details\u00A0",
		});
		this.helpBar = box({
			parent: options.container,
			bottom: 0,
			left: 0,
			width: "100%",
			height: 1,
			tags: true,
			wrap: true,
			content: "",
		});
		this.warningBar = options.startupWarning
			? createStartupWarningBar(options.container, options.startupWarning)
			: null;
	}

	get descriptionBox(): ScrollableTextInterface | undefined {
		return this.detailBox;
	}

	setActivePane(active: "list" | "detail" | "none") {
		const listBorder = this.taskListPane.style as { border?: { fg?: string } };
		const detailBorder = this.detailPane.style as { border?: { fg?: string } };
		if (listBorder.border) listBorder.border.fg = active === "list" ? "yellow" : "gray";
		if (detailBorder.border) detailBorder.border.fg = active === "detail" ? "yellow" : "gray";
	}

	syncPaneLayout() {
		const headerHeight = this.options.getHeaderHeight();
		const helpHeight = typeof this.helpBar.height === "number" ? this.helpBar.height : 1;
		const footerHeight = helpHeight + (this.warningBar ? 1 : 0);
		if (this.warningBar) this.warningBar.bottom = helpHeight;
		this.taskListPane.top = headerHeight;
		this.taskListPane.height = `100%-${headerHeight + footerHeight}`;
		this.detailPane.top = headerHeight;
		this.detailPane.height = `100%-${headerHeight + footerHeight}`;
	}

	setHelpBarContent(
		content: string,
		width: number,
		format: (content: string, width: number) => { content: string; height: number },
	) {
		const formatted = format(content, width);
		this.helpBar.height = formatted.height;
		this.helpBar.setContent(formatted.content);
		this.syncPaneLayout();
	}

	refreshDetailPane() {
		this.headerDetailBox?.destroy();
		this.divider?.destroy();
		this.detailBox?.destroy();
		const noResultsMessage = this.options.getNoResultsMessage();
		if (noResultsMessage) {
			this.options.screen.title = this.options.screenTitle;
			this.headerDetailBox = box({
				parent: this.detailPane,
				top: 0,
				left: 1,
				right: 1,
				height: "shrink",
				tags: true,
				wrap: true,
				padding: { left: 1, right: 1 },
				content: "{bold}No tasks to display{/bold}",
			});
			this.detailBox = scrollabletext({
				parent: this.detailPane,
				top: (typeof this.headerDetailBox.bottom === "number" ? this.headerDetailBox.bottom : 0) + 1,
				left: 1,
				right: 1,
				bottom: 1,
				keys: true,
				vi: true,
				mouse: true,
				tags: true,
				wrap: true,
				padding: { left: 1, right: 1 },
				content: noResultsMessage,
			});
			this.configureDetail(this.detailBox);
			this.options.screen.render();
			return;
		}
		const selected = this.options.getSelectedTask();
		this.options.screen.title = `Task ${selected.id} - ${selected.title} - ${this.options.projectName}`;
		const detail = generateDetailContent(toTaskDetail(selected, this.options.resolveDependencyCorpus()), {
			resolveMilestoneLabel: this.options.resolveMilestoneLabel,
			dateFormat: this.options.dateFormat,
			configuredProjects: this.options.configuredProjects,
		});
		const width = typeof this.detailPane.width === "number" ? this.detailPane.width : 60;
		const headerHeight = detail.headerContent.reduce(
			(count, header) => count + Math.max(1, Math.ceil(header.replace(/\{[^}]+\}/g, "").length / (width - 6))),
			0,
		);
		this.headerDetailBox = box({
			parent: this.detailPane,
			top: 0,
			left: 1,
			right: 1,
			height: headerHeight,
			tags: true,
			wrap: true,
			padding: { left: 1, right: 1 },
			content: detail.headerContent.join("\n"),
		});
		this.divider = line({
			parent: this.detailPane,
			top: headerHeight,
			left: 1,
			right: 1,
			orientation: "horizontal",
			style: { fg: "gray" },
		});
		this.detailBox = scrollabletext({
			parent: this.detailPane,
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
			content: detail.bodyContent.join("\n"),
			scrollbar: { ch: " ", inverse: true },
			style: { scrollbar: { bg: "gray" } },
		});
		this.configureDetail(this.detailBox);
	}

	private configureDetail(detailBox: ScrollableTextInterface) {
		configureTaskViewerDetailPane(detailBox, {
			screen: this.options.screen,
			getFocus: this.options.getFocus,
			setFocus: this.options.setFocus,
			setActivePane: (pane) => this.setActivePane(pane),
			updateHelpBar: this.options.updateHelpBar,
			focusTaskList: this.options.focusTaskList,
			focusSearch: this.options.focusSearch,
			clearPendingSearchWrap: this.options.clearPendingSearchWrap,
		});
	}
}

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
