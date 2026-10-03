import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { NewWindowOptions, SplitOptions } from "libtmux";
import { PaneDirection, Server, TmuxCommandError } from "libtmux";
import { LockOwner } from "../file-system/lock-owner.ts";
import { createTmuxChannels, type TmuxChannels } from "./tmux/channels.ts";
import { createTmuxClient, createTmuxClientEntry, type TmuxClient, type TmuxClientEntry } from "./tmux/client.ts";
import { createTmuxExec, type TmuxExec } from "./tmux/exec.ts";
import { createTmuxOptions, DEFAULT_PREFIX, type TmuxOptions } from "./tmux/options.ts";
import { createTmuxPane, type TmuxPane } from "./tmux/pane.ts";
import { createTmuxServerSession, type TmuxServerSession } from "./tmux/server-session.ts";
import { createTmuxSignalsKeys, type TmuxSignalsKeys } from "./tmux/signals-keys.ts";
import { createTmuxWindow, type TmuxWindow } from "./tmux/window.ts";
import { findAbandonedWorkspaces, OWNER_OPTION, OWNER_PID_OPTION } from "./tmux-orphan-sweep.ts";
import { findTmuxPanesByTaskAndRole } from "./tmux-pane-lookup.ts";

export type TmuxWorkspaceView =
	| "board"
	| "workspace"
	| "workspace-nav"
	| "workspace-tasks"
	| "workspace-details"
	| "workspace-footer";

type TmuxCommandOptions = { timeoutMs?: number | null };
type TmuxCommandResult = { exitCode: number; stdout: string; stderr: string };

type TmuxPaneHandle = {
	readonly id: string;
	split(options?: SplitOptions): Promise<TmuxPaneHandle>;
};

type TmuxWindowHandle = {
	readonly id: string;
	readonly activePane?: TmuxPaneHandle;
};

type TmuxSessionHandle = {
	readonly activeWindow?: TmuxWindowHandle;
	readonly activePane?: TmuxPaneHandle;
	newWindow(options?: NewWindowOptions): Promise<TmuxWindowHandle>;
};

type TmuxSessionSelection = {
	where(criteria: { name: string }): { first(): TmuxSessionHandle | undefined };
};

type TmuxPaneSelection = {
	where(criteria: { id: string }): { first(): TmuxPaneHandle | undefined };
};

export interface TmuxWorkspaceServer {
	hasSession(name: string): Promise<boolean>;
	newSession(options: { name: string; startDirectory: string; shellCommand: string }): Promise<TmuxSessionHandle>;
	sessions?(): Promise<TmuxSessionSelection>;
	panes?(): Promise<TmuxPaneSelection>;
	cmd(command: string, args?: readonly string[], options?: TmuxCommandOptions): Promise<readonly string[]>;
}

const OWNER = OWNER_OPTION;
const OWNER_PID = OWNER_PID_OPTION;
const READY = "@backlog_workspace_ready";
const ACTIVE_TASK = "@backlog_workspace_active_task";
const MAILBOX = "@backlog_workspace_task_request";
const BOARD_WINDOW = "@backlog_workspace_board_window";
const BOARD_PANE = "@backlog_workspace_board_pane";
const WORKSPACE_WINDOW = "@backlog_workspace_window";
const NAV_PANE = "@backlog_workspace_nav_pane";
const TASKS_PANE = "@backlog_workspace_tasks_pane";
const DETAILS_PANE = "@backlog_workspace_details_pane";
const DISPLAY_PANE = "@backlog_workspace_display_pane";
const FOOTER_PANE = "@backlog_workspace_footer_pane";
const NAV_HEIGHT = "@backlog_workspace_nav_height";
const FOOTER_HEIGHT = "@backlog_workspace_footer_height";
const VIEW_STATE = "@backlog_workspace_view_state";
const VIEW_STATE_LISTENERS = "@backlog_workspace_view_state_listeners";
const BOOTSTRAP_LOCK_STALE_MS = 2_000;
/** A respawned pane can read as dead for a few milliseconds; give it that long before failing. */
const PANE_LIVENESS_BUDGET_MS = 200;
const PANE_LIVENESS_STEP_MS = 25;
const PANE_OUTPUT_TAIL_LINES = 20;
const TERMINATION_SIGNALS = ["SIGINT", "SIGTERM"] as const;

type SignalSource = {
	on(signal: string, listener: () => void): void;
	off(signal: string, listener: () => void): void;
};

export type WorkspaceTermination = { readonly dispose: () => void };

/**
 * Treat SIGINT/SIGTERM as "tear the workspace down and exit": a terminal that cannot deliver a
 * signal the harness would trap otherwise leaves dead panes inside a surviving session.
 */
export function watchWorkspaceTermination(
	teardown: () => Promise<void>,
	exit: (code: number) => void = (code) => process.exit(code),
	source: SignalSource = process,
): WorkspaceTermination {
	let handled = false;
	const listeners = TERMINATION_SIGNALS.map((signal) => {
		const listener = () => {
			if (handled) return;
			handled = true;
			dispose();
			void teardown()
				.catch(() => {})
				.finally(() => exit(0));
		};
		source.on(signal, listener);
		return [signal, listener] as const;
	});
	const dispose = () => {
		for (const [signal, listener] of listeners) source.off(signal, listener);
	};
	return { dispose };
}
const BOOTSTRAP_LOCK_RETRY_DELAY_MS = 25;
const BOOTSTRAP_LOCK_RETRIES = 200;

type ShellPaneName =
	| "board"
	| "workspace-nav"
	| "tasks-list"
	| "empty-details"
	| "empty-live-preview"
	| "workspace-footer";

type ShellPaneKey =
	| typeof BOARD_PANE
	| typeof NAV_PANE
	| typeof TASKS_PANE
	| typeof DETAILS_PANE
	| typeof DISPLAY_PANE
	| typeof FOOTER_PANE;

const SHELL_PANES: Record<
	ShellPaneKey,
	{
		readonly name: ShellPaneName;
		readonly view?: TmuxWorkspaceView;
		readonly parent?: ShellPaneKey;
		readonly direction?: PaneDirection;
		readonly size?: SplitOptions["size"];
	}
> = {
	[BOARD_PANE]: { name: "board", view: "board" },
	[NAV_PANE]: { name: "workspace-nav", view: "workspace-nav" },
	[TASKS_PANE]: {
		name: "tasks-list",
		view: "workspace-tasks",
		parent: NAV_PANE,
		direction: PaneDirection.Below,
		size: "90%",
	},
	[DETAILS_PANE]: {
		name: "empty-details",
		view: "workspace-details",
		parent: TASKS_PANE,
		direction: PaneDirection.Right,
		size: "58%",
	},
	[DISPLAY_PANE]: { name: "empty-live-preview", parent: DETAILS_PANE, direction: PaneDirection.Below, size: "56%" },
	[FOOTER_PANE]: {
		name: "workspace-footer",
		view: "workspace-footer",
		parent: NAV_PANE,
		direction: PaneDirection.Below,
		size: "1%",
	},
};

function quote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
function placeholder(): string {
	return "exec sleep 2147483647";
}
function sourceEntrypoint(): string | undefined {
	const entrypoint = process.argv[1];
	return entrypoint?.endsWith("/src/cli/index.ts") ? entrypoint : undefined;
}
function workspaceCommand(view: TmuxWorkspaceView, sessionName: string, rootPath: string): string {
	const source = sourceEntrypoint();
	const executable = source ? `${quote(process.execPath)} ${quote(source)}` : quote(process.execPath);
	// A long-lived tmux server may have inherited another project's environment.
	const environment = {
		BACKLOG_CWD: rootPath,
		BACKLOG_TMUX_WORKSPACE: sessionName,
		BACKLOG_TMUX_VIEW: view,
		XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? "",
		PATH: process.env.PATH ?? "",
	};
	return `exec env ${Object.entries(environment)
		.map(([key, value]) => `${key}=${quote(value)}`)
		.join(" ")} ${executable} workspace-ui ${view}`;
}
function outputText(lines: readonly string[]): string {
	return lines.length ? `${lines.join("\n")}\n` : "";
}
export function isTmuxWorkspace(): boolean {
	return Boolean(process.env.BACKLOG_TMUX_WORKSPACE?.trim());
}

/**
 * A root-owned native tmux host. The session, its windows, and its panes outlive every client:
 * only a deliberate quit stops the processes running inside them.
 */
/**
 * Hand the workspace to the user from the host process. Inside tmux the current client is switched so
 * the user keeps their window layout, but a session with no client (or a client tmux refuses to switch)
 * cannot be switched to, so attaching is the fallback rather than a hard failure. Returns the command
 * that handed over the workspace.
 *
 * Routed through `tmux/client.ts`, like {@link TmuxWorkspace.attachClient}: the two paths differ
 * only in fallback policy (`allowAttachFallback`), which the client module already models. Neither
 * goes through `exec.run` — the handover child must own the terminal via inherited stdio.
 */
export async function attachWorkspaceClient(
	sessionName: string,
	options: { insideTmux: boolean; spawn?: typeof Bun.spawn },
): Promise<string> {
	// Typed against the entry-only surface: both branches hand the terminal to `Bun.spawn` with
	// inherited stdio and never call `exec.run`, so no exec surface is needed or built here.
	const client: TmuxClientEntry = createTmuxClientEntry();
	return options.insideTmux
		? await client.switchClientAttach(sessionName, { spawn: options.spawn })
		: await client.attachSession(sessionName, { spawn: options.spawn });
}

/**
 * Tear down a workspace session left behind by a host that died before finishing the build,
 * so the next run starts from a clean shell instead of inheriting dead panes. Collecting a
 * corpse is best effort: any failure falls back to the reuse path rather than blocking startup.
 */
export class TmuxWorkspace {
	private async collectAbandonedHost(): Promise<boolean> {
		try {
			const swept = await findAbandonedWorkspaces({
				rootPath: this.rootPath,
				runner: { run: (args: readonly string[]) => this.run(args) },
			});
			if (!swept.abandoned.includes(this.sessionName)) return false;
			await this.tmuxKeys.killPaneProcessTrees(this.sessionName);
			await this.killSessionIfPresent();
			return true;
		} catch {
			return false;
		}
	}

	private async ensureHostUnlocked(attempts = 0): Promise<void> {
		if (await this.ready()) return;
		if (await this.tmux.hasSession(this.sessionName)) {
			const outcome = await this.withBootstrapLock(async () => {
				if (await this.ready()) return "ready" as const;
				// An unfinished workspace from a host that died is a corpse, not a workspace:
				// collect it before the reuse path tries to rebuild panes that no longer exist.
				if (await this.collectAbandonedHost()) return "collected" as const;
				if (await this.owned()) {
					await this.rebuildTopology();
					return "rebuilt" as const;
				}
				return "foreign" as const;
			});
			if (outcome === "collected") {
				if (attempts >= 3) throw new Error(`Could not collect abandoned tmux session ${this.sessionName}`);
				return await this.ensureHostUnlocked(attempts + 1);
			}
			if (outcome === "foreign")
				throw new Error(`tmux session ${this.sessionName} is not a Backlog workspace for this root`);
			return;
		}
		let boardWindow: string;
		let boardPane: string;
		try {
			const board = await this.tmux.newSession({
				name: this.sessionName,
				startDirectory: this.rootPath,
				shellCommand: placeholder(),
			});
			boardWindow = board.activeWindow?.id ?? "";
			boardPane = board.activePane?.id ?? "";
			if (!boardWindow.startsWith("@") || !boardPane.startsWith("%"))
				throw new Error("tmux did not return workspace resource IDs");
			// Claim the fresh session before any pane exists: a concurrent run must see a live
			// host pid here instead of mistaking a half-built workspace for a corpse.
			await this.set(OWNER_PID, String(process.pid));
		} catch (error) {
			const failure = this.failure(error);
			if (!failure) throw error;
			if (await this.tmux.hasSession(this.sessionName)) {
				if (attempts === 20) throw this.error("Could not create tmux workspace", failure);
				await Bun.sleep(25);
				return await this.ensureHostUnlocked(attempts + 1);
			}
			throw this.error("Could not create tmux workspace", failure);
		}
		await this.withBootstrapLock(async () => {
			const session = await this.workspaceSession();
			const { window: workspaceWindow, pane: navPane } = await this.createWorkspaceWindow(
				session,
				"Could not create Workspace window",
			);
			const footerPane = await this.splitPane(
				navPane,
				{ direction: PaneDirection.Below, size: "1%", shellCommand: placeholder() },
				"Could not create workspace footer pane",
			);
			const tasksPane = await this.splitPane(
				navPane,
				{ direction: PaneDirection.Below, size: "90%", shellCommand: placeholder() },
				"Could not create workspace task pane",
			);
			const detailsPane = await this.splitPane(
				tasksPane,
				{ direction: PaneDirection.Right, size: "58%", shellCommand: placeholder() },
				"Could not create workspace detail pane",
			);
			const displayPane = await this.splitPane(
				detailsPane,
				{ direction: PaneDirection.Below, size: "56%", shellCommand: placeholder() },
				"Could not create workspace display pane",
			);
			// All resource identity exists before ownership is published or any UI process can start.
			for (const [key, value] of [
				[OWNER, this.rootPath],
				[BOARD_WINDOW, boardWindow],
				[BOARD_PANE, boardPane],
				[WORKSPACE_WINDOW, workspaceWindow],
				[NAV_PANE, navPane.id],
				[TASKS_PANE, tasksPane.id],
				[DETAILS_PANE, detailsPane.id],
				[DISPLAY_PANE, displayPane.id],
				[FOOTER_PANE, footerPane.id],
			] as const)
				await this.set(key, value);
			for (const [key, pane] of [
				[BOARD_PANE, boardPane],
				[NAV_PANE, navPane.id],
				[TASKS_PANE, tasksPane.id],
				[DETAILS_PANE, detailsPane.id],
				[DISPLAY_PANE, displayPane.id],
				[FOOTER_PANE, footerPane.id],
			] as const)
				await this.nameShellPane(key, pane);
			await this.resizeRegion(NAV_PANE, NAV_HEIGHT, 3, "Could not resize workspace navigation");
			await this.resizeRegion(FOOTER_PANE, FOOTER_HEIGHT, 1, "Could not resize workspace footer");
			for (const target of [boardWindow, workspaceWindow]) {
				await this.tmuxOptions.setWindowOption("automatic-rename", "off", target);
				await this.tmuxOptions.setWindowOption("remain-on-exit", "on", target, "Could not preserve workspace window");
			}
			await this.tmuxWindow.renameWindow(boardWindow, "Board", "Could not name Board window");
			const prefix = await this.prefix();
			await this.tmuxWindow.renameWindow(workspaceWindow, "Workspace", "Could not name Workspace window");
			await this.tmuxOptions.setOption("key-table", this.table, this.sessionName, "Could not scope workspace keys");
			await this.tmuxKeys.bindKey(prefix, "switch-client", {
				table: this.table,
				commandArgs: ["-T", "prefix"],
				message: "Could not preserve tmux prefix",
			});
			for (const key of ["C-m", "C-i", "/"])
				await this.tmuxKeys.unbindKey(key, { table: this.table }, "Could not clear obsolete workspace key");
			await this.bindReturnKey(workspaceWindow, tasksPane.id);
			await this.set(READY, "1");
			await this.launchUi(boardPane, "board");
			await this.launchUi(navPane.id, "workspace-nav");
			await this.launchUi(tasksPane.id, "workspace-tasks");
			await this.launchUi(detailsPane.id, "workspace-details");
			await this.launchUi(footerPane.id, "workspace-footer");
		});
	}

	private async workspaceSession(): Promise<TmuxSessionHandle> {
		const session = (await this.tmux.sessions?.())?.where({ name: this.sessionName }).first();
		if (!session) throw new Error(`Could not resolve tmux workspace session ${this.sessionName}`);
		return session;
	}
	private async paneHandle(pane: string): Promise<TmuxPaneHandle> {
		const handle = (await this.tmux.panes?.())?.where({ id: pane }).first();
		if (!handle) throw new Error(`Could not resolve tmux workspace pane ${pane}`);
		return handle;
	}
	private async createWorkspaceWindow(
		session: TmuxSessionHandle,
		message: string,
	): Promise<{
		window: string;
		pane: TmuxPaneHandle;
	}> {
		try {
			const window = await session.newWindow({ startDirectory: this.rootPath, shellCommand: placeholder() });
			const pane = window.activePane;
			if (!window.id.startsWith("@") || !pane?.id.startsWith("%"))
				throw new Error("tmux did not return workspace resource IDs");
			return { window: window.id, pane };
		} catch (error) {
			const failure = this.failure(error);
			if (failure) throw this.error(message, failure);
			throw error;
		}
	}
	private async splitPane(pane: TmuxPaneHandle, options: SplitOptions, message: string): Promise<TmuxPaneHandle> {
		try {
			const created = await pane.split({ startDirectory: this.rootPath, ...options });
			if (!created.id.startsWith("%")) throw new Error("tmux did not return workspace pane ID");
			return created;
		} catch (error) {
			const failure = this.failure(error);
			if (failure) throw this.error(message, failure);
			throw error;
		}
	}

	private async rebuildTopology(): Promise<void> {
		const workspace = await this.id(WORKSPACE_WINDOW);
		const activeTask = await this.option(ACTIVE_TASK);
		const activePane = activeTask ? await this.findLivePreviewPane(activeTask) : undefined;
		if (activePane) {
			const display = await this.option(DISPLAY_PANE);
			const agentWindow = await this.tmuxPane.displayMessage(activePane, "#{window_id}");
			if (
				display &&
				display !== activePane &&
				(await this.paneLive(display)) &&
				agentWindow.exitCode === 0 &&
				agentWindow.stdout.trim() === workspace
			)
				await this.tmuxPane.swapPane(activePane, display, "Could not park active live preview pane");
		}
		if (await this.windowInSession(workspace))
			await this.tmuxWindow.killWindow(workspace, "Could not remove obsolete Workspace window");
		const session = await this.workspaceSession();
		const { window, pane: nav } = await this.createWorkspaceWindow(session, "Could not rebuild Workspace window");
		const footerPane = await this.splitPane(
			nav,
			{ direction: PaneDirection.Below, size: "1%", shellCommand: placeholder() },
			"Could not rebuild workspace footer pane",
		);
		const task = await this.splitPane(
			nav,
			{ direction: PaneDirection.Below, size: "90%", shellCommand: placeholder() },
			"Could not rebuild workspace task pane",
		);
		const detail = await this.splitPane(
			task,
			{ direction: PaneDirection.Right, size: "58%", shellCommand: placeholder() },
			"Could not rebuild workspace detail pane",
		);
		const displayPane = await this.splitPane(
			detail,
			{ direction: PaneDirection.Below, size: "56%", shellCommand: placeholder() },
			"Could not rebuild workspace display pane",
		);
		for (const [key, value] of [
			[WORKSPACE_WINDOW, window],
			[NAV_PANE, nav.id],
			[TASKS_PANE, task.id],
			[DETAILS_PANE, detail.id],
			[DISPLAY_PANE, displayPane.id],
			[FOOTER_PANE, footerPane.id],
		] as const)
			await this.set(key, value);
		const navHeight = Number(await this.option(NAV_HEIGHT));
		const footerHeight = Number(await this.option(FOOTER_HEIGHT));
		await this.unset(NAV_HEIGHT);
		await this.unset(FOOTER_HEIGHT);
		await this.resizeRegion(
			NAV_PANE,
			NAV_HEIGHT,
			Number.isFinite(navHeight) && navHeight > 0 ? navHeight : 3,
			"Could not resize workspace navigation",
		);
		await this.resizeRegion(
			FOOTER_PANE,
			FOOTER_HEIGHT,
			Number.isFinite(footerHeight) && footerHeight > 0 ? footerHeight : 1,
			"Could not resize workspace footer",
		);
		await this.unset(ACTIVE_TASK);
		await this.tmuxWindow.renameWindow(window, "Workspace", "Could not name rebuilt Workspace window");
		await this.tmuxOptions.setWindowOption("remain-on-exit", "on", window, "Could not preserve Workspace window");
		for (const key of ["C-m", "C-i", "/"])
			await this.tmuxKeys.unbindKey(key, { table: this.table }, "Could not clear obsolete workspace key");
		await this.bindReturnKey(window, task.id);
		await this.launchUi(nav.id, "workspace-nav");
		await this.launchUi(task.id, "workspace-tasks");
		await this.launchUi(detail.id, "workspace-details");
		await this.launchUi(footerPane.id, "workspace-footer");
		await this.set(READY, "1");
	}

	private async showLivePreview(taskId: string): Promise<void> {
		const activeTaskId = await this.option(ACTIVE_TASK);
		const activePaneId = activeTaskId ? await this.findLivePreviewPane(activeTaskId) : undefined;
		const slotPaneId = activePaneId ?? (await this.emptyPreviewPane());
		const nextPaneId = await this.findLivePreviewPane(taskId);
		if (!nextPaneId) throw new Error(`Live preview pane for task ${taskId} no longer exists`);
		await this.swapPanes(slotPaneId, nextPaneId);
		await this.set(ACTIVE_TASK, taskId);
	}

	private async clearLivePreview(): Promise<void> {
		const activeTaskId = await this.option(ACTIVE_TASK);
		if (!activeTaskId) return;
		const activePaneId = await this.findLivePreviewPane(activeTaskId);
		if (activePaneId) await this.swapPanes(activePaneId, await this.emptyPreviewPane());
		await this.unset(ACTIVE_TASK);
	}

	private async emptyPreviewPane(): Promise<string> {
		return await this.ensureShellPane(DISPLAY_PANE);
	}

	private async swapPanes(source: string, target: string): Promise<void> {
		if (source === target) return;
		await this.tmuxPane.swapPane(source, target, "Could not swap live preview pane");
	}
	private async liveUiPane(
		key: typeof BOARD_PANE | typeof NAV_PANE | typeof TASKS_PANE | typeof DETAILS_PANE | typeof FOOTER_PANE,
		view: TmuxWorkspaceView,
	): Promise<string> {
		const pane = await this.ensureShellPane(key);
		await this.respawnUi(key, view);
		await this.requireLivePane(pane, view);
		return pane;
	}
	/**
	 * A pane that is still respawning reads as dead for a few milliseconds, so poll for a bounded
	 * budget before failing; a pane that never comes back reports its own last output.
	 */
	private async requireLivePane(pane: string, view: TmuxWorkspaceView): Promise<void> {
		const deadline = Date.now() + PANE_LIVENESS_BUDGET_MS;
		for (;;) {
			if (await this.paneLive(pane)) return;
			if (Date.now() >= deadline) break;
			await Bun.sleep(PANE_LIVENESS_STEP_MS);
		}
		const captured = await this.tmuxPane.capture(pane, { lines: PANE_OUTPUT_TAIL_LINES });
		const output = captured.stdout.trim();
		throw new Error(`Could not recover ${view} pane${output ? `: ${output}` : ""}`);
	}
	private async ensureShellPane(key: ShellPaneKey): Promise<string> {
		const existing = await this.option(key);
		if (existing && (await this.paneExists(existing))) {
			await this.nameShellPane(key, existing);
			return existing;
		}
		const pane = await this.createShellPane(key);
		await this.set(key, pane);
		await this.nameShellPane(key, pane);
		return pane;
	}
	private async createShellPane(key: ShellPaneKey): Promise<string> {
		const descriptor = SHELL_PANES[key];
		if (!descriptor.parent || !descriptor.direction || !descriptor.size)
			throw new Error(`tmux workspace is missing ${descriptor.name} pane`);
		const parent = await this.ensureShellPane(descriptor.parent);
		const pane = await this.splitPane(
			await this.paneHandle(parent),
			{ direction: descriptor.direction, size: descriptor.size, shellCommand: placeholder() },
			`Could not create ${descriptor.name} pane`,
		);
		return pane.id;
	}
	private async nameShellPane(key: ShellPaneKey, pane: string): Promise<void> {
		// tmux has no "rename without activating", and `select-pane -T` activates its target, so the
		// window's active pane is restored afterwards. Naming a pane must never move user focus.
		const window = (await this.tmuxPane.displayMessage(pane, "#{window_id}")).stdout.trim();
		const active = window ? (await this.tmuxPane.displayMessage(window, "#{pane_id}")).stdout.trim() : "";
		// `setPaneTitle` throws, and the restore below deliberately does not run if it does: that is
		// today's behaviour. Do not "fix" it by restoring focus in a `finally` — a caller that treats
		// the throw as "focus already restored" is wrong twice.
		await this.tmuxPane.setPaneTitle(pane, SHELL_PANES[key].name);
		if (active && active !== pane) await this.tmuxPane.selectPane(active);
	}
	private async respawnUi(
		key: typeof BOARD_PANE | typeof NAV_PANE | typeof TASKS_PANE | typeof DETAILS_PANE | typeof FOOTER_PANE,
		view: TmuxWorkspaceView,
	): Promise<void> {
		const pane = await this.id(key);
		if (!(await this.paneLive(pane))) await this.launchUi(pane, view);
	}
	private async launchUi(pane: string, view: TmuxWorkspaceView): Promise<void> {
		await this.tmuxPane.respawnPane(pane, {
			cwd: this.rootPath,
			command: workspaceCommand(view, this.sessionName, this.rootPath),
		});
	}
	private async bindReturnKey(workspaceWindow: string, tasksPane: string): Promise<void> {
		// The `-Z` inside the embedded if-shell stays a bare atomic toggle (§2.3).
		await this.tmuxKeys.bindReturnKey({
			table: this.table,
			workspaceWindow,
			tasksPane,
		});
	}
	private async selectWindow(window: string): Promise<void> {
		await this.tmuxWindow.selectWindow(window, "Could not select workspace window");
	}
	private async zoomed(): Promise<boolean> {
		const result = await this.tmuxPane.displayMessage(await this.id(WORKSPACE_WINDOW), "#{window_zoomed_flag}");
		return result.exitCode === 0 && result.stdout.trim() === "1";
	}
	private async findLivePreviewPane(taskId: string): Promise<string | undefined> {
		const matches = await this.livePreviewPanes(taskId);
		if (matches.length > 1) throw new Error(`Multiple tmux live preview panes match task ${taskId}.`);
		return matches[0]?.paneId;
	}
	private async livePreviewPanes(taskId: string): Promise<
		Array<{
			paneId: string;
			taskId: string;
			windowId: string;
		}>
	> {
		return (
			await findTmuxPanesByTaskAndRole({
				// `tmux/pane.ts` owns the `list-panes -a …` argv outright, so nothing is built here
				// and nothing is parsed back out; `-a` comes from that layer, as it always has.
				listPanes: (paneOptions) => this.tmuxPane.listPanes(paneOptions),
				rootPath: this.rootPath,
				taskId,
				role: "live-preview",
				includeWindow: true,
			})
		).flatMap((pane) => (pane.windowId ? [{ paneId: pane.paneId, taskId: pane.taskId, windowId: pane.windowId }] : []));
	}
	private async paneExists(pane: string): Promise<boolean> {
		const result = await this.tmuxPane.displayMessage(pane, "#{pane_id}");
		return result.exitCode === 0 && result.stdout.trim() === pane;
	}
	private async paneLive(pane: string): Promise<boolean> {
		const result = await this.tmuxPane.displayMessage(pane, "#{pane_id} #{pane_dead}");
		if (result.exitCode !== 0) return false;
		const [actualPaneId, paneDead] = result.stdout.trim().split(/\s+/);
		return actualPaneId === pane && paneDead !== "1";
	}
	private async prefix(): Promise<string> {
		return (await this.tmuxOptions.showGlobalOption("prefix")) ?? DEFAULT_PREFIX;
	}
	private async ready(): Promise<boolean> {
		if ((await this.option(READY)) !== "1" || !(await this.owned())) return false;
		const workspaceWindow = await this.option(WORKSPACE_WINDOW);
		return !!workspaceWindow && (await this.windowInSession(workspaceWindow));
	}
	private async windowInSession(window: string): Promise<boolean> {
		const windows = await this.tmuxWindow.listWindows(this.sessionName, "Could not inspect Workspace window");
		return windows.some((candidate) => candidate.trim() === window);
	}
	private async owned(): Promise<boolean> {
		return (await this.option(OWNER)) === this.rootPath;
	}
	private async id(key: string): Promise<string> {
		const value = await this.option(key);
		if (!value) throw new Error(`tmux workspace is missing ${key}`);
		return value;
	}
	private async option(key: string): Promise<string | undefined> {
		return await this.tmuxOptions.showOption(key, this.sessionName);
	}
	private async workspaceStateListeners(): Promise<string[]> {
		const value = await this.option(VIEW_STATE_LISTENERS);
		try {
			return value ? (JSON.parse(value) as unknown[]).filter((item): item is string => typeof item === "string") : [];
		} catch {
			return [];
		}
	}
	private async set(key: string, value: string): Promise<void> {
		await this.tmuxOptions.setOption(key, value, this.sessionName);
	}
	private async unset(key: string): Promise<void> {
		await this.tmuxOptions.unsetOption(key, this.sessionName);
	}
	private async resizeRegion(paneKey: string, heightKey: string, height: number, message: string): Promise<void> {
		if (!Number.isFinite(height) || height <= 0)
			throw new Error("Workspace region height must be a positive finite number");
		const rows = Math.max(1, Math.floor(height));
		const pane = await this.id(paneKey);
		if ((await this.option(heightKey)) === String(rows)) {
			const current = await this.tmuxPane.displayMessage(pane, "#{pane_height}");
			const currentRows = Number(current.stdout.trim());
			if (Number.isFinite(currentRows) && currentRows > 0 && currentRows === rows) return;
		}
		await this.tmuxPane.resizePaneHeight(pane, rows, message);
		await this.set(heightKey, String(rows));
	}
	/** Serializes shared state writes across panes with a lock that expires when its holder dies. */
	private async withStateLock<T>(operation: () => Promise<T>): Promise<T> {
		return await this.stateLock.withTarget(
			this.rootPath,
			join(this.rootPath, "backlog", ".locks", "workspace-state"),
			{
				staleMs: BOOTSTRAP_LOCK_STALE_MS,
				retries: BOOTSTRAP_LOCK_RETRIES,
				retryDelayMs: BOOTSTRAP_LOCK_RETRY_DELAY_MS,
			},
			(error) =>
				new Error(`Could not lock tmux workspace state: ${error instanceof Error ? error.message : String(error)}`),
			operation,
		);
	}
	private async withBootstrapLock<T>(operation: () => Promise<T>): Promise<T> {
		return await this.bootstrapLock.withTarget(
			this.rootPath,
			join(this.rootPath, "backlog", ".locks", "workspace-bootstrap"),
			{
				staleMs: BOOTSTRAP_LOCK_STALE_MS,
				retries: BOOTSTRAP_LOCK_RETRIES,
				retryDelayMs: BOOTSTRAP_LOCK_RETRY_DELAY_MS,
			},
			(error) =>
				new Error(`Could not lock tmux workspace bootstrap: ${error instanceof Error ? error.message : String(error)}`),
			operation,
		);
	}
	private async run(args: readonly string[], options?: TmuxCommandOptions): Promise<TmuxCommandResult> {
		const [command, ...commandArgs] = args;
		if (!command) throw new Error("tmux command is missing");
		try {
			return { exitCode: 0, stdout: outputText(await this.tmux.cmd(command, commandArgs, options)), stderr: "" };
		} catch (error) {
			const failure = this.failure(error);
			if (failure) return failure;
			throw error;
		}
	}
	private failure(error: unknown): TmuxCommandResult | undefined {
		if (!(error instanceof TmuxCommandError)) return undefined;
		return { exitCode: error.exitCode, stdout: outputText(error.stdout), stderr: outputText(error.stderr) };
	}
	private error(message: string, result: { stderr: string }): Error {
		return new Error(`${message}: ${result.stderr.trim() || "tmux command failed"}`);
	}

	readonly rootPath: string;
	readonly sessionName: string;
	private readonly tmux: TmuxWorkspaceServer;
	private readonly table: string;
	private readonly tmuxExec: TmuxExec;
	private readonly tmuxServer: TmuxServerSession;
	private readonly tmuxWindow: TmuxWindow;
	private readonly tmuxPane: TmuxPane;
	private readonly tmuxOptions: TmuxOptions;
	private readonly tmuxKeys: TmuxSignalsKeys;
	private readonly tmuxChannels: TmuxChannels;
	private readonly tmuxClient: TmuxClient;
	private readonly bootstrapLock = new LockOwner();
	private readonly stateLock = new LockOwner();
	private static readonly bootstraps = new Map<string, Promise<void>>();

	constructor(rootPath: string, tmux: TmuxWorkspaceServer = new Server()) {
		this.rootPath = realpathSync(rootPath);
		const hash = createHash("sha256").update(this.rootPath).digest("hex").slice(0, 12);
		this.sessionName = `backlog-workspace-${hash}`;
		this.table = `backlog-workspace-${hash}`;
		this.tmux = tmux;
		// `diag` is injected, not dropped: without it the `/tmp/focus.log` trace that diagnosed the
		// focus race silently disappears, because `exec.require` calls it for the four traced
		// subcommands (`select-pane`, `send-keys`, `select-window`, `set-option`) before running.
		this.tmuxExec = createTmuxExec({ runner: tmux, diag: (line) => this.diag(line) });
		this.tmuxServer = createTmuxServerSession({ exec: this.tmuxExec, graph: tmux });
		this.tmuxWindow = createTmuxWindow(this.tmuxExec);
		this.tmuxPane = createTmuxPane(this.tmuxExec);
		this.tmuxOptions = createTmuxOptions(this.tmuxExec);
		this.tmuxKeys = createTmuxSignalsKeys(this.tmuxExec);
		this.tmuxChannels = createTmuxChannels(this.tmuxExec);
		this.tmuxClient = createTmuxClient(this.tmuxExec);
	}

	async enter(view: TmuxWorkspaceView, taskId?: string): Promise<void> {
		await this.ensureHost();
		this.installTerminationHandlers();
		if (taskId) await this.showWorkspace(taskId);
		else if (view === "board") await this.showBoard();
		else await this.showWorkspace();
		await this.attachClient();
	}
	/**
	 * Enter the workspace and stay attached until the client goes away.
	 *
	 * The client leaving is not a quit: the terminal can close, tmux can drop the client, or this
	 * process can be killed at any moment. Nothing runs here afterwards, because every one of those
	 * outcomes must leave the session and its panes exactly as they were.
	 */
	private async attachClient(): Promise<void> {
		// Inside tmux the current client is switched, and `allowAttachFallback: false` is deliberate:
		// this path tries exactly ONE command and fails if it does not take, unlike
		// `attachWorkspaceClient` above.
		if (process.env.TMUX) await this.tmuxClient.switchClientAttach(this.sessionName, { allowAttachFallback: false });
		else await this.tmuxClient.attachSession(this.sessionName);
	}
	async showBoard(): Promise<void> {
		await this.ensureHost();
		await this.selectWindow(await this.id(BOARD_WINDOW));
		await this.liveUiPane(BOARD_PANE, "board");
		await this.tmuxPane.requireSelectPane(await this.id(BOARD_PANE), "Could not focus workspace board");
	}
	async showWorkspace(taskId?: string): Promise<void> {
		await this.ensureHost();
		await this.selectWindow(await this.id(WORKSPACE_WINDOW));
		// Focus is claimed before the remaining regions are revalidated so a concurrent key press
		// that arrives mid-handoff is not undone by the work that follows it.
		await this.tmuxPane.requireSelectPane(
			await this.liveUiPane(TASKS_PANE, "workspace-tasks"),
			"Could not focus workspace task list",
		);
		await this.liveUiPane(FOOTER_PANE, "workspace-footer");
		await this.liveUiPane(NAV_PANE, "workspace-nav");
		await this.liveUiPane(DETAILS_PANE, "workspace-details");
		if (taskId) await this.set(MAILBOX, taskId);
	}

	/** Present the selected task's live agent in the display slot without selecting a window or pane. */
	async showAgentSession(taskId: string | undefined, sessionId?: string): Promise<void> {
		await this.ensureHost();
		if (!taskId || !sessionId) {
			await this.clearLivePreview();
			return;
		}
		await this.showLivePreview(taskId);
	}

	async focusAgent(zoom: boolean): Promise<void> {
		await this.ensureHost();
		const taskId = await this.option(ACTIVE_TASK);
		const active = taskId ? await this.findLivePreviewPane(taskId) : undefined;
		if (!active) return;
		if (!zoom && (await this.zoomed())) await this.tmuxPane.toggleZoom(active, "Could not unzoom agent pane");
		await this.tmuxPane.requireSelectPane(active, "Could not focus agent pane");
		if (zoom && !(await this.zoomed())) await this.tmuxPane.toggleZoom(active, "Could not zoom agent pane");
	}
	readonly focusSearch = async (): Promise<void> => {
		await this.ensureHost();
		const pane = await this.liveUiPane(FOOTER_PANE, "workspace-footer");
		this.diag(`focusSearch pane=${pane}`);
		const sel = await this.tmuxPane.selectPane(pane);
		this.diag(`select-pane rc=${sel.exitCode}`);
		const send = await this.tmuxKeys.sendKeys(pane, "/");
		this.diag(`send-keys rc=${send.exitCode}`);
	};
	diag(line: string): void {
		try {
			appendFileSync(
				"/tmp/focus.log",
				`${Date.now()} pid=${process.pid} pane=${process.env.TMUX_PANE ?? "-"} ${line}\n`,
			);
		} catch {}
	}
	async focusTasks(): Promise<void> {
		await this.ensureHost();
		await this.tmuxPane.requireSelectPane(await this.id(TASKS_PANE), "Could not focus workspace task list");
	}
	async focusDetails(): Promise<void> {
		await this.ensureHost();
		await this.tmuxPane.requireSelectPane(await this.id(DETAILS_PANE), "Could not focus workspace details");
	}
	async setDetailsVisible(visible: boolean): Promise<void> {
		await this.ensureHost();
		const details = await this.id(DETAILS_PANE);
		const activeTask = await this.option(ACTIVE_TASK);
		const display =
			(activeTask ? await this.findLivePreviewPane(activeTask) : undefined) ?? (await this.id(DISPLAY_PANE));
		const measured = await this.tmuxPane.displayMessage(details, "#{pane_height}");
		const displayMeasured = await this.tmuxPane.displayMessage(display, "#{pane_height}");
		const detailsHeight = Number(measured.stdout.trim());
		const displayHeight = Number(displayMeasured.stdout.trim());
		if (!Number.isFinite(detailsHeight) || !Number.isFinite(displayHeight)) return;
		const total = Math.max(2, detailsHeight + displayHeight);
		const rows = visible ? Math.max(3, Math.floor(total * 0.44)) : 1;
		await this.tmuxPane.resizePaneHeight(details, rows, "Could not resize workspace details");
	}
	async resizeNavigation(height: number): Promise<void> {
		await this.ensureHost();
		await this.resizeRegion(NAV_PANE, NAV_HEIGHT, height, "Could not resize workspace navigation");
	}
	async resizeFooter(height: number): Promise<void> {
		await this.ensureHost();
		await this.resizeRegion(FOOTER_PANE, FOOTER_HEIGHT, height, "Could not resize workspace footer");
	}

	async takeTaskRequest(): Promise<string | undefined> {
		await this.ensureHost();
		const request = await this.option(MAILBOX);
		if (!request) return undefined;
		// Task IDs are CLI identifiers; reject control characters before embedding in tmux format syntax.
		if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(request)) return undefined;
		await this.tmuxServer.ifShell(
			this.sessionName,
			`#{==:#{${MAILBOX}},${request}}`,
			`set-option -t ${this.sessionName} ${MAILBOX} ''`,
			"Could not consume workspace task request",
		);
		return request;
	}
	async workspaceState<T extends object>(): Promise<T> {
		await this.ensureHost();
		const value = await this.option(VIEW_STATE);
		try {
			return value ? (JSON.parse(value) as T) : ({} as T);
		} catch {
			return {} as T;
		}
	}
	async updateWorkspaceState<T extends object>(update: (state: T) => T): Promise<void> {
		await this.ensureHost();
		await this.withStateLock(async () => {
			const current = (await this.option(VIEW_STATE)) ?? "";
			let state = {} as T;
			try {
				state = current ? (JSON.parse(current) as T) : state;
			} catch {}
			const next = JSON.stringify(update(state));
			if (next === current) return;
			await this.set(VIEW_STATE, next);
			const listeners = await this.workspaceStateListeners();
			// tmux has no command chaining and `wait-for` takes a single channel, so each listener
			// needs its own invocation; one argv holding `; wait-for ...` fails with "too many arguments".
			for (const channel of listeners)
				await this.tmuxChannels.signalChannel(channel, "Could not notify tmux workspace state listeners");
		});
	}
	async subscribeWorkspaceState<T extends object>(
		listener: (state: T) => Promise<void> | void,
	): Promise<() => Promise<void>> {
		await this.ensureHost();
		const channel = `${this.sessionName}-state-${process.env.TMUX_PANE ?? randomUUID()}`;
		let closed = false;
		let removed = false;
		let initial = {} as T;
		const remove = async () => {
			if (removed) return;
			removed = true;
			await this.withStateLock(async () => {
				await this.set(
					VIEW_STATE_LISTENERS,
					JSON.stringify((await this.workspaceStateListeners()).filter((value) => value !== channel)),
				);
			});
		};
		await this.withStateLock(async () => {
			await this.set(
				VIEW_STATE_LISTENERS,
				JSON.stringify([...new Set([...(await this.workspaceStateListeners()), channel])]),
			);
			const value = await this.option(VIEW_STATE);
			try {
				initial = value ? (JSON.parse(value) as T) : initial;
			} catch {}
		});
		try {
			await listener(initial);
		} catch (error) {
			closed = true;
			await remove();
			throw error;
		}
		const wait = (async () => {
			while (!closed) {
				await this.tmuxChannels.waitFor(channel, "Could not wait for tmux workspace state");
				if (!closed) {
					const value = await this.option(VIEW_STATE);
					let state = {} as T;
					try {
						state = value ? (JSON.parse(value) as T) : state;
					} catch {}
					await listener(state);
				}
			}
		})();
		void wait.catch(() => remove().catch(() => {}));
		return async () => {
			if (closed) return;
			closed = true;
			await remove();
			await this.tmuxChannels.signalChannel(channel, "Could not stop tmux workspace state listener");
			await wait.catch(() => {});
		};
	}

	/**
	 * Step away from the workspace without stopping it. The session keeps running, so re-entering
	 * restores the same view with the agent still live. This is also the incidental path: a client
	 * that merely disappears must leave no trace, and so does nothing beyond detaching.
	 */
	async detach(): Promise<void> {
		if (process.env.TMUX) await this.tmuxClient.switchClientLast();
		else await this.tmuxClient.detachClient(this.sessionName);
	}

	/**
	 * Deliberate close: no backlog or agent process may outlive it.
	 *
	 * Every pane process tree is killed, but the session, its windows, and its layout are kept —
	 * `remain-on-exit` holds the panes in place — so the next `backlog workspace` reopens the same
	 * view. The client is detached rather than killed for exactly that reason: killing the session
	 * is what destroyed the view.
	 */
	async quitWorkspace(): Promise<void> {
		if (!(await this.owned())) return;
		await this.tmuxKeys.killPaneProcessTrees(this.sessionName);
		await this.detach();
	}

	/** Own the host's SIGINT/SIGTERM so an interrupt tears the workspace down instead of orphaning it. */
	installTerminationHandlers(exit?: (code: number) => void, source?: SignalSource): WorkspaceTermination {
		return watchWorkspaceTermination(() => this.quitWorkspace(), exit, source);
	}

	private async killSessionIfPresent(): Promise<void> {
		// The ONLY session-destruction path in this file, and the only production caller of the
		// layer's `killSessionIfPresent`. `killSession` has no caller here and must never gain one.
		await this.tmuxServer.killSessionIfPresent(this.sessionName, "Could not quit tmux workspace");
	}

	private async ensureHost(): Promise<void> {
		const pending = TmuxWorkspace.bootstraps.get(this.sessionName);
		if (pending) return await pending;
		const bootstrap = this.ensureHostUnlocked();
		TmuxWorkspace.bootstraps.set(this.sessionName, bootstrap);
		try {
			await bootstrap;
		} finally {
			TmuxWorkspace.bootstraps.delete(this.sessionName);
		}
		// Publish the live host pid so a later run can tell "no client attached" from "the
		// process that built this workspace is provably gone" and collect the corpse.
		await this.set(OWNER_PID, String(process.pid));
	}
}
