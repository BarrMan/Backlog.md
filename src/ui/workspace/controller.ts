import { box, list, scrollablebox, textarea } from "neo-neo-bblessed";
import { getEditableAgentConfiguration, updateAgentConfiguration } from "../../agent-workspace/config.ts";
import { AgentSessionService } from "../../agent-workspace/sessions.ts";
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
import { openTaskComposer, type TaskComposerOptions } from "../components/task-composer.ts";
import { formatFooterContent } from "../footer-content.ts";
import { formatKeymap, keymapKeys, matchesKey } from "../keymap.ts";
import {
	focusTaskFilterControl,
	openTaskFilterPicker,
	taskFilterHeaderControls,
	taskFilterOptions,
} from "../task-filter-wiring.ts";
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
	terminalInput,
	type WorkspaceDraft,
	type WorkspaceEntry,
} from "./model.ts";
import { reconciledWorkspaceSelection, workspaceRows } from "./reconciliation.ts";

type Mode = "navigation" | "details" | "field" | "inline" | "history" | "config" | "composer";
export type WorkspaceViewState = {
	drafts: Map<string, WorkspaceDraft>;
	scrolls: Map<string, { details: number; preview: number }>;
	filters: FilterState;
	collapsed: Set<string>;
	selectedTaskId?: string;
};

export type AgentWorkspaceOptions = {
	screen?: ReturnType<typeof createScreen>;
	service?: AgentSessionService;
	state?: WorkspaceViewState;
	preserveScreen?: boolean;
	taskComposer?: (options: TaskComposerOptions) => Promise<Task | null>;
};

type AgentWorkspaceInitialData = {
	config: Awaited<ReturnType<Core["filesystem"]["loadConfig"]>>;
	availableMilestoneTitles: string[];
	resolveMilestoneLabel: (milestone: string) => string;
};

export function createWorkspaceViewState(): WorkspaceViewState {
	return {
		drafts: new Map(),
		scrolls: new Map(),
		filters: { search: "", status: [], taskTypes: [], projects: [], priority: "", labels: [], milestone: "" },
		collapsed: new Set(),
	};
}

const FIELDS: Array<[DraftField, string]> = [
	["title", TASK_FIELD_LABELS.TITLE],
	["description", TASK_FIELD_LABELS.DESCRIPTION],
	["acceptanceCriteria", TASK_FIELD_LABELS.ACCEPTANCE_CRITERIA],
	["implementationPlan", "Plan"],
	["implementationNotes", "Notes"],
	["finalSummary", TASK_FIELD_LABELS.FINAL_SUMMARY],
];
type ScrollBox = { getScroll(): number; setScroll(value: number): void; setLabel?(label: string): void };
type LayoutWidget = { top?: number; left?: string; width?: string; height?: number; bottom?: number };
type EditableWidget = ReturnType<typeof textarea> & {
	cancel?: () => void;
	readInput?: () => void;
	cpos?: { x: number; y: number };
	getScroll?: () => number;
	setScroll?: (value: number) => void;
};

// Blessed exposes these runtime properties but does not declare them on every widget subtype.
function layoutWidget<T>(widget: T): T & LayoutWidget {
	return widget as T & LayoutWidget;
}

function scrollBox(widget: unknown): ScrollBox {
	return widget as ScrollBox;
}

function editableWidget(widget: unknown): EditableWidget {
	return widget as EditableWidget;
}

function selectedIndex(widget: unknown): number {
	return (widget as { selected: number }).selected;
}

function workspaceMouseIndex(
	tree: { lpos?: { xi: number; xl: number; yi: number; yl: number } },
	data: unknown,
): number | undefined {
	const point = data as { x?: number; y?: number };
	const position = tree.lpos;
	if (!position || point.x === undefined || point.y === undefined) return undefined;
	if (point.x < position.xi || point.x > position.xl || point.y <= position.yi || point.y >= position.yl)
		return undefined;
	const state = tree as { childBase?: number; getScroll?: () => number };
	return point.y - position.yi - 1 + (state.childBase ?? state.getScroll?.() ?? 0);
}

function sessionLabel(session?: AgentSession): string {
	return session ? `${session.status} · ${session.preset} · ${session.id.slice(0, 8)}` : "No active session";
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

/** Interactive task workspace. It intentionally leaves agent sessions running on exit. */
export class AgentWorkspaceController {
	readonly #core: Core;
	readonly #options: AgentWorkspaceOptions;

	constructor(core: Core, options: AgentWorkspaceOptions = {}) {
		this.#core = core;
		this.#options = options;
	}

	async run(): Promise<"board" | "exit"> {
		if (!process.stdout.isTTY) {
			console.log("Workspace requires an interactive terminal.");
			return "exit";
		}
		const initial = await this.#loadInitialData();
		const service = this.#options.service ?? new AgentSessionService(this.#core);
		const state = this.#options.state ?? createWorkspaceViewState();
		return this.#mount(initial, service, state);
	}

	async #loadInitialData(): Promise<AgentWorkspaceInitialData> {
		const config = await this.#core.filesystem.loadConfig();
		const [milestones, archivedMilestones] = await Promise.all([
			this.#core.filesystem.listMilestones(),
			this.#core.filesystem.listArchivedMilestones(),
		]);
		return { config, ...buildTaskViewerMilestoneFilterModel(milestones, archivedMilestones) };
	}

	#mount(
		initial: AgentWorkspaceInitialData,
		service: AgentSessionService,
		state: WorkspaceViewState,
	): Promise<"board" | "exit"> {
		const core = this.#core;
		const options = this.#options;
		const { config: initialConfig, availableMilestoneTitles, resolveMilestoneLabel } = initial;
		return new Promise<"board" | "exit">((resolve) => {
			const screen = options.screen ?? createScreen({ title: formatTuiTitle("Workspace", initialConfig?.projectName) });
			const screenEvents = screen as typeof screen & {
				removeListener(event: string, listener: (...args: never[]) => void): void;
			};
			let filterHeader: FilterHeader;
			const tree = list({
				parent: screen,
				top: 0,
				left: 0,
				width: "28%",
				bottom: 1,
				border: "line",
				label: " Tasks ",
				keys: false,
				mouse: true,
				tags: true,
				style: {
					border: { fg: "gray" },
					focus: { border: { fg: "yellow" } },
					selected: { inverse: true, bold: true },
				},
			});
			const details = scrollablebox({
				parent: screen,
				top: 0,
				left: "28%",
				width: "72%",
				height: "54%",
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
			const preview = scrollablebox({
				parent: screen,
				top: 0,
				left: "28%",
				width: "72%",
				bottom: 1,
				border: "line",
				label: " Live preview ",
				scrollable: true,
				alwaysScroll: true,
				mouse: true,
				keys: true,
				vi: true,
				style: { border: { fg: "gray" }, focus: { border: { fg: "yellow" } } },
			});
			const footer = box({
				parent: screen,
				bottom: 0,
				left: 0,
				width: "100%",
				height: 1,
				content: "",
			});
			const statusRow = box({
				parent: screen,
				bottom: 1,
				left: 0,
				width: "100%",
				height: 1,
				content: "",
			}) as ReturnType<typeof box> & { hide(): void; show(): void };
			statusRow.hide();
			addScrollKeys(details, screen);
			addScrollKeys(preview, screen);
			let mode: Mode = "navigation";
			let closed = false;
			let busy = false;
			let generation = 0;
			let selected = 0;
			let leftWidth = 28;
			let split = 54;
			let statuses = initialConfig?.statuses ?? ["To Do", "In Progress", "Done"];
			const taskTypes = getTaskTypeValues(initialConfig);
			const projects = getProjectValues(initialConfig);
			const priorityOptions = getPriorityOptions(initialConfig);
			let availableLabels = collectAvailableLabels([], initialConfig?.labels ?? []);
			let filters = state.filters;
			let filterFocused = false;
			let filterPopupOpen = false;
			let tasks: Task[] = [];
			let entries: WorkspaceEntry[] = [];
			let selectedTask: Task | undefined;
			let taskSessions: TaskSessions | undefined;
			let historySession: AgentSession | undefined;
			let fieldEditor: { field: DraftField; widget: EditableWidget } | undefined;
			let inputQueue = Promise.resolve();
			let attached = false;
			let sessionAction = false;
			let notificationTimer: ReturnType<typeof setTimeout> | undefined;
			let disposeConfig = () => {};
			const { collapsed, drafts, scrolls } = state;
			const active = () => taskSessions?.sessions.find((item) => item.id === taskSessions?.activeSessionId);
			const focusedTask = () => {
				const entry = entries[selected];
				return entry?.kind === "task" ? entry.task : undefined;
			};
			let footerHeight = 1;
			let notification = "";
			const dispose = () => {
				if (closed) return;
				closed = true;
				++generation;
				clearInterval(poll);
				clearNotification();
				disposeConfig();
				if (fieldEditor) {
					fieldEditor.widget.cancel?.();
					fieldEditor.widget.destroy();
					fieldEditor = undefined;
				}
				filterHeader.destroy();
				for (const widget of [tree, details, preview, footer, statusRow]) widget.destroy();
				screenEvents.removeListener("mouse", onMouse);
				screenEvents.removeListener("keypress", onKeypress);
				screenEvents.removeListener("resize", onResize);
				screenEvents.removeListener("destroy", onDestroy);
			};
			const close = (result: "board" | "exit") => {
				dispose();
				if (!options.preserveScreen) screen.destroy();
				resolve(result);
			};
			const footerHelp = () => {
				if (mode === "details")
					return ` [${formatKeymap("workspace", "edit")}] Edit | [${formatKeymap("shared", "up")}${formatKeymap("shared", "down")}] Field | [${formatKeymap("workspace", "history")}] History | [${formatKeymap("workspace", "close")}] Tasks `;
				if (mode === "history")
					return ` [${formatKeymap("shared", "up")}${formatKeymap("shared", "down")}] Session | [${formatKeymap("workspace", "open")}] Preview | [${formatKeymap("workspace", "close")}] Details `;
				if (mode === "field")
					return ` [${formatKeymap("workspace", "save")}] Save | [${formatKeymap("workspace", "close")}] Details `;
				if (mode === "inline") return ` [${formatKeymap("workspace", "inlineClose")}] Tasks | Keys → session `;
				if (mode === "config")
					return ` [${formatKeymap("shared", "tab")}] Next | [${formatKeymap("workspace", "save")}] Save | [${formatKeymap("workspace", "close")}] Tasks `;
				return ` [${formatKeymap("workspace", "up")}${formatKeymap("workspace", "down")}] Task | [${formatKeymap("workspace", "search")}] Search | [${formatKeymap("workspace", "details")}] Details | [${formatKeymap("workspace", "inlineInput")}] Input | [${formatKeymap("workspace", "open")}] Start/Attach | [${formatKeymap("workspace", "newTask")}] New | [${formatKeymap("workspace", "board")}] Board | [${formatKeymap("shared", "quitWithoutEscape")}] Close `;
			};
			const updateFooter = () => {
				const formatted = formatFooterContent(footerHelp(), screen.width);
				footerHeight = formatted.height;
				layoutWidget(footer).height = footerHeight;
				footer.setContent(formatted.content);
				layoutWidget(statusRow).bottom = footerHeight;
				layoutWidget(tree).bottom = footerHeight + (notification ? 1 : 0);
				layoutWidget(preview).bottom = footerHeight + (notification ? 1 : 0);
			};
			const render = () => {
				if (closed || attached) return;
				layout();
				screen.render();
			};
			const clearNotification = () => {
				if (notificationTimer) clearTimeout(notificationTimer);
				notificationTimer = undefined;
				notification = "";
				statusRow.setContent("");
				statusRow.hide();
			};
			const tell = (message: string) => {
				if (closed) return;
				if (notificationTimer) clearTimeout(notificationTimer);
				notification = message;
				statusRow.setContent(` ${message} `);
				statusRow.show();
				notificationTimer = setTimeout(() => {
					clearNotification();
					render();
				}, 3000);
				render();
			};
			const run = (action: () => Promise<void>) => {
				void action().catch((error) => tell(error instanceof Error ? error.message : String(error)));
			};
			const headerHeight = () => filterHeader.getHeight();
			const detailsHeight = () =>
				Math.max(
					1,
					Math.floor(
						(Math.max(2, screen.height - headerHeight() - footerHeight - (notification ? 1 : 0)) * split) / 100,
					),
				);
			const layout = () => {
				updateFooter();
				const right = 100 - leftWidth;
				const top = headerHeight();
				const detailHeight = detailsHeight();
				layoutWidget(tree).width = `${leftWidth}%`;
				layoutWidget(tree).top = top;
				for (const panel of [details, preview]) {
					layoutWidget(panel).left = `${leftWidth}%`;
					layoutWidget(panel).width = `${right}%`;
				}
				layoutWidget(details).top = top;
				layoutWidget(details).height = detailHeight;
				layoutWidget(preview).top = top + detailHeight;
			};
			const resizeAgent = () => {
				if (attached) return;
				const task = selectedTask;
				const session = active();
				if (task && session)
					run(() =>
						service.resize(
							task.id,
							Math.max(1, Math.floor((screen.width * (100 - leftWidth)) / 100) - 2),
							Math.max(1, screen.height - headerHeight() - detailsHeight() - footerHeight - (notification ? 1 : 0) - 2),
							session.id,
						),
					);
			};
			const showDetails = () => {
				if (selectedTask) {
					details.setContent(detailsText(selectedTask, drafts.get(selectedTask.id), active(), taskSessions?.handoff));
					render();
				}
			};
			const showPreview = async (task = selectedTask, session = historySession ?? active(), token = generation) => {
				if (!task || (mode === "history" && !session)) {
					preview.setContent("No session selected.");
					return;
				}
				if (!session) {
					if (token === generation) {
						preview.setContent(`No active session. Press ${formatKeymap("workspace", "open")} to start or attach.`);
						render();
					}
					return;
				}
				const output = await service.preview(task.id, session.id);
				if (!closed && token === generation && selectedTask?.id === task.id) {
					preview.setContent(output || "Session has no output yet.");
					render();
				}
			};
			const leaveInline = () => {
				if (mode !== "inline" || !selectedTask) return;
				const task = selectedTask;
				const session = active();
				mode = "navigation";
				if (session) run(() => service.resetSize(task.id, session.id));
			};
			const clearTaskSelection = (message: string) => {
				if (selectedTask)
					scrolls.set(selectedTask.id, {
						details: scrollBox(details).getScroll(),
						preview: scrollBox(preview).getScroll(),
					});
				if (fieldEditor) closeField();
				leaveInline();
				mode = "navigation";
				++generation;
				selectedTask = undefined;
				state.selectedTaskId = undefined;
				taskSessions = undefined;
				historySession = undefined;
				preview.setLabel?.(" Live preview ");
				details.setContent(message);
				preview.setContent("");
				clearNotification();
				tree.focus();
			};
			const selectHeader = (index: number, entry: Extract<WorkspaceEntry, { kind: "header" }>) => {
				const changed = selected !== index || selectedTask !== undefined;
				selected = index;
				tree.select(index);
				state.selectedTaskId = undefined;
				if (changed) clearTaskSelection(` ${entry.status} `);
				render();
			};
			const selectTask = async (index: number, task: Task) => {
				const unchanged = selectedTask?.id === task.id;
				if (!unchanged) {
					clearTaskSelection("");
					mode = "navigation";
				}
				selected = index;
				tree.select(index);
				selectedTask = task;
				state.selectedTaskId = task.id;
				if (!unchanged) {
					historySession = undefined;
					details.setContent(detailsText(task, drafts.get(task.id)));
					preview.setContent(`No active session. Press ${formatKeymap("workspace", "open")} to start or attach.`);
				}
				preview.setLabel?.(" Live preview ");
				const token = ++generation;
				render();
				const sessions = await service.list(task.id);
				if (closed || token !== generation || selectedTask?.id !== task.id) return;
				taskSessions = sessions;
				if (mode !== "history") showDetails();
				if (!unchanged) {
					const saved = scrolls.get(task.id);
					scrollBox(details).setScroll(saved?.details ?? 0);
					scrollBox(preview).setScroll(saved?.preview ?? 0);
				}
				if (mode !== "history") await showPreview(task, active(), token);
			};
			const select = async (index: number) => {
				const entry = entries[index];
				if (!entry) return;
				if (entry.kind === "header") selectHeader(index, entry);
				else await selectTask(index, entry.task);
			};
			const toggleGroup = async (index: number) => {
				const entry = entries[index];
				if (entry?.kind !== "header") {
					return;
				}
				await select(index);
				if (collapsed.has(entry.status)) collapsed.delete(entry.status);
				else collapsed.add(entry.status);
				await reload(false);
			};
			const updateTreeRows = (rows: string[]) => {
				const list = tree as typeof tree & { removeItem(index: number): void };
				const node = screen as typeof screen & { remove(this: typeof tree, item: (typeof list.items)[number]): void };
				while (list.items.length > rows.length) {
					const index = list.items.length - 1;
					// List#remove only handles numeric indexes, so use Node#remove to detach the row.
					node.remove.call(tree, list.items[index]);
					list.removeItem(index);
				}
				tree.setItems(rows);
			};
			const loadWorkspaceEntries = async () => {
				const config = await core.filesystem.loadConfig();
				if (closed) return false;
				statuses = config?.statuses ?? statuses;
				tasks = await core.filesystem.listTasks();
				if (closed) return false;
				availableLabels = collectAvailableLabels(tasks, initialConfig?.labels ?? []);
				const filteredTasks = applyTaskFilters(
					tasks,
					taskFilterOptions(filters, "any", resolveMilestoneLabel),
					createTaskSearchIndex(tasks),
				);
				entries = buildWorkspaceEntries(filteredTasks, statuses, "All", collapsed);
				return filteredTasks.length > 0;
			};
			const reload = async (selectTask = true) => {
				if (busy || closed) return;
				busy = true;
				try {
					const previous = entries[selected];
					const hasTasks = await loadWorkspaceEntries();
					if (closed) return;
					updateTreeRows(workspaceRows(entries));
					if (!hasTasks) {
						selected = -1;
						clearTaskSelection("No tasks match this filter.");
						render();
						return;
					}
					selected = reconciledWorkspaceSelection(
						entries,
						previous,
						state.selectedTaskId ?? selectedTask?.id,
						!selectTask,
					);
					if (selected >= 0) {
						await select(selected);
						render();
					} else {
						clearTaskSelection("No tasks match this filter.");
						render();
					}
				} finally {
					busy = false;
				}
			};
			const closeField = () => {
				if (!fieldEditor || !selectedTask) return;
				const { field, widget } = fieldEditor;
				const draft = drafts.get(selectedTask.id) ?? createWorkspaceDraft(selectedTask);
				draft.values[field] = widget.getValue();
				draft.cursor[field] = {
					x: widget.cpos?.x ?? 0,
					y: widget.cpos?.y ?? 0,
					scroll: widget.getScroll?.() ?? 0,
				};
				drafts.set(selectedTask.id, draft);
				widget.cancel?.();
				widget.destroy();
				fieldEditor = undefined;
				mode = "details";
				details.focus();
				showDetails();
			};
			const openField = (field: DraftField) => {
				if (!selectedTask) return;
				const task = selectedTask;
				const draft = drafts.get(task.id) ?? createWorkspaceDraft(task);
				drafts.set(task.id, draft);
				mode = "field";
				const widget = editableWidget(
					textarea({
						parent: screen,
						top: headerHeight(),
						left: `${leftWidth}%`,
						width: `${100 - leftWidth}%`,
						height: detailsHeight(),
						border: "line",
						label: ` ${FIELDS.find(([name]) => name === field)?.[1]} · ${formatKeymap("workspace", "save")} save · ${formatKeymap("workspace", "close")} details `,
						keys: true,
						mouse: true,
						inputOnFocus: false,
						scrollable: true,
						value: draft.values[field],
					}),
				);
				fieldEditor = { field, widget };
				const savedCursor = draft.cursor[field];
				if (savedCursor) {
					widget.cpos = { x: savedCursor.x, y: savedCursor.y };
					widget.setScroll?.(savedCursor.scroll);
				}
				widget.focus();
				widget.readInput();
				widget.key(keymapKeys("workspace", "save"), () => {
					closeField();
					run(async () => {
						const current = await core.getTask(task.id);
						if (!current) throw new Error("Task no longer exists.");
						const changes = changedTaskFields(draft, current);
						const { acceptanceCriteria, ...textChanges } = changes;
						const input: TaskUpdateInput = textChanges;
						if (acceptanceCriteria !== undefined)
							input.acceptanceCriteria = parseAcceptanceCriteria(acceptanceCriteria);
						if (Object.keys(input).length) await core.updateTaskFromInput(task.id, input);
						drafts.set(task.id, createWorkspaceDraft((await core.getTask(task.id)) ?? current));
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
			const enterDetails = () => {
				if (!focusedTask()) return;
				mode = "details";
				showDetails();
				details.setLabel?.(
					` Details · ${formatKeymap("workspace", "edit")} edit field · ${formatKeymap("workspace", "history")} history · ${formatKeymap("workspace", "close")} task list `,
				);
				details.focus();
				tell(
					` ${formatKeymap("workspace", "edit")} edit field  ${formatKeymap("shared", "up")}${formatKeymap("shared", "down")} field  ${formatKeymap("workspace", "history")} history  ${formatKeymap("workspace", "close")} task list `,
				);
			};
			let detailField = 0;
			const showHistory = async () => {
				if (!selectedTask || mode !== "details") return;
				const current = await service.list(selectedTask.id);
				taskSessions = current;
				mode = "history";
				historySession = current.sessions.at(-1);
				preview.setLabel?.(
					` History · ${formatKeymap("shared", "up")}${formatKeymap("shared", "down")} choose · ${formatKeymap("workspace", "open")} preview · ${formatKeymap("workspace", "close")} details `,
				);
				preview.setContent(
					current.sessions
						.map(
							(item, index) =>
								`${index === current.sessions.length - 1 ? ">" : " "} ${item.createdAt}  ${item.status}  ${item.id}`,
						)
						.join("\n") || "No session history.",
				);
				render();
				preview.focus();
			};
			details.key(keymapKeys("workspace", "close"), () => {
				if (mode !== "details") return;
				mode = "navigation";
				details.setLabel?.(" Details ");
				tree.focus();
				return false;
			});
			details.key(keymapKeys("workspace", "history"), () => {
				if (mode === "details") run(showHistory);
				return false;
			});
			details.key(
				[...keymapKeys("shared", "up"), ...keymapKeys("shared", "down")],
				(_character: unknown, key: unknown) => {
					if (mode !== "details") return;
					detailField =
						(detailField + ((key as { name?: string }).name === "up" ? FIELDS.length - 1 : 1)) % FIELDS.length;
					tell(`${FIELDS[detailField]?.[1]} · ${formatKeymap("workspace", "edit")} edits`);
					return false;
				},
			);
			details.key(keymapKeys("workspace", "edit"), () => {
				if (mode === "details") openField(FIELDS[detailField]?.[0] ?? "description");
				return false;
			});
			preview.key(keymapKeys("workspace", "close"), () => {
				if (mode !== "history") return;
				mode = "details";
				historySession = undefined;
				preview.setLabel?.(" Live preview ");
				showDetails();
				run(() => showPreview(selectedTask, active()));
				details.focus();
				return false;
			});
			preview.key(
				[...keymapKeys("shared", "up"), ...keymapKeys("shared", "down")],
				(_character: unknown, key: unknown) => {
					if (mode !== "history" || !taskSessions?.sessions.length) return;
					const all = taskSessions.sessions;
					const current = historySession ?? all[0];
					if (!current) return false;
					const index = Math.max(
						0,
						Math.min(all.length - 1, all.indexOf(current) + ((key as { name?: string }).name === "up" ? -1 : 1)),
					);
					historySession = all[index];
					preview.setContent(
						all
							.map(
								(item) => `${item.id === historySession?.id ? ">" : " "} ${item.createdAt}  ${item.status}  ${item.id}`,
							)
							.join("\n"),
					);
					render();
					return false;
				},
			);
			preview.key(keymapKeys("workspace", "open"), () => {
				if (mode === "history" && selectedTask) run(() => showPreview(selectedTask, historySession));
				return false;
			});
			const focusFilterControl = (filterId: FilterControlId) => focusTaskFilterControl(filterHeader, filterId);
			const openFilter = async (filterId: Exclude<FilterControlId, "search">) => {
				if (filterPopupOpen) return;
				filterPopupOpen = true;
				try {
					const nextFilters = await openTaskFilterPicker({
						screen,
						filterId,
						filters,
						statuses,
						taskTypes,
						projects,
						priorityOptions,
						labels: availableLabels,
						milestones: availableMilestoneTitles,
					});
					if (nextFilters !== null) {
						filters = nextFilters;
						state.filters = filters;
						filterHeader.setFilters(nextFilters);
						await reload();
					}
				} finally {
					filterPopupOpen = false;
					focusFilterControl(filterId);
					render();
				}
			};
			filterHeader = createFilterHeader({
				parent: screen,
				statuses,
				availableLabels,
				availableMilestones: availableMilestoneTitles,
				visibleFilters: taskFilterHeaderControls(projects),
				initialFilters: filters,
				onFilterChange: (nextFilters) => {
					filters = nextFilters;
					state.filters = filters;
					run(() => reload());
				},
				onFilterPickerOpen: (filterId) => {
					run(() => openFilter(filterId));
				},
			});
			filterHeader.setFocusChangeHandler((focus) => {
				filterFocused = focus !== null;
				if (focus !== null && mode === "inline" && selectedTask) {
					const task = selectedTask;
					const session = active();
					mode = "navigation";
					if (session) run(() => service.resetSize(task.id, session.id));
				}
			});
			filterHeader.setExitRequestHandler(() => {
				filterFocused = false;
				filterHeader.setBorderColor("cyan");
				tree.focus();
			});
			const openConfig = () => {
				if (!selectedTask) return;
				mode = "config";
				const task = selectedTask;
				let scope: AgentConfigScope = "card";
				let selectedPreset = "";
				let editable: AgentConfiguration | undefined;
				let worktree = false;
				let bootstrap: AgentPreset["bootstrap"] = "prompt";
				const bootstraps: AgentPreset["bootstrap"][] = [
					"opencode",
					"claude",
					"codex",
					"gemini",
					"antigravity",
					"prompt",
				];
				const scopeList = list({
					parent: screen,
					top: "8%",
					left: "28%",
					width: "20%",
					height: 6,
					border: "line",
					label: " Scope ",
					keys: true,
					mouse: true,
					items: ["root", "project", "card"],
				});
				const presetList = list({
					parent: screen,
					top: "8%",
					left: "48%",
					width: "24%",
					height: 6,
					border: "line",
					label: " Preset ",
					keys: true,
					mouse: true,
				});
				const command = textarea({
					parent: screen,
					top: "25%",
					left: "28%",
					width: "44%",
					height: 4,
					border: "line",
					label: " Command ",
					keys: true,
					inputOnFocus: false,
				});
				const environment = textarea({
					parent: screen,
					top: "38%",
					left: "28%",
					width: "44%",
					height: 6,
					border: "line",
					label: " Environment (KEY=value) ",
					keys: true,
					inputOnFocus: false,
				});
				const prepare = textarea({
					parent: screen,
					top: "57%",
					left: "28%",
					width: "44%",
					height: 6,
					border: "line",
					label: " Prepare ",
					keys: true,
					inputOnFocus: false,
				});
				const bootstrapList = list({
					parent: screen,
					top: "77%",
					left: "28%",
					width: "22%",
					height: 4,
					border: "line",
					label: " Bootstrap ",
					keys: true,
					mouse: true,
					items: bootstraps,
				});
				const worktreeBox = box({
					parent: screen,
					top: "77%",
					left: "50%",
					width: "22%",
					height: 3,
					border: "line",
					label: " Worktree ",
					mouse: true,
				});
				const widgets = [scopeList, presetList, command, environment, prepare, bootstrapList, worktreeBox];
				let focusedWidget = 0;
				const focusWidget = (index: number) => {
					focusedWidget = (index + widgets.length) % widgets.length;
					for (const widget of [command, environment, prepare]) editableWidget(widget).cancel?.();
					const widget = widgets[focusedWidget];
					widget?.focus();
					if (widget === command || widget === environment || widget === prepare) editableWidget(widget).readInput?.();
				};
				const tabHandler = () => {
					if (mode !== "config") return;
					focusWidget(focusedWidget + 1);
					return false;
				};
				const closeConfig = () => {
					screen.unkey(keymapKeys("shared", "tab"), tabHandler);
					screen.unkey(keymapKeys("workspace", "save"), save);
					for (const widget of widgets) widget.destroy();
					disposeConfig = () => {};
					mode = "navigation";
					tree.focus();
					render();
				};
				disposeConfig = closeConfig;
				const showWorktree = () => worktreeBox.setContent(` ${worktree ? "[x]" : "[ ]"} Use a task worktree `);
				const setPreset = () => {
					if (!editable) return;
					const preset = editable.presets[selectedPreset];
					if (!preset) return;
					command.setValue(preset.command);
					environment.setValue(
						Object.entries(preset.env)
							.map(([key, value]) => `${key}=${value}`)
							.join("\n"),
					);
					prepare.setValue(preset.prepare);
					worktree = preset.worktree;
					bootstrap = preset.bootstrap;
					bootstrapList.select(bootstraps.indexOf(bootstrap));
					showWorktree();
				};
				const load = async () => {
					editable = await getEditableAgentConfiguration(core, scope, scope === "card" ? task.id : undefined);
					selectedPreset = editable.selectedPreset;
					scopeList.select(["root", "project", "card"].indexOf(scope));
					presetList.setItems([...Object.keys(editable.presets), "+ New preset"]);
					presetList.select(Object.keys(editable.presets).indexOf(selectedPreset));
					setPreset();
					render();
				};
				run(load);
				focusWidget(0);
				scopeList.key(keymapKeys("workspace", "open"), () => {
					const next = ["root", "project", "card"][selectedIndex(scopeList)] as AgentConfigScope;
					if (next && next !== scope) {
						scope = next;
						run(load);
					}
					return false;
				});
				presetList.key(keymapKeys("workspace", "open"), () => {
					const config = editable;
					if (!config) return false;
					const name = [...Object.keys(config.presets), "+ New preset"][selectedIndex(presetList)];
					if (name === "+ New preset") {
						const prompt = textarea({
							parent: screen,
							top: "18%",
							left: "28%",
							width: "44%",
							height: 3,
							border: "line",
							label: ` New preset name · ${formatKeymap("workspace", "open")} confirms · ${formatKeymap("workspace", "close")} cancels `,
							keys: true,
							inputOnFocus: false,
						});
						prompt.focus();
						prompt.readInput();
						prompt.key(keymapKeys("workspace", "open"), () => {
							const next = prompt.getValue().trim();
							if (next && !config.presets[next]) {
								config.presets[next] = {
									command: "agent {prompt}",
									env: {},
									prepare: "",
									worktree: false,
									bootstrap: "prompt",
								};
								selectedPreset = next;
								presetList.setItems([...Object.keys(config.presets), "+ New preset"]);
								presetList.select(Object.keys(config.presets).indexOf(next));
								setPreset();
							}
							prompt.destroy();
							presetList.focus();
							return false;
						});
						prompt.key(keymapKeys("workspace", "close"), () => {
							prompt.destroy();
							presetList.focus();
							return false;
						});
					} else if (name) {
						selectedPreset = name;
						setPreset();
					}
					return false;
				});
				worktreeBox.key(keymapKeys("workspace", "toggleWorktree"), () => {
					worktree = !worktree;
					showWorktree();
					return false;
				});
				bootstrapList.key(keymapKeys("workspace", "open"), () => {
					const value = bootstraps[selectedIndex(bootstrapList)];
					if (value) bootstrap = value as AgentPreset["bootstrap"];
					return false;
				});
				worktreeBox.on("click", () => {
					worktree = !worktree;
					showWorktree();
					render();
				});
				const save = () => {
					if (mode !== "config") return;
					run(async () => {
						if (!editable) return;
						const commandValue = command.getValue();
						if (!commandValue.trim()) throw new Error("Command is required.");
						const env = parsePresetEnvironment(environment.getValue());
						await updateAgentConfiguration(
							core,
							scope,
							(config) =>
								updatePresetConfiguration(config, selectedPreset, {
									command: commandValue,
									environment: env,
									prepare: prepare.getValue(),
									worktree,
									bootstrap,
								}),
							scope === "card" ? task.id : undefined,
						);
						closeConfig();
						tell(`Saved ${scope} preset.`);
					});
					return false;
				};
				screen.key(keymapKeys("shared", "tab"), tabHandler);
				screen.key(keymapKeys("workspace", "save"), save);
				for (const widget of widgets) widget.key(keymapKeys("workspace", "save"), save);
				for (const widget of widgets)
					widget.key(keymapKeys("workspace", "close"), () => {
						closeConfig();
						return false;
					});
			};
			const onMouse = (data: unknown) => {
				if (attached || mode === "config" || mode === "composer") return;
				const point = data as { x?: number; y?: number; action?: string; button?: string };
				const index = workspaceMouseIndex(
					tree as unknown as { lpos?: { xi: number; xl: number; yi: number; yl: number } },
					data,
				);
				if (index === undefined) return;
				if (point.action !== "mousemove" && point.action !== "mousedown") return;
				if (entries[index]?.kind === "header") {
					if (point.action === "mousedown" && point.button === "left") run(() => toggleGroup(index));
					else if (index !== selected) run(() => select(index));
				}
				if (entries[index]?.kind === "task" && index !== selected) run(() => select(index));
			};
			const attach = async (task: Task, session: AgentSession) => {
				if (closed) return;
				const mouseEnabled = (screen.program as { mouseEnabled?: boolean }).mouseEnabled === true;
				attached = true;
				screen.leave();
				const resume = screen.program.pause?.();
				try {
					await service.attach(task.id, session.id);
				} finally {
					resume?.();
					attached = false;
					if (!closed) {
						screen.enter();
						if (mouseEnabled) screen.program.enableMouse();
						render();
						resizeAgent();
					}
				}
			};
			type NavigationAction =
				| "quit"
				| "board"
				| "up"
				| "down"
				| "search"
				| "shrinkSidebar"
				| "expandSidebar"
				| "shrinkDetails"
				| "expandDetails"
				| "details"
				| "open"
				| "inlineInput"
				| "newTask"
				| "handoff"
				| "config";
			const navigationBindings: Array<{ action: NavigationAction; keys: string[] }> = [
				{ action: "quit", keys: keymapKeys("shared", "quitWithoutEscape") },
				{ action: "board", keys: keymapKeys("workspace", "board") },
				{ action: "up", keys: keymapKeys("workspace", "up") },
				{ action: "down", keys: keymapKeys("workspace", "down") },
				{ action: "search", keys: keymapKeys("workspace", "search") },
				{ action: "shrinkSidebar", keys: keymapKeys("workspace", "shrinkSidebar") },
				{ action: "expandSidebar", keys: keymapKeys("workspace", "expandSidebar") },
				{ action: "shrinkDetails", keys: keymapKeys("workspace", "shrinkDetails") },
				{ action: "expandDetails", keys: keymapKeys("workspace", "expandDetails") },
				{ action: "details", keys: keymapKeys("workspace", "details") },
				{ action: "open", keys: keymapKeys("workspace", "open") },
				{ action: "inlineInput", keys: keymapKeys("workspace", "inlineInput") },
				{ action: "newTask", keys: keymapKeys("workspace", "newTask") },
				{ action: "handoff", keys: keymapKeys("workspace", "handoff") },
				{ action: "config", keys: keymapKeys("workspace", "config") },
			];
			const startComposer = () => {
				mode = "composer";
				run(async () => {
					try {
						const created = await (options.taskComposer ?? openTaskComposer)({
							screen,
							statuses,
							types: taskTypes,
							priorities: priorityOptions.map((priority) => priority.value),
							projects,
							persist: async (input) => {
								const config = await core.filesystem.loadConfig();
								return (await core.createTaskFromInput(input, config?.autoCommit ?? false)).task;
							},
						});
						if (created) {
							state.selectedTaskId = created.id;
							await reload();
						}
					} finally {
						if (!closed) {
							mode = "navigation";
							tree.focus();
							render();
						}
					}
				});
			};
			const startOrAttachSession = () => {
				const task = focusedTask();
				if (!task || sessionAction) return;
				sessionAction = true;
				run(async () => {
					try {
						const session = active() ?? (await service.start(task.id));
						if (!closed) await attach(task, session);
						if (!closed && selectedTask?.id === task.id) await select(selected);
					} finally {
						attached = false;
						sessionAction = false;
					}
				});
			};
			const moveSelection = (step: number) => {
				const next = Math.max(0, Math.min(entries.length - 1, selected + step));
				if (next !== selected) run(() => select(next));
			};
			const resizePanel = (panel: "sidebar" | "details", amount: number) => {
				if (panel === "sidebar") leftWidth = Math.max(18, Math.min(50, leftWidth + amount));
				else split = Math.max(30, Math.min(75, split + amount));
				layout();
				resizeAgent();
				render();
			};
			const openSelectedEntry = () => {
				if (entries[selected]?.kind === "header") run(() => toggleGroup(selected));
				else startOrAttachSession();
			};
			const sendHandoffRequest = () => {
				const task = focusedTask();
				if (task)
					run(async () => {
						await service.requestHandoff(task.id);
						await select(selected);
					});
			};
			const navigationActions: Record<NavigationAction, () => void> = {
				quit: () => close("exit"),
				board: () => close("board"),
				up: () => moveSelection(-1),
				down: () => moveSelection(1),
				search: () => filterHeader.focusSearch(),
				shrinkSidebar: () => resizePanel("sidebar", -2),
				expandSidebar: () => resizePanel("sidebar", 2),
				shrinkDetails: () => resizePanel("details", -2),
				expandDetails: () => resizePanel("details", 2),
				details: enterDetails,
				open: openSelectedEntry,
				inlineInput: () => {
					if (!focusedTask()) return;
					if (active()) {
						mode = "inline";
						tell("Inline tmux input · Ctrl+Q returns");
					} else tell("Start a session first.");
				},
				newTask: startComposer,
				handoff: sendHandoffRequest,
				config: openConfig,
			};
			const forwardsInlineInput = (
				ch: string,
				key: { name?: string; full?: string; sequence?: string; ctrl?: boolean },
			) => {
				if (mode !== "inline" || !selectedTask) return false;
				if (matchesKey(keymapKeys("workspace", "inlineClose"), key)) {
					const task = selectedTask;
					const session = active();
					mode = "navigation";
					tell("Task navigation.");
					if (session) run(() => service.resetSize(task.id, session.id));
					return true;
				}
				const input = terminalInput(ch, key);
				const session = active();
				if (input && session) {
					const task = selectedTask;
					inputQueue = inputQueue
						.then(() => service.sendInput(task.id, input, session.id))
						.catch((error) => tell(error instanceof Error ? error.message : String(error)));
				}
				return true;
			};
			const capturesWorkspaceKey = () =>
				filterFocused ||
				filterPopupOpen ||
				mode === "composer" ||
				mode === "field" ||
				mode === "config" ||
				mode === "details" ||
				mode === "history";
			const dispatchNavigationKey = (key: { name?: string; full?: string; sequence?: string; ctrl?: boolean }) => {
				const action = navigationBindings.find((binding) => matchesKey(binding.keys, key))?.action;
				if (action) navigationActions[action]();
			};
			const onKeypress = (character: unknown, raw: unknown) => {
				if (attached) return;
				const ch = typeof character === "string" ? character : "";
				const key = raw as { name?: string; full?: string; sequence?: string; ctrl?: boolean };
				if (capturesWorkspaceKey() || forwardsInlineInput(ch, key)) return;
				dispatchNavigationKey(key);
			};
			const onResize = () => {
				if (attached) return;
				filterHeader.rebuild();
				layout();
				resizeAgent();
				render();
			};
			const poll = setInterval(() => {
				if (!closed && !attached && mode !== "field" && mode !== "history" && mode !== "config" && mode !== "composer")
					run(async () => {
						if (selectedTask) await service.recover(selectedTask.id);
						await reload(false);
					});
			}, 2000);
			const onDestroy = () => dispose();
			screen.on("mouse", onMouse);
			screen.on("keypress", onKeypress);
			screen.on("resize", onResize);
			screen.on("destroy", onDestroy);
			layout();
			run(() => reload());
		});
	}
}
