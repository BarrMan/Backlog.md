import { box, list, scrollablebox, textarea } from "neo-neo-bblessed";
import { getEditableAgentConfiguration, updateAgentConfiguration } from "../../agent-workspace/config.ts";
import { AgentSessionService } from "../../agent-workspace/sessions.ts";
import { TmuxWorkspace } from "../../agent-workspace/tmux-workspace.ts";
import type {
	AgentConfigScope,
	AgentConfiguration,
	AgentPreset,
	AgentSession,
	TaskSessions,
} from "../../agent-workspace/types.ts";
import type { Core } from "../../core/backlog.ts";
import type { Task, TaskUpdateInput } from "../../types/index.ts";
import { collectAvailableLabels } from "../../utils/label-filter.ts";
import { getPriorityOptions } from "../../utils/priority-config.ts";
import { getProjectValues } from "../../utils/project-config.ts";
import { applyTaskFilters, createTaskSearchIndex } from "../../utils/task-search.ts";
import { getTaskTypeValues } from "../../utils/task-type-config.ts";
import { parsePresetEnvironment, updatePresetConfiguration } from "../agent-workspace-config-editor.ts";
import {
	createFilterHeader,
	type FilterControlId,
	type FilterHeader,
	type FilterState,
} from "../components/filter-header.ts";
import { FooterSearch } from "../components/footer-search.ts";
import { openTaskComposer, type TaskComposerOptions } from "../components/task-composer.ts";
import { formatFooterContent } from "../footer-content.ts";
import { formatKeymap, keymapKeys, matchesKey } from "../keymap.ts";
import { openTaskFilterPicker, taskFilterHeaderControls, taskFilterOptions } from "../task-filter-wiring.ts";
import { TASK_FIELD_LABELS } from "../task-labels.ts";
import { buildTaskViewerMilestoneFilterModel } from "../task-viewer/controller.ts";
import { generateDetailContent } from "../task-viewer/detail-content.ts";
import { addScrollKeys, createScreen, formatTuiTitle } from "../tui.ts";
import {
	buildWorkspaceEntries,
	changedTaskFields,
	createWorkspaceDraft,
	type DraftField,
	parseAcceptanceCriteria,
	taskWithWorkspaceDraft,
	type WorkspaceDraft,
	type WorkspaceEntry,
} from "./model.ts";
import { reconciledWorkspaceSelection, workspaceRows } from "./reconciliation.ts";

type Mode = "navigation" | "details" | "field" | "history" | "config" | "composer";
type WorkspaceHost = Pick<TmuxWorkspace, "showBoard" | "showAgent" | "focusAgent" | "takeTaskRequest" | "detach"> &
	Partial<
		Pick<
			TmuxWorkspace,
			"focusSearch" | "focusTasks" | "resizeNavigation" | "resizeFooter" | "workspaceState" | "updateWorkspaceState"
		>
	>;
type EditableWidget = ReturnType<typeof textarea> & {
	cancel?(): void;
	readInput?(): void;
	cpos?: { x: number; y: number };
	setScroll?(value: number): void;
};

export type WorkspaceViewState = {
	drafts: Map<string, WorkspaceDraft>;
	scrolls: Map<string, number>;
	filters: FilterState;
	collapsed: Set<string>;
	detailsVisible: boolean;
	selectedTaskId?: string;
};
type SharedWorkspaceState = Pick<WorkspaceViewState, "filters" | "selectedTaskId"> & {
	footerEditing?: boolean;
	footerContext?: "tasks" | "details";
};

export type AgentWorkspaceOptions = {
	screen?: ReturnType<typeof createScreen>;
	service?: AgentSessionService;
	host?: WorkspaceHost;
	state?: WorkspaceViewState;
	taskComposer?: (options: TaskComposerOptions) => Promise<Task | null>;
	region?: "workspace-nav" | "workspace-tasks" | "workspace-details" | "workspace-footer";
};

const FIELDS: Array<[DraftField, string]> = [
	["title", TASK_FIELD_LABELS.TITLE],
	["description", TASK_FIELD_LABELS.DESCRIPTION],
	["acceptanceCriteria", TASK_FIELD_LABELS.ACCEPTANCE_CRITERIA],
	["implementationPlan", "Plan"],
	["implementationNotes", "Notes"],
	["finalSummary", TASK_FIELD_LABELS.FINAL_SUMMARY],
];

export function createWorkspaceViewState(): WorkspaceViewState {
	return {
		drafts: new Map(),
		scrolls: new Map(),
		filters: { search: "", status: [], taskTypes: [], projects: [], priority: "", labels: [], milestone: "" },
		collapsed: new Set(),
		detailsVisible: true,
	};
}

export function withWorkspaceSearch(filters: FilterState, search: string): FilterState {
	return { ...filters, search };
}

function sessionLabel(session?: AgentSession): string {
	if (!session) return "No active session";
	return `${session.status} · ${session.preset} · ${session.id.slice(0, 8)}${session.paneId ? "" : " · pane unavailable"}`;
}

function detailsText(
	task: Task,
	draft?: WorkspaceDraft,
	session?: AgentSession,
	handoff?: TaskSessions["handoff"],
): string {
	const { headerContent, bodyContent } = generateDetailContent(taskWithWorkspaceDraft(task, draft));
	return [
		...headerContent,
		"",
		`{bold}Session:{/bold} ${sessionLabel(session)}`,
		handoff?.error ? `{bold}Handoff:{/bold} {yellow-fg}${handoff.error}{/}` : "",
		"",
		...bodyContent,
	]
		.filter(Boolean)
		.join("\n");
}

/** Task navigation and editing in the left native workspace pane. Agent terminals remain tmux-owned. */
export class AgentWorkspaceController {
	readonly #core: Core;
	readonly #options: AgentWorkspaceOptions;

	constructor(core: Core, options: AgentWorkspaceOptions = {}) {
		this.#core = core;
		this.#options = options;
	}

	async run(): Promise<"exit"> {
		if (!process.stdout.isTTY) {
			console.log("Workspace requires an interactive terminal.");
			return "exit";
		}
		const config = await this.#core.filesystem.loadConfig();
		const [milestones, archivedMilestones] = await Promise.all([
			this.#core.filesystem.listMilestones(),
			this.#core.filesystem.listArchivedMilestones(),
		]);
		return this.#mount(config, buildTaskViewerMilestoneFilterModel(milestones, archivedMilestones));
	}

	#mount(
		initialConfig: Awaited<ReturnType<Core["filesystem"]["loadConfig"]>>,
		milestoneModel: ReturnType<typeof buildTaskViewerMilestoneFilterModel>,
	): Promise<"exit"> {
		const { core, options } = { core: this.#core, options: this.#options };
		if (options.region === "workspace-nav") return this.#mountNavigationRegion();
		if (options.region === "workspace-footer") return this.#mountFooterRegion();
		const tasksOnly = options.region === "workspace-tasks";
		const detailsOnly = options.region === "workspace-details";
		const nativePane = tasksOnly || detailsOnly;
		const service = options.service ?? new AgentSessionService(core);
		const host = options.host ?? new TmuxWorkspace(core.filesystem.rootDir);
		const state = options.state ?? createWorkspaceViewState();
		return new Promise((resolve) => {
			const screen = options.screen ?? createScreen({ title: formatTuiTitle("Workspace", initialConfig?.projectName) });
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
				style: { border: { fg: "gray" }, focus: { border: { fg: "yellow" } } },
			});
			const detailsViewport = details as typeof details & {
				show(): void;
				hide(): void;
				getScroll(): number;
				setScroll(value: number): void;
			};
			const footer = box({ parent: screen, bottom: 0, left: 0, width: "100%", height: 1 });
			const statusRow = box({ parent: screen, bottom: 1, left: 0, width: "100%", height: 1 }) as ReturnType<
				typeof box
			> & { hide(): void; show(): void };
			statusRow.hide();
			addScrollKeys(details, screen);
			let filterHeader: FilterHeader;
			let mode: Mode = "navigation";
			let closed = false;
			let busy = false;
			let selected = 0;
			let detailField = 0;
			let sessionAction = false;
			let statuses = initialConfig?.statuses ?? ["To Do", "In Progress", "Done"];
			let availableLabels = collectAvailableLabels([], initialConfig?.labels ?? []);
			let filters = state.filters;
			let entries: WorkspaceEntry[] = [];
			let selectedTask: Task | undefined;
			let taskSessions: TaskSessions | undefined;
			let historySession: AgentSession | undefined;
			let fieldEditor: { field: DraftField; widget: EditableWidget } | undefined;
			let disposeConfig = () => {};
			let notificationTimer: ReturnType<typeof setTimeout> | undefined;
			let poll: ReturnType<typeof setInterval> | undefined;
			let refreshRunning = false;
			let filterFocused = false;
			let selectionGeneration = 0;
			let displayedPaneId: string | null | undefined;
			let presentation = Promise.resolve();
			const active = () => taskSessions?.sessions.find((item) => item.id === taskSessions?.activeSessionId);
			const focusedTask = () =>
				entries[selected]?.kind === "task"
					? (entries[selected] as Extract<WorkspaceEntry, { kind: "task" }>).task
					: undefined;
			const render = () => {
				if (!closed) screen.render();
			};
			const activateFooterContext = () => {
				if (!nativePane) return;
				const footerContext = detailsOnly ? "details" : "tasks";
				void host.updateWorkspaceState?.<SharedWorkspaceState>((shared) =>
					shared.footerContext === footerContext ? shared : { ...shared, footerContext },
				);
			};
			const tell = (message: string) => {
				if (notificationTimer) clearTimeout(notificationTimer);
				statusRow.setContent(` ${message} `);
				statusRow.show();
				notificationTimer = setTimeout(() => {
					statusRow.hide();
					render();
				}, 3000);
				render();
			};
			const run = (action: () => Promise<void>) =>
				void action().catch((error) => tell(error instanceof Error ? error.message : String(error)));
			const queuePresentation = (action: () => Promise<void>) => {
				presentation = presentation.catch(() => {}).then(action);
				return presentation;
			};
			const showAgent = (session: AgentSession | undefined, generation = selectionGeneration) =>
				queuePresentation(async () => {
					if (closed || generation !== selectionGeneration) return;
					const paneId = session?.paneId ?? null;
					if (session?.status === "running" && !paneId)
						tell("The running agent has no tmux pane yet. Wait for startup or recover the session.");
					if (displayedPaneId === paneId) return;
					await host.showAgent(paneId);
					displayedPaneId = paneId;
				});
			const updateFooter = () => {
				if (nativePane) return;
				footer.setContent(
					formatFooterContent(
						mode === "details"
							? ` [${formatKeymap("workspace", "edit")}] Edit | [${formatKeymap("workspace", "history")}] History | [${formatKeymap("workspace", "close")}] Tasks `
							: mode === "history"
								? ` [${formatKeymap("shared", "up")}${formatKeymap("shared", "down")}] Session | [${formatKeymap("workspace", "open")}] Show agent | [${formatKeymap("workspace", "close")}] Details `
								: ` [${formatKeymap("workspace", "up")}${formatKeymap("workspace", "down")}] Task | [${formatKeymap("workspace", "search")}] Search | [${formatKeymap("workspace", "details")}] Details | [${formatKeymap("workspace", "focusDetails")}] Focus details | [${formatKeymap("workspace", "inlineInput")}] Agent | [${formatKeymap("workspace", "open")}] Start/Show | [${formatKeymap("workspace", "newTask")}] New | [${formatKeymap("workspace", "board")}] Board | [${formatKeymap("shared", "quitWithoutEscape")}] Close `,
						screen.width,
					).content,
				);
			};
			const showDetails = () => {
				details.setContent(
					selectedTask
						? detailsText(selectedTask, state.drafts.get(selectedTask.id), active(), taskSessions?.handoff)
						: "No tasks match this filter.",
				);
				updateFooter();
				render();
			};
			const layout = () => {
				const top = tasksOnly || detailsOnly ? 0 : filterHeader.getHeight();
				const available = Math.max(1, screen.height - top - (nativePane ? 0 : 2));
				const treeHeight = tasksOnly
					? available
					: detailsOnly
						? 1
						: state.detailsVisible
							? Math.max(1, Math.floor(available / 2))
							: available;
				tree.top = top;
				tree.height = treeHeight;
				details.top = detailsOnly ? 0 : top + treeHeight;
				details.height = detailsOnly ? available : Math.max(1, available - treeHeight);
				if (!tasksOnly && (detailsOnly || state.detailsVisible)) detailsViewport.show();
				else detailsViewport.hide();
			};
			const clearSelection = () => {
				++selectionGeneration;
				selectedTask = undefined;
				taskSessions = undefined;
				historySession = undefined;
				state.selectedTaskId = undefined;
				details.setContent("No tasks match this filter.");
				run(() => showAgent(undefined));
			};
			const selectTask = async (index: number, task: Task) => {
				const unchanged = selectedTask?.id === task.id;
				if (!unchanged && selectedTask) state.scrolls.set(selectedTask.id, detailsViewport.getScroll());
				selected = index;
				tree.select(index);
				selectedTask = task;
				state.selectedTaskId = task.id;
				void host.updateWorkspaceState?.((shared: SharedWorkspaceState) => ({ ...shared, selectedTaskId: task.id }));
				const generation = unchanged ? selectionGeneration : ++selectionGeneration;
				if (!unchanged) {
					historySession = undefined;
					taskSessions = undefined;
					await showAgent(undefined, generation);
				}
				showDetails();
				const sessions = await service.list(task.id);
				if (closed || generation !== selectionGeneration || selectedTask?.id !== task.id) return;
				taskSessions = sessions;
				if (!unchanged) detailsViewport.setScroll(state.scrolls.get(task.id) ?? 0);
				showDetails();
				if (mode !== "history") await showAgent(active(), generation);
			};
			const select = async (index: number) => {
				const entry = entries[index];
				if (!entry) return;
				selected = index;
				tree.select(index);
				if (entry.kind === "header") {
					clearSelection();
					render();
				} else await selectTask(index, entry.task);
			};
			const toggleGroup = async (index: number) => {
				const entry = entries[index];
				if (entry?.kind !== "header") return;
				await select(index);
				if (state.collapsed.has(entry.status)) state.collapsed.delete(entry.status);
				else state.collapsed.add(entry.status);
				await reload(false);
			};
			const reload = async (selectCurrent = true) => {
				if (busy || closed) return;
				busy = true;
				try {
					const config = await core.filesystem.loadConfig();
					statuses = config?.statuses ?? statuses;
					const tasks = await core.filesystem.listTasks();
					availableLabels = collectAvailableLabels(tasks, initialConfig?.labels ?? []);
					const filtered = applyTaskFilters(
						tasks,
						taskFilterOptions(filters, "any", milestoneModel.resolveMilestoneLabel),
						createTaskSearchIndex(tasks),
					);
					const previous = entries[selected];
					entries = buildWorkspaceEntries(filtered, statuses, "All", state.collapsed);
					tree.setItems(workspaceRows(entries));
					selected = reconciledWorkspaceSelection(entries, previous, state.selectedTaskId, !selectCurrent);
					if (selected >= 0 && selectCurrent) await select(selected);
					else if (selected < 0) clearSelection();
					else if (selectedTask) {
						const current = entries.find(
							(entry): entry is Extract<WorkspaceEntry, { kind: "task" }> =>
								entry.kind === "task" && entry.task.id === selectedTask?.id,
						);
						if (!current) clearSelection();
						else {
							const generation = selectionGeneration;
							selectedTask = current.task;
							const sessions = await service.list(current.task.id);
							if (generation === selectionGeneration && selectedTask?.id === current.task.id) {
								taskSessions = sessions;
								if (mode === "history") {
									historySession =
										sessions.sessions.find((item) => item.id === historySession?.id) ?? sessions.sessions.at(-1);
									showHistoryRows();
								} else {
									showDetails();
									await showAgent(active(), generation);
								}
							}
						}
					}
					render();
				} finally {
					busy = false;
				}
			};
			const selectRequestedTask = async (taskId: string) => {
				filters = { search: "", status: [], taskTypes: [], projects: [], priority: "", labels: [], milestone: "" };
				state.filters = filters;
				state.collapsed.clear();
				filterHeader.setFilters(filters);
				await reload(false);
				const index = entries.findIndex((entry) => entry.kind === "task" && entry.task.id === taskId);
				if (index >= 0) await select(index);
				else tell(`Requested task ${taskId} is unavailable.`);
			};
			const closeField = () => {
				if (!fieldEditor || !selectedTask) return;
				const draft = state.drafts.get(selectedTask.id) ?? createWorkspaceDraft(selectedTask);
				draft.values[fieldEditor.field] = fieldEditor.widget.getValue();
				draft.cursor[fieldEditor.field] = {
					x: fieldEditor.widget.cpos?.x ?? 0,
					y: fieldEditor.widget.cpos?.y ?? 0,
				};
				state.drafts.set(selectedTask.id, draft);
				fieldEditor.widget.cancel?.();
				fieldEditor.widget.destroy();
				fieldEditor = undefined;
				mode = "details";
				details.focus();
				showDetails();
			};
			const openField = (field: DraftField) => {
				if (!selectedTask) return;
				const task = selectedTask;
				const draft = state.drafts.get(task.id) ?? createWorkspaceDraft(task);
				state.drafts.set(task.id, draft);
				mode = "field";
				const widget = textarea({
					parent: screen,
					left: 0,
					width: "100%",
					top: details.top,
					height: details.height,
					border: "line",
					label: ` ${FIELDS.find(([name]) => name === field)?.[1]} · ${formatKeymap("workspace", "save")} save `,
					keys: true,
					mouse: true,
					inputOnFocus: false,
					scrollable: true,
					value: draft.values[field],
				}) as EditableWidget;
				fieldEditor = { field, widget };
				const cursor = draft.cursor[field];
				if (cursor) widget.cpos = cursor;
				widget.focus();
				widget.readInput?.();
				widget.key(keymapKeys("workspace", "save"), () => {
					closeField();
					run(async () => {
						const current = await core.getTask(task.id);
						if (!current) throw new Error("Task no longer exists.");
						const changes = changedTaskFields(draft, current);
						const { acceptanceCriteria, ...text } = changes;
						const input: TaskUpdateInput = text;
						if (acceptanceCriteria !== undefined)
							input.acceptanceCriteria = parseAcceptanceCriteria(acceptanceCriteria);
						if (Object.keys(input).length) await core.updateTaskFromInput(task.id, input);
						state.drafts.set(task.id, createWorkspaceDraft((await core.getTask(task.id)) ?? current));
						await reload(false);
						tell("Saved changed fields.");
					});
					return false;
				});
				widget.key(keymapKeys("workspace", "close"), () => {
					closeField();
					return false;
				});
				render();
			};
			const showHistory = async () => {
				if (!selectedTask || mode !== "details") return;
				const taskId = selectedTask.id;
				const generation = selectionGeneration;
				const sessions = await service.list(taskId);
				if (closed || generation !== selectionGeneration || selectedTask?.id !== taskId || mode !== "details") return;
				taskSessions = sessions;
				historySession = taskSessions.sessions.at(-1);
				mode = "history";
				details.setLabel?.(" Session history ");
				showHistoryRows();
				updateFooter();
				details.focus();
				render();
			};
			const showHistoryRows = () => {
				if (!taskSessions) return;
				details.setContent(
					taskSessions.sessions
						.map(
							(item) =>
								`${item.id === historySession?.id ? ">" : " "} ${item.createdAt}  ${sessionLabel(item)}${item.error ? `  ${item.error}` : ""}`,
						)
						.join("\n") || "No session history.",
				);
			};
			const openConfig = () => {
				if (!selectedTask) return;
				mode = "config";
				const task = selectedTask;
				let scope: AgentConfigScope = "card";
				let selectedPreset = "";
				let editable: AgentConfiguration | undefined;
				let worktree = false;
				let bootstrap: AgentPreset["bootstrap"] = "prompt";
				const scopeList = list({
					parent: screen,
					top: "8%",
					left: 0,
					width: "35%",
					height: 6,
					border: "line",
					label: " Scope ",
					keys: true,
					items: ["root", "project", "card"],
				});
				const presetList = list({
					parent: screen,
					top: "8%",
					left: "35%",
					width: "65%",
					height: 6,
					border: "line",
					label: " Preset ",
					keys: true,
				});
				const command = textarea({
					parent: screen,
					top: "25%",
					left: 0,
					width: "100%",
					height: 4,
					border: "line",
					label: " Command ",
					keys: true,
					inputOnFocus: false,
				});
				const environment = textarea({
					parent: screen,
					top: "40%",
					left: 0,
					width: "100%",
					height: 6,
					border: "line",
					label: " Environment (KEY=value) ",
					keys: true,
					inputOnFocus: false,
				});
				const prepare = textarea({
					parent: screen,
					top: "62%",
					left: 0,
					width: "100%",
					height: 5,
					border: "line",
					label: " Prepare ",
					keys: true,
					inputOnFocus: false,
				});
				const widgets = [scopeList, presetList, command, environment, prepare];
				let focus = 0;
				const focusWidget = (index: number) => {
					focus = (index + widgets.length) % widgets.length;
					const widget = widgets[focus];
					widget?.focus();
					if ([command, environment, prepare].includes(widget as typeof command))
						(widget as EditableWidget).readInput?.();
				};
				const close = () => {
					screen.unkey(keymapKeys("shared", "tab"), tab);
					screen.unkey(keymapKeys("workspace", "save"), save);
					widgets.forEach((widget) => {
						widget.destroy();
					});
					disposeConfig = () => {};
					mode = "navigation";
					tree.focus();
					showDetails();
				};
				const load = async () => {
					editable = await getEditableAgentConfiguration(core, scope, scope === "card" ? task.id : undefined);
					selectedPreset = editable.selectedPreset;
					const preset = editable.presets[selectedPreset];
					if (!preset) return;
					scopeList.select(["root", "project", "card"].indexOf(scope));
					presetList.setItems(Object.keys(editable.presets));
					presetList.select(Object.keys(editable.presets).indexOf(selectedPreset));
					command.setValue(preset.command);
					environment.setValue(
						Object.entries(preset.env)
							.map(([key, value]) => `${key}=${value}`)
							.join("\n"),
					);
					prepare.setValue(preset.prepare);
					worktree = preset.worktree;
					bootstrap = preset.bootstrap;
					render();
				};
				const save = () => {
					if (mode !== "config" || !editable) return false;
					run(async () => {
						const env = parsePresetEnvironment(environment.getValue());
						await updateAgentConfiguration(
							core,
							scope,
							(value) =>
								updatePresetConfiguration(value, selectedPreset, {
									command: command.getValue(),
									environment: env,
									prepare: prepare.getValue(),
									worktree,
									bootstrap,
								}),
							scope === "card" ? task.id : undefined,
						);
						close();
						tell(`Saved ${scope} preset.`);
					});
					return false;
				};
				const tab = () => {
					if (mode === "config") focusWidget(focus + 1);
					return false;
				};
				disposeConfig = close;
				run(load);
				focusWidget(0);
				screen.key(keymapKeys("shared", "tab"), tab);
				screen.key(keymapKeys("workspace", "save"), save);
				scopeList.key(keymapKeys("workspace", "open"), () => {
					scope = ["root", "project", "card"][
						(scopeList as unknown as { selected: number }).selected
					] as AgentConfigScope;
					run(load);
					return false;
				});
				presetList.key(keymapKeys("workspace", "open"), () => {
					if (editable) {
						selectedPreset =
							Object.keys(editable.presets)[(presetList as unknown as { selected: number }).selected] ?? selectedPreset;
						run(load);
					}
					return false;
				});
				widgets.forEach((widget) => {
					widget.key(keymapKeys("workspace", "close"), () => {
						close();
						return false;
					});
				});
			};
			const startComposer = () => {
				mode = "composer";
				run(async () => {
					try {
						const created = await (options.taskComposer ?? openTaskComposer)({
							screen,
							statuses,
							types: getTaskTypeValues(initialConfig),
							priorities: getPriorityOptions(initialConfig).map((item) => item.value),
							projects: getProjectValues(initialConfig),
							persist: async (input) =>
								(await core.createTaskFromInput(input, (await core.filesystem.loadConfig())?.autoCommit ?? false)).task,
						});
						if (created) {
							state.selectedTaskId = created.id;
							await reload();
						}
					} finally {
						mode = "navigation";
						tree.focus();
						render();
					}
				});
			};
			const startOrShow = () => {
				const task = focusedTask();
				if (!task || sessionAction) return;
				const generation = selectionGeneration;
				sessionAction = true;
				run(async () => {
					try {
						let session = active();
						if (!session) {
							session = await service.start(task.id);
							if (closed || generation !== selectionGeneration || focusedTask()?.id !== task.id) return;
							taskSessions = await service.list(task.id);
							if (closed || generation !== selectionGeneration || focusedTask()?.id !== task.id) return;
							session = active() ?? session;
						}
						if (!session.paneId) throw new Error("Agent session started without a tmux pane.");
						await showAgent(session, generation);
						if (closed || generation !== selectionGeneration || focusedTask()?.id !== task.id) return;
						await host.focusAgent(true);
					} finally {
						sessionAction = false;
					}
				});
			};
			const onKeypress = (_character: unknown, raw: unknown) => {
				const key = raw as { name?: string; full?: string; sequence?: string; ctrl?: boolean };
				if (mode === "field" || mode === "config" || mode === "composer") return;
				if (filterFocused) return;
				if (mode === "details") {
					if (matchesKey(keymapKeys("workspace", "close"), key)) {
						mode = "navigation";
						details.setLabel?.(" Details ");
						tree.focus();
						updateFooter();
						render();
					} else if (matchesKey(keymapKeys("workspace", "history"), key)) run(showHistory);
					else if (matchesKey(keymapKeys("workspace", "edit"), key))
						openField(FIELDS[detailField]?.[0] ?? "description");
					else if (matchesKey([...keymapKeys("shared", "up"), ...keymapKeys("shared", "down")], key))
						detailField = (detailField + (key.name === "up" ? FIELDS.length - 1 : 1)) % FIELDS.length;
					return;
				}
				if (mode === "history") {
					if (matchesKey(keymapKeys("workspace", "close"), key)) {
						mode = "details";
						historySession = undefined;
						showDetails();
						return;
					}
					if (matchesKey(keymapKeys("workspace", "open"), key))
						run(async () => {
							await showAgent(historySession);
							await host.focusAgent(true);
						});
					else if (
						matchesKey([...keymapKeys("shared", "up"), ...keymapKeys("shared", "down")], key) &&
						taskSessions?.sessions.length
					) {
						const all = taskSessions.sessions;
						const current = historySession ?? all[0];
						if (!current) return;
						const index = Math.max(0, Math.min(all.length - 1, all.indexOf(current) + (key.name === "up" ? -1 : 1)));
						historySession = all[index];
						showHistoryRows();
						render();
					}
					return;
				}
				if (matchesKey(keymapKeys("shared", "quitWithoutEscape"), key)) {
					run(() => host.detach());
					return;
				}
				if (matchesKey(keymapKeys("workspace", "board"), key)) {
					run(() => host.showBoard());
					return;
				}
				if (matchesKey(keymapKeys("workspace", "up"), key) || matchesKey(keymapKeys("workspace", "down"), key)) {
					const next = Math.max(0, Math.min(entries.length - 1, selected + (key.name === "up" ? -1 : 1)));
					if (next !== selected) run(() => select(next));
					return;
				}
				if (matchesKey(keymapKeys("workspace", "search"), key)) {
					run(async () => {
						await host.focusSearch?.();
					});
					return;
				}
				if (matchesKey(keymapKeys("workspace", "details"), key)) {
					state.detailsVisible = !state.detailsVisible;
					layout();
					render();
					return;
				}
				if (matchesKey(keymapKeys("workspace", "focusDetails"), key) && focusedTask()) {
					mode = "details";
					details.focus();
					updateFooter();
					render();
					return;
				}
				if (matchesKey(keymapKeys("workspace", "open"), key)) {
					if (entries[selected]?.kind === "header") run(() => toggleGroup(selected));
					else startOrShow();
					return;
				}
				if (matchesKey(keymapKeys("workspace", "inlineInput"), key)) {
					filterHeader.setExitRequestHandler(() => tree.focus());
					run(() => host.focusAgent(false));
					return;
				}
				if (matchesKey(keymapKeys("workspace", "newTask"), key)) {
					startComposer();
					return;
				}
				const task = focusedTask();
				if (matchesKey(keymapKeys("workspace", "handoff"), key) && task)
					run(async () => {
						await service.requestHandoff(task.id);
						await select(selected);
					});
				if (matchesKey(keymapKeys("workspace", "config"), key)) openConfig();
			};
			const close = () => {
				if (closed) return;
				closed = true;
				if (poll) clearInterval(poll);
				if (notificationTimer) clearTimeout(notificationTimer);
				disposeConfig();
				filterHeader.destroy();
				[tree, details, footer, statusRow].forEach((widget) => {
					widget.destroy();
				});
				screen.destroy();
				resolve("exit");
			};
			filterHeader = createFilterHeader({
				parent: screen,
				statuses,
				availableLabels,
				availableMilestones: milestoneModel.availableMilestoneTitles,
				visibleFilters: taskFilterHeaderControls(getProjectValues(initialConfig)).filter((id) => id !== "search"),
				initialFilters: filters,
				onFilterChange: (next) => {
					filters = next;
					state.filters = next;
					void host.updateWorkspaceState?.<SharedWorkspaceState>((shared) => ({ ...shared, filters: next }));
					run(() => reload());
				},
				onFilterPickerOpen: (id) =>
					run(async () => {
						const next = await openTaskFilterPicker({
							screen,
							filterId: id as Exclude<FilterControlId, "search">,
							filters,
							statuses,
							taskTypes: getTaskTypeValues(initialConfig),
							projects: getProjectValues(initialConfig),
							priorityOptions: getPriorityOptions(initialConfig),
							labels: availableLabels,
							milestones: milestoneModel.availableMilestoneTitles,
						});
						if (next) {
							filters = next;
							state.filters = next;
							filterHeader.setFilters(next);
							await reload();
						}
					}),
			});
			filterHeader.setFocusChangeHandler((focus) => {
				filterFocused = focus !== null;
			});
			filterHeader.setExitRequestHandler(() => {
				filterFocused = false;
				tree.focus();
			});
			if (tasksOnly || detailsOnly) filterHeader.hide();
			if (nativePane) {
				(footer as unknown as { hide(): void }).hide();
				statusRow.hide();
			}
			if (tasksOnly) detailsViewport.hide();
			if (detailsOnly) (tree as unknown as { hide(): void }).hide();
			layout();
			screen.on("keypress", (character, raw) => {
				activateFooterContext();
				onKeypress(character, raw);
			});
			screen.on("resize", () => {
				filterHeader.rebuild();
				layout();
				render();
			});
			screen.on("destroy", close);
			updateFooter();
			run(async () => {
				await reload();
				if (detailsOnly) {
					mode = "details";
					details.focus();
					updateFooter();
					render();
				} else tree.focus();
			});
			poll = setInterval(
				() =>
					run(async () => {
						if (refreshRunning || closed || mode === "field" || mode === "config" || mode === "composer") return;
						refreshRunning = true;
						try {
							const shared = await host.workspaceState?.<SharedWorkspaceState>();
							if (shared?.filters && JSON.stringify(shared.filters) !== JSON.stringify(filters)) {
								filters = shared.filters;
								state.filters = filters;
								filterHeader.setFilters(filters);
								await reload();
							}
							const sharedTaskId = shared?.selectedTaskId;
							if (detailsOnly && sharedTaskId !== state.selectedTaskId) {
								const index = entries.findIndex((entry) => entry.kind === "task" && entry.task.id === sharedTaskId);
								if (index >= 0) await select(index);
								else clearSelection();
							}
							const requested = detailsOnly ? undefined : await host.takeTaskRequest();
							if (requested) await selectRequestedTask(requested);
							else {
								if (selectedTask) await service.recover(selectedTask.id);
								await reload(false);
							}
						} finally {
							refreshRunning = false;
						}
					}),
				2000,
			);
		});
	}

	#mountNavigationRegion(): Promise<"exit"> {
		const core = this.#core;
		const host = this.#options.host ?? new TmuxWorkspace(core.filesystem.rootDir);
		return new Promise((resolve) => {
			const screen = this.#options.screen ?? createScreen({ title: formatTuiTitle("Workspace") });
			let closed = false;
			let header: FilterHeader;
			const close = () => {
				if (closed) return;
				closed = true;
				header.destroy();
				screen.destroy();
				resolve("exit");
			};
			void (async () => {
				const [config, tasks, milestones, archived] = await Promise.all([
					core.filesystem.loadConfig(),
					core.filesystem.listTasks(),
					core.filesystem.listMilestones(),
					core.filesystem.listArchivedMilestones(),
				]);
				const shared = ((await host.workspaceState?.<SharedWorkspaceState>()) ?? {}) as SharedWorkspaceState;
				let navigationFilters = shared.filters ?? createWorkspaceViewState().filters;
				const milestoneModel = buildTaskViewerMilestoneFilterModel(milestones, archived);
				header = createFilterHeader({
					parent: screen,
					statuses: config?.statuses ?? ["To Do", "In Progress", "Done"],
					availableLabels: collectAvailableLabels(tasks, config?.labels ?? []),
					availableMilestones: milestoneModel.availableMilestoneTitles,
					visibleFilters: taskFilterHeaderControls(getProjectValues(config)).filter((id) => id !== "search"),
					initialFilters: navigationFilters,
					onFilterChange: (filters) =>
						void (async () => {
							navigationFilters = filters;
							await host.updateWorkspaceState?.<SharedWorkspaceState>((state) => ({ ...state, filters }));
						})(),
					onFilterPickerOpen: (id) =>
						void openTaskFilterPicker({
							screen,
							filterId: id,
							filters: navigationFilters,
							statuses: config?.statuses ?? ["To Do", "In Progress", "Done"],
							taskTypes: getTaskTypeValues(config),
							projects: getProjectValues(config),
							priorityOptions: getPriorityOptions(config),
							labels: collectAvailableLabels(tasks, config?.labels ?? []),
							milestones: milestoneModel.availableMilestoneTitles,
						}).then((next) => {
							if (next) {
								navigationFilters = next;
								header.setFilters(next);
								void host.updateWorkspaceState?.<SharedWorkspaceState>((state) => ({ ...state, filters: next }));
							}
						}),
				});
				screen.key(keymapKeys("shared", "tab"), () => {
					void host.focusAgent(false);
					return false;
				});
				screen.key(keymapKeys("workspace", "search"), () => {
					void host.focusSearch?.();
					return false;
				});
				const resize = () => {
					header.rebuild();
					void host.resizeNavigation?.(header.getHeight());
					screen.render();
				};
				screen.on("resize", resize);
				void host.resizeNavigation?.(header.getHeight());
				screen.key(["q", "C-c"], close);
				screen.on("destroy", close);
				screen.render();
			})().catch(close);
		});
	}

	#mountFooterRegion(): Promise<"exit"> {
		const core = this.#core;
		const host = this.#options.host ?? new TmuxWorkspace(core.filesystem.rootDir);
		return new Promise((resolve) => {
			const screen = this.#options.screen ?? createScreen({ title: formatTuiTitle("Workspace") });
			let closed = false;
			let filters: FilterState = createWorkspaceViewState().filters;
			let context: SharedWorkspaceState["footerContext"] = "tasks";
			let pending = Promise.resolve();
			let poll: ReturnType<typeof setInterval> | undefined;
			const close = () => {
				if (closed) return;
				closed = true;
				if (poll) clearInterval(poll);
				footer.destroy();
				screen.destroy();
				resolve("exit");
			};
			const footer = new FooterSearch({
				screen,
				content: () => {
					const query = filters.search ? ` | {yellow-fg}Search: ${filters.search}{/}` : "";
					if (context === "details")
						return ` [${formatKeymap("workspace", "edit")}] Edit | [${formatKeymap("workspace", "history")}] History | [${formatKeymap("workspace", "close")}] Tasks${query}`;
					return ` [${formatKeymap("workspace", "up")}${formatKeymap("workspace", "down")}] Task | [${formatKeymap("workspace", "search")}] Search | [${formatKeymap("workspace", "details")}] Details | [${formatKeymap("workspace", "focusDetails")}] Focus details | [${formatKeymap("workspace", "inlineInput")}] Agent | [${formatKeymap("workspace", "open")}] Start/Show | [${formatKeymap("workspace", "newTask")}] New | [${formatKeymap("workspace", "board")}] Board | [${formatKeymap("shared", "quitWithoutEscape")}] Close${query}`;
				},
				query: () => filters.search,
				onQueryChange: (query) => {
					pending = pending.then(() =>
						host.updateWorkspaceState?.<SharedWorkspaceState>((state) => {
							filters = withWorkspaceSearch(state.filters ?? filters, query);
							return { ...state, filters, footerEditing: true };
						}),
					);
				},
				onFocusChange: (editing) => {
					pending = pending.then(() =>
						host.updateWorkspaceState?.<SharedWorkspaceState>((state) => ({ ...state, footerEditing: editing })),
					);
				},
				onSubmit: async () => {
					await pending;
					await host.focusTasks?.();
				},
				onCancel: async () => {
					await pending;
					await host.focusTasks?.();
				},
				onHeightChange: (height) => void host.resizeFooter?.(height),
			});
			const sync = async () => {
				const shared = await host.workspaceState?.<SharedWorkspaceState>();
				if (!shared || footer.isEditing) return;
				if (shared.filters) filters = shared.filters;
				context = shared.footerContext ?? "tasks";
				footer.render();
			};
			const focusSearch = async () => {
				const shared = await host.workspaceState?.<SharedWorkspaceState>();
				if (shared?.filters) filters = shared.filters;
				context = shared?.footerContext ?? context;
				footer.focus();
			};
			void (async () => {
				const shared = await host.workspaceState?.<SharedWorkspaceState>();
				if (shared?.filters) filters = shared.filters;
				context = shared?.footerContext ?? context;
				footer.render();
				screen.key(keymapKeys("workspace", "search"), () => {
					void focusSearch();
					return false;
				});
				screen.on("resize", () => footer.render());
				screen.on("destroy", close);
				poll = setInterval(() => void sync(), 250);
				screen.render();
			})().catch(close);
		});
	}
}
