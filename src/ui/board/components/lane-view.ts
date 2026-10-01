import type { BoxInterface, ListInterface } from "neo-neo-bblessed";
import { box, list } from "neo-neo-bblessed";
import type { Task } from "../../../types/index.ts";
import type { Lane } from "../models/lane.ts";
import { buildRenderedTaskListItems, formatColumnLabel } from "../policies/column-policy.ts";

type MutableList = ListInterface & {
	selected?: number;
	setItem?: (index: number, content: string) => void;
};

export type LaneViewProps = {
	parent: BoxInterface;
	lane: Lane;
	left: number;
	width: number;
	laneCount: number;
	terminalWidth: number;
	movingTaskIds?: ReadonlySet<string>;
	isMoveActive: boolean;
	dateFormat?: string;
	projects: string[];
	isInteractionBlocked: () => boolean;
	isRendering: () => boolean;
	onSelect: (status: string, taskId: string | null) => void;
	onFocus: (status: string) => void;
	onRender: () => void;
};

/** A single board lane and its Blessed widgets. */
export class LaneView {
	readonly box: BoxInterface;
	readonly list: ListInterface;
	status: string;
	tasks: Task[];
	private props: LaneViewProps;
	private richItems: string[] = [];
	private plainItems: string[] = [];
	private highlightedIndex?: number;
	private programmaticSelection = false;

	constructor(props: LaneViewProps) {
		this.props = props;
		this.status = props.lane.status;
		this.tasks = [...props.lane.tasks];
		this.box = box({
			parent: props.parent,
			left: `${props.left}%`,
			top: 0,
			width: `${props.width}%`,
			height: "100%",
			border: { type: "line" },
			style: { border: { fg: "gray" } },
		});
		this.list = list({
			parent: this.box,
			top: 1,
			left: 1,
			width: "100%-4",
			height: "100%-3",
			keys: false,
			mouse: true,
			scrollable: true,
			tags: true,
			style: { selected: {} },
		});
		this.list.on("select item", (_item: unknown, selected: unknown) => this.handleSelection(selected));
		this.list.on("focus", () => this.handleFocus());
		this.render();
	}

	render(): void {
		this.box.left = `${this.props.left}%`;
		this.box.width = `${this.props.width}%`;
		this.box.setLabel?.(formatColumnLabel(this.status, this.tasks.length));
		const rendered = buildRenderedTaskListItems(
			this.tasks,
			this.props.movingTaskIds,
			Math.max(1, Math.floor(this.props.terminalWidth / this.props.laneCount) - 4),
			this.props.dateFormat,
			this.props.projects,
		);
		this.richItems = rendered.rich;
		this.plainItems = rendered.plain;
		this.highlightedIndex = undefined;
		this.list.setItems(rendered.rich);
	}

	update(props: LaneViewProps): void {
		this.props = props;
		this.status = props.lane.status;
		this.tasks = [...props.lane.tasks];
		this.render();
	}

	focus(): void {
		this.list.focus();
	}

	select(index: number, active: boolean): void {
		if (this.tasks.length === 0) {
			this.syncSelectionDisplay(false);
			return;
		}
		const nextIndex = Math.max(0, Math.min(index, this.tasks.length - 1));
		this.programmaticSelection = true;
		try {
			this.list.select(nextIndex);
		} finally {
			this.programmaticSelection = false;
		}
		(this.list as MutableList).selected = nextIndex;
		this.syncSelectionDisplay(active);
	}

	setActive(active: boolean): void {
		const listStyle = this.list.style as {
			selected?: { bg?: string; fg?: string; inverse?: boolean; bold?: boolean };
		};
		if (listStyle.selected) {
			listStyle.selected.inverse = active;
			listStyle.selected.bold = active && !this.props.isMoveActive;
			listStyle.selected.bg = active && this.props.isMoveActive ? "cyan" : undefined;
			listStyle.selected.fg = active && this.props.isMoveActive ? "black" : undefined;
		}
		const boxStyle = this.box.style as { border?: { fg?: string } };
		if (boxStyle.border) boxStyle.border.fg = active ? "yellow" : "gray";
		this.syncSelectionDisplay(active);
	}

	destroy(): void {
		this.box.destroy();
	}

	private selectedRowIndex(): number {
		const selected = (this.list as MutableList).selected ?? 0;
		return Math.max(0, Math.min(selected, Math.max(0, this.tasks.length - 1)));
	}

	private setItemContent(index: number, plain: boolean): void {
		if (index < 0 || index >= this.tasks.length) return;
		const content = plain ? this.plainItems[index] : this.richItems[index];
		if (content) (this.list as MutableList).setItem?.(index, content);
	}

	private syncSelectionDisplay(active: boolean): void {
		const highlightedIndex = active && this.tasks.length > 0 ? this.selectedRowIndex() : undefined;
		if (this.highlightedIndex !== undefined && this.highlightedIndex !== highlightedIndex) {
			this.setItemContent(this.highlightedIndex, false);
		}
		if (highlightedIndex !== undefined) this.setItemContent(highlightedIndex, true);
		this.highlightedIndex = highlightedIndex;
	}

	private handleSelection(selected: unknown): void {
		if (this.programmaticSelection || this.props.isRendering() || this.props.isInteractionBlocked()) return;
		(this.list as MutableList).selected = typeof selected === "number" ? selected : this.selectedRowIndex();
		this.props.onSelect(this.status, this.tasks[this.selectedRowIndex()]?.id ?? null);
		if (!this.props.isRendering()) this.props.onRender();
	}

	private handleFocus(): void {
		if (this.props.isInteractionBlocked()) return;
		this.props.onFocus(this.status);
		if (!this.props.isRendering()) this.props.onRender();
	}
}
