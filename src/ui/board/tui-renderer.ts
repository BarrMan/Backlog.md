import type { ScreenInterface } from "neo-neo-bblessed";
import { type BoardLayout, generateKanbanBoardWithMetadata, generateMilestoneGroupedBoard } from "../../board.ts";
import { type Core, createRuntimeCore } from "../../core/backlog.ts";
import type { Milestone, Task, TaskCreateInput } from "../../types/index.ts";
import { openTaskComposer, type TaskComposerOptions } from "../components/task-composer.ts";
import { BoardActions } from "./board-actions.ts";
import { BoardInteraction } from "./board-interaction.ts";
import { BoardDialogs } from "./components/board-dialogs.ts";
import { BoardView } from "./components/board-view.ts";
import { FilterBar } from "./components/filter-bar.ts";
import { Footer } from "./components/footer.ts";
import { BoardTaskPopup } from "./components/task-popup.ts";
import { type BoardSessionConfigurationOptions, normalizeBoardSessionConfiguration } from "./configuration.ts";
import { Board } from "./models/board.ts";
import { areBoardTaskCollectionsEqual } from "./policies/navigation.ts";
import { type BoardScreenSession, createBoardScreenSession, removeBoardScreenListener } from "./screen.ts";

export type BoardTuiOptions = {
	core?: Core;
	viewSwitcher?: import("../view-switcher.ts").ViewSwitcher;
	onTaskSelect?: (task: Task) => void;
	onTabPress?: () => Promise<void>;
	onWorkspacePress?: () => Promise<void>;
	subscribeUpdates?: (update: (tasks: Task[], statuses: string[]) => void) => void;
	filters?: BoardSessionConfigurationOptions["filters"];
	availableLabels?: string[];
	availableMilestones?: string[];
	priorities?: string[];
	types?: string[];
	projects?: string[];
	onFilterChange?: (filters: import("./configuration.ts").BoardSharedFilters) => void;
	milestoneMode?: boolean;
	milestoneEntities?: Milestone[];
	startupWarning?: string;
	dateFormat?: string;
	hideEmptyColumns?: boolean;
	projectName?: string;
	createTask?: (input: TaskCreateInput) => Promise<Task>;
	screen?: ScreenInterface;
	preserveScreen?: boolean;
	onReady?: () => void;
	taskComposer?: (options: TaskComposerOptions) => Promise<Task | null>;
};

/** Interactive board composition. Board retains all task, selection, and move state. */
export class TUIRenderer {
	private readonly configuration;
	private readonly board: Board;
	private readonly actions: BoardActions;
	private fallbackCore: Core | null = null;
	private session: BoardScreenSession | null = null;
	private view: BoardView | null = null;
	private filters: FilterBar | null = null;
	private footer: Footer | null = null;
	private popup: BoardTaskPopup | null = null;
	private dialogs: BoardDialogs | null = null;
	private interaction: BoardInteraction | null = null;
	private resolve: (() => void) | null = null;
	private closeListener: (() => void) | null = null;
	private rendering = false;
	private disposed = false;
	private closing: Promise<void> | null = null;

	constructor(
		private readonly initialTasks: Task[],
		private readonly statuses: string[],
		_layout: BoardLayout,
		_maxColumnWidth: number,
		private readonly options?: BoardTuiOptions,
	) {
		this.configuration = normalizeBoardSessionConfiguration(initialTasks, statuses, options);
		this.board = new Board({
			tasks: initialTasks,
			statuses,
			filters: this.configuration.sharedFilters,
			taskTypes: this.configuration.configuredTaskTypes,
			projects: this.configuration.configuredProjects,
			resolveMilestoneLabel: this.configuration.resolveMilestoneLabel,
			hideEmptyColumns: this.configuration.hideEmptyColumns,
		});
		this.actions = new BoardActions(this.board, () => this.getCore());
	}

	async run(): Promise<void> {
		if (!process.stdout.isTTY) {
			this.renderText();
			return;
		}
		if (this.statuses.length === 0) {
			console.log("No tasks available for the Kanban board.");
			return;
		}
		try {
			await new Promise<void>((resolve) => {
				this.resolve = resolve;
				this.initialize();
			});
		} finally {
			await this.dispose();
		}
	}

	private initialize(): void {
		this.session = createBoardScreenSession(
			this.options?.screen,
			this.options?.preserveScreen,
			this.options?.projectName,
		);
		const { screen, container, boardArea } = this.session;
		this.footer = new Footer({ screen, onHeightChange: () => this.layout() });
		this.filters = new FilterBar({
			parent: container,
			screen,
			board: this.board,
			taskTypes: this.configuration.configuredTaskTypes,
			projects: this.configuration.configuredProjects,
			priorityOptions: this.configuration.priorityOptions,
			labels: this.configuration.configuredLabels,
			milestones: this.configuration.availableMilestones,
			onChange: (filters) => {
				this.options?.onFilterChange?.(filters);
				this.render();
			},
			onFocus: () => this.interaction?.focusFilters(),
			onExit: (direction) => this.interaction?.exitFilters(direction),
		});
		this.view = new BoardView(boardArea, {
			board: this.board,
			getTerminalWidth: () => (typeof screen.width === "number" ? screen.width : 80),
			dateFormat: this.options?.dateFormat,
			projects: this.configuration.configuredProjects,
			isInteractionBlocked: () => this.interaction?.isBlocked() ?? true,
			isRendering: () => this.rendering,
			onBoardFocus: () => this.interaction?.focusBoard(),
			onRender: () => screen.render(),
		});
		this.dialogs = new BoardDialogs({
			screen,
			board: this.board,
			footer: this.footer,
			composer: this.options?.taskComposer ?? openTaskComposer,
			composerOptions: {
				statuses: this.board.statusesSnapshot,
				types: this.options?.types,
				priorities: this.options?.priorities,
				projects: this.options?.projects,
				persist: (input) => this.options?.createTask?.(input) ?? this.actions.createTask(input),
			},
			hasProjects: this.configuration.configuredProjects.length > 0,
			onRender: () => this.render(),
			onRestoreFocus: (id) => this.interaction?.restoreFocus(id),
		});
		this.popup = new BoardTaskPopup({
			screen,
			getCore: () => this.getCore(),
			getTasks: () => this.board.tasksSnapshot,
			updateTasks: (tasks) => this.update(tasks, []),
			removeTask: (id) => this.board.update(this.board.tasksSnapshot.filter((task) => task.id !== id)),
			resolveMilestoneLabel: this.configuration.resolveMilestoneLabel,
			dateFormat: this.options?.dateFormat,
			projects: this.configuration.configuredProjects,
			runWithModalGuard: (work) => this.dialogs?.run(work) ?? work(),
			isModalOpen: () => this.dialogs?.isOpen ?? false,
			showFooter: (message, duration) => this.footer?.showTransient(message, duration),
			renderView: () => this.render(),
			restoreColumnFocus: (id) => this.interaction?.restoreFocus(id),
			onClosed: () => undefined,
		});
		this.closeListener = this.dialogs.onClosed(() => this.popup?.onModalClosed());
		const onSwitchView = this.options?.viewSwitcher
			? async () => {
					await this.options?.viewSwitcher?.switchView();
				}
			: undefined;
		this.interaction = new BoardInteraction({
			screen,
			board: this.board,
			actions: this.actions,
			view: this.view,
			filters: this.filters,
			footer: this.footer,
			dialogs: this.dialogs,
			popup: this.popup,
			onRender: () => this.render(),
			onClose: (handoff) => this.close(handoff),
			onTaskSelect: this.options?.onTaskSelect,
			onTabPress: this.options?.onTabPress,
			onWorkspacePress: this.options?.onWorkspacePress,
			onSwitchView,
		});
		this.interaction.attach();
		screen.on("resize", this.resize);
		this.options?.subscribeUpdates?.((tasks, statuses) => this.update(tasks, statuses));
		this.render();
		this.view.focus(0, 0);
		if (this.options?.startupWarning) {
			this.footer.showTransient(` {yellow-fg}${this.options.startupWarning}{/}`, 15000);
		}
		screen.render();
		this.options?.onReady?.();
	}

	private render(): void {
		if (
			this.disposed ||
			!this.view ||
			!this.filters ||
			!this.footer ||
			!this.session ||
			!this.dialogs ||
			!this.interaction
		) {
			return;
		}
		this.rendering = true;
		try {
			this.filters.render({ modalOpen: this.dialogs.isOpen });
			this.view.render();
			this.footer.render({
				focus: this.interaction.footerFocus,
				filterFocus: this.filters.currentFocus,
				isMoveActive: Boolean(this.board.move),
				hasActiveFilters: this.board.filter.active,
				hasProjects: this.configuration.configuredProjects.length > 0,
			});
			this.layout();
		} finally {
			this.rendering = false;
		}
		this.session.screen.render();
	}
	private layout(): void {
		if (!this.session) {
			return;
		}

		const height = this.filters?.height ?? 0;
		this.session.boardArea.top = height;
		this.session.boardArea.height = `100%-${height + (this.footer?.height ?? 1)}`;
	}

	private resize = (): void => {
		this.filters?.rebuild();
		this.render();
	};
	private update(tasks: Task[], statuses: string[]): void {
		if (
			this.disposed ||
			(areBoardTaskCollectionsEqual(this.board.tasksSnapshot, tasks) &&
				(statuses.length === 0 || statuses.every((status, index) => status === this.board.statusesSnapshot[index])))
		) {
			return;
		}
		this.board.update(tasks, statuses.length ? statuses : this.board.statusesSnapshot);
		this.refreshFilterChoices(tasks);
		if (this.dialogs?.defersUpdates) {
			this.dialogs.noteUpdate();
			return;
		}
		this.render();
		if (this.popup?.isOpen) {
			void this.popup.sync();
		}
	}

	private refreshFilterChoices(tasks: readonly Task[]): void {
		const labels = new Set(this.configuration.configuredLabels);
		const milestones = new Set(this.configuration.availableMilestones);
		for (const task of tasks) {
			for (const label of task.labels) labels.add(label);
			if (task.milestone) milestones.add(task.milestone);
		}
		this.filters?.refreshChoices([...labels], [...milestones]);
	}
	private async getCore(): Promise<Core> {
		if (this.options?.core) {
			return this.options.core;
		}
		if (!this.fallbackCore) {
			this.fallbackCore = await createRuntimeCore();
		}
		return this.fallbackCore;
	}

	private renderText(): void {
		const visible = this.options?.hideEmptyColumns ? this.board.lanes.map((lane) => lane.status) : this.statuses;
		const name = this.options?.projectName?.trim() || "Project";
		if (this.options?.milestoneMode) {
			console.log(
				generateMilestoneGroupedBoard(this.initialTasks, visible, this.options.milestoneEntities ?? [], name),
			);
			return;
		}
		console.log(generateKanbanBoardWithMetadata(this.initialTasks, visible, name));
	}
	private close(handoff?: () => Promise<unknown>): Promise<void> {
		if (!this.closing) {
			this.closing = (async () => {
				await this.dialogs?.settle();
				await this.actions.settle();
				await this.dispose();
				await handoff?.();
				this.resolve?.();
			})();
		}
		return this.closing;
	}

	private async dispose(): Promise<void> {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		const session = this.session;
		if (!session) {
			return;
		}
		removeBoardScreenListener(session.screen, "resize", this.resize);
		this.interaction?.detach();
		this.closeListener?.();
		this.popup?.close();
		this.filters?.destroy();
		this.footer?.destroy();
		this.view?.destroy();
		session.container.destroy();
		if (session.ownsScreen) {
			session.screen.destroy();
		}
		this.session = null;
	}
}
