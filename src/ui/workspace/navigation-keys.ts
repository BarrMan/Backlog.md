import type { TmuxWorkspace } from "../../agent-workspace/tmux-workspace.ts";
import type { WorkspaceStateService } from "../../agent-workspace/workspace-state.ts";
import { keymapKeys, matchesKey } from "../keymap.ts";
import type { WorkspaceEntry } from "./model.ts";
import { quitWorkspaceHost, type WorkspaceQuittableHost } from "./native-regions.ts";
import type { WorkspaceKey } from "./session-view.ts";
import type { SharedWorkspaceState, WorkspaceViewState } from "./state.ts";

type WorkspaceHost = Pick<TmuxWorkspace, "showBoard" | "focusAgent"> &
	Partial<Pick<TmuxWorkspace, "focusSearch" | "focusDetails" | "setDetailsVisible" | "updateWorkspaceState">> &
	WorkspaceQuittableHost;

/** Everything navigation-mode key handling needs from the mounted workspace. */
export type NavigationKeyContext = {
	key: WorkspaceKey;
	host: WorkspaceHost;
	workspaceState: WorkspaceStateService;
	state: WorkspaceViewState;
	entries: WorkspaceEntry[];
	selected: number;
	tasksOnly: boolean;
	run(action: () => Promise<void>): void;
	focusedTaskId(): string | undefined;
	select(index: number): Promise<void>;
	toggleGroup(index: number): Promise<void>;
	startOrShow(): void;
	startComposer(): void;
	openConfig(): void;
	touchDisplayedAgent(): Promise<void>;
	/** Hides the filter header and hands focus to the task tree. */
	leaveFilterHeader(): void;
	setSharedDetailsVisible(visible: boolean): Promise<void>;
	showDetails(): void;
	details: { focus(): void; setLabel?(label: string): void };
	layout(): void;
	updateFooter(): void;
	render(): void;
};

/**
 * Key handling for the task-list (navigation) mode. Detail/session modes are handled by
 * {@link handleSessionViewKey}; field, config, and composer modes own their own input.
 */
export function handleNavigationKey(context: NavigationKeyContext): void {
	const { key, host, state, entries, selected, run } = context;

	if (matchesKey(keymapKeys("shared", "quitWithoutEscape"), key)) {
		run(() => quitWorkspaceHost(host));
		return;
	}
	if (matchesKey(keymapKeys("workspace", "board"), key)) {
		run(() => host.showBoard());
		return;
	}
	if (matchesKey(keymapKeys("workspace", "up"), key) || matchesKey(keymapKeys("workspace", "down"), key)) {
		const step = key.name === "up" ? -1 : 1;
		const next = Math.max(0, Math.min(entries.length - 1, selected + step));
		if (next !== selected) run(() => context.select(next));
		return;
	}
	if (matchesKey(keymapKeys("workspace", "search"), key)) {
		run(async () => {
			await host.focusSearch?.();
		});
		return;
	}

	const toggleDetails = matchesKey(keymapKeys("workspace", "details"), key);
	const focusDetails = matchesKey(keymapKeys("workspace", "focusDetails"), key);
	if ((toggleDetails || focusDetails) && context.focusedTaskId()) {
		if (context.tasksOnly) {
			run(async () => {
				if (toggleDetails) return context.setSharedDetailsVisible(!state.detailsVisible);
				if (!state.detailsVisible) return;
				await host.updateWorkspaceState?.<SharedWorkspaceState>((shared) => ({
					...shared,
					footerContext: "details",
				}));
				await host.focusDetails?.();
			});
			return;
		}
		if (toggleDetails) {
			state.detailsVisible = !state.detailsVisible;
			context.layout();
		} else {
			if (!state.detailsVisible) return;
			context.showDetails();
		}
		context.updateFooter();
		context.render();
		return;
	}

	if (matchesKey(keymapKeys("workspace", "open"), key)) {
		if (entries[selected]?.kind === "header") run(() => context.toggleGroup(selected));
		else context.startOrShow();
		return;
	}
	if (matchesKey(keymapKeys("workspace", "inlineInput"), key)) {
		context.leaveFilterHeader();
		run(async () => {
			await context.touchDisplayedAgent();
			await host.focusAgent(false);
		});
		return;
	}
	if (matchesKey(keymapKeys("workspace", "newTask"), key)) {
		context.startComposer();
		return;
	}
	const taskId = context.focusedTaskId();
	if (taskId && matchesKey(keymapKeys("workspace", "handoff"), key)) {
		run(async () => {
			await context.workspaceState.requestHandoff(taskId);
			await context.select(selected);
		});
		return;
	}
	if (matchesKey(keymapKeys("workspace", "config"), key)) context.openConfig();
}
