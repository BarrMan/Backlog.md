import type { ScreenInterface } from "neo-neo-bblessed";
import type { Task } from "../../types/index.ts";
import { copyToClipboard } from "../../utils/clipboard.ts";
import { keymapKeys } from "../keymap.ts";
import { resolveListBoundaryNavigation, resolveSearchExitTargetIndex } from "../task-viewer/controller.ts";
import type { BoardActions } from "./board-actions.ts";
import type { BoardDialogs } from "./components/board-dialogs.ts";
import type { BoardView } from "./components/board-view.ts";
import type { FilterBar } from "./components/filter-bar.ts";
import type { Footer } from "./components/footer.ts";
import type { BoardTaskPopup } from "./components/task-popup.ts";
import type { Board } from "./models/board.ts";

type BoardInteractionOptions = {
	screen: ScreenInterface;
	board: Board;
	actions: BoardActions;
	view: BoardView;
	filters: FilterBar;
	footer: Footer;
	dialogs: BoardDialogs;
	popup: BoardTaskPopup;
	onRender: () => void;
	onClose: (handoff?: () => Promise<unknown>) => Promise<void>;
	onTaskSelect?: (task: Task) => void;
	onTabPress?: () => Promise<void>;
	onWorkspacePress?: () => Promise<void>;
	onSwitchView?: () => Promise<void>;
};

/** Focus coordinator and keyboard owner; Board remains the state authority. */
export class BoardInteraction {
	private focus: "board" | "filters" = "board";
	private pendingSearchWrap: "to-first" | "to-last" | null = null;
	private readonly bindings: Array<{ keys: string[]; handler: () => void }> = [];

	constructor(private readonly options: BoardInteractionOptions) {}

	get footerFocus(): "board" | "filters" {
		return this.focus;
	}

	attach(): void {
		this.bindKey(keymapKeys("board", "search"), this.focusSearch.bind(this));
		this.bindKey(keymapKeys("board", "create"), this.create.bind(this));
		this.bindKey(keymapKeys("board", "filterPriority"), () => this.openFilter("priority"));
		this.bindKey(keymapKeys("board", "filterType"), () => this.openFilter("type"));
		this.bindKey(keymapKeys("board", "filterProject"), () => this.openFilter("project"));
		this.bindKey(keymapKeys("board", "filterLabels"), () => this.openFilter("labels"));
		this.bindKey(keymapKeys("board", "filterMilestone"), () => this.openFilter("milestone"));
		this.bindKey(keymapKeys("board", "navPrevious"), () => this.horizontal(-1));
		this.bindKey(keymapKeys("board", "navNext"), () => this.horizontal(1));
		this.bindKey(keymapKeys("board", "navUp"), () => this.vertical("up", "arrow"));
		this.bindKey(keymapKeys("board", "navUpVim"), () => this.vertical("up", "vim"));
		this.bindKey(keymapKeys("board", "navDown"), () => this.vertical("down", "arrow"));
		this.bindKey(keymapKeys("board", "navDownVim"), () => this.vertical("down", "vim"));
		this.bindKey(keymapKeys("board", "pageUp"), () => this.jump("pageUp"));
		this.bindKey(keymapKeys("board", "pageDown"), () => this.jump("pageDown"));
		this.bindKey(keymapKeys("board", "first"), () => this.jump("first"));
		this.bindKey(keymapKeys("board", "last"), () => this.jump("last"));
		this.bindKey(keymapKeys("board", "open"), this.open.bind(this));
		this.bindKey(keymapKeys("board", "edit"), () => this.taskAction("edit"));
		this.bindKey(keymapKeys("board", "moveHighlightUp"), () => this.moveHighlight("up"));
		this.bindKey(keymapKeys("board", "moveHighlightDown"), () => this.moveHighlight("down"));
		this.bindKey(keymapKeys("board", "move"), this.move.bind(this));
		this.bindKey(keymapKeys("board", "recruit"), this.recruit.bind(this));
		this.bindKey(keymapKeys("board", "switchView"), this.switchView.bind(this));
		this.bindKey(keymapKeys("board", "workspace"), this.workspace.bind(this));
		this.bindKey(keymapKeys("shared", "help"), this.help.bind(this));
		this.bindKey(keymapKeys("board", "copy"), this.copy.bind(this));
		this.bindKey(keymapKeys("board", "complete"), () => this.taskAction("complete"));
		this.bindKey(keymapKeys("board", "archive"), () => this.taskAction("archive"));
		this.bindKey(keymapKeys("board", "toggleHideEmpty"), this.toggleHideEmpty.bind(this));
		this.bindKey(keymapKeys("shared", "quitWithoutEscape"), () => this.options.onClose());
		this.bindKey(keymapKeys("shared", "escape"), this.escape.bind(this));
	}

	detach(): void {
		for (const { keys, handler } of this.bindings) {
			this.options.screen.unkey(keys, handler);
		}

		this.bindings.length = 0;
	}

	isBlocked(): boolean {
		return this.options.popup.isOpen || this.options.filters.isPickerOpen || this.options.dialogs.isOpen;
	}

	focusBoard(): void {
		this.focus = "board";
		this.options.filters.setBorderColor("cyan");
		this.options.onRender();
	}

	focusFilters(): void {
		this.focus = "filters";
		this.options.onRender();
	}

	restoreFocus(id?: string): void {
		const { view } = this.options;
		const index = id
			? view.lanes.findIndex((lane) => lane.tasks.some((task) => task.id === id))
			: view.selectedLaneIndex;
		view.focus(
			Math.max(0, index),
			id ? view.lanes[Math.max(0, index)]?.tasks.findIndex((task) => task.id === id) : undefined,
		);
	}

	exitFilters(direction: "up" | "down" | "escape"): void {
		const lane = this.options.board.selectedLane;
		const target = resolveSearchExitTargetIndex(
			direction,
			this.pendingSearchWrap,
			lane?.tasks.length ?? 0,
			lane?.selectedIndex,
		);
		this.pendingSearchWrap = null;
		this.focus = "board";
		this.restoreFocus();
		if (target !== undefined) {
			this.options.view.focus(this.options.view.selectedLaneIndex, target);
		}
		this.options.onRender();
	}

	private focusSearch(): void {
		if (this.isBlocked()) {
			return;
		}

		this.pendingSearchWrap = null;
		this.options.filters.focus("search");
	}

	private openFilter(id: "priority" | "type" | "project" | "labels" | "milestone"): void {
		if (this.isBlocked()) {
			return;
		}

		this.options.filters.open(id);
	}

	private horizontal(step: -1 | 1): void {
		if (this.isBlocked() || this.focus === "filters") {
			return;
		}

		if (this.options.board.move) {
			this.options.board.moveToAdjacentLane(step === -1 ? "previous" : "next");
		} else {
			this.options.view.focus(this.options.view.selectedLaneIndex + step);
		}
		this.options.onRender();
	}

	private vertical(direction: "up" | "down", key: "arrow" | "vim"): void {
		if (this.isBlocked() || this.focus === "filters") {
			return;
		}

		const { board, view, filters } = this.options;
		if (board.move) {
			if (board.moveInsertion(direction)) {
				this.options.onRender();
			}
			return;
		}
		const lane = board.selectedLane;
		if (!lane) {
			return;
		}
		const boundary = resolveListBoundaryNavigation(direction, lane.selectedIndex, lane.tasks.length, key);
		if (boundary === "search") {
			this.pendingSearchWrap = lane.tasks.length ? (direction === "up" ? "to-last" : "to-first") : null;
			filters.focus("search");
		} else if (boundary !== "stay") {
			view.focus(view.selectedLaneIndex, lane.selectedIndex + (direction === "up" ? -1 : 1));
		}
		this.options.onRender();
	}

	private jump(command: "pageUp" | "pageDown" | "first" | "last"): void {
		if (this.isBlocked() || this.focus === "filters") {
			return;
		}

		const { board, view } = this.options;
		const lane = board.selectedLane;
		const laneView = view.lanes[view.selectedLaneIndex];
		if (board.move || !lane || !laneView || lane.tasks.length === 0) {
			return;
		}
		const page = typeof laneView.list.height === "number" ? Math.max(1, laneView.list.height - 1) : 5;
		const index =
			command === "first"
				? 0
				: command === "last"
					? lane.tasks.length - 1
					: Math.max(0, Math.min(lane.tasks.length - 1, lane.selectedIndex + (command === "pageUp" ? -page : page)));
		view.focus(view.selectedLaneIndex, index);
		this.options.onRender();
	}
	private async open(): Promise<void> {
		if (this.isBlocked() || this.focus === "filters") {
			return;
		}

		if (this.options.board.move) {
			return this.confirmMove();
		}

		const task = this.options.board.selectedTask;
		if (task) {
			await this.options.popup.open(task);
		}
	}

	private async taskAction(action: "edit" | "complete" | "archive"): Promise<void> {
		if (this.isBlocked()) {
			return;
		}

		const task = this.options.board.selectedTask;
		if (this.focus === "board" && !this.options.board.move && task) {
			await this.options.popup[action](task);
		}
	}

	private async copy(): Promise<void> {
		if (this.isBlocked()) {
			return;
		}

		const task = this.options.board.selectedTask;
		if (this.focus === "board" && task) {
			this.options.footer.showTransient(
				(await copyToClipboard(task.id))
					? ` {green-fg}Copied ${task.id} to clipboard{/}`
					: " {red-fg}Failed to copy to clipboard{/}",
			);
		}
	}

	private moveHighlight(direction: "up" | "down"): void {
		if (this.isBlocked() || this.focus === "filters") {
			return;
		}

		if (this.options.board.walkRecruitHighlight(direction)) {
			this.options.onRender();
		}
	}

	private move(): void | Promise<void> {
		if (this.focus === "filters" || this.isBlocked()) {
			return;
		}

		return this.options.board.move ? this.confirmMove() : this.beginMove();
	}

	private recruit(): void {
		if (this.focus === "filters" || this.isBlocked() || !this.options.board.move) {
			return;
		}

		const { board, footer } = this.options;
		const result = board.toggleRecruit();
		if (result === "unavailable") {
			footer.showTransient(" {yellow-fg}No task to select here.{/}");
		}
		if (result === "branched") {
			footer.showTransient(" {red-fg}Cannot move task from another branch.{/}");
		}
		if (result === "selected" || result === "deselected") {
			this.options.onRender();
		}
	}

	private beginMove(): void {
		const result = this.options.board.beginMove();
		if (result === "blocked") {
			this.options.footer.showTransient(" {yellow-fg}Clear filters before moving tasks.{/}");
		}
		if (result === "branched") {
			this.options.footer.showTransient(
				` {red-fg}Cannot move task from branch "${this.options.board.selectedTask?.branch}".{/}`,
			);
		}
		if (result === "entered") {
			this.options.onRender();
		}
	}

	private async confirmMove(): Promise<void> {
		const pending = this.options.actions.confirmMove();
		this.options.onRender();
		const feedback = await pending;
		this.options.onRender();
		if (feedback.status === "partial") {
			this.options.footer.showTransient(
				` {red-fg}Could not move ${feedback.failures.length} of the selected tasks — ${feedback.failures.map((failure) => `${failure.taskId}: ${failure.reason}`).join("; ")}{/}`,
				6000,
			);
		}
	}

	private async create(): Promise<void> {
		if (this.isBlocked() || this.focus !== "board" || this.options.board.move) {
			return;
		}

		await this.options.dialogs.openComposer();
	}

	private async toggleHideEmpty(): Promise<void> {
		const { board, actions, footer } = this.options;
		if (this.isBlocked() || this.focus === "filters" || board.move || board.isWritePending) {
			return;
		}
		const next = !board.hideEmptyColumns;
		const pending = actions.setHideEmptyColumns(next);
		this.options.onRender();
		const result = await pending;
		this.options.onRender();
		if (result.status === "failed") {
			footer.showTransient(` {red-fg}Error saving hide empty columns setting: ${result.error.message}{/}`);
		}
		if (result.status === "saved") {
			footer.showTransient(next ? " {green-fg}Hiding empty columns{/}" : " {green-fg}Showing empty columns{/}");
		}
	}

	private async help(): Promise<void> {
		if (!this.isBlocked() && !this.options.board.move) {
			await this.options.dialogs.openHelp();
		}
	}

	private async switchView(): Promise<void> {
		if (this.isBlocked() || this.focus === "filters") {
			return;
		}
		const task = this.options.board.selectedTask;
		if (task) {
			this.options.onTaskSelect?.(task);
		}
		if (this.options.onTabPress) {
			return this.options.onClose(this.options.onTabPress);
		}
		if (this.options.onSwitchView) {
			return this.options.onClose(this.options.onSwitchView);
		}
	}

	private async workspace(): Promise<void> {
		if (!this.isBlocked() && this.focus === "board" && !this.options.board.move && this.options.onWorkspacePress) {
			await this.options.onClose(this.options.onWorkspacePress);
		}
	}

	private async escape(): Promise<void> {
		const { board, popup, filters, view } = this.options;
		if (popup.isOpen || this.options.dialogs.isOpen || filters.isPickerOpen) {
			return;
		}
		if (board.move) {
			if (board.cancelMove()) {
				view.destroy();
				this.options.onRender();
			}
			return;
		}
		if (this.focus === "filters") {
			this.focus = "board";
			this.restoreFocus();
			this.options.onRender();
			return;
		}
		await this.options.onClose();
	}

	private bindKey(keys: string[], action: () => void | Promise<void>): void {
		const handler = (): void => {
			void Promise.resolve(action()).catch((error: unknown) => this.showError(error));
		};

		this.options.screen.key(keys, handler);
		this.bindings.push({ keys, handler });
	}

	private showError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		this.options.footer.showTransient(` {red-fg}Error: ${message}{/}`);
	}
}
