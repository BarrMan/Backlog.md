import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { LockOwner } from "../file-system/lock-owner.ts";
import { captureProcessOutput } from "../process/capture.ts";

export type TmuxWorkspaceView =
	| "board"
	| "workspace"
	| "workspace-nav"
	| "workspace-tasks"
	| "workspace-details"
	| "workspace-footer";

export interface TmuxWorkspaceRunner {
	run(
		args: string[],
		options?: { cwd?: string; env?: Record<string, string>; inherit?: boolean },
	): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

class BunTmuxWorkspaceRunner implements TmuxWorkspaceRunner {
	async run(args: string[], options: { cwd?: string; env?: Record<string, string>; inherit?: boolean } = {}) {
		const child = Bun.spawn(args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
			stdin: options.inherit ? "inherit" : "ignore",
			stdout: options.inherit ? "inherit" : "pipe",
			stderr: options.inherit ? "inherit" : "pipe",
		});
		if (options.inherit) return { exitCode: await child.exited, stdout: "", stderr: "" };
		return await captureProcessOutput(child);
	}
}

const OWNER = "@backlog_workspace_owner";
const READY = "@backlog_workspace_ready";
const ACTIVE = "@backlog_workspace_active";
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
function idPair(output: string): [string, string] {
	const [window, pane] = output.trim().split("|");
	if (!window?.startsWith("@") || !pane?.startsWith("%")) throw new Error("tmux did not return workspace resource IDs");
	return [window, pane];
}
function terminalSize(): { columns: number; rows: number } {
	const dimension = (value: number | undefined, fallback: number) =>
		Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;
	return {
		columns: dimension(process.stdout.columns ?? Number(process.env.COLUMNS), 120),
		rows: dimension(process.stdout.rows ?? Number(process.env.LINES), 40),
	};
}

export function isTmuxWorkspace(): boolean {
	return Boolean(process.env.BACKLOG_TMUX_WORKSPACE?.trim());
}

/** A root-owned native tmux host. It never kills its session or any agent pane. */
export class TmuxWorkspace {
	readonly rootPath: string;
	readonly sessionName: string;
	private readonly runner: TmuxWorkspaceRunner;
	private readonly table: string;
	private readonly bootstrapLock = new LockOwner();
	private static readonly bootstraps = new Map<string, Promise<void>>();

	constructor(rootPath: string, runner: TmuxWorkspaceRunner = new BunTmuxWorkspaceRunner()) {
		this.rootPath = realpathSync(rootPath);
		const hash = createHash("sha256").update(this.rootPath).digest("hex").slice(0, 12);
		this.sessionName = `backlog-workspace-${hash}`;
		this.table = `backlog-workspace-${hash}`;
		this.runner = runner;
	}

	async enter(view: TmuxWorkspaceView, taskId?: string): Promise<void> {
		await this.ensureHost();
		if (taskId) await this.showWorkspace(taskId);
		else if (view === "board") await this.showBoard();
		else await this.showWorkspace();
		await this.resizeWindows();
		await this.require(
			["tmux", process.env.TMUX ? "switch-client" : "attach-session", "-t", this.sessionName],
			"Could not enter tmux workspace",
			{ inherit: true },
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
		await this.require(["tmux", "select-pane", "-t", await this.id(TASKS_PANE)], "Could not focus workspace task list");
		if (taskId) await this.set(MAILBOX, taskId);
	}

	/** Present an agent in the display slot without selecting a window or pane. */
	async showAgent(paneId: string | null): Promise<void> {
		await this.ensureHost(false);
		const active = await this.option(ACTIVE);
		if (active === paneId) return;
		if (active) await this.returnAgent(active);
		if (!paneId) return;
		if (!(await this.paneExists(paneId))) throw new Error(`Agent pane ${paneId} no longer exists`);
		let display = await this.displayPane();
		let swapped = await this.runner.run(["tmux", "swap-pane", "-d", "-s", paneId, "-t", display]);
		if (swapped.exitCode !== 0 && /can't find pane/i.test(swapped.stderr)) {
			await this.unset(DISPLAY_PANE);
			await this.heal();
			display = await this.displayPane();
			swapped = await this.runner.run(["tmux", "swap-pane", "-d", "-s", paneId, "-t", display]);
		}
		if (swapped.exitCode !== 0) throw this.error("Could not show agent pane", swapped);
		await this.set(`${ACTIVE}_return_${paneId.slice(1)}`, display);
		await this.set(ACTIVE, paneId);
		await this.set(DISPLAY_PANE, paneId);
	}

	async focusAgent(zoom: boolean): Promise<void> {
		await this.ensureHost(false);
		const active = await this.option(ACTIVE);
		if (!active || !(await this.paneExists(active))) return;
		if (!zoom && (await this.zoomed()))
			await this.require(["tmux", "resize-pane", "-Z", "-t", active], "Could not unzoom agent pane");
		await this.require(["tmux", "select-pane", "-t", active], "Could not focus agent pane");
		if (zoom && !(await this.zoomed()))
			await this.require(["tmux", "resize-pane", "-Z", "-t", active], "Could not zoom agent pane");
	}
	readonly focusSearch = async (): Promise<void> => {
		await this.ensureHost(false);
		const pane = await this.liveUiPane(FOOTER_PANE, "workspace-footer");
		await this.require(["tmux", "select-pane", "-t", pane], "Could not focus workspace search");
		await this.require(["tmux", "send-keys", "-t", pane, "/"], "Could not start workspace search");
	};
	async focusTasks(): Promise<void> {
		await this.ensureHost(false);
		await this.require(["tmux", "select-pane", "-t", await this.id(TASKS_PANE)], "Could not focus workspace task list");
	}
	async focusDetails(): Promise<void> {
		await this.ensureHost(false);
		await this.require(["tmux", "select-pane", "-t", await this.id(DETAILS_PANE)], "Could not focus workspace details");
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
				"tmux",
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
					["tmux", ...listeners.flatMap((channel, index) => [...(index ? [";"] : []), "wait-for", "-S", channel])],
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
				await this.require(["tmux", "wait-for", channel], "Could not wait for tmux workspace state");
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
			await this.require(["tmux", "wait-for", "-S", channel], "Could not stop tmux workspace state listener");
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
			["tmux", "list-clients", "-t", this.sessionName, "-F", "#{client_tty}|#{pane_id}"],
			"Could not resolve tmux workspace client",
		);
		const matches = clients.stdout
			.trim()
			.split("\n")
			.filter((line) => panes.has(line.split("|").at(-1) ?? ""));
		if (matches.length !== 1) return;
		const tty = matches[0]?.split("|")[0];
		if (tty) await this.require(["tmux", "detach-client", "-t", tty], "Could not detach tmux workspace client");
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
		const exists = await this.runner.run(["tmux", "has-session", "-t", this.sessionName]);
		if (exists.exitCode === 0) {
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
		const size = terminalSize();
		const board = await this.runner.run([
			"tmux",
			"new-session",
			"-d",
			"-x",
			String(size.columns),
			"-y",
			String(size.rows),
			"-P",
			"-F",
			"#{window_id}|#{pane_id}",
			"-s",
			this.sessionName,
			"-c",
			this.rootPath,
			placeholder(),
		]);
		if (board.exitCode !== 0) {
			const concurrent = await this.runner.run(["tmux", "has-session", "-t", this.sessionName]);
			if (concurrent.exitCode === 0) {
				if (attempts === 20) throw this.error("Could not create tmux workspace", board);
				await Bun.sleep(25);
				return await this.ensureHostUnlocked(heal, attempts + 1);
			}
			throw this.error("Could not create tmux workspace", board);
		}
		const [boardWindow, boardPane] = idPair(board.stdout);
		await this.withBootstrapLock(async () => {
			const workspace = await this.command(
				[
					"tmux",
					"new-window",
					"-d",
					"-P",
					"-F",
					"#{window_id}|#{pane_id}",
					"-t",
					this.sessionName,
					"-c",
					this.rootPath,
					placeholder(),
				],
				"Could not create Workspace window",
			);
			const [workspaceWindow, navPane] = idPair(workspace.stdout);
			const footer = await this.command(
				["tmux", "split-window", "-v", "-d", "-p", "1", "-P", "-F", "#{pane_id}", "-t", navPane, placeholder()],
				"Could not create workspace footer pane",
			);
			const footerPane = footer.stdout.trim();
			const tasks = await this.command(
				["tmux", "split-window", "-v", "-d", "-p", "90", "-P", "-F", "#{pane_id}", "-t", navPane, placeholder()],
				"Could not create workspace task pane",
			);
			const tasksPane = tasks.stdout.trim();
			if (!tasksPane.startsWith("%")) throw new Error("tmux did not return workspace task pane ID");
			const details = await this.command(
				["tmux", "split-window", "-h", "-d", "-p", "58", "-P", "-F", "#{pane_id}", "-t", tasksPane, placeholder()],
				"Could not create workspace detail pane",
			);
			const detailsPane = details.stdout.trim();
			if (!detailsPane.startsWith("%")) throw new Error("tmux did not return workspace detail pane ID");
			const display = await this.command(
				["tmux", "split-window", "-v", "-d", "-p", "56", "-P", "-F", "#{pane_id}", "-t", detailsPane, placeholder()],
				"Could not create workspace display pane",
			);
			const displayPane = display.stdout.trim();
			if (!displayPane.startsWith("%")) throw new Error("tmux did not return workspace display pane ID");
			// All resource identity exists before ownership is published or any UI process can start.
			for (const [key, value] of [
				[OWNER, this.rootPath],
				[BOARD_WINDOW, boardWindow],
				[BOARD_PANE, boardPane],
				[WORKSPACE_WINDOW, workspaceWindow],
				[NAV_PANE, navPane],
				[TASKS_PANE, tasksPane],
				[DETAILS_PANE, detailsPane],
				[DISPLAY_PANE, displayPane],
				[FOOTER_PANE, footerPane],
			] as const)
				await this.set(key, value);
			await this.resizeRegion(NAV_PANE, NAV_HEIGHT, 3, "Could not resize workspace navigation");
			await this.resizeRegion(FOOTER_PANE, FOOTER_HEIGHT, 1, "Could not resize workspace footer");
			for (const target of [boardWindow, workspaceWindow]) {
				await this.require(
					["tmux", "set-option", "-w", "-t", target, "automatic-rename", "off"],
					"Could not stabilize workspace window",
				);
				await this.require(
					["tmux", "set-option", "-w", "-t", target, "remain-on-exit", "on"],
					"Could not preserve workspace window",
				);
			}
			await this.require(["tmux", "rename-window", "-t", boardWindow, "Board"], "Could not name Board window");
			const prefix = await this.prefix();
			await this.require(
				["tmux", "rename-window", "-t", workspaceWindow, "Workspace"],
				"Could not name Workspace window",
			);
			await this.require(
				["tmux", "set-option", "-t", this.sessionName, "key-table", this.table],
				"Could not scope workspace keys",
			);
			await this.require(
				["tmux", "bind-key", "-T", this.table, prefix, "switch-client", "-T", "prefix"],
				"Could not preserve tmux prefix",
			);
			for (const key of ["C-m", "C-i", "/"])
				await this.require(
					["tmux", "unbind-key", "-q", "-T", this.table, key],
					"Could not clear obsolete workspace key",
				);
			await this.bindReturnKey(workspaceWindow, tasksPane);
			await this.set(READY, "1");
			await this.launchUi(boardPane, "board");
			await this.launchUi(navPane, "workspace-nav");
			await this.launchUi(tasksPane, "workspace-tasks");
			await this.launchUi(detailsPane, "workspace-details");
			await this.launchUi(footerPane, "workspace-footer");
		});
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
		if (display && (await this.paneLive(display))) return;
		if (display && (await this.paneExists(display))) {
			await this.launchPlaceholder(display);
			await this.set(DISPLAY_PANE, display);
		} else {
			const workspace = await this.id(WORKSPACE_WINDOW);
			const created = await this.command(
				["tmux", "split-window", "-v", "-d", "-p", "56", "-P", "-F", "#{pane_id}", "-t", workspace, placeholder()],
				"Could not recover workspace display pane",
			);
			const pane = created.stdout.trim();
			if (!pane.startsWith("%")) throw new Error("tmux did not return recovered display pane ID");
			await this.set(DISPLAY_PANE, pane);
		}
		const active = await this.option(ACTIVE);
		if (active) {
			await this.unset(`${ACTIVE}_return_${active.slice(1)}`);
			await this.unset(ACTIVE);
		}
	}
	private async rebuildTopology(): Promise<void> {
		const workspace = await this.id(WORKSPACE_WINDOW);
		const active = await this.option(ACTIVE);
		let parkedActive: string | undefined;
		if (active) {
			const agentWindow = await this.runner.run(["tmux", "display-message", "-p", "-t", active, "#{window_id}"]);
			if (agentWindow.exitCode === 0 && agentWindow.stdout.trim() === workspace) {
				await this.require(["tmux", "break-pane", "-d", "-t", active], "Could not park active agent pane");
				parkedActive = active;
			}
		}
		if (await this.windowInSession(workspace))
			await this.require(["tmux", "kill-window", "-t", workspace], "Could not remove obsolete Workspace window");
		const created = await this.command(
			[
				"tmux",
				"new-window",
				"-d",
				"-P",
				"-F",
				"#{window_id}|#{pane_id}",
				"-t",
				this.sessionName,
				"-c",
				this.rootPath,
				placeholder(),
			],
			"Could not rebuild Workspace window",
		);
		const [window, nav] = idPair(created.stdout);
		const footer = await this.command(
			["tmux", "split-window", "-v", "-d", "-p", "1", "-P", "-F", "#{pane_id}", "-t", nav, placeholder()],
			"Could not rebuild workspace footer pane",
		);
		const footerPane = footer.stdout.trim();
		const tasks = await this.command(
			["tmux", "split-window", "-v", "-d", "-p", "90", "-P", "-F", "#{pane_id}", "-t", nav, placeholder()],
			"Could not rebuild workspace task pane",
		);
		const task = tasks.stdout.trim();
		const details = await this.command(
			["tmux", "split-window", "-h", "-d", "-p", "58", "-P", "-F", "#{pane_id}", "-t", task, placeholder()],
			"Could not rebuild workspace detail pane",
		);
		const detail = details.stdout.trim();
		const display = await this.command(
			["tmux", "split-window", "-v", "-d", "-p", "56", "-P", "-F", "#{pane_id}", "-t", detail, placeholder()],
			"Could not rebuild workspace display pane",
		);
		const displayPane = display.stdout.trim();
		if (![task, detail, displayPane, footerPane].every((pane) => pane.startsWith("%")))
			throw new Error("tmux did not return rebuilt workspace pane IDs");
		for (const [key, value] of [
			[WORKSPACE_WINDOW, window],
			[NAV_PANE, nav],
			[TASKS_PANE, task],
			[DETAILS_PANE, detail],
			[DISPLAY_PANE, displayPane],
			[FOOTER_PANE, footerPane],
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
		if (parkedActive && (await this.paneExists(parkedActive))) {
			await this.require(
				["tmux", "swap-pane", "-d", "-s", parkedActive, "-t", displayPane],
				"Could not restore active agent pane",
			);
			await this.set(`${ACTIVE}_return_${parkedActive.slice(1)}`, displayPane);
			await this.set(ACTIVE, parkedActive);
			await this.set(DISPLAY_PANE, parkedActive);
		} else await this.unset(ACTIVE);
		await this.require(["tmux", "rename-window", "-t", window, "Workspace"], "Could not name rebuilt Workspace window");
		await this.require(
			["tmux", "set-option", "-w", "-t", window, "remain-on-exit", "on"],
			"Could not preserve Workspace window",
		);
		for (const key of ["C-m", "C-i", "/"])
			await this.require(["tmux", "unbind-key", "-q", "-T", this.table, key], "Could not clear obsolete workspace key");
		await this.bindReturnKey(window, task);
		await this.launchUi(nav, "workspace-nav");
		await this.launchUi(task, "workspace-tasks");
		await this.launchUi(detail, "workspace-details");
		await this.launchUi(footerPane, "workspace-footer");
		await this.set(READY, "1");
	}

	private async returnAgent(agent: string): Promise<void> {
		const slot = await this.option(`${ACTIVE}_return_${agent.slice(1)}`);
		if (slot && (await this.paneExists(agent)) && (await this.paneExists(slot))) {
			const swapped = await this.runner.run(["tmux", "swap-pane", "-d", "-s", agent, "-t", slot]);
			if (swapped.exitCode === 0) await this.set(DISPLAY_PANE, slot);
		}
		await this.unset(`${ACTIVE}_return_${agent.slice(1)}`);
		await this.unset(ACTIVE);
		await this.heal();
	}
	private async displayPane(): Promise<string> {
		const pane = await this.id(DISPLAY_PANE);
		if (!(await this.paneLive(pane))) {
			await this.heal();
			return await this.id(DISPLAY_PANE);
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
			[
				"tmux",
				"respawn-pane",
				"-k",
				"-t",
				pane,
				"-c",
				this.rootPath,
				workspaceCommand(view, this.sessionName, this.rootPath),
			],
			"Could not reopen workspace UI",
		);
	}
	private async bindReturnKey(workspaceWindow: string, tasksPane: string): Promise<void> {
		await this.require(
			[
				"tmux",
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
			["tmux", "respawn-pane", "-k", "-t", pane, "-c", this.rootPath, placeholder()],
			"Could not repair workspace display pane",
		);
	}
	private async selectWindow(window: string): Promise<void> {
		await this.require(["tmux", "select-window", "-t", window], "Could not select workspace window");
	}
	private async resizeWindows(): Promise<void> {
		const { columns, rows } = terminalSize();
		for (const window of [await this.id(BOARD_WINDOW), await this.id(WORKSPACE_WINDOW)])
			await this.require(
				["tmux", "resize-window", "-t", window, "-x", String(columns), "-y", String(rows)],
				"Could not resize tmux workspace window",
			);
	}
	private async zoomed(): Promise<boolean> {
		const result = await this.runner.run([
			"tmux",
			"display-message",
			"-p",
			"-t",
			await this.id(WORKSPACE_WINDOW),
			"#{window_zoomed_flag}",
		]);
		return result.exitCode === 0 && result.stdout.trim() === "1";
	}
	private async paneExists(pane: string): Promise<boolean> {
		const result = await this.runner.run(["tmux", "display-message", "-p", "-t", pane, "#{pane_id}"]);
		return result.exitCode === 0 && result.stdout.trim() === pane;
	}
	private async paneLive(pane: string): Promise<boolean> {
		const result = await this.runner.run(["tmux", "display-message", "-p", "-t", pane, "#{pane_id} #{pane_dead}"]);
		if (result.exitCode !== 0) return false;
		const [actualPaneId, paneDead] = result.stdout.trim().split(/\s+/);
		return actualPaneId === pane && paneDead !== "1";
	}
	private async prefix(): Promise<string> {
		const result = await this.runner.run(["tmux", "show-options", "-gv", "prefix"]);
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
			["tmux", "list-windows", "-t", this.sessionName, "-F", "#{window_id}"],
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
		const result = await this.runner.run(["tmux", "show-options", "-qv", "-t", this.sessionName, key]);
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
		await this.require(
			["tmux", "set-option", "-t", this.sessionName, key, value],
			"Could not update tmux workspace state",
		);
	}
	private async unset(key: string): Promise<void> {
		await this.require(
			["tmux", "set-option", "-qu", "-t", this.sessionName, key],
			"Could not update tmux workspace state",
		);
	}
	private async resizeRegion(paneKey: string, heightKey: string, height: number, message: string): Promise<void> {
		if (!Number.isFinite(height) || height <= 0)
			throw new Error("Workspace region height must be a positive finite number");
		const rows = Math.max(1, Math.floor(height));
		const pane = await this.id(paneKey);
		if ((await this.option(heightKey)) === String(rows)) {
			const current = await this.runner.run(["tmux", "display-message", "-p", "-t", pane, "#{pane_height}"]);
			const currentRows = Number(current.stdout.trim());
			if (Number.isFinite(currentRows) && currentRows > 0 && currentRows === rows) return;
		}
		await this.require(["tmux", "resize-pane", "-t", pane, "-y", String(rows)], message);
		await this.set(heightKey, String(rows));
	}
	private async lock(name = "bootstrap"): Promise<void> {
		await this.require(
			["tmux", "wait-for", "-L", `${this.sessionName}-${name}`],
			`Could not lock tmux workspace ${name}`,
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
	private async unlock(name = "bootstrap"): Promise<void> {
		await this.require(
			["tmux", "wait-for", "-U", `${this.sessionName}-${name}`],
			`Could not unlock tmux workspace ${name}`,
		);
	}
	private async command(args: string[], message: string) {
		const result = await this.runner.run(args);
		if (result.exitCode !== 0) throw this.error(message, result);
		return result;
	}
	private async require(args: string[], message: string, options?: { inherit?: boolean }): Promise<void> {
		const result = await this.runner.run(args, options);
		if (result.exitCode !== 0) throw this.error(message, result);
	}
	private error(message: string, result: { stderr: string }): Error {
		return new Error(`${message}: ${result.stderr.trim() || "tmux command failed"}`);
	}
}
