import type { BoxInterface, ListInterface } from "neo-neo-bblessed";
import { box, list } from "neo-neo-bblessed";
import type { Task } from "../../types/index.ts";
import { buildRenderedTaskListItems, type ColumnData, formatColumnLabel } from "./column-policy.ts";

type MutableList = ListInterface & {
	selected?: number;
	setItem?: (index: number, content: string) => void;
};

export type BoardColumnView = {
	status: string;
	tasks: Task[];
	list: ListInterface;
	box: BoxInterface;
	richItems: string[];
	plainItems: string[];
	highlightedIndex?: number;
};

type BoardColumnsOptions = {
	parent: BoxInterface;
	getTerminalWidth: () => number;
	getMovingTaskIds: () => string[] | undefined;
	isMoveActive: () => boolean;
	dateFormat?: string;
	projects: string[];
	isInteractionBlocked: () => boolean;
	isRendering: () => boolean;
	onBoardFocus: () => void;
	onRender: () => void;
};

export function createBoardColumns(options: BoardColumnsOptions) {
	const columns: BoardColumnView[] = [];
	const columnData: ColumnData[] = [];
	const selection = { currentColumnIndex: 0 };
	let programmaticSelection = false;

	const selectedRowIndex = (column: BoardColumnView): number => {
		const selected = (column.list as MutableList).selected ?? 0;
		return Math.max(0, Math.min(selected, Math.max(0, column.tasks.length - 1)));
	};
	const setItemContent = (column: BoardColumnView, index: number, plain: boolean) => {
		if (index < 0 || index >= column.tasks.length) return;
		const content = plain ? column.plainItems[index] : column.richItems[index];
		if (content) (column.list as MutableList).setItem?.(index, content);
	};
	const syncSelectionDisplay = (column: BoardColumnView | undefined, active: boolean) => {
		if (!column) return;
		const highlightedIndex = active && column.tasks.length > 0 ? selectedRowIndex(column) : undefined;
		if (column.highlightedIndex !== undefined && column.highlightedIndex !== highlightedIndex) {
			setItemContent(column, column.highlightedIndex, false);
		}
		if (highlightedIndex !== undefined) setItemContent(column, highlightedIndex, true);
		column.highlightedIndex = highlightedIndex;
	};
	const setActive = (column: BoardColumnView | undefined, active: boolean) => {
		if (!column) return;
		const listStyle = column.list.style as {
			selected?: { bg?: string; fg?: string; inverse?: boolean; bold?: boolean };
		};
		if (listStyle.selected) {
			listStyle.selected.inverse = active;
			listStyle.selected.bold = active && !options.isMoveActive();
			listStyle.selected.bg = active && options.isMoveActive() ? "cyan" : undefined;
			listStyle.selected.fg = active && options.isMoveActive() ? "black" : undefined;
		}
		const boxStyle = column.box.style as { border?: { fg?: string } };
		if (boxStyle.border) boxStyle.border.fg = active ? "yellow" : "gray";
		syncSelectionDisplay(column, active);
	};
	const selectRow = (column: BoardColumnView, index: number, active: boolean) => {
		if (column.tasks.length === 0) return syncSelectionDisplay(column, false);
		const nextIndex = Math.max(0, Math.min(index, column.tasks.length - 1));
		programmaticSelection = true;
		try {
			column.list.select(nextIndex);
		} finally {
			programmaticSelection = false;
		}
		(column.list as MutableList).selected = nextIndex;
		syncSelectionDisplay(column, active);
	};
	const formattedItems = (tasks: Task[]) =>
		buildRenderedTaskListItems(
			tasks,
			options.getMovingTaskIds() ? new Set(options.getMovingTaskIds()) : undefined,
			Math.max(1, Math.floor(options.getTerminalWidth() / Math.max(1, columnData.length)) - 4),
			options.dateFormat,
			options.projects,
		);
	const focus = (index: number, preferredRow?: number, activate = true) => {
		if (options.isInteractionBlocked() || index < 0 || index >= columns.length) return;
		const previous = columns[selection.currentColumnIndex];
		setActive(previous, false);
		selection.currentColumnIndex = index;
		const column = columns[selection.currentColumnIndex];
		if (!column) return;
		if (column.tasks.length > 0) {
			selectRow(column, preferredRow ?? Math.min(previous?.list.selected ?? 0, column.tasks.length - 1), activate);
		}
		if (activate) {
			column.list.focus();
			setActive(column, true);
			options.onBoardFocus();
		} else setActive(column, false);
		if (!options.isRendering()) options.onRender();
	};
	const restoreSelection = (taskId?: string) => {
		if (columns.length === 0) return;
		if (taskId) {
			for (const [index, column] of columns.entries()) {
				const taskIndex = column.tasks.findIndex((task) => task.id === taskId);
				if (taskIndex !== -1) return focus(index, taskIndex);
			}
		}
		focus(Math.min(columns.length - 1, Math.max(0, selection.currentColumnIndex)));
	};
	const rebuild = (data: ColumnData[], selectedTaskId?: string) => {
		for (const column of columns) column.box.destroy();
		columns.splice(0);
		columnData.splice(0, columnData.length, ...data);
		const widthPercent = Math.max(1, Math.floor(100 / Math.max(1, data.length)));
		data.forEach((entry, index) => {
			const left = index * widthPercent;
			const columnBox = box({
				parent: options.parent,
				left: `${left}%`,
				top: 0,
				width: index === data.length - 1 ? `${Math.max(0, 100 - left)}%` : `${widthPercent}%`,
				height: "100%",
				border: { type: "line" },
				style: { border: { fg: "gray" } },
				label: formatColumnLabel(entry.status, entry.tasks.length),
			});
			const taskList = list({
				parent: columnBox,
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
			const rendered = formattedItems(entry.tasks);
			taskList.setItems(rendered.rich);
			const column: BoardColumnView = {
				status: entry.status,
				tasks: entry.tasks,
				list: taskList,
				box: columnBox,
				richItems: rendered.rich,
				plainItems: rendered.plain,
			};
			columns.push(column);
			taskList.on("select item", (_item: unknown, selected: unknown) => {
				if (programmaticSelection || options.isRendering() || options.isInteractionBlocked()) return;
				if (selection.currentColumnIndex !== index) setActive(columns[selection.currentColumnIndex], false);
				selection.currentColumnIndex = index;
				(column.list as MutableList).selected = typeof selected === "number" ? selected : selectedRowIndex(column);
				setActive(column, true);
				options.onBoardFocus();
				if (!options.isRendering()) options.onRender();
			});
			taskList.on("focus", () => {
				if (options.isInteractionBlocked()) return;
				if (selection.currentColumnIndex !== index) setActive(columns[selection.currentColumnIndex], false);
				selection.currentColumnIndex = index;
				setActive(column, true);
				options.onBoardFocus();
				if (!options.isRendering()) options.onRender();
			});
		});
		restoreSelection(selectedTaskId);
	};
	const apply = (data: ColumnData[], selectedTaskId?: string) => {
		columnData.splice(0, columnData.length, ...data);
		data.forEach((entry, index) => {
			const column = columns[index];
			if (!column) return;
			column.status = entry.status;
			column.tasks = entry.tasks;
			const rendered = formattedItems(entry.tasks);
			column.richItems = rendered.rich;
			column.plainItems = rendered.plain;
			column.highlightedIndex = undefined;
			column.list.setItems(rendered.rich);
			column.box.setLabel?.(formatColumnLabel(entry.status, entry.tasks.length));
		});
		restoreSelection(selectedTaskId);
	};
	return {
		columns,
		data: columnData,
		selection,
		get selectedTaskId() {
			const column = columns[selection.currentColumnIndex];
			return column?.tasks[column.list.selected ?? 0]?.id;
		},
		selectRow,
		setActive,
		focus,
		restoreSelection,
		rebuild,
		apply,
	};
}
