import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import type { NewWindowOptions, SplitOptions } from "libtmux";
import { PaneDirection, Server, TmuxCommandError } from "libtmux";
import { LockOwner } from "../file-system/lock-owner.ts";

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

const OWNER = "@backlog_workspace_owner";
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
const BOOTSTRAP_LOCK_RETRY_DELAY_MS = 25;
const BOOTSTRAP_LOCK_RETRIES = 200;

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

/** A root-owned native tmux host. It never kills its session or any agent pane. */
export class TmuxWorkspace {
	readonly rootPath: string;
	readonly sessionName: string;
	private readonly tmux: TmuxWorkspaceServer;
	private readonly table: string;
	private readonly bootstrapLock = new LockOwner();
	private static readonly bootstraps = new Map<string, Promise<void>>();

	constructor(rootPath: string, tmux: TmuxWorkspaceServer = new Server()) {
		this.rootPath = realpathSync(rootPath);
		const hash = createHash("sha256").update(this.rootPath).digest("hex").slice(0, 12);
		this.sessionName = `backlog-workspace-${hash}`;
		this.table = `backlog-workspace-${hash}`;
		this.tmux = tmux;
	}

	async enter(view: TmuxWorkspaceView, taskId?: string): Promise<void> {
		await this.ensureHost();
		if (taskId) await this.showWorkspace(taskId);
		else if (view === "board") await this.showBoard();
		else await this.showWorkspace();
		await this.require(
			[process.env.TMUX ? "switch-client" : "attach-session", "-t", this.sessionName],
			"Could not enter tmux workspace",
			{ timeoutMs: null },
		);
	}
	async showBoard(): Promise<void> {
		await this.ensureHost();
		await this.selectWindow(await this.id(BOARD_WINDOW));
		await this.liveUiPane(BOARD_PANE, "board");
	}
	async showWorkspace(taskId?: string): Promise<void> {
		await this.ensureHost();
		await this.selectWindow(await this.id(WORKSPACE_WINDOW));
		await this.liveUiPane(FOOTER_PANE, "workspace-footer");
		await this.respawnUi(NAV_PANE, "workspace-nav");
		await this.respawnUi(TASKS_PANE, "workspace-tasks");
		await this.respawnUi(DETAILS_PANE, "workspace-details");
		await this.require(["select-pane", "-t", await this.id(TASKS_PANE)], "Could not focus workspace task list");
		if (taskId) await this.set(MAILBOX, taskId);
	}

	/** Present the selected task's live agent in the display slot without selecting a window or pane. */
	async showAgentSession(taskId: string | undefined, sessionId?: string): Promise<void> {
		await this.ensureHost(false);
		if (!taskId || !sessionId) {
			await this.showAgentPane(null, null);
			await this.unset(ACTIVE_TASK);
			return;
		}
		const paneId = await this.findLivePreviewPane(taskId);
		if (!paneId) throw new Error(`Live preview pane for task ${taskId} no longer exists`);
		await this.showAgentPane(taskId, paneId);
		await this.set(ACTIVE_TASK, taskId);
	}

	async focusAgent(zoom: boolean): Promise<void> {
		await this.ensureHost(false);
		const taskId = await this.option(ACTIVE_TASK);
		const active = taskId ? await this.findLivePreviewPane(taskId) : undefined;
		if (!active) return;
		if (!zoom && (await this.zoomed()))
			await this.require(["resize-pane", "-Z", "-t", active], "Could not unzoom agent pane");
		await this.require(["select-pane", "-t", active], "Could not focus agent pane");
		if (zoom && !(await this.zoomed()))
			await this.require(["resize-pane", "-Z", "-t", active], "Could not zoom agent pane");
	}
	readonly focusSearch = async (): Promise<void> => {
		await this.ensureHost(false);
		const pane = await this.liveUiPane(FOOTER_PANE, "workspace-footer");
		await this.require(["select-pane", "-t", pane], "Could not focus workspace search");
		await this.require(["send-keys", "-t", pane, "/"], "Could not start workspace search");
	};
	async focusTasks(): Promise<void> {
		await this.ensureHost(false);
		await this.require(["select-pane", "-t", await this.id(TASKS_PANE)], "Could not focus workspace task list");
	}
	async focusDetails(): Promise<void> {
		await this.ensureHost(false);
		await this.require(["select-pane", "-t", await this.id(DETAILS_PANE)], "Could not focus workspace details");
	}
	async setDetailsVisible(visible: boolean): Promise<void> {
		await this.ensureHost(false);
		const details = await this.id(DETAILS_PANE);
		const activeTask = await this.option(ACTIVE_TASK);
		const display =
			(activeTask ? await this.findLivePreviewPane(activeTask) : undefined) ?? (await this.id(DISPLAY_PANE));
		const measured = await this.run(["display-message", "-p", "-t", details, "#{pane_height}"]);
		const displayMeasured = await this.run(["display-message", "-p", "-t", display, "#{pane_height}"]);
		const detailsHeight = Number(measured.stdout.trim());
		const displayHeight = Number(displayMeasured.stdout.trim());
		if (!Number.isFinite(detailsHeight) || !Number.isFinite(displayHeight)) return;
		const total = Math.max(2, detailsHeight + displayHeight);
		const rows = visible ? Math.max(3, Math.floor(total * 0.44)) : 1;
		await this.require(["resize-pane", "-t", details, "-y", String(rows)], "Could not resize workspace details");
	}
	async resizeNavigation(height: number): Promise<void> {
		await this.ensureHost(false);
		await this.resizeRegion(NAV_PANE, NAV_HEIGHT, height, "Could not resize workspace navigation");
	}
	async resizeFooter(height: number): Promise<void> {
		await this.ensureHost(false);
		await this.resizeRegion(FOOTER_PANE, FOOTER_HEIGHT, height, "Could not resize workspace footer");
	}

	async takeTaskRequest(): Promise<string | undefined> {
		await this.ensureHost(false);
		const request = await this.option(MAILBOX);
		if (!request) return undefined;
		// Task IDs are CLI identifiers; reject control characters before embedding in tmux format syntax.
		if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(request)) return undefined;
		await this.require(
			[
				"if-shell",
				"-t",
				this.sessionName,
				"-F",
				`#{==:#{${MAILBOX}},${request}}`,
				`set-option -t ${this.sessionName} ${MAILBOX} ''`,
			],
			"Could not consume workspace task request",
		);
		return request;
	}
	async workspaceState<T extends object>(): Promise<T> {
		await this.ensureHost(false);
		const value = await this.option(VIEW_STATE);
		try {
			return value ? (JSON.parse(value) as T) : ({} as T);
		} catch {
			return {} as T;
		}
	}
	async updateWorkspaceState<T extends object>(update: (state: T) => T): Promise<void> {
		await this.ensureHost(false);
		await this.lock("state");
		try {
			const current = (await this.option(VIEW_STATE)) ?? "";
			let state = {} as T;
			try {
				state = current ? (JSON.parse(current) as T) : state;
			} catch {}
			const next = JSON.stringify(update(state));
			if (next === current) return;
			await this.set(VIEW_STATE, next);
			const listeners = await this.workspaceStateListeners();
			if (listeners.length)
				await this.require(
					[...listeners.flatMap((channel, index) => [...(index ? [";"] : []), "wait-for", "-S", channel])],
					"Could not notify tmux workspace state listeners",
				);
		} finally {
			await this.unlock("state");
		}
	}
	async subscribeWorkspaceState<T extends object>(
		listener: (state: T) => Promise<void> | void,
	): Promise<() => Promise<void>> {
		await this.ensureHost(false);
		const channel = `${this.sessionName}-state-${process.env.TMUX_PANE ?? randomUUID()}`;
		let closed = false;
		let removed = false;
		let initial = {} as T;
		const remove = async () => {
			if (removed) return;
			removed = true;
			await this.lock("state");
			try {
				await this.set(
					VIEW_STATE_LISTENERS,
					JSON.stringify((await this.workspaceStateListeners()).filter((value) => value !== channel)),
				);
			} finally {
				await this.unlock("state");
			}
		};
		await this.lock("state");
		try {
			await this.set(
				VIEW_STATE_LISTENERS,
				JSON.stringify([...new Set([...(await this.workspaceStateListeners()), channel])]),
			);
			const value = await this.option(VIEW_STATE);
			try {
				initial = value ? (JSON.parse(value) as T) : initial;
			} catch {}
		} finally {
			await this.unlock("state");
		}
		try {
			await listener(initial);
		} catch (error) {
			closed = true;
			await remove();
			throw error;
		}
		const wait = (async () => {
			while (!closed) {
				await this.require(["wait-for", channel], "Could not wait for tmux workspace state");
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
			await this.require(["wait-for", "-S", channel], "Could not stop tmux workspace state listener");
			await wait.catch(() => {});
		};
	}

	async detach(): Promise<void> {
		if (!(await this.owned())) return;
		const panes = new Set([
			await this.id(BOARD_PANE),
			await this.id(NAV_PANE),
			await this.id(TASKS_PANE),
			await this.id(DETAILS_PANE),
			await this.id(FOOTER_PANE),
		]);
		const clients = await this.command(
			["list-clients", "-t", this.sessionName, "-F", "#{client_tty}|#{pane_id}"],
			"Could not resolve tmux workspace client",
		);
		const matches = clients.stdout
			.trim()
			.split("\n")
			.filter((line) => panes.has(line.split("|").at(-1) ?? ""));
		if (matches.length !== 1) return;
		const tty = matches[0]?.split("|")[0];
		if (tty) await this.require(["detach-client", "-t", tty], "Could not detach tmux workspace client");
	}

	private async ensureHost(heal = true): Promise<void> {
		const pending = TmuxWorkspace.bootstraps.get(this.sessionName);
		if (pending) return await pending;
		const bootstrap = this.ensureHostUnlocked(heal);
		TmuxWorkspace.bootstraps.set(this.sessionName, bootstrap);
		try {
			await bootstrap;
		} finally {
			TmuxWorkspace.bootstraps.delete(this.sessionName);
		}
	}
	private async ensureHostUnlocked(heal: boolean, attempts = 0): Promise<void> {
		if (await this.ready()) {
			if (heal) await this.heal();
			return;
		}
		if (await this.tmux.hasSession(this.sessionName)) {
			await this.withBootstrapLock(async () => {
				if (await this.ready()) {
					if (heal) await this.heal();
					return;
				}
				if (await this.owned()) {
					await this.rebuildTopology();
					return;
				}
				throw new Error(`tmux session ${this.sessionName} is not a Backlog workspace for this root`);
			});
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
		} catch (error) {
			const failure = this.failure(error);
			if (!failure) throw error;
			if (await this.tmux.hasSession(this.sessionName)) {
				if (attempts === 20) throw this.error("Could not create tmux workspace", failure);
				await Bun.sleep(25);
				return await this.ensureHostUnlocked(heal, attempts + 1);
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
			await this.resizeRegion(NAV_PANE, NAV_HEIGHT, 3, "Could not resize workspace navigation");
			await this.resizeRegion(FOOTER_PANE, FOOTER_HEIGHT, 1, "Could not resize workspace footer");
			for (const target of [boardWindow, workspaceWindow]) {
				await this.require(
					["set-option", "-w", "-t", target, "automatic-rename", "off"],
					"Could not stabilize workspace window",
				);
				await this.require(
					["set-option", "-w", "-t", target, "remain-on-exit", "on"],
					"Could not preserve workspace window",
				);
			}
			await this.require(["rename-window", "-t", boardWindow, "Board"], "Could not name Board window");
			const prefix = await this.prefix();
			await this.require(["rename-window", "-t", workspaceWindow, "Workspace"], "Could not name Workspace window");
			await this.require(
				["set-option", "-t", this.sessionName, "key-table", this.table],
				"Could not scope workspace keys",
			);
			await this.require(
				["bind-key", "-T", this.table, prefix, "switch-client", "-T", "prefix"],
				"Could not preserve tmux prefix",
			);
			for (const key of ["C-m", "C-i", "/"])
				await this.require(["unbind-key", "-q", "-T", this.table, key], "Could not clear obsolete workspace key");
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
	): Promise<{ window: string; pane: TmuxPaneHandle }> {
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

	private async heal(): Promise<void> {
		for (const [key, view] of [
			[BOARD_PANE, "board"],
			[NAV_PANE, "workspace-nav"],
			[TASKS_PANE, "workspace-tasks"],
			[DETAILS_PANE, "workspace-details"],
			[FOOTER_PANE, "workspace-footer"],
		] as const)
			await this.respawnUi(key, view);
		const display = await this.option(DISPLAY_PANE);
		const activeTask = await this.option(ACTIVE_TASK);
		if (display && (await this.paneLive(display)) && (await this.paneInWorkspace(display))) return;
		if (display && (await this.paneExists(display)) && (await this.paneInWorkspace(display))) {
			await this.launchPlaceholder(display);
			await this.set(DISPLAY_PANE, display);
		} else {
			const pane = await this.splitPane(
				await this.paneHandle(await this.id(DETAILS_PANE)),
				{ direction: PaneDirection.Below, size: "56%", shellCommand: placeholder() },
				"Could not recover workspace display pane",
			);
			await this.set(DISPLAY_PANE, pane.id);
		}
		if (activeTask && !(await this.findLivePreviewPane(activeTask))) await this.unset(ACTIVE_TASK);
	}
	private async rebuildTopology(): Promise<void> {
		const workspace = await this.id(WORKSPACE_WINDOW);
		const activeTask = await this.option(ACTIVE_TASK);
		const activePane = activeTask ? await this.findLivePreviewPane(activeTask) : undefined;
		if (activePane) {
			const display = await this.option(DISPLAY_PANE);
			const agentWindow = await this.run(["display-message", "-p", "-t", activePane, "#{window_id}"]);
			if (
				display &&
				display !== activePane &&
				(await this.paneLive(display)) &&
				agentWindow.exitCode === 0 &&
				agentWindow.stdout.trim() === workspace
			)
				await this.require(
					["swap-pane", "-d", "-s", activePane, "-t", display],
					"Could not park active live preview pane",
				);
		}
		if (await this.windowInSession(workspace))
			await this.require(["kill-window", "-t", workspace], "Could not remove obsolete Workspace window");
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
		await this.require(["rename-window", "-t", window, "Workspace"], "Could not name rebuilt Workspace window");
		await this.require(
			["set-option", "-w", "-t", window, "remain-on-exit", "on"],
			"Could not preserve Workspace window",
		);
		for (const key of ["C-m", "C-i", "/"])
			await this.require(["unbind-key", "-q", "-T", this.table, key], "Could not clear obsolete workspace key");
		await this.bindReturnKey(window, task.id);
		await this.launchUi(nav.id, "workspace-nav");
		await this.launchUi(task.id, "workspace-tasks");
		await this.launchUi(detail.id, "workspace-details");
		await this.launchUi(footerPane.id, "workspace-footer");
		await this.set(READY, "1");
	}

	private async showAgentPane(taskId: string | null, paneId: string | null): Promise<void> {
		const visible = await this.visibleLivePreviewPanes();
		if (!taskId || !paneId) {
			const current = visible[0]?.paneId;
			const display = await this.option(DISPLAY_PANE);
			if (current && display && current !== display && (await this.paneLive(display)))
				await this.require(["swap-pane", "-d", "-s", current, "-t", display], "Could not hide live preview pane");
			await this.unset(ACTIVE_TASK);
			return;
		}
		if (!(await this.paneExists(paneId))) throw new Error(`Live preview pane ${paneId} no longer exists`);
		if (!(await this.paneInWorkspace(paneId))) {
			const target = visible.find((pane) => pane.taskId !== taskId)?.paneId ?? (await this.displayPane());
			let swapped = await this.run(["swap-pane", "-d", "-s", paneId, "-t", target]);
			if (swapped.exitCode !== 0 && /can't find pane/i.test(swapped.stderr)) {
				await this.unset(DISPLAY_PANE);
				await this.heal();
				swapped = await this.run(["swap-pane", "-d", "-s", paneId, "-t", await this.displayPane()]);
			}
			if (swapped.exitCode !== 0) throw this.error("Could not show live preview pane", swapped);
		}
		await this.set(ACTIVE_TASK, taskId);
	}
	private async displayPane(): Promise<string> {
		const pane = await this.id(DISPLAY_PANE);
		if (!(await this.paneLive(pane)) || !(await this.paneInWorkspace(pane))) {
			await this.heal();
			const recovered = await this.id(DISPLAY_PANE);
			if (!(await this.paneLive(recovered)) || !(await this.paneInWorkspace(recovered))) {
				const display = await this.splitPane(
					await this.paneHandle(await this.id(DETAILS_PANE)),
					{ direction: PaneDirection.Below, size: "56%", shellCommand: placeholder() },
					"Could not recover workspace display pane",
				);
				await this.set(DISPLAY_PANE, display.id);
				return display.id;
			}
			return recovered;
		}
		return pane;
	}
	private async liveUiPane(
		key: typeof BOARD_PANE | typeof NAV_PANE | typeof TASKS_PANE | typeof DETAILS_PANE | typeof FOOTER_PANE,
		view: TmuxWorkspaceView,
	): Promise<string> {
		let pane = await this.id(key);
		if (!(await this.paneExists(pane))) {
			await this.rebuildTopology();
			pane = await this.id(key);
		}
		await this.respawnUi(key, view);
		if (!(await this.paneLive(pane))) throw new Error(`Could not recover ${view} pane`);
		return pane;
	}
	private async respawnUi(
		key: typeof BOARD_PANE | typeof NAV_PANE | typeof TASKS_PANE | typeof DETAILS_PANE | typeof FOOTER_PANE,
		view: TmuxWorkspaceView,
	): Promise<void> {
		const pane = await this.id(key);
		if (!(await this.paneLive(pane))) await this.launchUi(pane, view);
	}
	private async launchUi(pane: string, view: TmuxWorkspaceView): Promise<void> {
		await this.require(
			["respawn-pane", "-k", "-t", pane, "-c", this.rootPath, workspaceCommand(view, this.sessionName, this.rootPath)],
			"Could not reopen workspace UI",
		);
	}
	private async bindReturnKey(workspaceWindow: string, tasksPane: string): Promise<void> {
		await this.require(
			[
				"bind-key",
				"-T",
				this.table,
				"C-q",
				"if-shell",
				"-F",
				`#{==:#{window_id},${workspaceWindow}}`,
				`if-shell -F '#{window_zoomed_flag}' 'resize-pane -Z; select-pane -t ${tasksPane}' 'select-pane -t ${tasksPane}'`,
				"",
			],
			"Could not bind workspace return key",
		);
	}
	private async launchPlaceholder(pane: string): Promise<void> {
		await this.require(
			["respawn-pane", "-k", "-t", pane, "-c", this.rootPath, placeholder()],
			"Could not repair workspace display pane",
		);
	}
	private async selectWindow(window: string): Promise<void> {
		await this.require(["select-window", "-t", window], "Could not select workspace window");
	}
	private async zoomed(): Promise<boolean> {
		const result = await this.run([
			"display-message",
			"-p",
			"-t",
			await this.id(WORKSPACE_WINDOW),
			"#{window_zoomed_flag}",
		]);
		return result.exitCode === 0 && result.stdout.trim() === "1";
	}
	private async findLivePreviewPane(taskId: string): Promise<string | undefined> {
		const matches = (await this.livePreviewPanes()).filter((pane) => pane.taskId === taskId);
		if (matches.length > 1) throw new Error(`Multiple tmux live preview panes match task ${taskId}.`);
		return matches[0]?.paneId;
	}
	private async livePreviewPanes(): Promise<Array<{ paneId: string; taskId: string; windowId: string }>> {
		const listed = await this.run([
			"list-panes",
			"-a",
			"-F",
			"#{pane_id}\t#{pane_dead}\t#{window_id}\t#{@backlog_root}\t#{@backlog_task}\t#{@backlog_role}",
		]);
		if (listed.exitCode !== 0) {
			if (/no server running/i.test(listed.stderr)) return [];
			throw this.error("Could not inspect live preview panes", listed);
		}
		const panes: Array<{ paneId: string; taskId: string; windowId: string }> = [];
		for (const line of listed.stdout.split("\n")) {
			const [paneId, dead, windowId, root, taskId, role] = line.split("\t");
			if (
				paneId?.startsWith("%") &&
				dead !== "1" &&
				windowId &&
				root === this.rootPath &&
				taskId &&
				role === "live-preview"
			)
				panes.push({ paneId, taskId, windowId });
		}
		return panes;
	}
	private async visibleLivePreviewPanes(): Promise<Array<{ paneId: string; taskId: string }>> {
		const workspace = await this.id(WORKSPACE_WINDOW);
		return (await this.livePreviewPanes())
			.filter((pane) => pane.windowId === workspace)
			.map(({ paneId, taskId }) => ({ paneId, taskId }));
	}

	private async paneExists(pane: string): Promise<boolean> {
		const result = await this.run(["display-message", "-p", "-t", pane, "#{pane_id}"]);
		return result.exitCode === 0 && result.stdout.trim() === pane;
	}
	private async paneLive(pane: string): Promise<boolean> {
		const result = await this.run(["display-message", "-p", "-t", pane, "#{pane_id} #{pane_dead}"]);
		if (result.exitCode !== 0) return false;
		const [actualPaneId, paneDead] = result.stdout.trim().split(/\s+/);
		return actualPaneId === pane && paneDead !== "1";
	}
	private async paneInWorkspace(pane: string): Promise<boolean> {
		const result = await this.run(["display-message", "-p", "-t", pane, "#{window_id}"]);
		return result.exitCode === 0 && result.stdout.trim() === (await this.id(WORKSPACE_WINDOW));
	}
	private async prefix(): Promise<string> {
		const result = await this.run(["show-options", "-gv", "prefix"]);
		return result.exitCode === 0 && result.stdout.trim() ? result.stdout.trim() : "C-b";
	}
	private async ready(): Promise<boolean> {
		if ((await this.option(READY)) !== "1" || !(await this.owned())) return false;
		const [boardPane, workspaceWindow, navPane, tasksPane, detailsPane, displayPane, footerPane] = await Promise.all(
			[BOARD_PANE, WORKSPACE_WINDOW, NAV_PANE, TASKS_PANE, DETAILS_PANE, DISPLAY_PANE, FOOTER_PANE].map((key) =>
				this.option(key),
			),
		);
		return (
			!!boardPane &&
			!!workspaceWindow &&
			!!navPane &&
			!!tasksPane &&
			!!detailsPane &&
			!!displayPane &&
			!!footerPane &&
			(await this.windowInSession(workspaceWindow))
		);
	}
	private async windowInSession(window: string): Promise<boolean> {
		const windows = await this.command(
			["list-windows", "-t", this.sessionName, "-F", "#{window_id}"],
			"Could not inspect Workspace window",
		);
		return windows.stdout.split("\n").some((candidate) => candidate.trim() === window);
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
		const result = await this.run(["show-options", "-qv", "-t", this.sessionName, key]);
		return result.exitCode === 0 && result.stdout.trim() ? result.stdout.trim() : undefined;
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
		await this.require(["set-option", "-t", this.sessionName, key, value], "Could not update tmux workspace state");
	}
	private async unset(key: string): Promise<void> {
		await this.require(["set-option", "-qu", "-t", this.sessionName, key], "Could not update tmux workspace state");
	}
	private async resizeRegion(paneKey: string, heightKey: string, height: number, message: string): Promise<void> {
		if (!Number.isFinite(height) || height <= 0)
			throw new Error("Workspace region height must be a positive finite number");
		const rows = Math.max(1, Math.floor(height));
		const pane = await this.id(paneKey);
		if ((await this.option(heightKey)) === String(rows)) {
			const current = await this.run(["display-message", "-p", "-t", pane, "#{pane_height}"]);
			const currentRows = Number(current.stdout.trim());
			if (Number.isFinite(currentRows) && currentRows > 0 && currentRows === rows) return;
		}
		await this.require(["resize-pane", "-t", pane, "-y", String(rows)], message);
		await this.set(heightKey, String(rows));
	}
	private async lock(name = "bootstrap"): Promise<void> {
		await this.require(["wait-for", "-L", `${this.sessionName}-${name}`], `Could not lock tmux workspace ${name}`);
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
	private async unlock(name = "bootstrap"): Promise<void> {
		await this.require(["wait-for", "-U", `${this.sessionName}-${name}`], `Could not unlock tmux workspace ${name}`);
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
	private async command(args: readonly string[], message: string) {
		const result = await this.run(args);
		if (result.exitCode !== 0) throw this.error(message, result);
		return result;
	}
	private async require(args: readonly string[], message: string, options?: TmuxCommandOptions): Promise<void> {
		const result = await this.run(args, options);
		if (result.exitCode !== 0) throw this.error(message, result);
	}
	private error(message: string, result: { stderr: string }): Error {
		return new Error(`${message}: ${result.stderr.trim() || "tmux command failed"}`);
	}
}
