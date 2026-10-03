import type { AgentSession, TaskSessions } from "../../agent-workspace/types.ts";
import type { WorkspaceStateService } from "../../agent-workspace/workspace-state.ts";
import type { Task } from "../../types/index.ts";
import type { WorkspaceMode } from "./footer.ts";
import { sessionLabel } from "./model.ts";

type DetailsWidget = { focus(): void; setLabel?(label: string): void; setContent(content: string): void };
type FocusableWidget = { focus(): void };

export type SessionActionsContext = {
	workspaceState: WorkspaceStateService;
	details: DetailsWidget;
	tree: FocusableWidget;
	mode(): WorkspaceMode;
	setMode(mode: WorkspaceMode): void;
	/** False once the workspace has closed, so in-flight session loads can bail out. */
	isClosed(): boolean;
	/** The current selection generation, bumped on every selection change. */
	selectionGeneration(): number;
	selectedTask(): Task | undefined;
	setTaskSessions(sessions: TaskSessions | undefined): void;
	taskSessions(): TaskSessions | undefined;
	historySession(): AgentSession | undefined;
	setHistorySession(session: AgentSession | undefined): void;
	activateFooterContext(): void;
	updateFooter(): void;
	render(): void;
	run(action: () => Promise<void>): void;
	/** True when this pane owns the whole window, so there is no task list to return to. */
	detailsOnly(): boolean;
	/** Hands focus to the native tasks pane when the workspace is split across tmux panes. */
	leaveToTasksPane(): Promise<void> | void;
};

/**
 * Session-scoped actions shared by the workspace panes: loading the session history for the selected
 * task, rendering its rows, and leaving the details view back to the task list. The key handling for
 * these views lives in ./session-view.ts; this module owns the actions that key handling calls.
 */
export function createSessionActions(context: SessionActionsContext): {
	showHistory: () => Promise<void>;
	showHistoryRows: () => void;
	leaveDetails: () => void;
} {
	const { details, tree, render, updateFooter, activateFooterContext } = context;

	const showHistoryRows = () => {
		const sessions = context.taskSessions();
		if (!sessions) return;
		const currentId = context.historySession()?.id;
		details.setContent(
			sessions.sessions
				.map(
					(item) =>
						`${item.id === currentId ? ">" : " "} ${item.createdAt}  ${sessionLabel(item)}${item.error ? `  ${item.error}` : ""}`,
				)
				.join("\n") || "No session history.",
		);
	};

	const showHistory = async () => {
		const task = context.selectedTask();
		if (!task || context.mode() !== "details") return;
		const taskId = task.id;
		const generation = context.selectionGeneration();
		const sessions = await context.workspaceState.listSessions(taskId);
		const stale =
			context.isClosed() || generation !== context.selectionGeneration() || context.selectedTask()?.id !== taskId;
		if (stale || context.mode() !== "details") return;
		context.setTaskSessions(sessions);
		context.setHistorySession(sessions.sessions.at(-1));
		context.setMode("history");
		activateFooterContext();
		details.setLabel?.(" Session history ");
		showHistoryRows();
		updateFooter();
		details.focus();
		render();
	};

	const leaveDetails = () => {
		if (context.detailsOnly()) {
			context.run(async () => {
				await context.leaveToTasksPane();
			});
			return;
		}
		context.setMode("navigation");
		details.setLabel?.(" Details ");
		tree.focus();
		updateFooter();
		render();
	};

	return { showHistory, showHistoryRows, leaveDetails };
}
