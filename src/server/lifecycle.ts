import { type FSWatcher, watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { ProjectTaskGraph } from "../core/project-task-graph.ts";
import { FileSystem } from "../file-system/operations.ts";
import { watchConfigFile } from "../utils/config-watcher.ts";
import { ProjectScope, type ServerRequestScope } from "./project-scope.ts";
import type { ServerServices } from "./resources/api.ts";
import type { WebSocketHub } from "./websocket-hub.ts";

/** Owns the selected immutable project binding and its prepared task graph. */
export class BrowserServices implements ServerServices {
	readonly deploymentRoot: string;
	private watchers: Array<Pick<FSWatcher, "close">> = [];
	private recoveryWatcher?: Pick<FSWatcher, "close">;
	private selected: ServerRequestScope;
	private reconciling?: Promise<void>;
	private rebuildRequested = false;
	private configVersion = 0;
	private publishedConfigVersion = 0;
	private pendingConfig?: {
		version: number;
		core: Core;
		scope: ProjectScope;
		watchers: Array<Pick<FSWatcher, "close">>;
	};
	private reconciliationError?: unknown;
	private publication: "tasks" | "milestones" = "tasks";
	private stopped = false;

	constructor(
		core: Core,
		private readonly hub: WebSocketHub,
	) {
		const scope = new ProjectScope(core);
		this.deploymentRoot = scope.root;
		this.selected = { scope, core };
	}

	createRequestScope(requireReady = false): ServerRequestScope {
		if (requireReady && this.reconciliationError) throw this.reconciliationError;
		return this.selected;
	}

	get scope(): ProjectScope {
		return this.selected.scope;
	}

	async configChanged(): Promise<void> {
		await this.scheduleReconcile(true);
	}

	async reconcile(scope?: ProjectScope, publication: "tasks" | "milestones" = "tasks"): Promise<void> {
		if (scope && this.selected.scope !== scope) return;
		this.publication = publication;
		await this.scheduleReconcile(false);
	}

	private scheduleReconcile(configChanged: boolean): Promise<void> {
		this.rebuildRequested = true;
		if (configChanged) this.configVersion += 1;
		if (this.reconciling) return this.reconciling;
		this.reconciling = this.reconcileUntilCurrent()
			.catch((error) => {
				this.reconciliationError = error;
				this.hub.publishLoading({ type: "error", message: error instanceof Error ? error.message : String(error) });
				this.ensureRecoveryWatcher();
				throw error;
			})
			.finally(() => {
				this.reconciling = undefined;
				if (!this.stopped && this.rebuildRequested) this.reconcileFromWatcher(false);
			});
		return this.reconciling;
	}

	async initialize(): Promise<void> {
		this.stopped = false;
		this.reconciliationError = undefined;
		await this.installWatchers(this.selected.scope);
		await this.scheduleReconcile(false);
		if (!this.selected.graph) throw new Error("Browser services did not prepare a task graph");
		this.hub.publishLoading({ type: "loaded" });
	}

	private async reconcileUntilCurrent(): Promise<void> {
		while (!this.stopped && this.rebuildRequested) {
			this.rebuildRequested = false;
			const configChanged = this.configVersion > this.publishedConfigVersion;
			if (configChanged && this.pendingConfig?.version !== this.configVersion) {
				this.clearWatchers(this.pendingConfig?.watchers);
				const version = this.configVersion;
				const core = new Core(this.deploymentRoot);
				const scope = new ProjectScope(core);
				const watchers = await this.createWatchers(scope);
				if (this.stopped) {
					this.clearWatchers(watchers);
					return;
				}
				if (version !== this.configVersion) {
					this.clearWatchers(watchers);
					continue;
				}
				this.pendingConfig = { version, core, scope, watchers };
			}
			const current = this.pendingConfig?.core ?? this.selected.core;
			const graph = new ProjectTaskGraph(await current.loadTaskSnapshot());
			if (this.stopped) return;
			if (this.rebuildRequested) continue;
			const scope = this.pendingConfig?.scope ?? this.selected.scope;
			const recovered = this.reconciliationError !== undefined;
			this.reconciliationError = undefined;
			this.recoveryWatcher?.close();
			this.recoveryWatcher = undefined;
			// Publish one complete binding. A request that already captured the old selection keeps it.
			this.selected = { scope, core: current, graph };
			if (configChanged) {
				const pending = this.pendingConfig;
				this.pendingConfig = undefined;
				if (pending) {
					this.publishedConfigVersion = pending.version;
					this.replaceWatchers(pending.watchers);
				}
				this.hub.disconnectAll();
				this.hub.publishConfig();
			} else {
				this.hub.publishData(this.publication);
			}
			if (recovered) this.hub.publishLoading({ type: "loaded" });
		}
	}

	private async installWatchers(scope: ProjectScope): Promise<void> {
		if (this.watchers.length > 0) return;
		const watchers = await this.createWatchers(scope);
		if (this.stopped) {
			this.clearWatchers(watchers);
			return;
		}
		this.watchers = watchers;
	}

	private async createWatchers(scope: ProjectScope): Promise<Array<Pick<FSWatcher, "close">>> {
		const watchers: Array<Pick<FSWatcher, "close">> = [];
		try {
			await mkdir(this.deploymentRoot, { recursive: true });
			const filesystem = scope.requestCore().filesystem;
			// Prime the baseline so the fallback only publishes post-subscription changes.
			await filesystem.loadConfig();
			const configWatcher = watchConfigFile(filesystem, {
				onConfigChanged: () => this.reconcileFromWatcher(true),
				onConfigInvalid: () => this.reconcileFromWatcher(true),
			});
			watchers.push({ close: () => configWatcher.stop() });
			if (scope.configLocation !== "root") {
				const rootFilesystem = new FileSystem(this.deploymentRoot, {
					backlogDirectory: scope.directory,
					configLocation: "root",
				});
				await rootFilesystem.loadConfig();
				const rootConfigWatcher = watchConfigFile(rootFilesystem, {
					onConfigChanged: () => this.reconcileFromWatcher(true),
					onConfigInvalid: () => this.reconcileFromWatcher(true),
				});
				watchers.push({ close: () => rootConfigWatcher.stop() });
			}
			this.watchDirectory(watchers, scope.root, (path) => {
				if (
					!path ||
					(scope.backlog === scope.root && !path.startsWith(".git/")) ||
					path === scope.directory ||
					path.startsWith(`${scope.directory}/`)
				)
					this.reconcileFromWatcher(false);
			});
			if (scope.backlog !== scope.root) {
				this.watchDirectory(watchers, scope.backlog, () => {
					this.reconcileFromWatcher(false);
				});
			}
			for (const directory of await this.gitDirectories(scope.root)) {
				if (this.stopped) break;
				this.watchDirectory(watchers, directory, (path) => {
					if (!path || path === "HEAD" || path === "packed-refs" || path.startsWith("refs/"))
						this.reconcileFromWatcher(false);
				});
			}
			if (this.stopped) this.clearWatchers(watchers);
			return watchers;
		} catch (error) {
			this.clearWatchers(watchers);
			throw error;
		}
	}

	async dispose(): Promise<void> {
		this.stopped = true;
		this.clearWatchers();
		this.recoveryWatcher?.close();
		this.recoveryWatcher = undefined;
		this.clearWatchers(this.pendingConfig?.watchers);
		this.pendingConfig = undefined;
		this.reconciliationError = undefined;
	}

	private replaceWatchers(watchers: Array<Pick<FSWatcher, "close">>): void {
		const previous = this.watchers;
		this.watchers = watchers;
		this.clearWatchers(previous);
	}

	private clearWatchers(watchers: Array<Pick<FSWatcher, "close">> = this.watchers): void {
		for (const watcher of watchers) watcher.close();
		if (watchers === this.watchers) this.watchers = [];
	}

	private reconcileFromWatcher(configChanged: boolean): void {
		void this.scheduleReconcile(configChanged).catch(() => {});
	}

	private ensureRecoveryWatcher(): void {
		if (this.stopped || this.recoveryWatcher) return;
		const filesystem = new Core(this.deploymentRoot).filesystem;
		void filesystem.loadConfig().catch(() => {});
		const watcher = watchConfigFile(filesystem, {
			onConfigChanged: () => this.reconcileFromWatcher(true),
			onConfigInvalid: () => this.reconcileFromWatcher(true),
		});
		this.recoveryWatcher = { close: () => watcher.stop() };
	}

	private watchDirectory(
		watchers: Array<Pick<FSWatcher, "close">>,
		directory: string,
		onChange: (path: string | null) => void,
	): boolean {
		try {
			const watcher = watch(directory, { recursive: true }, (_event, filename) => {
				onChange(filename?.toString().replaceAll("\\", "/") ?? null);
			});
			watcher.on("error", (error) => this.hub.publishLoading({ type: "error", message: error.message }));
			watchers.push(watcher);
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw error;
		}
	}

	private async gitDirectories(root: string): Promise<string[]> {
		try {
			const process = Bun.spawn(["git", "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"], {
				cwd: root,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "ignore",
			});
			if ((await process.exited) !== 0) return [];
			return [...new Set((await new Response(process.stdout).text()).split("\n").filter(Boolean))];
		} catch {
			return [];
		}
	}
}
