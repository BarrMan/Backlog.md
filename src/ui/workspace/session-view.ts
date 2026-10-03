import type { AgentSession, TaskSessions } from "../../agent-workspace/types.ts";
import type { WorkspaceStateService } from "../../agent-workspace/workspace-state.ts";
import type { Task } from "../../types/index.ts";
import { keymapKeys, matchesKey } from "../keymap.ts";
import { escapeBlessedTags, type WorkspaceMode } from "./footer.ts";

export type WorkspaceKey = { name?: string; full?: string; sequence?: string; ctrl?: boolean };

/** The slice of {@link WorkspaceMode} these three views own, derived so it cannot drift from the full union. */
export type SessionViewMode = Extract<WorkspaceMode, "details" | "history" | "output">;

type FocusableWidget = { focus(): void };
type DetailsWidget = { focus(): void; setLabel?(label: string): void; setContent(content: string): void };

/**
 * Everything the details / session-history / saved-output views need from the workspace. These three
 * modes read and mutate the same selection and session state, so they are handled together rather
 * than as three near-identical key dispatchers inside the controller.
 */
export type SessionViewContext = {
	key: WorkspaceKey;
	mode: SessionViewMode;
	setMode(mode: SessionViewMode): void;
	details: DetailsWidget;
	detailsViewport: { setScroll(value: number): void };
	tree: FocusableWidget;
	workspaceState: WorkspaceStateService;
	/** False once the workspace has closed, so in-flight session loads can bail out. */
	isClosed(): boolean;
	selectedTask: Task | undefined;
	historySession: AgentSession | undefined;
	setHistorySession(session: AgentSession | undefined): void;
	taskSessions: TaskSessions | undefined;
	run(action: () => Promise<void>): void;
	render(): void;
	updateFooter(): void;
	activateFooterContext(): void;
	showDetails(): void;
	showHistory(): void;
	showHistoryRows(): void;
	/** Opens the editor for the currently highlighted detail field. */
	openCurrentField(): void;
	cycleDetailField(delta: number): void;
	/** Leaves the details view: focus back to the task list, or hand over to the tasks pane. */
	leaveDetails(): void;
	showAgent(task: Task | undefined, session: AgentSession | undefined): void;
	focusAgent(focused: boolean): Promise<void> | void;
};

const VERTICAL = [...keymapKeys("shared", "up"), ...keymapKeys("shared", "down")];

export function handleSessionViewKey(context: SessionViewContext): void {
	const { key, details, run, render, updateFooter, activateFooterContext } = context;

	if (context.mode === "details") {
		if (matchesKey(keymapKeys("workspace", "close"), key)) {
			context.leaveDetails();
		} else if (matchesKey(keymapKeys("workspace", "history"), key)) {
			run(() => Promise.resolve(context.showHistory()));
		} else if (matchesKey(keymapKeys("workspace", "edit"), key)) {
			context.openCurrentField();
		} else if (matchesKey(VERTICAL, key)) {
			context.cycleDetailField(key.name === "up" ? -1 : 1);
		}
		return;
	}

	if (context.mode === "output") {
		if (matchesKey(keymapKeys("workspace", "close"), key)) {
			context.setMode("history");
			details.setLabel?.(" Session history ");
			context.showHistoryRows();
			activateFooterContext();
			updateFooter();
			render();
		}
		return;
	}

	if (matchesKey(keymapKeys("workspace", "close"), key)) {
		context.setMode("details");
		context.setHistorySession(undefined);
		details.setLabel?.(" Details (active) ");
		activateFooterContext();
		context.showDetails();
		return;
	}
	if (matchesKey(keymapKeys("workspace", "open"), key)) {
		run(() => openSession(context));
		return;
	}
	if (matchesKey(VERTICAL, key) && context.taskSessions?.sessions.length) {
		const sessions = context.taskSessions.sessions;
		const current = context.historySession ?? sessions[0];
		if (!current) return;
		const step = key.name === "up" ? -1 : 1;
		context.setHistorySession(sessions[Math.max(0, Math.min(sessions.length - 1, sessions.indexOf(current) + step))]);
		context.showHistoryRows();
		render();
	}
}

async function openSession(context: SessionViewContext): Promise<void> {
	const session = context.historySession;
	const task = context.selectedTask;
	if (!session || !task) return;
	if (session.status === "running") {
		await context.showAgent(task, session);
		await context.focusAgent(true);
		return;
	}
	const output = await context.workspaceState.sessionOutput(task.id, session.id);
	const stale =
		context.isClosed() ||
		context.selectedTask?.id !== task.id ||
		context.historySession?.id !== session.id ||
		context.mode !== "history";
	if (stale) return;
	context.setMode("output");
	context.details.setLabel?.(` Session ${session.id.slice(0, 8)} · ${session.status} `);
	context.details.setContent(escapeBlessedTags(Bun.stripANSI(output) || "No saved output."));
	context.detailsViewport.setScroll(0);
	context.activateFooterContext();
	context.updateFooter();
	context.render();
}
