import type { BoxInterface } from "neo-neo-bblessed";
import type { Board } from "./board.ts";
import type { Lane } from "./lane.ts";
import { LaneView, type LaneViewProps } from "./lane-view.ts";
import { getMoveSetIds } from "./move-policy.ts";

export type BoardViewProps = Omit<
	LaneViewProps,
	| "parent"
	| "lane"
	| "left"
	| "width"
	| "laneCount"
	| "terminalWidth"
	| "movingTaskIds"
	| "isMoveActive"
	| "onSelect"
	| "onFocus"
> & {
	board: Board;
	getTerminalWidth: () => number;
	onBoardFocus: () => void;
};

/** Composes lane widgets from the Board's current projection. */
export class BoardView {
	private views: LaneView[] = [];

	constructor(
		private readonly parent: BoxInterface,
		private props: BoardViewProps,
	) {}

	get lanes(): readonly LaneView[] {
		return this.views;
	}

	get selectedTaskId(): string | undefined {
		return this.props.board.selectedTask?.id;
	}

	get selectedLaneIndex(): number {
		const selectedStatus = this.props.board.selectedLane?.status;
		return Math.max(
			0,
			this.views.findIndex((view) => view.status === selectedStatus),
		);
	}

	render(): void {
		const lanes = this.props.board.lanes;
		if (this.needsRebuild(lanes.map((lane) => lane.status))) {
			for (const view of this.views) view.destroy();
			this.views = lanes.map((lane, index) => new LaneView(this.laneProps(lane, index, lanes.length)));
		} else {
			lanes.forEach((lane, index) => {
				this.views[index]?.update(this.laneProps(lane, index, lanes.length));
			});
		}
		this.reconcileFocus();
	}

	update(props: Partial<BoardViewProps>): void {
		this.props = { ...this.props, ...props };
		this.render();
	}

	focus(index: number, preferredRow?: number, active = true): void {
		if (this.props.isInteractionBlocked()) return;
		const view = this.views[index];
		if (!view) return;
		const task = view.tasks[Math.max(0, Math.min(preferredRow ?? 0, view.tasks.length - 1))];
		this.props.board.select(view.status, task?.id ?? null);
		this.reconcileFocus(active);
		if (active) {
			view.focus();
			this.props.onBoardFocus();
		}
		if (!this.props.isRendering()) this.props.onRender();
	}

	select(index: number, row: number, active = true): void {
		this.focus(index, row, active);
	}

	destroy(): void {
		for (const view of this.views) view.destroy();
		this.views = [];
	}

	private laneProps(lane: Lane, index: number, count: number): LaneViewProps {
		const width = Math.max(1, Math.floor(100 / Math.max(1, count)));
		const left = index * width;
		const move = this.props.board.move;
		return {
			parent: this.parent,
			lane,
			left,
			width: index === count - 1 ? Math.max(0, 100 - left) : width,
			laneCount: count,
			terminalWidth: this.props.getTerminalWidth(),
			movingTaskIds: move ? new Set(getMoveSetIds(move)) : undefined,
			isMoveActive: Boolean(move),
			dateFormat: this.props.dateFormat,
			projects: this.props.projects,
			isInteractionBlocked: this.props.isInteractionBlocked,
			isRendering: this.props.isRendering,
			onSelect: (status, taskId) => this.selectTask(status, taskId),
			onFocus: (status) => this.focusLane(status),
			onRender: this.props.onRender,
		};
	}

	private needsRebuild(statuses: string[]): boolean {
		return this.views.length !== statuses.length || this.views.some((view, index) => view.status !== statuses[index]);
	}

	private reconcileFocus(active = true): void {
		const selectedStatus = this.props.board.selectedLane?.status;
		const selectedIndex = this.views.findIndex((view) => view.status === selectedStatus);
		const view = this.views[selectedIndex === -1 ? 0 : selectedIndex];
		if (!view) return;
		if (selectedIndex === -1) this.props.board.select(view.status);
		const row = view.tasks.findIndex((task) => task.id === this.props.board.selectedTask?.id);
		view.select(row === -1 ? 0 : row, active);
		for (const candidate of this.views) {
			if (candidate !== view) candidate.setActive(false);
		}
		view.setActive(active);
	}

	private selectTask(status: string, taskId: string | null): void {
		this.props.board.select(status, taskId);
		this.reconcileFocus();
		this.props.onBoardFocus();
	}

	private focusLane(status: string): void {
		const view = this.views.find((candidate) => candidate.status === status);
		if (!view) return;
		this.props.board.select(status, view.tasks[view.list.selected ?? 0]?.id ?? null);
		this.reconcileFocus();
		this.props.onBoardFocus();
	}
}
