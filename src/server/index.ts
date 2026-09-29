import net from "node:net";
import { dirname, isAbsolute, join } from "node:path";
import type { Server, ServerWebSocket } from "bun";
import { DEFAULT_STATUSES } from "../constants/index.ts";
import { Core, TaskArchiveStatusError } from "../core/backlog.ts";
import type { ContentStore } from "../core/content-store.ts";
import { initializeProject } from "../core/init.ts";
import { MilestoneWorkflow, MilestoneWorkflowError } from "../core/milestone-workflow.ts";
import { collectMilestoneAliasKeys } from "../core/milestones.ts";
import type { SearchService } from "../core/search-service.ts";
import { getTaskStatistics } from "../core/statistics.ts";
import { loadTaskDetail } from "../core/task-detail.ts";
import { isCreateLockError, isTaskLockError } from "../file-system/operations.ts";
import { DOCUMENT_TYPE_VALUES, type Document, type Task } from "../types/index.ts";
import { launchBrowser } from "../utils/browser-launch.ts";
import type { BrowserLoadingState } from "../utils/browser-loading-state.ts";
import { isAmbiguousIdError } from "../utils/entity-id.ts";
import { resolveMilestoneInputFromFilesystem } from "../utils/milestone-storage.ts";
import { DRAFT_PREFIX, extractAnyPrefix } from "../utils/prefix-config.ts";
import { formatValidPriorityValues, resolvePriorityValue } from "../utils/priority-config.ts";
import { formatValidStatuses, getCanonicalStatuses, getValidStatuses } from "../utils/status.ts";
import { isValidTaskId } from "../utils/task-id.ts";
import { isAmbiguousTaskIdError, LOCAL_TASK_LOOKUP_HINT } from "../utils/task-path.ts";
import { getVersion } from "../utils/version.ts";
import { parseSearchRequest } from "./search.ts";
import {
	normalizeAcceptanceCriteriaItems,
	parseDocumentUpdate,
	parseDueDate,
	parseInitInput,
	parseTaskUpdate,
} from "./validation.ts";

// Regex pattern to match any prefix (letters followed by dash)
const PREFIX_PATTERN = /^[a-zA-Z]+-/i;
const DEFAULT_PREFIX = "task-";
const DOCUMENT_TYPES = new Set<Document["type"]>(DOCUMENT_TYPE_VALUES);

/**
 * The task routes serve drafts too, so only an explicit DRAFT- id addresses a draft.
 * A prefix-less id such as "2" keeps naming a task, which is what the task store resolves it to.
 */
function isDraftId(taskId: string): boolean {
	return extractAnyPrefix(taskId) === DRAFT_PREFIX;
}

/**
 * Lookups stay local on every surface, but the CLI's hint ends by telling the reader to open
 * 'backlog browser' - nonsensical once the rejected save already happened there. Same fact,
 * addressed to a reader who is already in the browser.
 */
const WEB_TASK_LOOKUP_HINT =
	"Task lookups read only the local working copy; a task that exists only on another branch cannot be referenced yet.";

function formatErrorForWeb(message: string): string {
	return message.replace(LOCAL_TASK_LOOKUP_HINT, WEB_TASK_LOOKUP_HINT);
}

/**
 * Read the marker core attaches when a mutation failed after the record had already moved. The
 * response carries it so a client refreshes and reports what happened instead of retrying a move
 * that already took place.
 */
function readMovedState(error: unknown, key: "archiveState" | "demotionState"): "moved" | "partial" | undefined {
	const state = typeof error === "object" && error !== null ? (error as Record<string, unknown>)[key] : undefined;
	return state === "moved" || state === "partial" ? state : undefined;
}

function readDemotionFailureCause(error: unknown): "cleanup" | "commit" | undefined {
	const cause =
		typeof error === "object" && error !== null ? (error as Record<string, unknown>).demotionFailureCause : undefined;
	return cause === "cleanup" || cause === "commit" ? cause : undefined;
}

class DocumentPayloadValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DocumentPayloadValidationError";
	}
}

function parseDocumentType(value: unknown): Document["type"] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string") {
		throw new DocumentPayloadValidationError("Document type must be a string.");
	}
	if (!DOCUMENT_TYPES.has(value as Document["type"])) {
		throw new DocumentPayloadValidationError(`Document type must be one of: ${DOCUMENT_TYPE_VALUES.join(", ")}.`);
	}
	return value as Document["type"];
}

function parseDocumentTags(value: unknown): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		throw new DocumentPayloadValidationError("Document tags must be an array of strings.");
	}
	if (value.some((tag) => typeof tag !== "string")) {
		throw new DocumentPayloadValidationError("Document tags must be an array of strings.");
	}
	return Array.from(new Set(value.map((tag) => tag.trim()).filter((tag) => tag.length > 0)));
}

function parseCreateDocumentPath(value: unknown): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string") {
		throw new DocumentPayloadValidationError("Document path must be a string.");
	}
	return value;
}

function collectDelimitedSearchParams(url: URL, names: string[]): string[] {
	const values = names.flatMap((name) => url.searchParams.getAll(name));
	return values
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

function isDocumentValidationError(error: Error): boolean {
	return (
		error instanceof DocumentPayloadValidationError ||
		error.message.startsWith("Document type ") ||
		error.message.startsWith("Document path ") ||
		error.message === "Title is required to create a document." ||
		error.message === "Document title cannot be empty."
	);
}

/**
 * Ensure an ID has a prefix. If it already has one, return as-is.
 * Otherwise, add the default "task-" prefix.
 */
function ensurePrefix(id: string): string {
	if (PREFIX_PATTERN.test(id)) {
		return id;
	}
	return `${DEFAULT_PREFIX}${id}`;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return undefined;
}

import indexHtml from "../web/index.html";

const NO_STORE_HEADERS = {
	"Cache-Control": "no-store, max-age=0, must-revalidate",
	Pragma: "no-cache",
	Expires: "0",
} as const;

function applyNoStoreHeaders(headers: Headers): void {
	for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
		headers.set(name, value);
	}
}

export function markHtmlBundleNoStore(bundle: Bun.HTMLBundle): Bun.HTMLBundle {
	if (!bundle.files) {
		return bundle;
	}

	for (const file of bundle.files) {
		if (file.loader === "html" && file.isEntry) {
			Object.assign(file.headers, NO_STORE_HEADERS);
		}
	}

	return bundle;
}

const spaIndexHtml = markHtmlBundleNoStore(indexHtml);
const BUNDLE_ASSET_DIR_ENV = "BACKLOG_BUNDLE_ASSET_DIR";
const BROWSER_HOST = "127.0.0.1";
const DEFAULT_BROWSER_PORT = 6420;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const DATA_BROADCAST_DEBOUNCE_MS = 75;
const SERVER_STOP_TIMEOUT_MS = 1500;

export async function isPortAvailable(port: number): Promise<boolean> {
	if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) return false;
	return new Promise((resolve) => {
		const srv = net.createServer();
		srv.listen(port, BROWSER_HOST, () => srv.close(() => resolve(true)));
		srv.on("error", () => resolve(false));
	});
}

export async function findNextAvailablePort(startPort: number, maxPort = MAX_PORT): Promise<number | null> {
	if (!Number.isInteger(startPort) || !Number.isInteger(maxPort)) return null;

	const firstPort = Math.max(startPort, MIN_PORT);
	const lastPort = Math.min(maxPort, MAX_PORT);
	for (let port = firstPort; port <= lastPort; port++) {
		if (await isPortAvailable(port)) {
			return port;
		}
	}
	return null;
}

export class BacklogServer {
	private core: Core;
	private server: Server<unknown> | null = null;
	private runtimeWorkingDirectory: string | null = null;
	private projectName = "Untitled Project";
	private sockets = new Set<ServerWebSocket<unknown>>();
	private contentStore: ContentStore | null = null;
	private searchService: SearchService | null = null;
	private servicesReadyPromise: Promise<void> | null = null;
	private servicesInitialized = false;
	private browserLoadingState: BrowserLoadingState = { type: "loading", message: null };
	private unsubscribeContentStore?: () => void;
	private taskBroadcastTimer?: ReturnType<typeof setTimeout>;
	private pendingDataBroadcastScope: "tasks" | "milestones" = "tasks";
	private storeReadyBroadcasted = false;

	constructor(projectPath: string) {
		this.core = new Core(projectPath, { enableWatchers: true });
	}

	private async resolveMilestoneInput(milestone: string): Promise<string> {
		return resolveMilestoneInputFromFilesystem(milestone, this.core.filesystem);
	}

	private async ensureServicesReady(): Promise<void> {
		if (!this.servicesReadyPromise) {
			this.publishBrowserLoadingState({ type: "loading", message: null });
			const readyPromise = this.initializeServices()
				.then(() => this.publishBrowserLoadingState({ type: "loaded" }))
				.catch((error) => {
					if (this.servicesReadyPromise === readyPromise) this.servicesReadyPromise = null;
					this.publishBrowserLoadingState({
						type: "error",
						message: error instanceof Error ? error.message : String(error),
					});
					throw error;
				});
			this.servicesReadyPromise = readyPromise;
		}
		await this.servicesReadyPromise;
	}

	private async initializeServices(): Promise<void> {
		const store = await this.core.getContentStore((message) => {
			this.publishBrowserLoadingState({ type: "loading", message });
		});
		this.contentStore = store;

		if (!this.unsubscribeContentStore) {
			this.unsubscribeContentStore = store.subscribe((event) => {
				if (event.type === "config") {
					this.storeReadyBroadcasted = true;
					this.projectName = event.config.projectName;
					this.broadcastConfigUpdated();
					return;
				}

				if (event.type === "ready") {
					if (!this.storeReadyBroadcasted) {
						this.storeReadyBroadcasted = true;
						return;
					}
					this.broadcastDataUpdated();
					return;
				}

				// Broadcast for tasks/documents/decisions so clients refresh caches/search
				this.storeReadyBroadcasted = true;
				this.broadcastDataUpdated();
			});
		}

		const search = await this.core.getSearchService();
		this.searchService = search;
		this.servicesInitialized = true;
	}

	private async getContentStoreInstance(): Promise<ContentStore> {
		await this.ensureServicesReady();
		if (!this.contentStore) {
			throw new Error("Content store not initialized");
		}
		return this.contentStore;
	}

	private async getSearchServiceInstance(): Promise<SearchService> {
		await this.ensureServicesReady();
		if (!this.searchService) {
			throw new Error("Search service not initialized");
		}
		return this.searchService;
	}

	getPort(): number | null {
		return this.server?.port ?? null;
	}

	private broadcast(message: string) {
		for (const ws of this.sockets) {
			try {
				ws.send(message);
			} catch {}
		}
	}

	private broadcastDataUpdated(scope: "tasks" | "milestones" = "tasks") {
		// Milestone changes widen the message so clients also refetch milestone
		// entities; the debounce keeps the widest scope seen in the window.
		if (scope === "milestones") this.pendingDataBroadcastScope = "milestones";
		if (this.taskBroadcastTimer) clearTimeout(this.taskBroadcastTimer);
		this.taskBroadcastTimer = setTimeout(() => {
			this.taskBroadcastTimer = undefined;
			const message = this.pendingDataBroadcastScope === "milestones" ? "milestones-updated" : "tasks-updated";
			this.pendingDataBroadcastScope = "tasks";
			this.broadcast(message);
		}, DATA_BROADCAST_DEBOUNCE_MS);
	}

	private broadcastConfigUpdated() {
		this.broadcast("config-updated");
	}

	private publishBrowserLoadingState(state: BrowserLoadingState) {
		this.browserLoadingState = state;
		const message = JSON.stringify(state);
		this.broadcast(message);
	}

	private createRoutes() {
		return {
			"/": spaIndexHtml,
			"/tasks": spaIndexHtml,
			"/tasks/*": spaIndexHtml,
			"/board": spaIndexHtml,
			"/board/*": spaIndexHtml,
			"/milestones": spaIndexHtml,
			"/drafts": spaIndexHtml,
			"/documentation": spaIndexHtml,
			"/documentation/*": spaIndexHtml,
			"/decisions": spaIndexHtml,
			"/decisions/*": spaIndexHtml,
			"/statistics": spaIndexHtml,
			"/settings": spaIndexHtml,
			"/api/tasks": {
				GET: async (req: Request) => await this.handleListTasks(req),
				POST: async (req: Request) => await this.handleCreateTask(req),
			},
			"/api/task/:id": {
				GET: async (req: Request & { params: { id: string } }) => await this.handleGetTask(req.params.id),
			},
			"/api/tasks/:id": {
				GET: async (req: Request & { params: { id: string } }) => await this.handleGetTask(req.params.id),
				PUT: async (req: Request & { params: { id: string } }) => await this.handleUpdateTask(req, req.params.id),
				DELETE: async (req: Request & { params: { id: string } }) => await this.handleDeleteTask(req.params.id),
			},
			"/api/tasks/:id/complete": {
				POST: async (req: Request & { params: { id: string } }) => await this.handleCompleteTask(req.params.id),
			},
			"/api/tasks/:id/demote": {
				POST: async (req: Request & { params: { id: string } }) => await this.handleDemoteTask(req.params.id),
			},
			"/api/statuses": { GET: async () => await this.handleGetStatuses() },
			"/api/config": {
				GET: async () => await this.handleGetConfig(),
				PUT: async (req: Request) => await this.handleUpdateConfig(req),
			},
			"/api/docs": {
				GET: async () => await this.handleListDocs(),
				POST: async (req: Request) => await this.handleCreateDoc(req),
			},
			"/api/doc/:id": {
				GET: async (req: Request & { params: { id: string } }) => await this.handleGetDoc(req.params.id),
			},
			"/api/docs/:id": {
				GET: async (req: Request & { params: { id: string } }) => await this.handleGetDoc(req.params.id),
				PUT: async (req: Request & { params: { id: string } }) => await this.handleUpdateDoc(req, req.params.id),
			},
			"/api/decisions": {
				GET: async () => await this.handleListDecisions(),
				POST: async (req: Request) => await this.handleCreateDecision(req),
			},
			"/api/decision/:id": {
				GET: async (req: Request & { params: { id: string } }) => await this.handleGetDecision(req.params.id),
			},
			"/api/decisions/:id": {
				GET: async (req: Request & { params: { id: string } }) => await this.handleGetDecision(req.params.id),
				PUT: async (req: Request & { params: { id: string } }) => await this.handleUpdateDecision(req, req.params.id),
			},
			"/api/drafts": { GET: async () => await this.handleListDrafts() },
			"/api/drafts/:id/promote": {
				POST: async (req: Request & { params: { id: string } }) => await this.handlePromoteDraft(req.params.id),
			},
			"/api/milestones": {
				GET: async () => await this.handleListMilestones(),
				POST: async (req: Request) => await this.handleCreateMilestone(req),
			},
			"/api/milestones/archived": { GET: async () => await this.handleListArchivedMilestones() },
			"/api/milestones/:id": {
				GET: async (req: Request & { params: { id: string } }) => await this.handleGetMilestone(req.params.id),
				PUT: async (req: Request & { params: { id: string } }) => await this.handleUpdateMilestone(req, req.params.id),
				DELETE: async (req: Request & { params: { id: string } }) =>
					await this.handleRemoveMilestone(req, req.params.id),
			},
			"/api/milestones/:id/archive": {
				POST: async (req: Request & { params: { id: string } }) => await this.handleArchiveMilestone(req.params.id),
			},
			"/api/tasks/reorder": { POST: async (req: Request) => await this.handleReorderTask(req) },
			"/api/tasks/move": { POST: async (req: Request) => await this.handleMoveTasks(req) },
			"/api/tasks/cleanup": { GET: async (req: Request) => await this.handleCleanupPreview(req) },
			"/api/tasks/duplicates": {
				GET: async () => await this.handleGetDuplicateTasks(),
				POST: async (req: Request) => await this.handleRepairDuplicateTasks(req),
			},
			"/api/tasks/cleanup/execute": { POST: async (req: Request) => await this.handleCleanupExecute(req) },
			"/api/version": { GET: async () => await this.handleGetVersion() },
			"/api/statistics": { GET: async () => await this.handleGetStatistics() },
			"/api/status": { GET: async () => await this.handleGetStatus() },
			"/api/init": { POST: async (req: Request) => await this.handleInit(req) },
			"/api/search": { GET: async (req: Request) => await this.handleSearch(req) },
			"/assets/*": { GET: async (req: Request) => await this.handleAssetRequest(req) },
		};
	}

	private async handleFetch(req: Request, server: Server<unknown>): Promise<Response> {
		const response = await this.handleRequest(req, server);
		if (req.method === "GET" || req.method === "HEAD") applyNoStoreHeaders(response.headers);
		return response;
	}

	private createWebSocketHandlers() {
		return {
			open: (ws: ServerWebSocket) => {
				this.sockets.add(ws);
				ws.send(JSON.stringify(this.browserLoadingState));
				if (this.browserLoadingState.type === "loading") void this.ensureServicesReady().catch(() => {});
			},
			message(ws: ServerWebSocket) {
				ws.send("pong");
			},
			close: (ws: ServerWebSocket) => {
				this.sockets.delete(ws);
			},
		};
	}

	private createServeOptions(port: number) {
		return {
			port,
			hostname: BROWSER_HOST,
			development: process.env.NODE_ENV === "development",
			routes: this.createRoutes(),
			fetch: this.handleFetch.bind(this),
			error: this.handleError.bind(this),
			websocket: this.createWebSocketHandlers(),
		};
	}

	async start(port?: number, openBrowser = true): Promise<void> {
		// Prevent duplicate starts (e.g., accidental re-entry)
		if (this.server) {
			console.log("Server already running");
			return;
		}
		this._stopping = false;
		// Load config (migration is handled globally by CLI)
		const config = await this.core.filesystem.loadConfig();

		// Use config default port if no port specified
		const finalPort = port ?? config?.defaultPort ?? DEFAULT_BROWSER_PORT;
		this.projectName = config?.projectName || "Untitled Project";

		// Check if browser should open (config setting or CLI override)
		// Default to true if autoOpenBrowser is not explicitly set to false
		const shouldOpenBrowser = openBrowser && (config?.autoOpenBrowser ?? true);

		try {
			const serveOptions = this.createServeOptions(finalPort);
			/*
				routes: {
					"/": spaIndexHtml,
					"/tasks": spaIndexHtml,
					"/tasks/*": spaIndexHtml,
					"/board": spaIndexHtml,
					"/board/*": spaIndexHtml,
					"/milestones": spaIndexHtml,
					"/drafts": spaIndexHtml,
					"/documentation": spaIndexHtml,
					"/documentation/*": spaIndexHtml,
					"/decisions": spaIndexHtml,
					"/decisions/*": spaIndexHtml,
					"/statistics": spaIndexHtml,
					"/settings": spaIndexHtml,

					// API Routes using Bun's native route syntax
					"/api/tasks": {
						GET: async (req: Request) => await this.handleListTasks(req),
						POST: async (req: Request) => await this.handleCreateTask(req),
					},
					"/api/task/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetTask(req.params.id),
					},
					"/api/tasks/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetTask(req.params.id),
						PUT: async (req: Request & { params: { id: string } }) => await this.handleUpdateTask(req, req.params.id),
						DELETE: async (req: Request & { params: { id: string } }) => await this.handleDeleteTask(req.params.id),
					},
					"/api/tasks/:id/complete": {
						POST: async (req: Request & { params: { id: string } }) => await this.handleCompleteTask(req.params.id),
					},
					"/api/tasks/:id/demote": {
						POST: async (req: Request & { params: { id: string } }) => await this.handleDemoteTask(req.params.id),
					},
					"/api/statuses": {
						GET: async () => await this.handleGetStatuses(),
					},
					"/api/config": {
						GET: async () => await this.handleGetConfig(),
						PUT: async (req: Request) => await this.handleUpdateConfig(req),
					},
					"/api/docs": {
						GET: async () => await this.handleListDocs(),
						POST: async (req: Request) => await this.handleCreateDoc(req),
					},
					"/api/doc/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetDoc(req.params.id),
					},
					"/api/docs/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetDoc(req.params.id),
						PUT: async (req: Request & { params: { id: string } }) => await this.handleUpdateDoc(req, req.params.id),
					},
					"/api/decisions": {
						GET: async () => await this.handleListDecisions(),
						POST: async (req: Request) => await this.handleCreateDecision(req),
					},
					"/api/decision/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetDecision(req.params.id),
					},
					"/api/decisions/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetDecision(req.params.id),
						PUT: async (req: Request & { params: { id: string } }) =>
							await this.handleUpdateDecision(req, req.params.id),
					},
					"/api/drafts": {
						GET: async () => await this.handleListDrafts(),
					},
					"/api/drafts/:id/promote": {
						POST: async (req: Request & { params: { id: string } }) => await this.handlePromoteDraft(req.params.id),
					},
					"/api/milestones": {
						GET: async () => await this.handleListMilestones(),
						POST: async (req: Request) => await this.handleCreateMilestone(req),
					},
					"/api/milestones/archived": {
						GET: async () => await this.handleListArchivedMilestones(),
					},
					"/api/milestones/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetMilestone(req.params.id),
						PUT: async (req: Request & { params: { id: string } }) =>
							await this.handleUpdateMilestone(req, req.params.id),
						DELETE: async (req: Request & { params: { id: string } }) =>
							await this.handleRemoveMilestone(req, req.params.id),
					},
					"/api/milestones/:id/archive": {
						POST: async (req: Request & { params: { id: string } }) => await this.handleArchiveMilestone(req.params.id),
					},
					"/api/tasks/reorder": {
						POST: async (req: Request) => await this.handleReorderTask(req),
					},
					"/api/tasks/move": {
						POST: async (req: Request) => await this.handleMoveTasks(req),
					},
					"/api/tasks/cleanup": {
						GET: async (req: Request) => await this.handleCleanupPreview(req),
					},
					"/api/tasks/duplicates": {
						GET: async () => await this.handleGetDuplicateTasks(),
						POST: async (req: Request) => await this.handleRepairDuplicateTasks(req),
					},
					"/api/tasks/cleanup/execute": {
						POST: async (req: Request) => await this.handleCleanupExecute(req),
					},
					"/api/version": {
						GET: async () => await this.handleGetVersion(),
					},
					"/api/statistics": {
						GET: async () => await this.handleGetStatistics(),
					},
					"/api/status": {
						GET: async () => await this.handleGetStatus(),
					},
					"/api/init": {
						POST: async (req: Request) => await this.handleInit(req),
					},
					"/api/search": {
						GET: async (req: Request) => await this.handleSearch(req),
					},
					// Serve files placed under backlog/assets at /assets/<relative-path>
					"/assets/*": {
						GET: async (req: Request) => await this.handleAssetRequest(req),
					},
				},
			*/
			const bundleAssetDirectory = process.env[BUNDLE_ASSET_DIR_ENV]?.trim();
			if (bundleAssetDirectory) {
				this.runtimeWorkingDirectory = process.cwd();
				process.chdir(bundleAssetDirectory);
			}

			try {
				this.server = Bun.serve(serveOptions as unknown as Parameters<typeof Bun.serve>[0]) as Server<unknown>;
			} catch (error) {
				this.restoreRuntimeWorkingDirectory();
				throw error;
			}
			const url = `http://${BROWSER_HOST}:${finalPort}`;
			console.log(`🚀 Backlog.md browser interface running at ${url}`);
			console.log(`📊 Project: ${this.projectName}`);
			const stopKey = process.platform === "darwin" ? "Cmd+C" : "Ctrl+C";
			console.log(`⏹️  Press ${stopKey} to stop the server`);

			if (shouldOpenBrowser) {
				console.log("🌐 Opening browser...");
				await this.openBrowser(url);
			} else {
				console.log("💡 Open your browser and navigate to the URL above");
			}
		} catch (error) {
			// Handle port already in use error
			const errorCode = (error as { code?: string })?.code;
			const errorMessage = (error as Error)?.message;
			if (errorCode === "EADDRINUSE" || errorMessage?.includes("address already in use")) {
				console.error(`\n❌ Error: Port ${finalPort} is already in use. Use --port to specify a different port.\n`);
				process.exit(1);
			}

			// Handle other errors
			console.error("❌ Failed to start server:", errorMessage || error);
			process.exit(1);
		}
	}

	private _stopping = false;

	private restoreRuntimeWorkingDirectory(): void {
		if (!this.runtimeWorkingDirectory) return;
		process.chdir(this.runtimeWorkingDirectory);
		this.runtimeWorkingDirectory = null;
	}

	async stop(): Promise<void> {
		if (this.taskBroadcastTimer) clearTimeout(this.taskBroadcastTimer);
		if (this._stopping) return;
		this._stopping = true;

		// Stop filesystem watcher first to reduce churn
		try {
			this.unsubscribeContentStore?.();
			this.unsubscribeContentStore = undefined;
		} catch {}

		this.core.disposeSearchService();
		this.core.disposeContentStore();
		this.restoreRuntimeWorkingDirectory();
		this.searchService = null;
		this.contentStore = null;
		this.servicesReadyPromise = null;
		this.servicesInitialized = false;
		this.browserLoadingState = { type: "loading", message: null };
		this.storeReadyBroadcasted = false;

		// Proactively close WebSocket connections
		for (const ws of this.sockets) {
			try {
				ws.close();
			} catch {}
		}
		this.sockets.clear();

		// Attempt to stop the server but don't hang forever
		if (this.server) {
			const serverRef = this.server;
			const stopPromise = (async () => {
				try {
					await serverRef.stop();
				} catch {}
			})();
			const timeout = new Promise<void>((resolve) => setTimeout(resolve, SERVER_STOP_TIMEOUT_MS));
			await Promise.race([stopPromise, timeout]);
			this.server = null;
			console.log("Server stopped");
		}

		this._stopping = false;
	}

	private async openBrowser(url: string): Promise<void> {
		try {
			await launchBrowser(url);
		} catch (error) {
			console.warn("⚠️  Failed to open browser automatically:", error);
			console.log("💡 Please open your browser manually and navigate to the URL above");
		}
	}

	private async handleAssetRequest(req: Request): Promise<Response> {
		try {
			const url = new URL(req.url);
			const pathname = decodeURIComponent(url.pathname || "");
			const prefix = "/assets/";
			if (!pathname.startsWith(prefix)) return new Response("Not Found", { status: 404 });

			// Path relative to backlog/assets
			const relPath = pathname.slice(prefix.length);

			// disallow traversal
			if (relPath.includes("..")) return new Response("Not Found", { status: 404 });

			// derive backlog root from docsDir (parent of backlog/docs)
			const docsDir = this.core.filesystem.docsDir;
			const backlogRoot = dirname(docsDir);
			const assetsRoot = join(backlogRoot, "assets");
			const filePath = join(assetsRoot, relPath);

			if (!filePath.startsWith(assetsRoot)) return new Response("Not Found", { status: 404 });

			const file = Bun.file(filePath);
			if (!(await file.exists())) return new Response("Not Found", { status: 404 });

			const ext = (filePath.match(/\.([^./]+)$/) || [])[1]?.toLowerCase() || "";
			const mimeMap: Record<string, string> = {
				png: "image/png",
				jpg: "image/jpeg",
				jpeg: "image/jpeg",
				gif: "image/gif",
				svg: "image/svg+xml",
				webp: "image/webp",
				avif: "image/avif",
				pdf: "application/pdf",
				txt: "text/plain",
				css: "text/css",
				js: "application/javascript",
			};

			const mime = mimeMap[ext] ?? "application/octet-stream";
			return new Response(file, { headers: { "Content-Type": mime } });
		} catch (error) {
			console.error("Error serving asset:", error);
			return new Response("Internal Server Error", { status: 500 });
		}
	}

	private async handleRequest(req: Request, server: Server<unknown>): Promise<Response> {
		// Handle WebSocket upgrade
		if (req.headers.get("upgrade") === "websocket") {
			const success = server.upgrade(req, { data: undefined });
			if (success) {
				return new Response(null, { status: 101 }); // WebSocket upgrade response
			}
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		// For all other routes, return 404 since routes should handle all valid paths
		return new Response("Not Found", { status: 404 });
	}

	// Task handlers
	private async handleListTasks(req: Request): Promise<Response> {
		let refreshCrossBranch = this.servicesInitialized;
		await this.ensureServicesReady();
		const url = new URL(req.url);
		const status = url.searchParams.get("status") || undefined;
		const assignee = url.searchParams.get("assignee") || undefined;
		const parent = url.searchParams.get("parent") || undefined;
		const priorityParam = url.searchParams.get("priority") || undefined;
		// The browser reads the cross-branch corpus the server already keeps in the content store, so
		// the default must not fall back to re-reading the working copy on every list request.
		const crossBranch = url.searchParams.get("crossBranch") !== "false";
		const excludeStatusParams = collectDelimitedSearchParams(url, [
			"excludeStatus",
			"exclude-status",
			"excludeStatuses",
			"exclude-statuses",
		]);
		const labelParams = [...url.searchParams.getAll("label"), ...url.searchParams.getAll("labels")];
		const labelsCsv = url.searchParams.get("labels");
		if (labelsCsv) {
			labelParams.push(...labelsCsv.split(","));
		}
		const labels = labelParams.map((label) => label.trim()).filter((label) => label.length > 0);

		const config = await this.core.filesystem.loadConfig();
		let priority: string | undefined;
		if (priorityParam) {
			const normalizedPriority = resolvePriorityValue(priorityParam, config);
			if (!normalizedPriority) {
				return Response.json(
					{ error: `Invalid priority filter. Valid values are: ${formatValidPriorityValues(config)}` },
					{ status: 400 },
				);
			}
			priority = normalizedPriority;
		}

		let excludeStatus: string[] | undefined;
		if (excludeStatusParams.length > 0) {
			const { values, invalid, validStatuses } = await getCanonicalStatuses(excludeStatusParams, this.core);
			if (invalid.length > 0) {
				return Response.json(
					{
						error: `Invalid excludeStatus filter: ${invalid.join(", ")}. Valid statuses are: ${formatValidStatuses(validStatuses)}`,
					},
					{ status: 400 },
				);
			}
			excludeStatus = values.length > 0 ? values : undefined;
		}

		// Resolve parent task ID if provided
		let parentTaskId: string | undefined;
		if (parent) {
			let parentTask: Task | null;
			try {
				parentTask = await this.core.getTask(parent, { refreshCrossBranch });
				refreshCrossBranch = false;
				if (!parentTask) {
					parentTask = await this.core.getTask(ensurePrefix(parent), { refreshCrossBranch: false });
				}
			} catch (error) {
				if (isAmbiguousTaskIdError(error)) {
					return Response.json({ error: error.message }, { status: 409 });
				}
				throw error;
			}
			if (!parentTask) {
				const normalizedParent = ensurePrefix(parent);
				return Response.json({ error: `Parent task ${normalizedParent} not found` }, { status: 404 });
			}
			parentTaskId = parentTask.id;
		}

		// Use Core.queryTasks which handles all filtering and cross-branch logic
		const tasks = await this.core.queryTasks({
			filters: {
				status,
				excludeStatus,
				assignee,
				priority,
				parentTaskId,
				labels: labels.length > 0 ? labels : undefined,
			},
			includeCrossBranch: crossBranch,
			refreshCrossBranch,
		});

		return Response.json(tasks);
	}

	private async handleSearch(req: Request): Promise<Response> {
		try {
			const parsed = await parseSearchRequest(new URL(req.url), this.core);
			if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
			const servicesWereReady = this.servicesInitialized;
			const searchService = await this.getSearchServiceInstance();
			if (servicesWereReady && (!parsed.value.types || parsed.value.types.includes("task"))) {
				await this.core.refreshTasksForTaskRead();
			}
			const results = searchService.search(parsed.value);
			return Response.json(results);
		} catch (error) {
			console.error("Error performing search:", error);
			return Response.json({ error: "Search failed" }, { status: 500 });
		}
	}

	private async handleCreateTask(req: Request): Promise<Response> {
		const payload = await req.json();

		if (!payload || typeof payload.title !== "string" || payload.title.trim().length === 0) {
			return Response.json({ error: "Title is required" }, { status: 400 });
		}
		const dueDate = parseDueDate(payload.dueDate, false);
		if ("error" in dueDate) return Response.json({ error: dueDate.error }, { status: 400 });

		const acceptanceCriteria = normalizeAcceptanceCriteriaItems(payload.acceptanceCriteriaItems);
		const definitionOfDoneAdd = Array.isArray(payload.definitionOfDoneAdd)
			? payload.definitionOfDoneAdd
					.map((item: unknown) => String(item ?? "").trim())
					.filter((item: string) => item.length > 0)
			: [];
		const disableDefinitionOfDoneDefaults = Boolean(payload.disableDefinitionOfDoneDefaults);

		try {
			const milestone =
				typeof payload.milestone === "string" ? await this.resolveMilestoneInput(payload.milestone) : undefined;

			const { task: createdTask } = await this.core.createTaskFromInput({
				title: payload.title,
				dueDate: dueDate.value ?? undefined,
				description: payload.description,
				status: payload.status,
				priority: payload.priority,
				type: typeof payload.type === "string" ? payload.type : undefined,
				project: typeof payload.project === "string" ? payload.project : undefined,
				milestone,
				labels: payload.labels,
				assignee: payload.assignee,
				dependencies: payload.dependencies,
				references: payload.references,
				modifiedFiles: payload.modifiedFiles,
				parentTaskId: payload.parentTaskId,
				implementationPlan: payload.implementationPlan,
				implementationNotes: payload.implementationNotes,
				finalSummary: payload.finalSummary,
				acceptanceCriteria,
				definitionOfDoneAdd,
				disableDefinitionOfDoneDefaults,
			});
			return Response.json(createdTask, { status: 201 });
		} catch (error) {
			if (isCreateLockError(error)) {
				const message = error instanceof Error ? error.message : "Failed to create task";
				return Response.json({ error: message }, { status: 409 });
			}
			const message = formatErrorForWeb(error instanceof Error ? error.message : "Failed to create task");
			return Response.json({ error: message }, { status: 400 });
		}
	}

	/**
	 * Resolve the one task a detail read is about, or the response that explains why it could not be
	 * resolved. Shared so every detail endpoint fails closed on an ambiguous ID the same way.
	 */
	private async resolveDetailTask(taskId: string): Promise<Task | Response> {
		if (!isValidTaskId(taskId)) return Response.json({ error: `Invalid task ID: ${taskId}` }, { status: 400 });
		if (isDraftId(taskId)) {
			try {
				const draft = await this.core.filesystem.loadDraft(taskId);
				return draft ?? Response.json({ error: `Task ${taskId} not found` }, { status: 404 });
			} catch (error) {
				if (isAmbiguousIdError(error)) {
					return Response.json({ error: error.message }, { status: 409 });
				}
				throw error;
			}
		}
		let resolvedTask: Task | null;
		try {
			resolvedTask = await this.core.getTask(taskId);
		} catch (error) {
			if (!isAmbiguousTaskIdError(error)) throw error;
			const message = error.candidates.some((candidate) => !isAbsolute(candidate))
				? `Task ID ${taskId} is ambiguous. Repair duplicate task IDs before opening it.`
				: error.message;
			return Response.json({ error: message }, { status: 409 });
		}
		return resolvedTask ?? Response.json({ error: `Task ${taskId} not found` }, { status: 404 });
	}

	/**
	 * One task, as a detail read returns it: the record plus the relationships derived at read time,
	 * so the browser gets the dependency graph in the same response that opens the task.
	 */
	private async handleGetTask(taskId: string): Promise<Response> {
		const resolved = await this.resolveDetailTask(taskId);
		if (resolved instanceof Response) return resolved;
		await this.ensureServicesReady();
		return Response.json(await loadTaskDetail(this.core, resolved, { includeCrossBranch: true }));
	}

	private async handleUpdateTask(req: Request, taskId: string): Promise<Response> {
		const parsed = parseTaskUpdate(await req.json());
		if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
		const updateInput = parsed.value;
		if (typeof updateInput.milestone === "string")
			updateInput.milestone = await this.resolveMilestoneInput(updateInput.milestone);

		try {
			// editTaskOrDraft keeps a draft a draft, or promotes it when a real status is requested.
			const updatedTask = isDraftId(taskId)
				? (await this.core.editTaskOrDraft(taskId, updateInput)).task
				: await this.core.updateTaskFromInput(taskId, updateInput);
			return Response.json(updatedTask);
		} catch (error) {
			const message = formatErrorForWeb(error instanceof Error ? error.message : "Failed to update task");
			// Editing a task into the Draft status demotes it, so the same "already moved" report the
			// demote endpoint makes applies here: refresh, and do not invite a retry.
			const demotionState = readMovedState(error, "demotionState");
			if (demotionState) {
				this.broadcastDataUpdated();
				const demotionFailureCause = readDemotionFailureCause(error);
				return Response.json(
					{ error: message, demotionState, ...(demotionFailureCause ? { demotionFailureCause } : {}) },
					{ status: 500 },
				);
			}
			const conflict = isAmbiguousIdError(error) || isAmbiguousTaskIdError(error) || isTaskLockError(error);
			return Response.json({ error: message }, { status: conflict ? 409 : 400 });
		}
	}

	private async handleDeleteTask(taskId: string): Promise<Response> {
		try {
			const { success, cleanedTaskIds } = await this.core.archiveTask(taskId);
			if (!success) {
				return Response.json({ error: "Task not found" }, { status: 404 });
			}
			return this.taskMoveSucceeded(cleanedTaskIds);
		} catch (error) {
			if (error instanceof TaskArchiveStatusError) {
				return Response.json({ error: error.message }, { status: 400 });
			}
			// The task reached the archive and something after that failed. Say so, and refresh:
			// a client told only "error" would offer to archive a task that is already archived.
			const archiveState = readMovedState(error, "archiveState");
			if (archiveState) {
				this.broadcastDataUpdated();
				const message = error instanceof Error ? error.message : "Failed to archive task";
				console.error("Error archiving task after it moved:", error);
				return Response.json({ error: message, archiveState }, { status: 500 });
			}
			if (isAmbiguousTaskIdError(error)) {
				return Response.json({ error: error.message }, { status: 409 });
			}
			throw error;
		}
	}

	private async handleCompleteTask(taskId: string): Promise<Response> {
		try {
			const success = await this.core.completeTask(taskId);
			if (!success) {
				return Response.json({ error: "Task not found" }, { status: 404 });
			}

			// Notify listeners to refresh
			this.broadcastDataUpdated();
			return Response.json({ success: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to complete task";
			if (!isAmbiguousTaskIdError(error)) {
				console.error("Error completing task:", error);
			}
			return Response.json({ error: message }, { status: isAmbiguousTaskIdError(error) ? 409 : 500 });
		}
	}

	private async handleDemoteTask(taskId: string): Promise<Response> {
		try {
			const { success, cleanedTaskIds } = await this.core.demoteTask(taskId);
			if (!success) {
				return Response.json({ error: "Task not found" }, { status: 404 });
			}

			return this.taskMoveSucceeded(cleanedTaskIds);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to demote task";
			const conflict = isAmbiguousTaskIdError(error) || isCreateLockError(error) || isTaskLockError(error);
			const knownDemotionState = readMovedState(error, "demotionState");
			const demotionFailureCause = readDemotionFailureCause(error);
			if (knownDemotionState) {
				this.broadcastDataUpdated();
			}
			if (!conflict) {
				console.error("Error demoting task:", error);
			}
			const status = knownDemotionState ? 500 : conflict ? 409 : 500;
			return Response.json(
				{
					error: message,
					...(knownDemotionState ? { demotionState: knownDemotionState } : {}),
					...(demotionFailureCause ? { demotionFailureCause } : {}),
				},
				{ status },
			);
		}
	}

	private taskMoveSucceeded(cleanedTaskIds: string[]): Response {
		this.broadcastDataUpdated();
		return Response.json({ success: true, cleanedTaskIds });
	}

	private async handleGetStatuses(): Promise<Response> {
		const statuses = await getValidStatuses(this.core);
		return Response.json(statuses);
	}

	// Documentation handlers
	private async handleListDocs(): Promise<Response> {
		try {
			const store = await this.getContentStoreInstance();
			const docs = store.getDocuments();
			const docFiles = docs.map((doc) => ({
				name: doc.path?.split(/[\\/]+/).pop() ?? `${doc.title}.md`,
				id: doc.id,
				title: doc.title,
				type: doc.type,
				path: doc.path,
				createdDate: doc.createdDate,
				updatedDate: doc.updatedDate,
				lastModified: doc.updatedDate || doc.createdDate,
				tags: doc.tags || [],
			}));
			return Response.json(docFiles);
		} catch (error) {
			console.error("Error listing documents:", error);
			return Response.json([]);
		}
	}

	private async handleGetDoc(docId: string): Promise<Response> {
		try {
			const doc = await this.core.getDocument(docId);
			if (!doc) {
				return Response.json({ error: "Document not found" }, { status: 404 });
			}
			return Response.json(doc);
		} catch (error) {
			if (isAmbiguousIdError(error)) {
				return Response.json({ error: error.message }, { status: 409 });
			}
			console.error("Error loading document:", error);
			return Response.json({ error: "Document not found" }, { status: 404 });
		}
	}

	private async handleCreateDoc(req: Request): Promise<Response> {
		try {
			const body = await req.json();
			const filename = typeof body?.filename === "string" ? body.filename : undefined;
			const title = typeof body?.title === "string" ? body.title : filename?.replace(/\.md$/i, "");
			if (!title || title.trim().length === 0) {
				return Response.json({ error: "Document title is required" }, { status: 400 });
			}
			const type = parseDocumentType(body?.type);
			const path = parseCreateDocumentPath(body?.path);
			const tags = parseDocumentTags(body?.tags);

			const document = await this.core.createDocumentFromInput({
				title,
				content: typeof body?.content === "string" ? body.content : "",
				type,
				path,
				tags,
			});
			return Response.json({ success: true, ...document }, { status: 201 });
		} catch (error) {
			if (error instanceof SyntaxError) {
				return Response.json({ error: "Invalid request payload" }, { status: 400 });
			}
			if (error instanceof Error && isDocumentValidationError(error)) {
				return Response.json({ error: error.message }, { status: 400 });
			}
			console.error("Error creating document:", error);
			return Response.json({ error: "Failed to create document" }, { status: 500 });
		}
	}

	private async handleUpdateDoc(req: Request, docId: string): Promise<Response> {
		try {
			const parsed = parseDocumentUpdate(await req.json());
			if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
			const { content, title, path, type, tags } = parsed.value;
			const documentType = parseDocumentType(type);

			const document = await this.core.updateDocumentFromInput({
				id: docId,
				content,
				...(title && { title }),
				...(path !== undefined && { path }),
				...(documentType !== undefined && { type: documentType }),
				...(tags !== undefined && { tags }),
			});
			return Response.json({ success: true, ...document });
		} catch (error) {
			if (error instanceof SyntaxError) {
				return Response.json({ error: "Invalid request payload" }, { status: 400 });
			}
			if (isAmbiguousIdError(error)) {
				return Response.json({ error: error.message }, { status: 409 });
			}
			if (error instanceof Error) {
				if (error.message.startsWith("Document not found")) {
					return Response.json({ error: error.message }, { status: 404 });
				}
				if (isDocumentValidationError(error)) {
					return Response.json({ error: error.message }, { status: 400 });
				}
			}
			console.error("Error updating document:", error);
			return Response.json({ error: "Failed to update document" }, { status: 500 });
		}
	}

	// Decision handlers
	private async handleListDecisions(): Promise<Response> {
		try {
			const store = await this.getContentStoreInstance();
			const decisions = store.getDecisions();
			const decisionFiles = decisions.map((decision) => ({
				id: decision.id,
				title: decision.title,
				status: decision.status,
				date: decision.date,
				context: decision.context,
				decision: decision.decision,
				consequences: decision.consequences,
				alternatives: decision.alternatives,
			}));
			return Response.json(decisionFiles);
		} catch (error) {
			console.error("Error listing decisions:", error);
			return Response.json([]);
		}
	}

	private async handleGetDecision(decisionId: string): Promise<Response> {
		try {
			// Resolve from disk, not the content store: the store keys decisions by raw ID and would
			// silently drop one of two files that share an ID before the ambiguity check could run.
			const decision = await this.core.filesystem.loadDecision(decisionId);

			if (!decision) {
				return Response.json({ error: "Decision not found" }, { status: 404 });
			}

			return Response.json(decision);
		} catch (error) {
			if (isAmbiguousIdError(error)) {
				return Response.json({ error: error.message }, { status: 409 });
			}
			console.error("Error loading decision:", error);
			return Response.json({ error: "Decision not found" }, { status: 404 });
		}
	}

	private async handleCreateDecision(req: Request): Promise<Response> {
		const { title } = await req.json();

		try {
			const decision = await this.core.createDecisionWithTitle(title);
			return Response.json(decision, { status: 201 });
		} catch (error) {
			console.error("Error creating decision:", error);
			return Response.json({ error: "Failed to create decision" }, { status: 500 });
		}
	}

	private async handleUpdateDecision(req: Request, decisionId: string): Promise<Response> {
		const content = await req.text();

		try {
			await this.core.updateDecisionFromContent(decisionId, content);
			return Response.json({ success: true });
		} catch (error) {
			if (isAmbiguousIdError(error)) {
				return Response.json({ error: error.message }, { status: 409 });
			}
			if (error instanceof Error && error.message.includes("not found")) {
				return Response.json({ error: "Decision not found" }, { status: 404 });
			}
			console.error("Error updating decision:", error);
			return Response.json({ error: "Failed to update decision" }, { status: 500 });
		}
	}

	private async handleGetConfig(): Promise<Response> {
		try {
			const config = await this.core.filesystem.loadConfig();
			if (!config) {
				return Response.json({ error: "Configuration not found" }, { status: 404 });
			}
			return Response.json(config);
		} catch (error) {
			console.error("Error loading config:", error);
			return Response.json({ error: "Failed to load configuration" }, { status: 500 });
		}
	}

	private async handleUpdateConfig(req: Request): Promise<Response> {
		try {
			const updatedConfig = await req.json();

			// Validate configuration
			if (!updatedConfig.projectName?.trim()) {
				return Response.json({ error: "Project name is required" }, { status: 400 });
			}

			if (updatedConfig.defaultPort && (updatedConfig.defaultPort < 1 || updatedConfig.defaultPort > 65535)) {
				return Response.json({ error: "Port must be between 1 and 65535" }, { status: 400 });
			}

			// Save configuration
			await this.core.filesystem.saveConfig(updatedConfig);

			// Update local project name if changed
			if (updatedConfig.projectName !== this.projectName) {
				this.projectName = updatedConfig.projectName;
			}

			return Response.json(updatedConfig);
		} catch (error) {
			console.error("Error updating config:", error);
			return Response.json({ error: "Failed to update configuration" }, { status: 500 });
		}
	}

	private handleError(error: Error): Response {
		console.error("Server Error:", error);
		return new Response("Internal Server Error", { status: 500 });
	}

	// Draft handlers
	private async handleListDrafts(): Promise<Response> {
		try {
			const drafts = await this.core.filesystem.listDrafts();
			return Response.json(drafts);
		} catch (error) {
			console.error("Error listing drafts:", error);
			return Response.json([]);
		}
	}

	private async handlePromoteDraft(draftId: string): Promise<Response> {
		try {
			const success = await this.core.promoteDraft(draftId);
			if (!success) {
				return Response.json({ error: "Draft not found" }, { status: 404 });
			}
			return Response.json({ success: true });
		} catch (error) {
			console.error("Error promoting draft:", error);
			if (isCreateLockError(error) || isAmbiguousIdError(error) || isTaskLockError(error)) {
				return Response.json({ error: error.message }, { status: 409 });
			}
			return Response.json({ error: "Failed to promote draft" }, { status: 500 });
		}
	}

	// Milestone handlers
	private async readOptionalJsonBody(req: Request): Promise<Record<string, unknown>> {
		const text = await req.text();
		if (!text.trim()) {
			return {};
		}

		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			throw new MilestoneWorkflowError("Request body must be valid JSON.", "VALIDATION_ERROR");
		}

		if (!body || typeof body !== "object" || Array.isArray(body)) {
			throw new MilestoneWorkflowError("Request body must be a JSON object.", "VALIDATION_ERROR");
		}

		return body as Record<string, unknown>;
	}

	private milestoneMutationErrorResponse(error: unknown, context: string): Response {
		const status =
			error instanceof MilestoneWorkflowError
				? error.code === "NOT_FOUND"
					? 404
					: error.code === "VALIDATION_ERROR"
						? 400
						: 500
				: 500;
		const message = error instanceof Error ? error.message : context;
		if (status === 500) {
			console.error(context, error);
		}
		return Response.json(
			{ error: message, code: error instanceof MilestoneWorkflowError ? error.code : "INTERNAL_ERROR" },
			{ status },
		);
	}

	private formatMilestoneRenameMessage(result: Awaited<ReturnType<MilestoneWorkflow["rename"]>>): string {
		if (!result.titleChanged && !result.dueDateChanged) {
			return `Milestone "${result.source.title}" (${result.source.id}) is already named "${result.source.title}". No changes made.`;
		}
		const lines: string[] = [];
		if (result.titleChanged) {
			lines.push(
				`Renamed milestone "${result.source.title}" (${result.source.id}) → "${result.milestone.title}" (${result.milestone.id}).`,
			);
		}
		if (result.dueDateChanged) {
			lines.push(result.milestone.dueDate ? `Due: ${result.milestone.dueDate}` : "Cleared milestone due date.");
		}
		if (result.skippedTaskUpdate) lines.push("Skipped updating tasks (updateTasks=false).");
		else if (result.titleChanged) {
			lines.push(
				`Updated ${result.updatedTaskIds.length} local task${result.updatedTaskIds.length === 1 ? "" : "s"}: ${this.formatMilestoneTaskIds(result.updatedTaskIds)}`,
			);
		}
		if (result.sourcePath && result.targetPath && result.sourcePath !== result.targetPath) {
			lines.push(`Renamed milestone file: ${result.sourcePath} -> ${result.targetPath}`);
		}
		return lines.join("\n");
	}

	private formatMilestoneRemoveMessage(result: Awaited<ReturnType<MilestoneWorkflow["remove"]>>): string {
		const lines = [`Removed milestone "${result.milestone.title}" (${result.milestone.id}).`];
		const taskIds = this.formatMilestoneTaskIds(result.updatedTaskIds);
		if (result.taskHandling === "keep") lines.push("Kept task milestone values unchanged (taskHandling=keep).");
		else if (result.taskHandling === "reassign") {
			lines.push(
				`Reassigned ${result.updatedTaskIds.length} local task${result.updatedTaskIds.length === 1 ? "" : "s"} to "${result.reassignedMilestone?.title}" (${result.reassignedMilestone?.id}): ${taskIds}`,
			);
		} else {
			lines.push(
				`Cleared milestone for ${result.updatedTaskIds.length} local task${result.updatedTaskIds.length === 1 ? "" : "s"}: ${taskIds}`,
			);
		}
		return lines.join("\n");
	}

	private formatMilestoneTaskIds(taskIds: string[]): string {
		const shown = taskIds.slice(0, 20);
		const suffix = taskIds.length > shown.length ? ` (and ${taskIds.length - shown.length} more)` : "";
		return `${shown.join(", ")}${suffix}`;
	}

	private async handleListMilestones(): Promise<Response> {
		try {
			const milestones = await this.core.filesystem.listMilestones();
			return Response.json(milestones);
		} catch (error) {
			console.error("Error listing milestones:", error);
			return Response.json([]);
		}
	}

	private async handleListArchivedMilestones(): Promise<Response> {
		try {
			const milestones = await this.core.filesystem.listArchivedMilestones();
			return Response.json(milestones);
		} catch (error) {
			console.error("Error listing archived milestones:", error);
			return Response.json([]);
		}
	}

	private async handleGetMilestone(milestoneId: string): Promise<Response> {
		try {
			const milestone = await this.core.filesystem.loadMilestone(milestoneId);
			if (!milestone) {
				return Response.json({ error: "Milestone not found" }, { status: 404 });
			}
			return Response.json(milestone);
		} catch (error) {
			console.error("Error loading milestone:", error);
			return Response.json({ error: "Milestone not found" }, { status: 404 });
		}
	}

	private async handleCreateMilestone(req: Request): Promise<Response> {
		try {
			const body = (await req.json()) as { title?: string; description?: string; dueDate?: unknown };
			const title = body.title?.trim();

			if (!title) {
				return Response.json({ error: "Milestone title is required" }, { status: 400 });
			}
			const dueDate = parseDueDate(body.dueDate, false);
			if ("error" in dueDate) return Response.json({ error: dueDate.error }, { status: 400 });

			// Check for duplicates
			const existingMilestones = await this.core.filesystem.listMilestones();
			const requestedKeys = collectMilestoneAliasKeys(title);
			const duplicate = existingMilestones.find((milestone) => {
				const milestoneKeys = new Set<string>([
					...collectMilestoneAliasKeys(milestone.id),
					...collectMilestoneAliasKeys(milestone.title),
				]);
				for (const key of requestedKeys) {
					if (milestoneKeys.has(key)) {
						return true;
					}
				}
				return false;
			});
			if (duplicate) {
				return Response.json({ error: "A milestone with this title or ID already exists" }, { status: 400 });
			}

			const milestone = await this.core.filesystem.createMilestone(title, body.description, dueDate.value ?? undefined);
			this.broadcastDataUpdated("milestones");
			return Response.json(milestone, { status: 201 });
		} catch (error) {
			console.error("Error creating milestone:", error);
			return Response.json({ error: "Failed to create milestone" }, { status: 500 });
		}
	}

	private async handleUpdateMilestone(req: Request, milestoneId: string): Promise<Response> {
		try {
			const body = await this.readOptionalJsonBody(req);
			const title = typeof body.title === "string" ? body.title.trim() : "";
			const updateTasks = typeof body.updateTasks === "boolean" ? body.updateTasks : true;
			const dueDate = parseDueDate(body.dueDate, true);
			if ("error" in dueDate) return Response.json({ error: dueDate.error }, { status: 400 });

			if (!title) {
				return Response.json({ error: "Milestone title is required" }, { status: 400 });
			}

			const result = await new MilestoneWorkflow(this.core).rename({
				from: milestoneId,
				to: title,
				updateTasks,
				dueDate: "dueDate" in body ? (dueDate.value ?? null) : undefined,
			});
			this.broadcastDataUpdated("milestones");
			return Response.json({
				success: true,
				milestone: result.milestone,
				message: this.formatMilestoneRenameMessage(result),
			});
		} catch (error) {
			return this.milestoneMutationErrorResponse(error, "Error updating milestone");
		}
	}

	private async handleRemoveMilestone(req: Request, milestoneId: string): Promise<Response> {
		try {
			const body = await this.readOptionalJsonBody(req);
			const rawTaskHandling = body.taskHandling;
			const taskHandling =
				rawTaskHandling === undefined
					? "clear"
					: rawTaskHandling === "clear" || rawTaskHandling === "keep" || rawTaskHandling === "reassign"
						? rawTaskHandling
						: null;
			const reassignTo = typeof body.reassignTo === "string" ? body.reassignTo : undefined;

			if (!taskHandling) {
				return Response.json({ error: "taskHandling must be clear, keep, or reassign" }, { status: 400 });
			}

			const result = await new MilestoneWorkflow(this.core).remove({
				name: milestoneId,
				taskHandling,
				reassignTo,
			});
			this.broadcastDataUpdated("milestones");
			return Response.json({
				success: true,
				message: this.formatMilestoneRemoveMessage(result),
			});
		} catch (error) {
			return this.milestoneMutationErrorResponse(error, "Error removing milestone");
		}
	}

	private async handleArchiveMilestone(milestoneId: string): Promise<Response> {
		try {
			const result = await this.core.archiveMilestone(milestoneId);
			if (!result.success) {
				return Response.json({ error: "Milestone not found" }, { status: 404 });
			}
			this.broadcastDataUpdated("milestones");
			return Response.json({ success: true, milestone: result.milestone ?? null });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to archive milestone";
			console.error("Error archiving milestone:", error);
			return Response.json({ error: message }, { status: 500 });
		}
	}

	private async handleGetVersion(): Promise<Response> {
		try {
			const version = await getVersion();
			return Response.json({ version });
		} catch (error) {
			console.error("Error getting version:", error);
			return Response.json({ error: "Failed to get version" }, { status: 500 });
		}
	}

	private async handleReorderTask(req: Request): Promise<Response> {
		try {
			const body = await req.json();
			const taskId = typeof body.taskId === "string" ? body.taskId : "";
			const targetStatus = typeof body.targetStatus === "string" ? body.targetStatus : "";
			const orderedTaskIds = Array.isArray(body.orderedTaskIds) ? body.orderedTaskIds : [];
			const targetMilestone =
				typeof body.targetMilestone === "string"
					? body.targetMilestone
					: body.targetMilestone === null
						? null
						: undefined;

			if (!taskId || !targetStatus || orderedTaskIds.length === 0) {
				return Response.json(
					{ error: "Missing required fields: taskId, targetStatus, and orderedTaskIds" },
					{ status: 400 },
				);
			}

			const { updatedTask, changedTasks } = await this.core.reorderTask({
				taskId,
				targetStatus,
				orderedTaskIds,
				targetMilestone,
				commitMessage: `Reorder tasks in ${targetStatus}`,
			});

			return Response.json({ success: true, task: updatedTask, changedTasks });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to reorder task";
			if (isAmbiguousTaskIdError(error)) {
				return Response.json({ error: message }, { status: 409 });
			}
			// Cross-branch and validation errors are client errors (400), not server errors (500)
			const isCrossBranchError = message.includes("exists in branch");
			const isValidationError = message.includes("not found") || message.includes("Missing required");
			const status = isCrossBranchError || isValidationError ? 400 : 500;
			if (status === 500) {
				console.error("Error reordering task:", error);
			}
			return Response.json({ error: message }, { status });
		}
	}

	private async handleMoveTasks(req: Request): Promise<Response> {
		try {
			const body = await req.json();
			const taskIds = Array.isArray(body.taskIds) ? body.taskIds.filter((id: unknown) => typeof id === "string") : [];
			const targetStatus = typeof body.targetStatus === "string" ? body.targetStatus : "";
			// Same shape as the reorder endpoint: a string names a lane, null is the no-milestone lane,
			// and an absent field leaves each task's milestone alone.
			const targetMilestone =
				typeof body.targetMilestone === "string"
					? body.targetMilestone
					: body.targetMilestone === null
						? null
						: undefined;

			if (taskIds.length === 0 || !targetStatus) {
				return Response.json({ error: "Missing required fields: taskIds and targetStatus" }, { status: 400 });
			}

			const { movedTasks, changedTasks, failures } = await this.core.moveTasksToStatus({
				taskIds,
				targetStatus,
				targetMilestone,
				commitMessage: `Move ${taskIds.length} tasks to ${targetStatus}`,
			});

			return Response.json({ success: failures.length === 0, tasks: movedTasks, changedTasks, failures });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to move tasks";
			const isValidationError = message.includes("required");
			if (!isValidationError) {
				console.error("Error moving tasks:", error);
			}
			return Response.json({ error: message }, { status: isValidationError ? 400 : 500 });
		}
	}

	private async handleGetDuplicateTasks(): Promise<Response> {
		try {
			await this.ensureServicesReady();
			return Response.json(await this.core.previewDuplicateTaskIdRepair());
		} catch (error) {
			return Response.json({ error: String(error) }, { status: 500 });
		}
	}

	private async handleRepairDuplicateTasks(req: Request): Promise<Response> {
		try {
			const body = (await req.json()) as { fingerprint?: unknown };
			const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint.trim() : "";
			if (!fingerprint) {
				return Response.json({ error: "A repair preview fingerprint is required." }, { status: 400 });
			}
			const result = await this.core.repairDuplicateTaskIds(fingerprint);
			return Response.json(result);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const status = message.includes("changed after the preview") ? 409 : 400;
			return Response.json({ error: message }, { status });
		}
	}

	private async handleCleanupPreview(req: Request): Promise<Response> {
		try {
			const url = new URL(req.url);
			const ageParam = url.searchParams.get("age");

			if (!ageParam) {
				return Response.json({ error: "Missing age parameter" }, { status: 400 });
			}

			const age = Number.parseInt(ageParam, 10);
			if (Number.isNaN(age) || age < 0) {
				return Response.json({ error: "Invalid age parameter" }, { status: 400 });
			}

			const tasksToCleanup = await this.core.getTerminalStatusTasksByAge(age);

			// Return preview of tasks to be cleaned up
			const preview = tasksToCleanup.map((task) => ({
				id: task.id,
				title: task.title,
				updatedDate: task.updatedDate,
				createdDate: task.createdDate,
			}));

			return Response.json({
				count: preview.length,
				tasks: preview,
			});
		} catch (error) {
			console.error("Error getting cleanup preview:", error);
			return Response.json({ error: "Failed to get cleanup preview" }, { status: 500 });
		}
	}

	private async handleCleanupExecute(req: Request): Promise<Response> {
		try {
			const { age } = await req.json();

			if (age === undefined || age === null) {
				return Response.json({ error: "Missing age parameter" }, { status: 400 });
			}

			const ageInDays = Number.parseInt(age, 10);
			if (Number.isNaN(ageInDays) || ageInDays < 0) {
				return Response.json({ error: "Invalid age parameter" }, { status: 400 });
			}

			const tasksToCleanup = await this.core.getTerminalStatusTasksByAge(ageInDays);

			if (tasksToCleanup.length === 0) {
				return Response.json({
					success: true,
					movedCount: 0,
					message: "No tasks to clean up",
				});
			}

			// Move tasks to completed folder
			let successCount = 0;
			const failedTasks: string[] = [];

			for (const task of tasksToCleanup) {
				try {
					const success = await this.core.completeTask(task.id);
					if (success) {
						successCount++;
					} else {
						failedTasks.push(task.id);
					}
				} catch (error) {
					console.error(`Failed to complete task ${task.id}:`, error);
					failedTasks.push(task.id);
				}
			}

			// Notify listeners to refresh
			this.broadcastDataUpdated();

			return Response.json({
				success: true,
				movedCount: successCount,
				totalCount: tasksToCleanup.length,
				failedTasks: failedTasks.length > 0 ? failedTasks : undefined,
				message: `Moved ${successCount} of ${tasksToCleanup.length} tasks to completed folder`,
			});
		} catch (error) {
			console.error("Error executing cleanup:", error);
			return Response.json({ error: "Failed to execute cleanup" }, { status: 500 });
		}
	}

	private async handleGetStatistics(): Promise<Response> {
		try {
			const servicesWereReady = this.servicesInitialized;
			const store = await this.getContentStoreInstance();
			const currentConfig = await this.core.filesystem.loadConfig();
			await store.ensureConfigWatcher();
			if (servicesWereReady) await this.core.refreshTasksForTaskRead();
			const corpus = store.getTaskCorpusSnapshot();
			const corpusConfig = corpus.config ?? currentConfig;
			const tasks = corpus.identityIndex?.getTasks(true) ?? [...corpus.activeTasks, ...corpus.completedTasks];
			const drafts = await this.core.filesystem.listDrafts();
			const statuses = (corpusConfig?.statuses || DEFAULT_STATUSES) as string[];
			const priorities = currentConfig?.priorities ?? corpusConfig?.priorities ?? [];

			// Calculate statistics using the exact same function as CLI
			const statistics = getTaskStatistics(tasks, drafts, statuses, priorities);

			// Convert Maps to objects for JSON serialization
			const response = {
				...statistics,
				statusCounts: Object.fromEntries(statistics.statusCounts),
				priorityCounts: Object.fromEntries(statistics.priorityCounts),
			};

			return Response.json(response);
		} catch (error) {
			console.error("Error getting statistics:", error);
			return Response.json({ error: "Failed to get statistics" }, { status: 500 });
		}
	}

	private async handleGetStatus(): Promise<Response> {
		try {
			const config = await this.core.filesystem.loadConfig();
			const backlogResolution = this.core.filesystem.resolveBacklogDirectoryInfo();
			return Response.json({
				initialized: !!config,
				projectPath: this.core.filesystem.rootDir,
				backlogDirectory: backlogResolution.backlogDir,
				backlogDirectorySource: backlogResolution.source,
				configLocation: backlogResolution.configSource,
				rootConfigPath: backlogResolution.rootConfigPath,
			});
		} catch (error) {
			console.error("Error getting status:", error);
			return Response.json({
				initialized: false,
				projectPath: this.core.filesystem.rootDir,
				backlogDirectory: null,
				backlogDirectorySource: null,
				configLocation: null,
				rootConfigPath: null,
			});
		}
	}

	private async handleInit(req: Request): Promise<Response> {
		try {
			const parsed = parseInitInput(await req.json());
			if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
			const body = parsed.value;
			const projectName = body.projectName;
			const backlogDirectory = typeof body.backlogDirectory === "string" ? body.backlogDirectory.trim() : undefined;
			const backlogDirectorySource =
				body.backlogDirectorySource === "backlog" ||
				body.backlogDirectorySource === ".backlog" ||
				body.backlogDirectorySource === "custom"
					? body.backlogDirectorySource
					: undefined;
			const configLocation =
				body.configLocation === "folder" || body.configLocation === "root" ? body.configLocation : undefined;
			const integrationMode = body.integrationMode as "mcp" | "cli" | "none" | undefined;
			const mcpClients = Array.isArray(body.mcpClients) ? body.mcpClients : [];
			const agentInstructions = Array.isArray(body.agentInstructions) ? body.agentInstructions : [];
			const installClaudeAgentFlag = parseOptionalBoolean(body.installClaudeAgent) ?? false;
			const filesystemOnly = parseOptionalBoolean(body.filesystemOnly) ?? false;
			const advancedConfig = body.advancedConfig || {};

			// Check if already initialized (for browser, we don't allow re-init)
			const existingConfig = await this.core.filesystem.loadConfig();
			if (existingConfig) {
				return Response.json({ error: "Project is already initialized" }, { status: 400 });
			}

			// Call shared core init function
			const result = await initializeProject(this.core, {
				projectName,
				backlogDirectory,
				backlogDirectorySource,
				configLocation,
				integrationMode: integrationMode || "none",
				mcpClients,
				agentInstructions,
				installClaudeAgent: installClaudeAgentFlag,
				filesystemOnly,
				advancedConfig,
				existingConfig: null,
			});

			// Update server's project name
			this.projectName = result.projectName;

			// Ensure config watcher is set up now that config file exists
			if (this.contentStore) {
				await this.contentStore.ensureConfigWatcher();
			}

			return Response.json({
				success: result.success,
				projectName: result.projectName,
				mcpResults: result.mcpResults,
			});
		} catch (error) {
			console.error("Error initializing project:", error);
			const message = error instanceof Error ? error.message : "Failed to initialize project";
			return Response.json({ error: message }, { status: 500 });
		}
	}
}
