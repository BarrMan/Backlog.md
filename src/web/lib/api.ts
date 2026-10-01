import type { DuplicateRepairPlan, DuplicateRepairResult } from "../../core/duplicate-task-repair.ts";
import type { TaskStatistics } from "../../core/statistics.ts";
import type { TaskDetail } from "../../core/task-detail.ts";
import { API_ROUTES, HTTP_HEADER, HTTP_METHOD, MEDIA_TYPE, PROJECT_SCOPE_HEADER } from "../../server/api-routes.ts";
import type {
	BacklogConfig,
	Decision,
	Document,
	Milestone,
	SearchPriorityFilter,
	SearchResult,
	SearchResultType,
	Task,
	TaskSummary,
} from "../../types/index.ts";
import type { BacklogConfigSource, BacklogDirectorySource } from "../../utils/backlog-directory.ts";
import { setTaskDetailCacheCapacity, TaskDetailCache } from "./task-detail-cache";

export interface ReorderTaskPayload {
	taskId: string;
	targetStatus: string;
	orderedTaskIds: string[];
	targetMilestone?: string | null;
}

export interface MoveTasksPayload {
	taskIds: string[];
	targetStatus: string;
	targetMilestone?: string | null;
}

export interface MoveTasksResult {
	success: boolean;
	tasks: Task[];
	changedTasks: Task[];
	failures: Array<{ taskId: string; reason: string }>;
}

/**
 * Read the marker the server forwards when a mutation failed after the record had already moved.
 * The view converges on what happened instead of offering a retry of a move that already ran.
 */
function readMovedFailureData(error: unknown): Record<string, unknown> | null {
	if (
		!(error instanceof ApiError) ||
		error.status === undefined ||
		error.status < 500 ||
		typeof error.data !== "object" ||
		error.data === null
	) {
		return null;
	}
	return error.data as Record<string, unknown>;
}

export function readMovedFailureState(
	error: unknown,
	key: "archiveState" | "demotionState",
): "moved" | "partial" | null {
	const state = readMovedFailureData(error)?.[key];
	return state === "moved" || state === "partial" ? state : null;
}

export function readDemotionFailureCause(error: unknown): "cleanup" | "commit" | null {
	const cause = readMovedFailureData(error)?.demotionFailureCause;
	return cause === "cleanup" || cause === "commit" ? cause : null;
}

/** Archiving and demoting vacate a task ID: `cleanedTaskIds` names the records that lost a reference to it. */
export interface TaskVacancyResponse {
	success: boolean;
	cleanedTaskIds: string[];
}

export type TaskUpdateRequest = Omit<Partial<Task>, "milestone" | "dueDate" | "project"> & {
	milestone?: string | null;
	dueDate?: string | null;
	project?: string | null;
	commentsAppend?: string[];
	commentAuthor?: string;
};

export interface InitializationStatus {
	initialized: boolean;
	projectScope?: string;
	projectPath: string;
	backlogDirectory?: string | null;
	backlogDirectorySource?: BacklogDirectorySource | null;
	configLocation?: BacklogConfigSource | null;
	rootConfigPath?: string | null;
}

// Enhanced error types for better error handling
export class ApiError extends Error {
	constructor(
		message: string,
		public status?: number,
		public code?: string,
		public data?: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}

	static fromResponse(response: Response, data?: unknown): ApiError {
		const errorMessage =
			typeof data === "object" && data !== null && "error" in data ? (data as { error?: unknown }).error : undefined;
		const message =
			typeof errorMessage === "string" && errorMessage.trim().length > 0
				? errorMessage
				: `HTTP ${response.status}: ${response.statusText}`;
		const code =
			typeof data === "object" && data !== null && "code" in data ? (data as { code?: unknown }).code : undefined;
		return new ApiError(message, response.status, typeof code === "string" ? code : response.statusText, data);
	}
}

export class NetworkError extends Error {
	constructor(message = "Network request failed") {
		super(message);
		this.name = "NetworkError";
	}
}

/** Builds an ApiError that keeps the server's message when the response body carries one. */
async function toApiError(response: Response, fallbackMessage: string): Promise<ApiError> {
	const data = await response.json().catch(() => undefined);
	const serverMessage = typeof data === "object" && data !== null ? (data as { error?: unknown }).error : undefined;
	const message =
		typeof serverMessage === "string" && serverMessage.trim().length > 0 ? serverMessage : fallbackMessage;
	return new ApiError(message, response.status, response.statusText, data);
}

/** The document and decision endpoints answer 409 only when an ID matches more than one file. */
export function isAmbiguousIdConflict(error: unknown): error is ApiError {
	return error instanceof ApiError && error.status === 409;
}

// Request configuration interface
interface RequestConfig {
	retries?: number;
	timeout?: number;
	Headers?: Record<string, string>;
}

// Default configuration
const DEFAULT_CONFIG: RequestConfig = {
	retries: 3,
	timeout: 10000,
};

type SearchOptions = {
	query?: string;
	types?: SearchResultType[];
	status?: string | string[];
	excludeStatus?: string | string[];
	priority?: SearchPriorityFilter | SearchPriorityFilter[];
	assignee?: string | string[];
	labels?: string[];
	modifiedFiles?: string[];
	limit?: number;
};

const appendQueryValues = (params: URLSearchParams, key: string, values?: string | string[]): void => {
	if (!values) return;
	for (const value of Array.isArray(values) ? values : [values]) {
		if (value.trim()) params.append(key, value.trim());
	}
};

const buildSearchParams = (options: SearchOptions): URLSearchParams => {
	const params = new URLSearchParams();
	if (options.query) params.set("query", options.query);
	appendQueryValues(params, "type", options.types);
	appendQueryValues(params, "status", options.status);
	appendQueryValues(params, "excludeStatus", options.excludeStatus);
	appendQueryValues(params, "priority", options.priority);
	appendQueryValues(params, "assignee", options.assignee);
	appendQueryValues(params, "label", options.labels);
	appendQueryValues(params, "modifiedFile", options.modifiedFiles);
	if (options.limit !== undefined) params.set("limit", String(options.limit));
	return params;
};

export class ApiClient {
	private config: RequestConfig;
	private projectScope: string | null = null;
	private scopeBootstrap: Promise<InitializationStatus & { projectScope: string }> | null = null;

	constructor(config: RequestConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	// Enhanced fetch with retry logic and better error handling
	private async fetchWithRetry(url: string, options: RequestInit = {}, retriesOverride?: number): Promise<Response> {
		const scope = await this.getProjectScope();
		const { retries: configuredRetries = 3, timeout = 10000 } = this.config;
		const retries =
			retriesOverride ??
			(options.method === undefined || options.method === HTTP_METHOD.GET || options.method === HTTP_METHOD.HEAD
				? configuredRetries
				: 0);
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				return await this.fetchAttempt(url, options, timeout, scope);
			} catch (error) {
				lastError = error as Error;

				// Don't retry on client errors (4xx) or specific cases
				if (error instanceof ApiError && error.status && error.status >= 400 && error.status < 500) {
					throw error;
				}

				// For network errors or server errors, retry with exponential backoff
				if (attempt < retries) {
					const delay = Math.min(1000 * 2 ** attempt, 10000);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		// If we get here, all retries failed
		if (lastError instanceof ApiError) {
			throw lastError;
		}
		throw new NetworkError(`Request failed after ${retries + 1} attempts: ${lastError?.message}`);
	}

	private async fetchAttempt(url: string, options: RequestInit, timeout: number, scope: string): Promise<Response> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);
		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
				headers: { [HTTP_HEADER.CONTENT_TYPE]: MEDIA_TYPE.JSON, [PROJECT_SCOPE_HEADER]: scope, ...options.headers },
			});
			if (response.ok) return response;
			const errorData = await response.json().catch(() => null);
			throw ApiError.fromResponse(response, errorData);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private async fetchWithoutRetry(url: string, options: RequestInit = {}): Promise<Response> {
		return await this.fetchWithRetry(url, options, 0);
	}

	// Helper method for JSON responses
	private async fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
		const response = await this.fetchWithRetry(url, options);
		return response.json();
	}

	private async fetchStatus(): Promise<InitializationStatus & { projectScope: string }> {
		const response = await fetch(API_ROUTES.STATUS, { headers: { [HTTP_HEADER.CONTENT_TYPE]: MEDIA_TYPE.JSON } });
		if (!response.ok) throw await toApiError(response, "Failed to check initialization status");
		const status = (await response.json()) as InitializationStatus;
		if (!status.projectScope) throw new ApiError("Server did not provide a project scope");
		if (this.projectScope && this.projectScope !== status.projectScope)
			throw new ApiError("Server project scope changed", 409, "PROJECT_SCOPE_MISMATCH");
		this.projectScope = status.projectScope;
		return status as InitializationStatus & { projectScope: string };
	}

	async getProjectScope(): Promise<string> {
		if (this.projectScope) return this.projectScope;
		this.scopeBootstrap ??= this.fetchStatus().finally(() => {
			this.scopeBootstrap = null;
		});
		return (await this.scopeBootstrap).projectScope;
	}

	private adoptExplicitProjectScope(scope: string) {
		if (!scope) throw new ApiError("Successful project update did not provide a project scope");
		this.projectScope = scope;
		this.scopeBootstrap = null;
		this.detailCache.invalidate();
		if (typeof window !== "undefined") window.dispatchEvent(new window.Event("project-scope-changed"));
	}

	private appendNonBlankQueryValues(params: URLSearchParams, key: string, values?: string | string[]): void {
		appendQueryValues(params, key, values);
	}
	async fetchTasks(options?: {
		status?: string;
		excludeStatus?: string | string[];
		assignee?: string;
		parent?: string;
		priority?: SearchPriorityFilter;
		labels?: string[];
		crossBranch?: boolean;
	}): Promise<TaskSummary[]> {
		const params = new URLSearchParams();
		if (options?.status) params.append("status", options.status);
		this.appendNonBlankQueryValues(params, "excludeStatus", options?.excludeStatus);
		if (options?.assignee) params.append("assignee", options.assignee);
		if (options?.parent) params.append("parent", options.parent);
		if (options?.priority) params.append("priority", options.priority);
		this.appendNonBlankQueryValues(params, "label", options?.labels);
		// Default to true for cross-branch loading to match TUI behavior
		if (options?.crossBranch !== false) params.append("crossBranch", "true");

		const url = `${API_ROUTES.TASKS}${params.toString() ? `?${params.toString()}` : ""}`;
		return this.fetchJson<TaskSummary[]>(url);
	}

	detailCache = new TaskDetailCache((id) => this.fetchTask(id));

	async loadTaskDetail(id: string): Promise<TaskDetail> {
		return this.detailCache.loadDetail(await this.getProjectScope(), id);
	}

	async fetchDrafts(): Promise<Task[]> {
		return this.fetchJson<Task[]>(API_ROUTES.DRAFTS);
	}

	async promoteDraft(id: string): Promise<void> {
		await this.fetchWithRetry(API_ROUTES.DRAFT_PROMOTE(encodeURIComponent(id)), { method: HTTP_METHOD.POST });
	}

	setTaskDetailCacheCapacity(capacity: number) {
		this.detailCache.setCapacity(setTaskDetailCacheCapacity(capacity));
	}

	async search(options: SearchOptions = {}): Promise<SearchResult[]> {
		const params = buildSearchParams(options);
		const url = `${API_ROUTES.SEARCH}${params.toString() ? `?${params.toString()}` : ""}`;
		return this.fetchJson<SearchResult[]>(url);
	}

	/** Reads one task through the detail path, so the response already carries its dependency graph. */
	async fetchTask(id: string): Promise<TaskDetail> {
		return this.fetchJson<TaskDetail>(API_ROUTES.LEGACY_TASK(encodeURIComponent(id)));
	}

	async createTask(task: Omit<Task, "id" | "createdDate">): Promise<Task> {
		const created = await this.fetchJson<Task>(API_ROUTES.TASKS, {
			method: HTTP_METHOD.POST,
			body: JSON.stringify(task),
		});
		this.detailCache.invalidate();
		return created;
	}

	async updateTask(id: string, updates: TaskUpdateRequest): Promise<Task> {
		const updated = await this.fetchJson<Task>(API_ROUTES.TASK(id), {
			method: HTTP_METHOD.PUT,
			body: JSON.stringify(updates),
		});
		this.detailCache.invalidate();
		return updated;
	}

	async reorderTask(payload: ReorderTaskPayload): Promise<{ success: boolean; task: Task; changedTasks: Task[] }> {
		const result = await this.fetchJson<{ success: boolean; task: Task; changedTasks: Task[] }>(
			API_ROUTES.TASK_REORDER,
			{
				method: HTTP_METHOD.POST,
				body: JSON.stringify(payload),
			},
		);
		this.detailCache.invalidate();
		return result;
	}

	async moveTasks(payload: MoveTasksPayload): Promise<MoveTasksResult> {
		const result = await this.fetchJson<MoveTasksResult>(API_ROUTES.TASK_MOVE, {
			method: HTTP_METHOD.POST,
			body: JSON.stringify(payload),
		});
		this.detailCache.invalidate();
		return result;
	}

	// Not retried, for the same reason demote is not: the second attempt would target a task the
	// first attempt already archived, and its "not found" would replace the real outcome.
	async archiveTask(id: string): Promise<TaskVacancyResponse> {
		const response = await this.fetchWithoutRetry(API_ROUTES.TASK(id), {
			method: HTTP_METHOD.DELETE,
		});
		const result = await response.json();
		this.detailCache.invalidate();
		return result;
	}

	async completeTask(id: string): Promise<void> {
		await this.fetchWithRetry(API_ROUTES.TASK_COMPLETE(id), {
			method: HTTP_METHOD.POST,
		});
		this.detailCache.invalidate();
	}

	async demoteTask(id: string): Promise<TaskVacancyResponse> {
		const response = await this.fetchWithoutRetry(API_ROUTES.TASK_DEMOTE(encodeURIComponent(id)), {
			method: HTTP_METHOD.POST,
		});
		const result = await response.json();
		this.detailCache.invalidate();
		return result;
	}

	async getCleanupPreview(age: number): Promise<{
		count: number;
		tasks: Array<{ id: string; title: string; updatedDate?: string; createdDate: string }>;
	}> {
		return this.fetchJson<{
			count: number;
			tasks: Array<{ id: string; title: string; updatedDate?: string; createdDate: string }>;
		}>(`${API_ROUTES.TASK_CLEANUP}?age=${age}`);
	}

	async executeCleanup(
		age: number,
	): Promise<{ success: boolean; movedCount: number; totalCount: number; message: string; failedTasks?: string[] }> {
		return this.fetchJson<{
			success: boolean;
			movedCount: number;
			totalCount: number;
			message: string;
			failedTasks?: string[];
		}>(API_ROUTES.TASK_CLEANUP_EXECUTE, {
			method: HTTP_METHOD.POST,
			body: JSON.stringify({ age }),
		});
	}

	async fetchDuplicateTaskRepairPlan(): Promise<DuplicateRepairPlan> {
		return await this.fetchJson<DuplicateRepairPlan>(API_ROUTES.TASK_DUPLICATES);
	}

	async repairDuplicateTaskIds(fingerprint: string): Promise<DuplicateRepairResult> {
		return await this.fetchJson<DuplicateRepairResult>(API_ROUTES.TASK_DUPLICATES, {
			method: HTTP_METHOD.POST,
			body: JSON.stringify({ fingerprint }),
		});
	}

	async fetchStatuses(): Promise<string[]> {
		const response = await this.fetchWithRetry(API_ROUTES.STATUSES);
		return response.json();
	}

	async fetchConfig(): Promise<BacklogConfig> {
		const response = await this.fetchWithRetry(API_ROUTES.CONFIG);
		return response.json();
	}

	async updateConfig(config: BacklogConfig): Promise<BacklogConfig> {
		const response = await this.fetchWithRetry(API_ROUTES.CONFIG, {
			method: HTTP_METHOD.PUT,
			headers: {
				[HTTP_HEADER.CONTENT_TYPE]: MEDIA_TYPE.JSON,
			},
			body: JSON.stringify(config),
		});
		const updated = await response.json();
		this.adoptExplicitProjectScope(response.headers.get(PROJECT_SCOPE_HEADER) ?? "");
		return updated;
	}

	async fetchDoc(filename: string): Promise<Document> {
		const response = await this.fetchWithRetry(API_ROUTES.DOC(encodeURIComponent(filename)));
		return response.json();
	}

	async updateDoc(filename: string, content: string, title?: string, path?: string | null): Promise<Document> {
		const payload: Record<string, unknown> = { content };
		if (typeof title === "string") {
			payload.title = title;
		}
		if (path !== undefined) {
			payload.path = path;
		}

		const response = await this.fetchWithRetry(API_ROUTES.DOC(encodeURIComponent(filename)), {
			method: HTTP_METHOD.PUT,
			headers: {
				[HTTP_HEADER.CONTENT_TYPE]: MEDIA_TYPE.JSON,
			},
			body: JSON.stringify(payload),
		});
		return response.json();
	}

	async createDoc(filename: string, content: string, path?: string): Promise<Document & { success?: boolean }> {
		const response = await this.fetchWithRetry(API_ROUTES.DOCS, {
			method: HTTP_METHOD.POST,
			headers: {
				[HTTP_HEADER.CONTENT_TYPE]: MEDIA_TYPE.JSON,
			},
			body: JSON.stringify({ filename, content, path }),
		});
		return response.json();
	}

	async fetchDecision(id: string): Promise<Decision> {
		const response = await this.fetchWithRetry(API_ROUTES.DECISION(encodeURIComponent(id)));
		return response.json();
	}

	async updateDecision(
		id: string,
		decision: Pick<Decision, "title" | "context" | "decision" | "consequences" | "alternatives">,
	): Promise<void> {
		await this.fetchWithRetry(API_ROUTES.DECISION(encodeURIComponent(id)), {
			method: HTTP_METHOD.PUT,
			headers: {
				[HTTP_HEADER.CONTENT_TYPE]: MEDIA_TYPE.JSON,
			},
			body: JSON.stringify(decision),
		});
	}

	async createDecision(title: string): Promise<Decision> {
		const response = await this.fetchWithRetry(API_ROUTES.DECISIONS, {
			method: HTTP_METHOD.POST,
			headers: {
				[HTTP_HEADER.CONTENT_TYPE]: MEDIA_TYPE.JSON,
			},
			body: JSON.stringify({ title }),
		});
		return response.json();
	}

	async fetchMilestones(): Promise<Milestone[]> {
		const response = await this.fetchWithRetry(API_ROUTES.MILESTONES);
		return response.json();
	}

	async fetchArchivedMilestones(): Promise<Milestone[]> {
		const response = await this.fetchWithRetry(API_ROUTES.ARCHIVED_MILESTONES);
		return response.json();
	}

	async createMilestone(title: string, description?: string, dueDate?: string): Promise<Milestone> {
		const response = await this.fetchWithRetry(API_ROUTES.MILESTONES, {
			method: HTTP_METHOD.POST,
			headers: {
				[HTTP_HEADER.CONTENT_TYPE]: MEDIA_TYPE.JSON,
			},
			body: JSON.stringify({ title, description, dueDate }),
		});
		return response.json();
	}

	async updateMilestone(
		id: string,
		title: string,
		dueDate?: string | null,
	): Promise<{ success: boolean; milestone?: Milestone | null; message?: string }> {
		const response = await this.fetchWithRetry(API_ROUTES.MILESTONE(encodeURIComponent(id)), {
			method: HTTP_METHOD.PUT,
			headers: {
				[HTTP_HEADER.CONTENT_TYPE]: MEDIA_TYPE.JSON,
			},
			body: JSON.stringify({ title, dueDate }),
		});
		return response.json();
	}

	async removeMilestone(
		id: string,
		options: { taskHandling?: "clear" | "keep" | "reassign"; reassignTo?: string } = {},
	): Promise<{ success: boolean; message?: string }> {
		const response = await this.fetchWithRetry(API_ROUTES.MILESTONE(encodeURIComponent(id)), {
			method: HTTP_METHOD.DELETE,
			headers: {
				[HTTP_HEADER.CONTENT_TYPE]: MEDIA_TYPE.JSON,
			},
			body: JSON.stringify(options),
		});
		return response.json();
	}

	async archiveMilestone(id: string): Promise<{ success: boolean; milestone?: Milestone | null }> {
		const response = await this.fetchWithRetry(API_ROUTES.MILESTONE_ARCHIVE(encodeURIComponent(id)), {
			method: HTTP_METHOD.POST,
		});
		return response.json();
	}

	async fetchStatistics(): Promise<
		TaskStatistics & { statusCounts: Record<string, number>; priorityCounts: Record<string, number> }
	> {
		return this.fetchJson<
			TaskStatistics & { statusCounts: Record<string, number>; priorityCounts: Record<string, number> }
		>(API_ROUTES.STATISTICS);
	}

	async checkStatus(): Promise<InitializationStatus> {
		if (this.scopeBootstrap) return this.scopeBootstrap;
		return this.fetchStatus();
	}

	async initializeProject(options: {
		projectName: string;
		backlogDirectory?: string;
		backlogDirectorySource?: BacklogDirectorySource;
		configLocation?: BacklogConfigSource;
		integrationMode: "mcp" | "cli" | "none";
		mcpClients?: ("claude" | "codex" | "gemini" | "kiro" | "guide")[];
		agentInstructions?: ("CLAUDE.md" | "AGENTS.md" | "GEMINI.md" | ".github/copilot-instructions.md")[];
		installClaudeAgent?: boolean;
		filesystemOnly?: boolean;
		advancedConfig?: {
			checkActiveBranches?: boolean;
			remoteOperations?: boolean;
			activeBranchDays?: number;
			bypassGitHooks?: boolean;
			autoCommit?: boolean;
			zeroPaddedIds?: number;
			taskPrefix?: string;
			defaultEditor?: string;
			defaultPort?: number;
			autoOpenBrowser?: boolean;
		};
	}): Promise<{ success: boolean; projectName: string; mcpResults?: Record<string, string>; projectScope: string }> {
		const result = await this.fetchJson<{
			success: boolean;
			projectName: string;
			mcpResults?: Record<string, string>;
			projectScope: string;
		}>(API_ROUTES.INIT, {
			method: HTTP_METHOD.POST,
			body: JSON.stringify(options),
		});
		if (!result.success) throw new ApiError("Initialization failed");
		this.adoptExplicitProjectScope(result.projectScope);
		return result;
	}
}

export const apiClient = new ApiClient();
