import { box, list, scrollablebox } from "neo-neo-bblessed";
import { adaptListRemoval } from "../list-removal-adapter.ts";
import { addScrollKeys, type createScreen } from "../tui.ts";

type Screen = ReturnType<typeof createScreen>;
type TaskListWidget = ReturnType<typeof list>;
type DetailsWidget = ReturnType<typeof scrollablebox> & {
	show(): void;
	hide(): void;
	getScroll(): number;
	setScroll(value: number): void;
};
type PlainBox = ReturnType<typeof box>;
type StatusRow = PlainBox & { hide(): void; show(): void };

export type TaskWidgets = {
	tree: TaskListWidget;
	details: DetailsWidget;
	detailsViewport: DetailsWidget;
	footer: PlainBox;
	statusRow: StatusRow;
	/** Recomputes widget geometry for the current screen size and  pane role. */
	layout(): void;
	destroy(): void;
};

export type TaskWidgetOptions = {
	screen: Screen;
	tasksOnly: boolean;
	detailsOnly: boolean;
	nativePane: boolean;
	detailsVisible(): boolean;
	filterHeight(): number;
};

/**
 * Builds the task list, details pane, footer, and status row for a workspace pane, together with
 * the layout rule that positions them. The active pane role decides what takes vertical space: the
 * tasks pane gives everything to the list, the details pane gives everything to  the details box,
 * and the combined pane splits the height when details are visible.
 */
export function createTaskWidgets(options: TaskWidgetOptions): TaskWidgets {
	const { screen, tasksOnly, detailsOnly, nativePane } = options;

	const tree = list({
		parent: screen,
		top: 0,
		left: 0,
		width: "100%",
		height: 1,
		border: "line",
		label: " Tasks ",
		keys: false,
		mouse: true,
		tags: true,
		style: { border: { fg: "gray" }, focus: { border: { fg: "yellow" } }, selected: { inverse: true, bold: true } },
	});
	adaptListRemoval(tree);

	const details = scrollablebox({
		parent: screen,
		top: 0,
		left: 0,
		width: "100%",
		height: 1,
		border: "line",
		label: " Details ",
		tags: true,
		scrollable: true,
		alwaysScroll: true,
		mouse: true,
		keys: true,
		vi: true,
		wrap: true,
		style: { border: { fg: "gray" } },
	}) as DetailsWidget;
	addScrollKeys(details, screen);

	const footer = box({ parent: screen, bottom: 0, left: 0, width: "100%", height: 1 });
	const statusRow = box({ parent: screen, bottom: 1, left: 0, width: "100%", height: 1 }) as StatusRow;
	statusRow.hide();

	const layout = () => {
		const top = tasksOnly || detailsOnly ? 0 : options.filterHeight();
		const available = Math.max(1, screen.height - top - (nativePane ? 0 : 2));
		const detailsVisible = options.detailsVisible();
		const treeHeight = tasksOnly
			? available
			: detailsOnly
				? 1
				: detailsVisible
					? Math.max(1, Math.floor(available / 2))
					: available;
		tree.top = top;
		tree.height = treeHeight;
		details.top = detailsOnly ? 0 : top + treeHeight;
		details.height = detailsOnly ? available : Math.max(1, available - treeHeight);
		if (!tasksOnly && (detailsOnly || detailsVisible)) details.show();
		else details.hide();
	};

	return {
		tree,
		details,
		detailsViewport: details,
		footer,
		statusRow,
		layout,
		destroy: () => {
			for (const widget of [tree, details, footer, statusRow]) widget.destroy();
		},
	};
}
