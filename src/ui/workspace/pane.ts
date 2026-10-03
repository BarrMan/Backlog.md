import type { TmuxWorkspace } from "../../agent-workspace/tmux-workspace.ts";
import type { AgentSession, TaskSessions } from "../../agent-workspace/types.ts";
import { activeSessionOf, type WorkspaceStateService } from "../../agent-workspace/workspace-state.ts";
import type { Core } from "../../core/backlog.ts";
import { UnsupportedTaskFrontmatterSchemaError } from "../../markdown/parser.ts";
import type { Task } from "../../types/index.ts";
import { collectAvailableLabels } from "../../utils/label-filter.ts";
import { getPriorityOptions } from "../../utils/priority-config.ts";
import { getProjectValues } from "../../utils/project-config.ts";
import { applyTaskFilters, createTaskSearchIndex } from "../../utils/task-search.ts";
import { getTaskTypeValues } from "../../utils/task-type-config.ts";
import type { FilterState } from "../components/filter-header.ts";
import { createFilterHeader, type FilterControlId, type FilterHeader } from "../components/filter-header.ts";
import { openTaskComposer, type TaskComposerOptions } from "../components/task-composer.ts";
import { formatFooterContent } from "../footer-content.ts";
import { openTaskFilterPicker, taskFilterHeaderControls, taskFilterOptions } from "../task-filter-wiring.ts";
import { TASK_FIELD_LABELS } from "../task-labels.ts";
import type { buildTaskViewerMilestoneFilterModel } from "../task-viewer/controller.ts";
import { generateDetailContent } from "../task-viewer/detail-content.ts";
import { openAgentConfigEditor } from "./config-editor.ts";
import type { WorkspaceFieldEditor } from "./field-editor.ts";
import { createWorkspaceFieldEditor } from "./field-editor.ts";
import { getWorkspaceFooterContent, type WorkspaceMode as Mode, workspaceFooterContext } from "./footer.ts";
import {
	buildWorkspaceEntries,
	type DraftField,
	sessionLabel,
	taskWithWorkspaceDraft,
	type WorkspaceDraft,
	type WorkspaceEntry,
} from "./model.ts";
import type { WorkspaceQuittableHost, WorkspaceScreen } from "./native-regions.ts";
import { handleNavigationKey } from "./navigation-keys.ts";
import { reconciledWorkspaceSelection, workspaceRows } from "./reconciliation.ts";
import { createSessionActions } from "./session-actions.ts";
import { handleSessionViewKey } from "./session-view.ts";
import { createWorkspaceFilters, type SharedWorkspaceState, type WorkspaceViewState } from "./state.ts";
import { createTaskWidgets } from "./task-widgets.ts";

export type WorkspaceHost = Pick<TmuxWorkspace, "showBoard" | "showAgentSession" | "focusAgent" | "takeTaskRequest"> &
	Partial<
		Pick<
			TmuxWorkspace,
			| "detach"
			| "focusSearch"
			| "focusTasks"
			| "focusDetails"
			| "setDetailsVisible"
			| "resizeNavigation"
			| "resizeFooter"
			| "workspaceState"
			| "updateWorkspaceState"
			| "subscribeWorkspaceState"
		>
	> &
	WorkspaceQuittableHost;

type Config = Awaited<ReturnType<Core["filesystem"]["loadConfig"]>>;
type MilestoneModel = ReturnType<typeof buildTaskViewerMilestoneFilterModel>;

export type WorkspacePaneOptions = {
	core: Core;
	screen: WorkspaceScreen;
	host: WorkspaceHost;
	workspaceState: WorkspaceStateService;
	state: WorkspaceViewState;
	initialConfig: Config;
	milestoneModel: MilestoneModel;
	/** `workspace-tasks` and `workspace-details` are the native tmux panes; otherwise one window owns both. */
	region?: "workspace-tasks" | "workspace-details";
	taskComposer?: (options: TaskComposerOptions) => Promise<Task | null>;
};

const FIELDS: Array<[DraftField, string]> = [
	["title", TASK_FIELD_LABELS.TITLE],
	["description", TASK_FIELD_LABELS.DESCRIPTION],
	["acceptanceCriteria", TASK_FIELD_LABELS.ACCEPTANCE_CRITERIA],
	["implementationPlan", "Plan"],
	["implementationNotes", "Notes"],
	["finalSummary", TASK_FIELD_LABELS.FINAL_SUMMARY],
];

const DEFAULT_STATUSES = ["To Do", "In Progress", "Done"];

function workspaceErrorMessage(error: unknown): string {
	if (error instanceof UnsupportedTaskFrontmatterSchemaError) {
		const taskId = error.message.match(/^Task (.+?) uses unsupported task frontmatter schema/)?.[1];
		const repair = taskId && taskId !== "(missing id)" ? ` Run: backlog task migrate-legacy ${taskId}` : "";
		return `${error.message}${repair}`;
	}
	return error instanceof Error ? error.message : String(error);
}

function detailsText(
	task: Task,
	draft?: WorkspaceDraft,
	session?: AgentSession,
	handoff?: TaskSessions["handoff"],
): string {
	const { headerContent, bodyContent } = generateDetailContent(taskWithWorkspaceDraft(task, draft));
	return [
		` {bold}{blue-fg}${task.id}{/blue-fg}{/bold} - ${task.title}`,
		...headerContent.slice(1),
		"",
		`{bold}Session:{/bold} ${sessionLabel(session)}`,
		handoff?.error ? `{bold}Handoff:{/bold} {yellow-fg}${handoff.error}{/}` : "",
		"",
		...bodyContent,
	]
		.filter(Boolean)
		.join("\n");
}

type Entry = WorkspaceEntry;
type TaskEntry = Extract<Entry, { kind: "task" }>;

/**
 * One workspace pane: the task list, the details box, and the modes layered on top of them. The
 * controller only picks a region to mount; everything a pane does lives here, and the sibling
 * modules (`navigation-keys`, `session-view`, `session-actions`, `field-editor`) call back into
 * these methods rather than closing over shared state.
 */
export class WorkspacePane {
	readonly #core: Core;
	readonly #screen: WorkspaceScreen;
	readonly #host: WorkspaceHost;
	readonly #workspaceState: WorkspaceStateService;
	readonly #state: WorkspaceViewState;
	readonly #initialConfig: Config;
	readonly #milestoneModel: MilestoneModel;
	readonly #tasksOnly: boolean;
	readonly #detailsOnly: boolean;
	readonly #nativePane: boolean;
	readonly #taskComposer: WorkspacePaneOptions["taskComposer"];

	#widgets: ReturnType<typeof createTaskWidgets>;
	#filterHeader: FilterHeader;
	#fieldEditor: WorkspaceFieldEditor;
	#sessionActions: ReturnType<typeof createSessionActions>;
	#resolve: (result: "exit") => void = () => {};

	#mode: Mode = "navigation";
	#closed = false;
	/** Guards `reload` against re-entry; distinct from {@link #refreshRunning}, which guards the poll. */
	#busy = false;
	#selected = 0;
	#detailField = 0;
	#sessionAction = false;
	#statuses: string[];
	#availableLabels: string[];
	#filters: FilterState;
	#entries: Entry[] = [];
	#cachedTasks: Task[] = [];
	#cachedSearchIndex = createTaskSearchIndex([]);
	#selectedTask: Task | undefined;
	#taskSessions: TaskSessions | undefined;
	#historySession: AgentSession | undefined;
	#disposeConfig: () => void = () => {};
	#notificationTimer: ReturnType<typeof setTimeout> | undefined;
	#poll: ReturnType<typeof setInterval> | undefined;
	#unsubscribeState = async () => {};
	#refreshRunning = false;
	#filterFocused = false;
	#selectionGeneration = 0;
	#displayedAgent: { taskId?: string; sessionId?: string } | undefined;
	/** Serialises agent-terminal switching so tmux sees calls in the order the pane issued them. */
	#presentation: Promise<void> = Promise.resolve();

	constructor(options: WorkspacePaneOptions) {
		this.#core = options.core;
		this.#screen = options.screen;
		this.#host = options.host;
		this.#workspaceState = options.workspaceState;
		this.#state = options.state;
		this.#initialConfig = options.initialConfig;
		this.#milestoneModel = options.milestoneModel;
		this.#tasksOnly = options.region === "workspace-tasks";
		this.#detailsOnly = options.region === "workspace-details";
		this.#nativePane = this.#tasksOnly || this.#detailsOnly;
		this.#taskComposer = options.taskComposer;
		this.#statuses = options.initialConfig?.statuses ?? DEFAULT_STATUSES;
		this.#availableLabels = collectAvailableLabels([], options.initialConfig?.labels ?? []);
		this.#filters = options.state.filters;

		this.#widgets = createTaskWidgets({
			screen: options.screen,
			tasksOnly: this.#tasksOnly,
			detailsOnly: this.#detailsOnly,
			nativePane: this.#nativePane,
			detailsVisible: () => options.state.detailsVisible,
			filterHeight: () => this.#filterHeader.getHeight(),
		});
		this.#fieldEditor = this.#createFieldEditor(options);
		this.#sessionActions = this.#createSessionActions(options);
		this.#filterHeader = this.#createFilterHeader(options);
		this.#filterHeader.setFocusChangeHandler((focus) => {
			this.#filterFocused = focus !== null;
		});
		this.#filterHeader.setExitRequestHandler(() => {
			this.#filterFocused = false;
			this.#widgets.tree.focus();
		});
	}

	#createFieldEditor(options: WorkspacePaneOptions): WorkspaceFieldEditor {
		return createWorkspaceFieldEditor({
			screen: options.screen,
			core: options.core,
			drafts: options.state.drafts,
			selectedTask: () => this.#selectedTask,
			enterFieldMode: () => {
				this.#mode = "field";
			},
			exitFieldMode: () => this.#exitFieldMode(),
			editorBounds: () => ({ top: Number(this.#widgets.details.top), height: Number(this.#widgets.details.height) }),
			fieldLabel: (field) => FIELDS.find(([name]) => name === field)?.[1] ?? field,
			run: (action) => this.#run(action),
			notify: (message) => this.#tell(message),
			reload: (selectCurrent) => this.reload(selectCurrent),
			render: () => this.#render(),
		});
	}

	#createSessionActions(options: WorkspacePaneOptions): ReturnType<typeof createSessionActions> {
		return createSessionActions({
			workspaceState: options.workspaceState,
			details: this.#widgets.details,
			tree: this.#widgets.tree,
			mode: () => this.#mode,
			setMode: (next) => {
				this.#mode = next;
			},
			isClosed: () => this.#closed,
			selectionGeneration: () => this.#selectionGeneration,
			selectedTask: () => this.#selectedTask,
			setTaskSessions: (next) => {
				this.#taskSessions = next;
			},
			taskSessions: () => this.#taskSessions,
			historySession: () => this.#historySession,
			setHistorySession: (next) => {
				this.#historySession = next;
			},
			activateFooterContext: () => this.#activateFooterContext(),
			updateFooter: () => this.#updateFooter(),
			render: () => this.#render(),
			run: (action) => this.#run(action),
			detailsOnly: () => this.#detailsOnly,
			leaveToTasksPane: () => this.#leaveToTasksPane(),
		});
	}

	#createFilterHeader(options: WorkspacePaneOptions): FilterHeader {
		return createFilterHeader({
			parent: options.screen,
			statuses: this.#statuses,
			availableLabels: this.#availableLabels,
			availableMilestones: options.milestoneModel.availableMilestoneTitles,
			visibleFilters: taskFilterHeaderControls(getProjectValues(options.initialConfig)).filter((id) => id !== "search"),
			initialFilters: this.#filters,
			onFilterChange: (next) => this.#applyFilters(next),
			onFilterPickerOpen: (id) => this.#openFilterPicker(id as Exclude<FilterControlId, "search">),
		});
	}

	run(): Promise<"exit"> {
		return new Promise((resolve) => {
			this.#resolve = resolve;
			const screen = this.#screen;
			if (this.#tasksOnly || this.#detailsOnly) this.#filterHeader.hide();
			if (this.#nativePane) {
				(this.#widgets.footer as unknown as { hide(): void }).hide();
				this.#widgets.statusRow.hide();
			}
			if (this.#tasksOnly) this.#widgets.detailsViewport.hide();
			if (this.#detailsOnly) (this.#widgets.tree as unknown as { hide(): void }).hide();
			this.#widgets.layout();
			screen.on("keypress", (_character: unknown, raw: unknown) => {
				this.#activateFooterContext();
				this.#onKeypress(raw);
			});
			screen.on("resize", () => {
				this.#filterHeader.rebuild();
				this.#widgets.layout();
				this.#render();
			});
			screen.on("destroy", () => this.#close());
			this.#updateFooter();
			this.#run(async () => {
				await this.reload();
				if (this.#detailsOnly) this.#enterDetailsMode();
				else this.#widgets.tree.focus();
			});
			if (this.#host.subscribeWorkspaceState) {
				this.#run(async () => {
					const dispose = await this.#host.subscribeWorkspaceState?.<SharedWorkspaceState>((shared) =>
						this.#applySharedState(shared),
					);
					if (!dispose) return;
					if (this.#closed) await dispose();
					else this.#unsubscribeState = dispose;
				});
			}
			this.#poll = setInterval(() => this.#tick(), 2000);
		});
	}

	// ── shared plumbing ──────────────────────────────────────────────────────────

	#render(): void {
		if (!this.#closed) this.#screen.render();
	}

	#run(action: () => Promise<void>): void {
		void action().catch((error) => this.#tell(workspaceErrorMessage(error)));
	}

	#tell(message: string): void {
		if (this.#notificationTimer) clearTimeout(this.#notificationTimer);
		if (this.#nativePane) {
			void this.#host
				.updateWorkspaceState?.<SharedWorkspaceState>((shared) => ({ ...shared, footerMessage: message }))
				.catch(() => {});
			this.#notificationTimer = setTimeout(() => {
				void this.#host
					.updateWorkspaceState?.<SharedWorkspaceState>((shared) =>
						shared.footerMessage === message ? { ...shared, footerMessage: undefined } : shared,
					)
					.catch(() => {});
			}, 3000);
			return;
		}
		this.#widgets.statusRow.setContent(` ${message} `);
		this.#widgets.statusRow.show();
		this.#notificationTimer = setTimeout(() => {
			this.#widgets.statusRow.hide();
			this.#render();
		}, 3000);
		this.#render();
	}

	#queuePresentation(action: () => Promise<void>): Promise<void> {
		this.#presentation = this.#presentation.catch(() => {}).then(action);
		return this.#presentation;
	}

	async #touchDisplayedAgent(): Promise<void> {
		if (this.#displayedAgent?.taskId && this.#displayedAgent.sessionId)
			await this.#workspaceState.touchSession(this.#displayedAgent.taskId, this.#displayedAgent.sessionId);
	}

	showAgent(
		task: Task | undefined,
		session: AgentSession | undefined,
		generation = this.#selectionGeneration,
	): Promise<void> {
		return this.#queuePresentation(async () => {
			if (this.#closed || generation !== this.#selectionGeneration) return;
			const next = {
				taskId: task && session?.status === "running" ? task.id : undefined,
				sessionId: session?.status === "running" ? session.id : undefined,
			};
			await this.#host.showAgentSession(next.taskId, next.sessionId);
			this.#displayedAgent = next;
			if (next.taskId && next.sessionId) await this.#workspaceState.touchSession(next.taskId, next.sessionId);
		});
	}

	#active(): AgentSession | undefined {
		return this.#taskSessions ? activeSessionOf(this.#taskSessions) : undefined;
	}

	#focusedTask(): Task | undefined {
		const entry = this.#entries[this.#selected];
		return entry?.kind === "task" ? (entry as TaskEntry).task : undefined;
	}

	#isSessionMode(): boolean {
		return this.#mode === "history" || this.#mode === "output";
	}

	#leaveSessionMode(): void {
		if (this.#isSessionMode()) this.#mode = this.#detailsOnly ? "details" : "navigation";
	}

	#stale(taskId: string, generation: number): boolean {
		return this.#closed || generation !== this.#selectionGeneration || this.#focusedTask()?.id !== taskId;
	}

	// ── chrome ───────────────────────────────────────────────────────────────────

	#activateFooterContext(): void {
		if (!this.#nativePane) return;
		const footerContext = this.#detailsOnly ? workspaceFooterContext(this.#mode) : "tasks";
		void this.#host.updateWorkspaceState?.<SharedWorkspaceState>((shared) =>
			shared.footerContext === footerContext ? shared : { ...shared, footerContext },
		);
	}

	#updateFooter(): void {
		if (this.#nativePane) return;
		this.#widgets.footer.setContent(
			formatFooterContent(getWorkspaceFooterContent(workspaceFooterContext(this.#mode)), this.#screen.width).content,
		);
	}

	async #setSharedDetailsVisible(visible: boolean): Promise<void> {
		this.#state.detailsVisible = visible;
		await this.#host.updateWorkspaceState?.<SharedWorkspaceState>((shared) => ({ ...shared, detailsVisible: visible }));
		await this.#host.setDetailsVisible?.(visible);
	}

	#enterDetailsMode(): void {
		this.#mode = "details";
		this.#widgets.details.setLabel?.(" Details (active) ");
		this.#widgets.details.focus();
		this.#showDetails();
	}

	#exitFieldMode(): void {
		this.#mode = "details";
		this.#widgets.details.setLabel?.(" Details (active) ");
		this.#widgets.details.focus();
		this.#showDetails();
	}

	#showDetails(): void {
		if (this.#isSessionMode()) return;
		this.#widgets.details.setContent(
			this.#selectedTask
				? detailsText(
						this.#selectedTask,
						this.#state.drafts.get(this.#selectedTask.id),
						this.#active(),
						this.#taskSessions?.handoff,
					)
				: "No tasks match this filter.",
		);
		this.#updateFooter();
		this.#render();
	}

	#clearSelection(): void {
		++this.#selectionGeneration;
		this.#leaveSessionMode();
		this.#widgets.details.setLabel?.(" Details ");
		this.#selectedTask = undefined;
		this.#taskSessions = undefined;
		this.#historySession = undefined;
		this.#state.selectedTaskId = undefined;
		this.#widgets.details.setContent("No tasks match this filter.");
		this.#run(() => this.showAgent(undefined, undefined));
	}

	async #leaveToTasksPane(): Promise<void> {
		await this.#host.updateWorkspaceState?.<SharedWorkspaceState>((shared) => ({ ...shared, footerContext: "tasks" }));
		await this.#host.focusTasks?.();
	}

	// ── selection ────────────────────────────────────────────────────────────────

	async #selectTask(index: number, task: Task): Promise<void> {
		const unchanged = this.#selectedTask?.id === task.id;
		if (!unchanged && this.#selectedTask)
			this.#state.scrolls.set(this.#selectedTask.id, this.#widgets.detailsViewport.getScroll());
		this.#selected = index;
		this.#widgets.tree.select(index);
		this.#selectedTask = task;
		this.#state.selectedTaskId = task.id;
		void this.#host.updateWorkspaceState?.((shared: SharedWorkspaceState) => ({ ...shared, selectedTaskId: task.id }));
		const generation = unchanged ? this.#selectionGeneration : ++this.#selectionGeneration;
		if (!unchanged) {
			this.#leaveSessionMode();
			this.#widgets.details.setLabel?.(" Details ");
			this.#historySession = undefined;
			this.#taskSessions = undefined;
			await this.showAgent(undefined, undefined, generation);
		}
		this.#showDetails();
		const sessions = await this.#safeListRecoveredSessions(task.id);
		if (this.#closed || generation !== this.#selectionGeneration || this.#selectedTask?.id !== task.id) return;
		this.#taskSessions = sessions;
		if (!unchanged) this.#widgets.detailsViewport.setScroll(this.#state.scrolls.get(task.id) ?? 0);
		this.#showDetails();
		if (!this.#isSessionMode()) await this.showAgent(this.#selectedTask, this.#active(), generation);
	}

	async #select(index: number): Promise<void> {
		const entry = this.#entries[index];
		if (!entry) return;
		this.#selected = index;
		this.#widgets.tree.select(index);
		if (entry.kind === "header") {
			this.#clearSelection();
			this.#render();
		} else await this.#selectTask(index, entry.task);
	}

	async #toggleGroup(index: number): Promise<void> {
		const entry = this.#entries[index];
		if (entry?.kind !== "header") return;
		await this.#select(index);
		if (this.#state.collapsed.has(entry.status)) this.#state.collapsed.delete(entry.status);
		else this.#state.collapsed.add(entry.status);
		await this.reload(false);
	}

	async #safeListRecoveredSessions(taskId: string): Promise<TaskSessions> {
		try {
			return await this.#workspaceState.sessionState(taskId);
		} catch (error) {
			this.#tell(workspaceErrorMessage(error));
			return { taskId, sessions: [] };
		}
	}

	// ── data ─────────────────────────────────────────────────────────────────────

	#filteredTasks(): Task[] {
		return applyTaskFilters(
			this.#cachedTasks,
			taskFilterOptions(this.#filters, "any", this.#milestoneModel.resolveMilestoneLabel),
			this.#cachedSearchIndex,
		);
	}

	async reload(selectCurrent = true): Promise<void> {
		if (this.#busy || this.#closed) return;
		this.#busy = true;
		try {
			const config = await this.#core.filesystem.loadConfig();
			this.#statuses = config?.statuses ?? this.#statuses;
			const tasks = await this.#core.filesystem.listTasks();
			this.#cachedTasks = tasks;
			this.#cachedSearchIndex = createTaskSearchIndex(tasks);
			this.#availableLabels = collectAvailableLabels(tasks, this.#initialConfig?.labels ?? []);
			this.#rebuildEntries(selectCurrent);
			if (this.#selected >= 0 && selectCurrent) await this.#select(this.#selected);
			else if (this.#selected < 0) this.#clearSelection();
			else if (this.#selectedTask) await this.#reconcileSelectedTask();
			this.#render();
		} finally {
			this.#busy = false;
		}
	}

	/**
	 * The selection survived the reload, so refresh its sessions in place: pick the history row up
	 * again when the pane is showing history, re-render details otherwise, and leave the agent
	 * terminal pointing at the current task.
	 */
	async #reconcileSelectedTask(): Promise<void> {
		const current = this.#entries.find(
			(entry): entry is TaskEntry => entry.kind === "task" && entry.task.id === this.#selectedTask?.id,
		);
		if (!current) {
			this.#clearSelection();
			return;
		}
		const generation = this.#selectionGeneration;
		this.#selectedTask = current.task;
		const sessions = await this.#safeListRecoveredSessions(current.task.id);
		if (generation !== this.#selectionGeneration || this.#selectedTask?.id !== current.task.id) return;
		this.#taskSessions = sessions;
		if (this.#mode === "history") {
			this.#historySession =
				sessions.sessions.find((item) => item.id === this.#historySession?.id) ?? sessions.sessions.at(-1);
			this.#sessionActions.showHistoryRows();
		} else if (this.#mode !== "output") {
			this.#showDetails();
			await this.showAgent(this.#selectedTask, this.#active(), generation);
		}
	}

	/**
	 * Rebuilds the row list from the cached tasks and reconciles the selection against it.
	 * `preserve` keeps the current selection when its task is still visible; otherwise the
	 * reconciliation falls back to the remembered `selectedTaskId`.
	 */
	#rebuildEntries(preserve: boolean): void {
		const previous = this.#entries[this.#selected];
		this.#entries = buildWorkspaceEntries(this.#filteredTasks(), this.#statuses, "All", this.#state.collapsed);
		this.#widgets.tree.setItems(workspaceRows(this.#entries));
		this.#selected = reconciledWorkspaceSelection(this.#entries, previous, this.#state.selectedTaskId, !preserve);
	}

	#applyCachedFilters(): void {
		this.#rebuildEntries(true);
		this.#render();
		if (this.#selected < 0) this.#clearSelection();
		else void this.#select(this.#selected);
	}

	#applyFilters(next: FilterState): void {
		this.#filters = next;
		this.#state.filters = next;
		this.#filterHeader.setFilters(next);
		void this.#host.updateWorkspaceState?.<SharedWorkspaceState>((shared) => ({ ...shared, filters: next }));
		this.#run(() => this.reload());
	}

	#openFilterPicker(id: Exclude<FilterControlId, "search">): void {
		this.#run(async () => {
			const next = await openTaskFilterPicker({
				screen: this.#screen,
				filterId: id,
				filters: this.#filters,
				statuses: this.#statuses,
				taskTypes: getTaskTypeValues(this.#initialConfig),
				projects: getProjectValues(this.#initialConfig),
				priorityOptions: getPriorityOptions(this.#initialConfig),
				labels: this.#availableLabels,
				milestones: this.#milestoneModel.availableMilestoneTitles,
			});
			if (!next) return;
			this.#filters = next;
			this.#state.filters = next;
			this.#filterHeader.setFilters(next);
			await this.reload();
		});
	}

	#applySharedState(shared: SharedWorkspaceState): void {
		if (shared.filters && JSON.stringify(shared.filters) !== JSON.stringify(this.#filters)) {
			this.#filters = shared.filters;
			this.#state.filters = this.#filters;
			this.#filterHeader.setFilters(this.#filters);
			this.#applyCachedFilters();
		}
		if (this.#detailsOnly && shared.selectedTaskId !== this.#state.selectedTaskId) {
			const index = this.#entries.findIndex(
				(entry) => entry.kind === "task" && entry.task.id === shared.selectedTaskId,
			);
			if (index >= 0) void this.#select(index);
			else this.#clearSelection();
		}
	}

	async #selectRequestedTask(taskId: string): Promise<void> {
		this.#filters = createWorkspaceFilters();
		this.#state.filters = this.#filters;
		this.#state.collapsed.clear();
		this.#filterHeader.setFilters(this.#filters);
		await this.reload(false);
		const index = this.#entries.findIndex((entry) => entry.kind === "task" && entry.task.id === taskId);
		if (index >= 0) await this.#select(index);
		else this.#tell(`Requested task ${taskId} is unavailable.`);
	}

	#tick(): void {
		this.#run(async () => {
			if (
				this.#refreshRunning ||
				this.#closed ||
				this.#mode === "field" ||
				this.#mode === "config" ||
				this.#mode === "composer"
			)
				return;
			this.#refreshRunning = true;
			try {
				const requested = this.#detailsOnly ? undefined : await this.#host.takeTaskRequest();
				if (requested) await this.#selectRequestedTask(requested);
				else await this.reload(false);
			} finally {
				this.#refreshRunning = false;
			}
		});
	}

	// ── commands ─────────────────────────────────────────────────────────────────

	#startOrShow(): void {
		const task = this.#focusedTask();
		if (!task || this.#sessionAction) return;
		const generation = this.#selectionGeneration;
		this.#sessionAction = true;
		this.#run(async () => {
			try {
				let session = this.#active();
				if (!session) {
					({ activeSession: session, sessions: this.#taskSessions } = await this.#workspaceState.startSession(task.id));
					if (this.#stale(task.id, generation)) return;
					this.#taskSessions = await this.#workspaceState.listSessions(task.id);
					if (this.#stale(task.id, generation)) return;
					session = this.#active() ?? session;
					this.#showDetails();
				}
				await this.showAgent(task, session, generation);
				if (this.#stale(task.id, generation)) return;
				await this.#host.focusAgent(true);
			} finally {
				this.#sessionAction = false;
			}
		});
	}

	#openConfig(): void {
		if (!this.#selectedTask) return;
		this.#mode = "config";
		this.#disposeConfig = openAgentConfigEditor({
			screen: this.#screen,
			core: this.#core,
			task: this.#selectedTask,
			run: (action) => this.#run(action),
			onClose: () => {
				this.#mode = "navigation";
				this.#widgets.tree.focus();
				this.#showDetails();
			},
			onSaved: (savedScope) => this.#tell(`Saved ${savedScope} preset.`),
		});
	}

	#startComposer(): void {
		this.#mode = "composer";
		this.#run(async () => {
			try {
				const created = await (this.#taskComposer ?? openTaskComposer)({
					screen: this.#screen,
					statuses: this.#statuses,
					types: getTaskTypeValues(this.#initialConfig),
					priorities: getPriorityOptions(this.#initialConfig).map((item) => item.value),
					projects: getProjectValues(this.#initialConfig),
					persist: async (input) =>
						(
							await this.#core.createTaskFromInput(
								input,
								(await this.#core.filesystem.loadConfig())?.autoCommit ?? false,
							)
						).task,
				});
				if (created) {
					this.#state.selectedTaskId = created.id;
					await this.reload();
				}
			} finally {
				this.#mode = "navigation";
				this.#widgets.tree.focus();
				this.#render();
			}
		});
	}

	// ── input ────────────────────────────────────────────────────────────────────

	#onKeypress(raw: unknown): void {
		if (this.#mode === "field" || this.#mode === "config" || this.#mode === "composer") return;
		if (this.#filterFocused) return;
		const key = raw as Parameters<typeof handleSessionViewKey>[0]["key"];
		if (this.#mode === "details" || this.#isSessionMode()) this.#onSessionViewKey(key);
		else this.#onNavigationKey(key);
	}

	#onSessionViewKey(key: Parameters<typeof handleSessionViewKey>[0]["key"]): void {
		handleSessionViewKey({
			key,
			mode: this.#mode as "details" | "history" | "output",
			setMode: (next) => {
				this.#mode = next;
			},
			details: this.#widgets.details,
			detailsViewport: this.#widgets.detailsViewport,
			tree: this.#widgets.tree,
			workspaceState: this.#workspaceState,
			isClosed: () => this.#closed,
			selectedTask: this.#selectedTask,
			historySession: this.#historySession,
			setHistorySession: (next) => {
				this.#historySession = next;
			},
			taskSessions: this.#taskSessions,
			run: (action) => this.#run(action),
			render: () => this.#render(),
			updateFooter: () => this.#updateFooter(),
			activateFooterContext: () => this.#activateFooterContext(),
			showDetails: () => this.#showDetails(),
			showHistory: () => this.#sessionActions.showHistory(),
			showHistoryRows: () => this.#sessionActions.showHistoryRows(),
			openCurrentField: () => this.#fieldEditor.openField(FIELDS[this.#detailField]?.[0] ?? "description"),
			cycleDetailField: (delta) => {
				this.#detailField = (this.#detailField + delta + FIELDS.length) % FIELDS.length;
			},
			leaveDetails: () => this.#sessionActions.leaveDetails(),
			showAgent: (task, session) => this.showAgent(task, session),
			focusAgent: (focused) => this.#host.focusAgent(focused),
		});
	}

	#onNavigationKey(key: Parameters<typeof handleNavigationKey>[0]["key"]): void {
		handleNavigationKey({
			key,
			host: this.#host,
			workspaceState: this.#workspaceState,
			state: this.#state,
			entries: this.#entries,
			selected: this.#selected,
			tasksOnly: this.#tasksOnly,
			run: (action) => this.#run(action),
			focusedTaskId: () => this.#focusedTask()?.id,
			select: (index) => this.#select(index),
			toggleGroup: (index) => this.#toggleGroup(index),
			startOrShow: () => this.#startOrShow(),
			startComposer: () => this.#startComposer(),
			openConfig: () => this.#openConfig(),
			touchDisplayedAgent: () => this.#touchDisplayedAgent(),
			leaveFilterHeader: () => this.#filterHeader.setExitRequestHandler(() => this.#widgets.tree.focus()),
			setSharedDetailsVisible: (visible) => this.#setSharedDetailsVisible(visible),
			showDetails: () => {
				this.#mode = "details";
				this.#widgets.details.setLabel?.(" Details (active) ");
				this.#widgets.details.focus();
			},
			details: this.#widgets.details,
			layout: () => this.#widgets.layout(),
			updateFooter: () => this.#updateFooter(),
			render: () => this.#render(),
		});
	}

	// ── teardown ─────────────────────────────────────────────────────────────────

	#close(): void {
		if (this.#closed) return;
		this.#closed = true;
		if (this.#poll) clearInterval(this.#poll);
		void this.#unsubscribeState();
		if (this.#notificationTimer) clearTimeout(this.#notificationTimer);
		this.#disposeConfig();
		this.#fieldEditor.closeField();
		this.#filterHeader.destroy();
		this.#widgets.destroy();
		this.#screen.destroy();
		this.#resolve("exit");
	}
}
