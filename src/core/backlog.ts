import { stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import {
	DEFAULT_DIRECTORIES,
	DEFAULT_INIT_CONFIG,
	DEFAULT_RUNTIME_TASK_RESOLUTION_STRATEGY,
	DEFAULT_STATUSES,
	FALLBACK_STATUS,
} from "../constants/index.ts";
import { type DraftFileReference, FileSystem, isConfigValueError } from "../file-system/operations.ts";
import { type GitBranchTip, GitOperations } from "../git/operations.ts";
import { assertValidChecklistMarks } from "../markdown/structured-sections.ts";
import {
	type AcceptanceCriterion,
	type BacklogConfig,
	type Decision,
	type Document,
	type DocumentCreateInput,
	type DocumentUpdateInput,
	EntityType,
	type Milestone,
	type Task,
	type TaskCreateInput,
	type TaskUpdateInput,
} from "../types/index.ts";
import { normalizeAssignee } from "../utils/assignee.ts";
import { formatStoredDate } from "../utils/date.ts";
import { decisionIdKey } from "../utils/decision-id.ts";
import { documentIdKey } from "../utils/document-id.ts";
import { getDocumentSubPathFromRelativePath } from "../utils/document-path.ts";
import {
	type ContentIdentityReport,
	type DraftIdentityFindings,
	detectContentIdentityIssues,
} from "../utils/duplicate-detection.ts";
import { findBacklogRoot } from "../utils/find-backlog-root.ts";
import { buildGlobPattern, buildIdRegex, normalizeId } from "../utils/prefix-config.ts";
import { resolveRuntimeCwd } from "../utils/runtime-cwd.ts";
import {
	AmbiguousTaskIdError,
	canonicalTaskId,
	getTaskPath,
	LOCAL_TASK_LOOKUP_HINT,
	normalizeTaskId,
} from "../utils/task-path.ts";
import { sortByOrdinal } from "../utils/task-sorting.ts";
import { ensureConfigMigrated, readLegacyConfigContent } from "./config-migration-workflow.ts";
import { ContentStore, type TaskCorpusSnapshot } from "./content-store.ts";
import {
	applyDuplicateTaskIdRepair,
	type DuplicateRepairPlan,
	type DuplicateRepairResult,
	previewDuplicateTaskIdRepair,
} from "./duplicate-task-repair.ts";
import { planOrderedTaskPlacement } from "./ordered-task-move-planner.ts";
import { migrateDraftPrefixes } from "./prefix-migration.ts";
import { ProjectContentService } from "./project-content-service.ts";
import { DEFAULT_ORDINAL_STEP, resolveOrdinalConflicts } from "./reorder.ts";
import { SearchService } from "./search-service.ts";
import {
	type CreatedTaskRollbackResult,
	type CreatedTaskWrite,
	rollbackCreatedTask,
} from "./task-creation-transaction.ts";
import { TaskCreationService } from "./task-creation-workflow.ts";
import { completedTaskIdentityRecord, TaskIdentityIndex, type TaskIdentityRecord } from "./task-identity-index.ts";
import { TaskLifecycleService } from "./task-lifecycle-service.ts";
import {
	BranchTaskLoader,
	type BranchTaskStateEntry,
	getBranchHistoryCutoff,
	getTaskLoadingMessage,
} from "./task-loader.ts";
import { ProjectTaskMutations } from "./task-mutation-service.ts";
import { type TaskQueryOptions, type TaskReadOptions, TaskReadSession } from "./task-query-workflow.ts";
import { planTaskReorder } from "./task-reorder-plan.ts";
import { type BlessedScreen, editTaskInTuiSession, type TuiTaskEditResult } from "./tui-task-edit-session.ts";
import { VacatedTaskReferenceService } from "./vacated-task-reference-service.ts";

interface MoveTasksPlan {
	readonly movedTasks: Task[];
	readonly changedTasks: Task[];
	readonly failures: Array<{ taskId: string; reason: string }>;
}

interface MoveTaskPlacement {
	readonly movedTasks: Task[];
	readonly changedTasks: Task[];
}

const REMOTE_REF_REFRESH_INTERVAL_MS = 60_000;

interface TaskCorpusLoadOptions {
	progressCallback?: (msg: string) => void;
	abortSignal?: AbortSignal;
	includeCompleted?: boolean;
	visibleCompleted?: boolean;
	/** Set only by the ContentStore corpus loader, whose result becomes the shared cross-branch state. */
	publishSharedState?: boolean;
	/** Set by task ID allocation, which cannot trust the coalesced remote-refresh window. */
	forceRemoteRefresh?: boolean;
}

export type { TaskReadOptions } from "./task-query-workflow.ts";

class ProjectSessionDisposed extends Error {}

interface ActiveBranchSnapshot {
	branchTips: readonly GitBranchTip[];
	currentBranch: string;
	fingerprint: string;
	stabilityFingerprint: string;
	settingsKey: string;
}

/** Owns all state invalidated when Core is pointed at another project root. */
export class ProjectSession {
	public readonly fs: FileSystem;
	public readonly git: GitOperations;
	public readonly branchTaskLoader: BranchTaskLoader;
	public contentStore: ContentStore | undefined;
	public searchService: SearchService | undefined;
	public activeBranchFingerprint: string | null = null;
	public activeBranchSnapshotPromise: {
		generation: number;
		settingsKey: string;
		promise: Promise<ActiveBranchSnapshot>;
	} | null = null;
	public activeBranchRefreshPromise: Promise<void> | null = null;
	public remoteRefRefreshPromise: Promise<void> | null = null;
	public lastRemoteRefRefreshAt = 0;
	private disposed = false;

	constructor(
		projectRoot: string,
		public readonly generation: number,
		private readonly enableWatchers: boolean,
		private readonly loadContentStoreCorpus: (
			progressCallback?: (message: string) => void,
			options?: { publish?: boolean },
		) => Promise<TaskCorpusSnapshot>,
		private readonly loadOccupiedTaskIdsForAllocation: () => Promise<string[]>,
	) {
		this.fs = new FileSystem(projectRoot);
		this.git = new GitOperations(projectRoot, null, () => this.fs.loadConfig());
		this.branchTaskLoader = new BranchTaskLoader(this.git);
	}

	dispose(): void {
		this.disposed = true;
		this.searchService?.dispose();
		this.searchService = undefined;
		this.disposeContentStore();
	}

	disposeContentStore(): void {
		this.contentStore?.dispose();
		this.contentStore = undefined;
		this.activeBranchFingerprint = null;
		this.activeBranchSnapshotPromise = null;
		this.activeBranchRefreshPromise = null;
		this.remoteRefRefreshPromise = null;
		this.lastRemoteRefRefreshAt = 0;
	}

	/** A read belongs to this session only while it has not been disposed or repointed. */
	isCurrent(generation: number, filesystem: FileSystem, backlogRoot: string): boolean {
		return (
			!this.disposed &&
			generation === this.generation &&
			filesystem === this.fs &&
			backlogRoot === filesystem.backlogDir
		);
	}

	isActiveContentStore(store: ContentStore): boolean {
		return store === this.contentStore;
	}

	async getContentStore(progressCallback?: (message: string) => void): Promise<ContentStore> {
		while (true) {
			if (this.disposed) throw new ProjectSessionDisposed();
			const { generation, fs: filesystem } = this;
			const backlogRoot = filesystem.backlogDir;
			let store = this.contentStore;
			if (!store) {
				store = new ContentStore(filesystem, this.loadContentStoreCorpus, this.enableWatchers);
				this.contentStore = store;
			}
			try {
				await store.ensureInitialized(progressCallback);
			} catch (error) {
				if (!this.isCurrent(generation, filesystem, backlogRoot) || store !== this.contentStore) continue;
				throw error;
			}
			if (this.isCurrent(generation, filesystem, backlogRoot) && store === this.contentStore) return store;
			if (this.disposed) throw new ProjectSessionDisposed();
		}
	}

	async getSearchService(): Promise<SearchService> {
		while (true) {
			if (this.disposed) throw new ProjectSessionDisposed();
			const { generation, fs: filesystem } = this;
			const backlogRoot = filesystem.backlogDir;
			const store = await this.getContentStore();
			if (!this.isCurrent(generation, filesystem, backlogRoot) || store !== this.contentStore) continue;
			let searchService = this.searchService;
			if (!searchService) {
				searchService = new SearchService(store);
				this.searchService = searchService;
			}
			try {
				await searchService.ensureInitialized();
			} catch (error) {
				if (
					!this.isCurrent(generation, filesystem, backlogRoot) ||
					store !== this.contentStore ||
					searchService !== this.searchService
				)
					continue;
				throw error;
			}
			if (
				this.isCurrent(generation, filesystem, backlogRoot) &&
				store === this.contentStore &&
				searchService === this.searchService
			) {
				return searchService;
			}
		}
	}

	async refreshCachedTasksForCrossBranchRead(includeCrossBranch: boolean, storeAlreadyExisted: boolean): Promise<void> {
		if (!storeAlreadyExisted || !this.enableWatchers || !includeCrossBranch || !this.contentStore) return;
		await this.refreshTasksForTaskRead();
	}

	async getOccupiedTaskIdsForAllocation(): Promise<string[]> {
		if (this.disposed) throw new ProjectSessionDisposed();
		const ids = await this.loadOccupiedTaskIdsForAllocation();
		if (this.disposed) throw new ProjectSessionDisposed();
		return ids;
	}

	getActiveBranchSettings(config: BacklogConfig | null) {
		const activeBranchDays = config?.activeBranchDays ?? DEFAULT_INIT_CONFIG.activeBranchDays;
		const checkActiveBranches = config?.checkActiveBranches !== false;
		const filesystemOnly = config?.filesystemOnly === true;
		return {
			checkActiveBranches,
			activeBranchDays,
			branchHistoryCutoff:
				checkActiveBranches && !filesystemOnly ? (getBranchHistoryCutoff(activeBranchDays)?.getTime() ?? null) : null,
			remoteOperations: config?.remoteOperations !== false,
			filesystemOnly,
			taskPrefix: config?.prefixes?.task ?? "task",
			taskResolutionStrategy: config?.taskResolutionStrategy ?? DEFAULT_RUNTIME_TASK_RESOLUTION_STRATEGY,
			statuses: config?.statuses ?? DEFAULT_STATUSES,
			backlogDir: this.fs.backlogDirName,
		};
	}

	async computeActiveBranchSnapshot(config: BacklogConfig | null): Promise<ActiveBranchSnapshot> {
		const settings = this.getActiveBranchSettings(config);
		const settingsKey = JSON.stringify(settings);
		this.git.setConfig(config);
		if (!settings.checkActiveBranches || settings.filesystemOnly) {
			return {
				branchTips: [],
				currentBranch: "",
				fingerprint: settingsKey,
				stabilityFingerprint: settingsKey,
				settingsKey,
			};
		}
		const branchTips = Object.freeze(
			(await this.git.listRecentBranchTips(settings.activeBranchDays))
				.map((tip) => Object.freeze({ ...tip }))
				.sort(
					(left, right) =>
						left.name.localeCompare(right.name) ||
						left.commit.localeCompare(right.commit) ||
						Number(left.current) - Number(right.current),
				),
		);
		const currentBranch =
			branchTips.find((tip) => tip.current && !tip.name.startsWith("origin/"))?.name ??
			(await this.git.getCurrentBranch()).trim();
		const fingerprintTips = branchTips.map((tip) => (tip.current ? { ...tip, commit: "working-copy" } : tip));
		return {
			branchTips,
			currentBranch,
			fingerprint: JSON.stringify({ ...settings, currentBranch, branchTips: fingerprintTips }),
			stabilityFingerprint: JSON.stringify({ ...settings, currentBranch, branchTips }),
			settingsKey,
		};
	}

	async getActiveBranchSnapshot(config: BacklogConfig | null): Promise<ActiveBranchSnapshot> {
		const settings = this.getActiveBranchSettings(config);
		const settingsKey = JSON.stringify(settings);
		if (this.activeBranchSnapshotPromise?.settingsKey === settingsKey)
			return await this.activeBranchSnapshotPromise.promise;
		const promise = this.computeActiveBranchSnapshot(config);
		const pending = { generation: this.generation, settingsKey, promise };
		this.activeBranchSnapshotPromise = pending;
		const clear = () => {
			if (this.activeBranchSnapshotPromise === pending) this.activeBranchSnapshotPromise = null;
		};
		void promise.then(clear, clear);
		return await promise;
	}

	async refreshRemoteRefsForTaskRead(config: BacklogConfig | null, options?: { force?: boolean }): Promise<void> {
		if (config?.checkActiveBranches === false || config?.remoteOperations === false || config?.filesystemOnly === true)
			return;
		if (!options?.force && Date.now() - this.lastRemoteRefRefreshAt < REMOTE_REF_REFRESH_INTERVAL_MS) return;
		if (options?.force && this.remoteRefRefreshPromise) {
			await this.remoteRefRefreshPromise;
			if (this.disposed) return;
		}
		if (!this.remoteRefRefreshPromise) {
			const git = this.git;
			const refresh = (async () => {
				git.setConfig(config);
				try {
					await git.fetch();
				} catch (error) {
					console.error("Failed to refresh remote refs:", error);
				} finally {
					if (this.git === git) this.lastRemoteRefRefreshAt = Date.now();
				}
			})();
			this.remoteRefRefreshPromise = refresh;
			const clear = () => {
				if (this.remoteRefRefreshPromise === refresh) this.remoteRefRefreshPromise = null;
			};
			void refresh.then(clear, clear);
		}
		await this.remoteRefRefreshPromise;
	}

	/** Refreshes a warm cross-branch corpus only when its branch snapshot changed. */
	async refreshTasksForTaskRead(): Promise<boolean> {
		while (true) {
			if (this.disposed) throw new ProjectSessionDisposed();
			const { generation, fs: filesystem, git } = this;
			const backlogRoot = filesystem.backlogDir;
			const projectChanged = () => !this.isCurrent(generation, filesystem, backlogRoot) || git !== this.git;
			const config = await filesystem.loadConfig();
			if (projectChanged()) {
				if (this.disposed) throw new ProjectSessionDisposed();
				continue;
			}
			await this.refreshRemoteRefsForTaskRead(config);
			if (projectChanged()) {
				if (this.disposed) throw new ProjectSessionDisposed();
				continue;
			}
			const snapshot = await this.getActiveBranchSnapshot(config);
			if (projectChanged()) {
				if (this.disposed) throw new ProjectSessionDisposed();
				continue;
			}
			if (snapshot.fingerprint === this.activeBranchFingerprint) {
				if (this.contentStore?.isInitialized()) await this.contentStore.refreshLocalTaskCorpus();
				if (projectChanged()) continue;
				return false;
			}
			const joinedExistingRefresh = this.activeBranchRefreshPromise !== null;
			if (!this.activeBranchRefreshPromise) {
				const refreshExistingStore = this.contentStore !== undefined;
				const refresh = (async () => {
					const store = await this.getContentStore();
					if (refreshExistingStore) await store.refreshTasks();
				})();
				this.activeBranchRefreshPromise = refresh;
				const clear = () => {
					if (this.activeBranchRefreshPromise === refresh) this.activeBranchRefreshPromise = null;
				};
				void refresh.then(clear, clear);
			}
			await this.activeBranchRefreshPromise;
			if (projectChanged()) {
				if (this.disposed) throw new ProjectSessionDisposed();
				continue;
			}
			if (joinedExistingRefresh && this.activeBranchFingerprint !== snapshot.fingerprint) continue;
			return true;
		}
	}

	publishTaskTransition(taskId: string, task?: Task): void {
		this.contentStore?.transitionTask(taskId, task);
	}

	publishActiveTask(task: Task): void {
		this.contentStore?.upsertTask(task);
	}
}

class TaskCorpusSnapshotRetry extends Error {
	constructor(readonly snapshot?: ActiveBranchSnapshot) {
		super("Project root or active branch refs changed while tasks were loading");
	}
}

export type { TuiTaskEditResult } from "./tui-task-edit-session.ts";

/**
 * Outcome of an operation that vacates a task ID. `cleanedTaskIds` names the records that lost a
 * stored reference to it, so every surface can report the change instead of making it silently.
 */
export interface VacatedTaskResult {
	success: boolean;
	cleanedTaskIds: string[];
}

interface TaskEditResult {
	task: Task;
	cleanedTaskIds: string[];
}

/** Dependencies are validated against the working copy on both the create and the edit path. */
function formatMissingDependenciesError(invalid: string[]): Error {
	return new Error(
		`The following dependencies do not exist: ${invalid.join(", ")}. Please create these tasks first or verify the IDs. ${LOCAL_TASK_LOOKUP_HINT}`,
	);
}

/**
 * A board move rewrites the task file, so a task that belongs to another branch can only be moved
 * from that branch. Returns the reason to report, or null when the task is local and writable.
 */
function crossBranchMoveReason(task: Task, verb: "reordered" | "moved"): string | null {
	if (!task.branch) return null;
	return `Task ${task.id} exists in branch "${task.branch}" and cannot be ${verb} from the current branch. Switch to that branch to modify it.`;
}

/**
 * Normalize the milestone a board move targets. A named lane stores its trimmed name, while the
 * board's no-milestone lane arrives as null or a blank string and clears the field.
 */
function normalizeTargetMilestone(targetMilestone: string | null | undefined): string | undefined {
	if (typeof targetMilestone !== "string") return undefined;
	const trimmed = targetMilestone.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export { TaskArchiveStatusError } from "./task-lifecycle-service.ts";

export class Core {
	private session: ProjectSession;
	private readonly projectContent = new ProjectContentService(this);
	private readonly enableWatchers: boolean;
	private vacatedTaskReferences: VacatedTaskReferenceService;
	private taskMutations: ProjectTaskMutations;
	private taskLifecycle: TaskLifecycleService;

	get fs(): FileSystem {
		return this.session.fs;
	}

	get git(): GitOperations {
		return this.session.git;
	}

	private get contentStore(): ContentStore | undefined {
		return this.session.contentStore;
	}

	private set contentStore(store: ContentStore | undefined) {
		this.session.contentStore = store;
	}

	private get searchService(): SearchService | undefined {
		return this.session.searchService;
	}

	private set searchService(service: SearchService | undefined) {
		this.session.searchService = service;
	}

	private get branchTaskLoader(): BranchTaskLoader {
		return this.session.branchTaskLoader;
	}

	private get projectGeneration(): number {
		return this.session.generation;
	}

	private get activeBranchFingerprint(): string | null {
		return this.session.activeBranchFingerprint;
	}

	private set activeBranchFingerprint(value: string | null) {
		this.session.activeBranchFingerprint = value;
	}

	constructor(projectRoot: string, options?: { enableWatchers?: boolean }) {
		this.enableWatchers = options?.enableWatchers ?? false;
		this.session = this.createProjectSession(projectRoot, 0);
		this.vacatedTaskReferences = new VacatedTaskReferenceService(this.fs, () => this.contentStore);
		this.taskMutations = new ProjectTaskMutations(this.fs, this.git, this.session);
		this.taskLifecycle = this.createTaskLifecycleService();
		// Note: Config is loaded lazily when needed since constructor can't be async
	}

	private createProjectSession(projectRoot: string, generation: number): ProjectSession {
		return new ProjectSession(
			projectRoot,
			generation,
			this.enableWatchers,
			(callback, options) => this.loadContentStoreCorpus(callback, options),
			() => this.getActiveAndCompletedTaskIds(),
		);
	}

	private createTaskLifecycleService(): TaskLifecycleService {
		return new TaskLifecycleService(this.fs, this.git, this.session, this.taskMutations, this.vacatedTaskReferences);
	}

	private async buildTaskIdentityIndex(
		localTasks: Array<Task & { lastModified?: Date }>,
		completedTasks: Task[],
		branchRecords: BranchTaskStateEntry[],
		statuses: string[],
		resolutionStrategy: "most_recent" | "most_progressed",
		repositoryRoot?: string | null,
		filesystem = this.fs,
		git = this.git,
	): Promise<TaskIdentityIndex> {
		const records: TaskIdentityRecord[] = [];
		for (const task of localTasks) {
			records.push({
				id: task.id,
				type: "task",
				branch: "local",
				path: task.filePath ?? join(filesystem.tasksDir, task.id),
				lastModified: task.lastModified ?? (task.updatedDate ? new Date(task.updatedDate) : new Date(0)),
				task: { ...task, source: "local" },
				workingCopy: true,
			});
		}
		for (const task of completedTasks) {
			records.push(completedTaskIdentityRecord(task, task.filePath ?? join(filesystem.completedDir, task.id)));
		}
		records.push(...branchRecords);

		return new TaskIdentityIndex(
			records,
			{
				repositoryRoot: repositoryRoot === undefined ? await git.getRepositoryRoot() : repositoryRoot,
				projectRoot: filesystem.rootDir,
				backlogDirectory: filesystem.backlogDirName,
			},
			statuses,
			resolutionStrategy,
		);
	}

	async withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
		return await this.taskMutations.withCreateLock(fn);
	}

	async previewDuplicateTaskIdRepair(options: { includeBranches?: boolean } = {}): Promise<DuplicateRepairPlan> {
		const storeAlreadyReady = this.contentStore?.isInitialized() ?? false;
		const store = await this.getContentStore();
		if (storeAlreadyReady) {
			if (options.includeBranches) await this.refreshTasksForTaskRead();
			else await store.refreshLocalTaskCorpus();
		}
		return await previewDuplicateTaskIdRepair(this, options, store.getTaskCorpusSnapshot());
	}

	async repairDuplicateTaskIds(expectedFingerprint: string): Promise<DuplicateRepairResult> {
		const result = await applyDuplicateTaskIdRepair(this, expectedFingerprint);
		if (this.contentStore) {
			await this.contentStore.refreshTasks();
		}
		return result;
	}

	/** Reports draft files whose numeric identities collide, whose frontmatter drifted from their filename, or that are unreadable. */
	async diagnoseDraftIdentity(): Promise<DraftIdentityFindings> {
		return this.fs.diagnoseDraftIdentity();
	}

	/** Reports document and decision files whose IDs collide or are missing, so lookups can fail closed. */
	async diagnoseContentIdentity(): Promise<ContentIdentityReport> {
		const unreadableDocuments: string[] = [];
		const unreadableDecisions: string[] = [];
		const [documents, decisions] = await Promise.all([
			this.fs.listDocuments(unreadableDocuments),
			this.fs.listDecisions(unreadableDecisions),
		]);
		// An empty collected path denotes the content directory itself, which the filesystem reports
		// when it could not be scanned at all.
		const locate = (directory: string, path: string) =>
			path ? `${this.fs.backlogDirName}/${directory}/${path}` : `${this.fs.backlogDirName}/${directory}`;
		const describe = (directory: string, item: { path?: string; title: string }) =>
			item.path ? locate(directory, item.path) : item.title;
		return {
			documents: detectContentIdentityIssues(
				documents.map((document) => ({ id: document.id, path: describe(DEFAULT_DIRECTORIES.DOCS, document) })),
				documentIdKey,
				unreadableDocuments.map((path) => locate(DEFAULT_DIRECTORIES.DOCS, path)),
			),
			decisions: detectContentIdentityIssues(
				decisions.map((decision) => ({ id: decision.id, path: describe(DEFAULT_DIRECTORIES.DECISIONS, decision) })),
				decisionIdKey,
				unreadableDecisions.map((path) => locate(DEFAULT_DIRECTORIES.DECISIONS, path)),
			),
		};
	}

	async resolveCreateOrdinal(inputOrdinal: number | undefined, isDraft: boolean): Promise<number | undefined> {
		if (typeof inputOrdinal === "number") {
			return inputOrdinal;
		}
		if (isDraft) {
			return undefined;
		}

		const tasks = await this.fs.listTasks();
		const ordinals = tasks
			.map((task) => task.ordinal)
			.filter((ordinal): ordinal is number => typeof ordinal === "number" && Number.isFinite(ordinal));

		if (ordinals.length === 0) {
			return tasks.length === 0 ? DEFAULT_ORDINAL_STEP : undefined;
		}

		return Math.max(...ordinals) + DEFAULT_ORDINAL_STEP;
	}

	async getContentStore(progressCallback?: (message: string) => void): Promise<ContentStore> {
		while (true) {
			const session = this.session;
			try {
				const store = await session.getContentStore(progressCallback);
				if (session === this.session) return store;
			} catch (error) {
				if (!(error instanceof ProjectSessionDisposed) || session === this.session) throw error;
			}
		}
	}

	async getSearchService(): Promise<SearchService> {
		while (true) {
			const session = this.session;
			try {
				const search = await session.getSearchService();
				if (session === this.session) return search;
			} catch (error) {
				if (!(error instanceof ProjectSessionDisposed) || session === this.session) throw error;
			}
		}
	}

	private getActiveBranchSettings(config: BacklogConfig | null) {
		return this.session.getActiveBranchSettings(config);
	}

	private async computeActiveBranchSnapshot(config: BacklogConfig | null): Promise<ActiveBranchSnapshot> {
		return await this.session.computeActiveBranchSnapshot(config);
	}

	private async getActiveBranchSnapshot(config?: BacklogConfig | null): Promise<ActiveBranchSnapshot> {
		return await this.session.getActiveBranchSnapshot(config ?? (await this.fs.loadConfig()));
	}

	private async refreshRemoteRefsForTaskRead(
		config: BacklogConfig | null,
		options?: { force?: boolean },
	): Promise<void> {
		await this.session.refreshRemoteRefsForTaskRead(config, options);
	}

	/** Refresh the existing cross-branch store only when relevant config or refs changed. */
	async refreshTasksForTaskRead(): Promise<boolean> {
		return await this.session.refreshTasksForTaskRead();
	}

	async requireCanonicalStatus(status: string): Promise<string> {
		return await this.taskMutations.requireCanonicalStatus(status);
	}

	async normalizePriority(value: string | undefined): Promise<string | undefined> {
		return await this.taskMutations.normalizePriority(value);
	}

	async normalizeTaskType(value: string | undefined): Promise<string | undefined> {
		return await this.taskMutations.normalizeTaskType(value);
	}

	async normalizeProject(value: string | undefined): Promise<string | undefined> {
		return await this.taskMutations.normalizeProject(value);
	}

	formatMissingDependenciesError(invalid: string[]): Error {
		return formatMissingDependenciesError(invalid);
	}

	publishTaskTransition(taskId: string, task?: Task): void {
		this.session.publishTaskTransition(taskId, task);
	}

	publishActiveTask(task: Task): void {
		this.session.publishActiveTask(task);
	}

	private createTaskReadSession(): TaskReadSession {
		const generation = this.projectGeneration;
		const filesystem = this.fs;
		const backlogRoot = filesystem.backlogDir;
		return new TaskReadSession(
			this.session,
			generation,
			filesystem,
			backlogRoot,
			this.contentStore?.isInitialized() ?? false,
			this.taskMutations,
		);
	}

	async queryTasks(options: TaskQueryOptions = {}): Promise<Task[]> {
		while (true) {
			const tasks = await this.createTaskReadSession().query(options);
			if (tasks) return tasks;
		}
	}

	async getTask(taskId: string, options: TaskReadOptions = {}): Promise<Task | null> {
		while (true) {
			const task = await this.createTaskReadSession().get(taskId, options);
			if (task !== undefined) return task;
		}
	}

	async getTaskWithSubtasks(taskId: string, localTasks?: Task[], options: TaskReadOptions = {}): Promise<Task | null> {
		while (true) {
			const task = await this.createTaskReadSession().getWithSubtasks(taskId, localTasks, options);
			if (task !== undefined) return task;
		}
	}

	async loadTaskById(taskId: string, options: TaskReadOptions = {}): Promise<Task | null> {
		return options.includeCrossBranch === false
			? await this.loadWorkingCopyTask(taskId, false)
			: await this.getTask(taskId, options);
	}

	async buildWorkingCopyTaskIndex(activeTasks?: Task[]): Promise<TaskIdentityIndex> {
		let suppliedActiveTasks = activeTasks;
		while (true) {
			const filesystem = this.fs;
			const backlogRoot = filesystem.backlogDir;
			const [localTasks, completedTasks, config] = await Promise.all([
				suppliedActiveTasks ? Promise.resolve(suppliedActiveTasks) : filesystem.listTasks(),
				filesystem.listCompletedTasks(),
				filesystem.loadConfig(),
			]);
			if (this.fs !== filesystem || backlogRoot !== filesystem.backlogDir) {
				suppliedActiveTasks = undefined;
				continue;
			}
			const index = await this.buildTaskIdentityIndex(
				localTasks,
				completedTasks,
				[],
				config?.statuses ?? [...DEFAULT_STATUSES],
				config?.taskResolutionStrategy ?? "most_progressed",
				null,
				filesystem,
			);
			if (this.fs === filesystem && backlogRoot === filesystem.backlogDir) return index;
			suppliedActiveTasks = undefined;
		}
	}

	async loadWorkingCopyTasks(includeCompleted = false): Promise<Task[]> {
		return (await this.buildWorkingCopyTaskIndex()).getTasks(includeCompleted);
	}

	async loadWorkingCopyTask(taskId: string, forMutation: boolean, activeTasks?: Task[]): Promise<Task | null> {
		return await this.taskMutations.loadWorkingCopyTask(taskId, forMutation, activeTasks);
	}

	async loadTaskForMutation(taskId: string, options: TaskReadOptions = {}): Promise<Task | null> {
		return await this.taskMutations.loadTaskForMutation(taskId, options);
	}

	async getTaskContent(taskId: string): Promise<string | null> {
		const task = await this.fs.loadTask(taskId);
		const filePath = task?.filePath ?? null;
		if (!filePath) return null;
		return await Bun.file(filePath).text();
	}

	async getDocument(documentId: string): Promise<Document | null> {
		return await this.projectContent.getDocument(documentId);
	}

	async getDocumentContent(documentId: string): Promise<string | null> {
		return await this.projectContent.getDocumentContent(documentId);
	}

	/**
	 * Re-point this Core instance to a different project root.
	 * Disposes caches and re-creates FileSystem / GitOperations.
	 */
	reinitializeProjectRoot(projectRoot: string): void {
		const previous = this.session;
		this.session = this.createProjectSession(projectRoot, previous.generation + 1);
		this.vacatedTaskReferences = new VacatedTaskReferenceService(this.fs, () => this.contentStore);
		this.taskMutations = new ProjectTaskMutations(this.fs, this.git, this.session);
		this.taskLifecycle = this.createTaskLifecycleService();
		previous.dispose();
	}

	disposeSearchService(): void {
		this.searchService?.dispose();
		this.searchService = undefined;
	}

	disposeContentStore(): void {
		this.session.disposeContentStore();
	}

	// Backward compatibility aliases
	get filesystem() {
		return this.fs;
	}

	get gitOps() {
		return this.git;
	}

	async ensureConfigLoaded(): Promise<void> {
		try {
			const config = await this.fs.loadConfig();
			this.git.setConfig(config);
		} catch (error) {
			// A config value Backlog refuses to read is the user's to fix and must reach the command;
			// only the recoverable git-configuration failures this guard exists for are suppressed.
			if (isConfigValueError(error)) {
				throw error;
			}
			// Config loading failed, git operations will work with null config
			if (process.env.DEBUG) {
				console.warn("Failed to load config for git operations:", error);
			}
		}
	}

	private async getBacklogDirectoryName(): Promise<string> {
		return this.fs.backlogDirName;
	}

	async shouldAutoCommit(overrideValue?: boolean): Promise<boolean> {
		return await this.taskMutations.shouldAutoCommit(overrideValue);
	}

	async getGitOps() {
		await this.ensureConfigLoaded();
		return this.git;
	}

	async ensureConfigMigrated(): Promise<void> {
		return await ensureConfigMigrated({
			ensureConfigLoaded: () => this.ensureConfigLoaded(),
			loadConfig: () => this.fs.loadConfig(),
			readConfigContent: () => readLegacyConfigContent(this.fs.configFilePath),
			listMilestones: () => this.fs.listMilestones(),
			createMilestone: (title) => this.fs.createMilestone(title),
			saveConfig: (config) => this.fs.saveConfig(config),
			migrateDraftPrefixes: () => migrateDraftPrefixes(this.fs),
		});
	}

	// ID generation
	/**
	 * Generates the next ID for a given entity type.
	 *
	 * @param type - The entity type (Task, Draft, Document, Decision). Defaults to Task.
	 * @param parent - Optional parent ID for subtask generation (only applicable for tasks).
	 * @returns The next available ID (e.g., "task-42", "draft-5", "doc-3")
	 *
	 * Folder scanning by type:
	 * - Task: /tasks, /completed, cross-branch (if enabled), remote (if enabled)
	 * - Draft: /drafts only
	 * - Document: /documents only
	 * - Decision: /decisions only
	 */
	async generateNextId(type: EntityType = EntityType.Task, parent?: string): Promise<string> {
		while (true) {
			const mutations = this.taskMutations;
			try {
				const id = await mutations.generateNextId(type, parent);
				if (mutations === this.taskMutations) return id;
			} catch (error) {
				if (!(error instanceof ProjectSessionDisposed) || mutations === this.taskMutations) throw error;
			}
		}
	}

	/**
	 * Gets all task IDs that are in use (active or completed) across all branches.
	 * Respects cross-branch config settings. Archived IDs are excluded (can be reused).
	 *
	 * This is used for ID generation to determine the next available ID.
	 */
	private async loadWorktreeTaskStateEntries(taskPrefix: string): Promise<BranchTaskStateEntry[]> {
		const [repoRoot, worktreeRoots] = await Promise.all([this.git.getRepositoryRoot(), this.git.listWorktreePaths()]);
		if (!repoRoot || worktreeRoots.length === 0) {
			return [];
		}

		const projectRelativePath = relative(repoRoot, this.fs.rootDir);
		if (projectRelativePath.startsWith("..") || isAbsolute(projectRelativePath)) {
			return [];
		}

		const backlogDir = await this.getBacklogDirectoryName();
		const entries: BranchTaskStateEntry[] = [];
		for (const worktreeRoot of worktreeRoots) {
			const projectRoot = projectRelativePath ? join(worktreeRoot, projectRelativePath) : worktreeRoot;
			entries.push(...(await this.loadTaskStateEntriesFromWorktree(projectRoot, backlogDir, taskPrefix, worktreeRoot)));
		}

		return entries;
	}

	private async loadTaskStateEntriesFromWorktree(
		projectRoot: string,
		backlogDir: string,
		taskPrefix: string,
		worktreeRoot: string,
	): Promise<BranchTaskStateEntry[]> {
		const idRegex = buildIdRegex(taskPrefix);
		const globPattern = buildGlobPattern(taskPrefix.toLowerCase());
		const directories: Array<{ path: string; type: "task" | "completed" }> = [
			{ path: join(projectRoot, backlogDir, DEFAULT_DIRECTORIES.TASKS), type: "task" },
			{ path: join(projectRoot, backlogDir, DEFAULT_DIRECTORIES.COMPLETED), type: "completed" },
		];
		const entries: BranchTaskStateEntry[] = [];

		for (const { path, type } of directories) {
			let files: string[];
			try {
				files = await Array.fromAsync(new Bun.Glob(globPattern).scan({ cwd: path, followSymlinks: true }));
			} catch {
				continue;
			}

			for (const file of files) {
				const match = file.match(idRegex);
				if (!match?.[1]) continue;

				const filePath = join(path, file);
				const stats = await stat(filePath).catch(() => null);
				entries.push({
					id: normalizeId(match[1], taskPrefix),
					type,
					branch: `worktree:${worktreeRoot}`,
					path: filePath,
					lastModified: stats?.mtime ?? new Date(0),
				});
			}
		}

		return entries;
	}

	private async getActiveAndCompletedTaskIds(): Promise<string[]> {
		const snapshot = await this.loadTasksWithStableBranchSnapshot({
			includeCompleted: false,
			visibleCompleted: false,
			forceRemoteRefresh: true,
		});
		const completedTasks = snapshot.completedTasks;
		const config = snapshot.config;
		const taskPrefix = config?.prefixes?.task ?? "task";
		if (!snapshot.identityIndex) throw new Error("Task corpus identity index was not initialized");

		// Same-repository worktrees share the task ID namespace even before their
		// task files are committed, so include their filesystem state for allocation.
		const worktreeEntries = await this.loadWorktreeTaskStateEntries(taskPrefix);
		const occupiedIds = new Set(snapshot.identityIndex.getOccupiedIds());
		for (const task of completedTasks) occupiedIds.add(task.id);
		for (const entry of worktreeEntries) {
			if (entry.type === "task" || entry.type === "completed") occupiedIds.add(entry.id);
		}
		return [...occupiedIds];
	}

	/**
	 * Gets all existing IDs for a given entity type.
	 * Used internally by generateNextId to determine the next available ID.
	 *
	 * Note: Archived tasks are intentionally excluded - archived IDs can be reused.
	 * This makes archive act as a soft delete for ID purposes.
	 */
	async getExistingIdsForType(type: EntityType): Promise<string[]> {
		switch (type) {
			case EntityType.Task: {
				// Get active + completed task IDs from all branches (respects config)
				// Archived IDs are excluded - they can be reused (soft delete behavior)
				return this.getActiveAndCompletedTaskIds();
			}
			case EntityType.Draft: {
				// Occupancy includes filename-derived ids: an unparsable file still reserves its
				// numeric id, so allocation can never reuse what it cannot parse.
				const [drafts, occupiedFileIds] = await Promise.all([this.fs.listDrafts(), this.fs.listOccupiedDraftFileIds()]);
				return [...drafts.map((d) => d.id), ...occupiedFileIds];
			}
			case EntityType.Document: {
				const documents = await this.fs.listDocuments();
				return documents.map((d) => d.id);
			}
			case EntityType.Decision: {
				const decisions = await this.fs.listDecisions();
				return decisions.map((d) => d.id);
			}
			default:
				return [];
		}
	}

	async writePreparedTask(task: Task, isDraft: boolean): Promise<string> {
		if (isDraft) {
			task.status = "Draft";
			normalizeAssignee(task);
			return await this.fs.saveDraft(task);
		}

		normalizeAssignee(task);
		return await this.fs.saveTask(task);
	}

	async finalizeCreatedTask(
		task: Task,
		filepath: string,
		isDraft: boolean,
		autoCommit: boolean,
		write?: CreatedTaskWrite,
	): Promise<Task | null> {
		const savedTask = isDraft ? await this.fs.loadDraft(task.id) : await this.fs.loadTask(task.id);

		if (!isDraft && this.contentStore && savedTask) {
			this.contentStore.upsertTask(savedTask);
		}

		if (autoCommit) {
			if (isDraft) {
				await this.git.addFile(filepath);
				if (write) write.generatedIndexEntries = await this.git.getIndexEntries(filepath);
				await this.git.commitTaskChange(task.id, `Create draft ${task.id}`, filepath);
			} else {
				await this.git.addAndCommitTaskFile(task.id, filepath, "create", (entries) => {
					if (write) write.generatedIndexEntries = entries;
				});
			}
		}

		return savedTask;
	}

	async rollbackCreatedTask(write: CreatedTaskWrite): Promise<CreatedTaskRollbackResult> {
		return await rollbackCreatedTask(write, {
			restoreIndexEntriesIfMatches: this.git.restoreIndexEntriesIfMatches.bind(this.git),
			refreshTasks: async () => await this.contentStore?.refreshTasks(),
		});
	}

	async createTaskFromInput(input: TaskCreateInput, autoCommit?: boolean): Promise<{ task: Task; filePath?: string }> {
		return await new TaskCreationService(this).create(input, autoCommit);
	}

	/**
	 * Resolve `--parent` against the working copy, the same corpus the parent filter and task reads
	 * use, so one ID cannot be an acceptable parent for a child that no task command can then show.
	 */
	async resolveParentTaskIdForCreate(parentTaskId: string): Promise<string> {
		const parentTask = await this.loadTaskById(parentTaskId, { includeCrossBranch: false });
		if (!parentTask) {
			const config = await this.fs.loadConfig();
			const canonicalParent = canonicalTaskId(parentTaskId, config?.prefixes?.task ?? "task");
			throw new Error(
				`Parent task ${canonicalParent} not found. ${LOCAL_TASK_LOOKUP_HINT} Use an existing task ID with --parent; use --milestone to assign a task to a milestone.`,
			);
		}
		return parentTask.id;
	}

	async createTask(task: Task, autoCommit?: boolean): Promise<string> {
		if (!task.status) {
			const config = await this.fs.loadConfig();
			task.status = config?.defaultStatus || FALLBACK_STATUS;
		}

		const autoCommitEnabled = await this.shouldAutoCommit(autoCommit);
		const filepath = await this.writePreparedTask(task, false);
		await this.finalizeCreatedTask(task, filepath, false, autoCommitEnabled);

		return filepath;
	}

	async updateTask(task: Task, autoCommit?: boolean): Promise<string> {
		return await this.taskMutations.saveTask(task, autoCommit);
	}

	async applyTaskUpdateInput(
		task: Task,
		input: TaskUpdateInput,
		statusResolver: (status: string) => Promise<string>,
	): Promise<{ task: Task; mutated: boolean }> {
		return await this.taskMutations.applyTaskUpdateInput(task, input, statusResolver);
	}

	async updateTaskFromInput(
		taskId: string,
		input: TaskUpdateInput,
		autoCommit?: boolean,
		options: TaskReadOptions = {},
	): Promise<Task> {
		const requestedStatus = input.status?.trim().toLowerCase();
		if (requestedStatus === "draft") {
			// demoteTaskWithUpdates takes the task lock itself, so it must not be nested here.
			const task = await this.loadTaskForMutation(taskId, options);
			if (!task) throw new Error(`Task not found: ${taskId}`);
			return (await this.demoteTaskWithUpdates(task, input, autoCommit, options)).task;
		}
		return await this.taskMutations.updateFromInput(taskId, input, autoCommit, options);
	}

	async updateDraft(task: Task, autoCommit?: boolean): Promise<string> {
		// Drafts always keep status Draft
		task.status = "Draft";
		normalizeAssignee(task);
		task.updatedDate = formatStoredDate();

		const previousPath = task.filePath;
		const filepath = await this.fs.saveDraft(task);

		if (await this.shouldAutoCommit(autoCommit)) {
			if (previousPath && previousPath !== filepath) {
				// A title rename moved the file: stage the deletion of the old path together with
				// the addition of the new one, mirroring how task moves stage their renames.
				const repoRoot = await this.git.stageFileMove(previousPath, filepath);
				await this.git.commitFiles(`Update draft ${task.id}`, [previousPath, filepath], repoRoot ?? undefined);
			} else {
				await this.git.addFile(filepath);
				await this.git.commitTaskChange(task.id, `Update draft ${task.id}`, filepath);
			}
		}

		return filepath;
	}

	async updateDraftFromInput(
		reference: DraftFileReference,
		input: TaskUpdateInput,
		autoCommit?: boolean,
	): Promise<Task> {
		// Same discipline as task edits: acquire the namespaced per-file lock before the
		// read-modify-write and re-read inside it, so a concurrent editor fails fast instead of
		// losing its update. The reference's own file is the only thing touched; no id is ever
		// re-resolved to a different path.
		return await this.fs.withDraftLock(reference, async () => {
			const current = await this.fs.draftReferenceFromPath(reference.filePath);
			// Bind the mutated record to the selected file's own identity: a padded filename whose
			// frontmatter carries an unpadded id must keep converging onto that one file instead of
			// minting a second spelling of the same numeric id.
			current.task.id = reference.canonicalId;

			const { mutated } = await this.applyTaskUpdateInput(current.task, input, async (status) => {
				if (status.trim().toLowerCase() !== "draft") {
					throw new Error("Drafts must use status Draft.");
				}
				return "Draft";
			});

			if (!mutated) {
				return current.task;
			}

			const savedPath = await this.updateDraft(current.task, autoCommit);
			const refreshed = await this.fs.draftReferenceFromPath(savedPath);
			return refreshed.task;
		});
	}

	async editTaskOrDraft(
		taskId: string,
		input: TaskUpdateInput,
		autoCommit?: boolean,
		options: TaskReadOptions = {},
	): Promise<TaskEditResult> {
		const resolvedDraft = await this.fs.resolveDraftReference(taskId);
		if (resolvedDraft) {
			const requestedStatus = input.status?.trim();
			const wantsDraft = requestedStatus?.toLowerCase() === "draft";
			if (requestedStatus && !wantsDraft) {
				return {
					task: await this.promoteDraftWithUpdates(resolvedDraft, input, autoCommit),
					cleanedTaskIds: [],
				};
			}
			return { task: await this.updateDraftFromInput(resolvedDraft, input, autoCommit), cleanedTaskIds: [] };
		}

		if (input.status?.trim().toLowerCase() === "draft") {
			const task = await this.loadTaskForMutation(taskId, options);
			if (!task) throw new Error(`Task not found: ${taskId}`);
			return await this.demoteTaskWithUpdates(task, input, autoCommit, options);
		}

		return { task: await this.updateTaskFromInput(taskId, input, autoCommit, options), cleanedTaskIds: [] };
	}

	private async promoteDraftWithUpdates(
		reference: DraftFileReference,
		input: TaskUpdateInput,
		autoCommit?: boolean,
	): Promise<Task> {
		return await this.taskLifecycle.promoteDraftWithUpdates(reference, input, autoCommit);
	}

	// Demotion is a read-modify-write of the task file too, reached from both updateTaskFromInput
	// and editTaskOrDraft, so it takes the task lock here rather than at each caller. Waiting on
	// the create lock below happens while the task lock is held; the order is always task lock
	// then create lock, never the reverse, so the two cannot deadlock.
	private async demoteTaskWithUpdates(
		task: Task,
		input: TaskUpdateInput,
		autoCommit?: boolean,
		options: TaskReadOptions = {},
	): Promise<TaskEditResult> {
		return await this.taskLifecycle.demoteTaskWithUpdates(task, input, autoCommit, options);
	}

	async editTask(
		taskId: string,
		input: TaskUpdateInput,
		autoCommit?: boolean,
		options: TaskReadOptions = {},
	): Promise<Task> {
		return await this.updateTaskFromInput(taskId, input, autoCommit, options);
	}

	private async writeTasksBulk(tasks: Task[]): Promise<string[]> {
		const filePaths: string[] = [];
		const updateAll = async () => {
			for (const task of tasks) {
				const filePath = await this.updateTask(task, false);
				filePaths.push(filePath);
				// Keep an in-process ContentStore serving what was just written: without this the
				// server, MCP and TUI keep reading the pre-write copy until a watcher refresh lands.
				this.contentStore?.upsertTask({ ...task, filePath });
			}
		};
		if (this.contentStore) await this.contentStore.batchTaskUpdates(updateAll);
		else await updateAll();
		return filePaths;
	}

	async updateTasksBulk(tasks: Task[], commitMessage?: string, autoCommit?: boolean): Promise<void> {
		const filePaths = await this.fs.withTaskLocks(tasks, async () => await this.writeTasksBulk(tasks));

		// Commit all changes at once if auto-commit is enabled
		if (await this.shouldAutoCommit(autoCommit)) {
			if (filePaths.length > 0) {
				await this.git.addFiles(filePaths);
				await this.git.commitFiles(commitMessage || `Update ${tasks.length} tasks`, filePaths);
			}
		}
	}

	/**
	 * Resolve the task ids of a board move against a freshly refreshed content store.
	 *
	 * Ids are trimmed and de-duplicated by normalized identity while keeping the caller's spelling so
	 * messages echo what was asked for. An identity that matches more than one file fails closed with
	 * the ambiguity error instead of picking a winner. An id the store does not know comes back as
	 * `task: null` with no error, because a gap means different things to different callers.
	 *
	 * The failure semantics stay with the callers on purpose: {@link reorderTask} raises the first
	 * problem and writes all or nothing, while {@link moveTasksToStatus} reports problems per task and
	 * moves the tasks that did resolve.
	 */
	private async resolveTasksForBoardMove(taskIds: readonly string[]): Promise<{
		store: ContentStore;
		resolutions: Array<{ taskId: string; task: Task | null; ambiguity: AmbiguousTaskIdError | null }>;
	}> {
		const requestedIds: string[] = [];
		const seen = new Set<string>();
		for (const rawId of taskIds) {
			const trimmed = String(rawId || "").trim();
			if (!trimmed) continue;
			// Canonical identity collapses cosmetic spellings such as leading zeros, so TASK-1 and
			// TASK-01 cannot both survive and write the same task twice.
			const key = canonicalTaskId(trimmed);
			if (seen.has(key)) continue;
			seen.add(key);
			requestedIds.push(trimmed);
		}

		const store = await this.getContentStore();
		await store.refreshTasks();

		const resolutions = requestedIds.map((taskId) => {
			const resolution = store.resolveTaskForMutation(normalizeTaskId(taskId));
			if (resolution.status === "ambiguous") {
				return { taskId, task: null, ambiguity: new AmbiguousTaskIdError(taskId, resolution.candidates) };
			}
			return { taskId, task: resolution.status === "found" ? resolution.task : null, ambiguity: null };
		});

		return { store, resolutions };
	}

	async reorderTask(params: {
		taskId: string;
		targetStatus: string;
		orderedTaskIds: string[];
		targetMilestone?: string | null;
		commitMessage?: string;
		autoCommit?: boolean;
		defaultStep?: number;
	}): Promise<{ updatedTask: Task; changedTasks: Task[] }> {
		const taskId = normalizeTaskId(String(params.taskId || "").trim());
		const targetStatus = String(params.targetStatus || "").trim();
		const orderedTaskIds = params.orderedTaskIds.map((id) => normalizeTaskId(String(id || "").trim())).filter(Boolean);
		const defaultStep = params.defaultStep ?? DEFAULT_ORDINAL_STEP;

		if (!taskId) throw new Error("taskId is required");
		if (!targetStatus) throw new Error("targetStatus is required");
		if (orderedTaskIds.length === 0) throw new Error("orderedTaskIds must include at least one task");
		if (!orderedTaskIds.includes(taskId)) {
			throw new Error("orderedTaskIds must include the task being moved");
		}

		// A repeated id means the caller sent a corrupt ordering, so reject it rather than let the
		// shared resolver quietly drop it and reorder the column into an order nobody asked for.
		const seen = new Set<string>();
		for (const id of orderedTaskIds) {
			if (seen.has(id)) {
				throw new Error(`Duplicate task id ${id} in orderedTaskIds`);
			}
			seen.add(id);
		}

		const { resolutions } = await this.resolveTasksForBoardMove(orderedTaskIds);
		for (const resolution of resolutions) {
			if (resolution.ambiguity) throw resolution.ambiguity;
		}

		// Tasks that couldn't be loaded (may have been moved/deleted) drop out of the ordering
		const validTasks = resolutions.map((resolution) => resolution.task).filter((t): t is Task => t !== null);

		const movedTask = validTasks.find((task) => task.id === taskId);
		if (!movedTask) throw new Error(`Task ${taskId} not found while reordering`);

		// Reject reordering tasks from other branches - they can only be modified in their source branch
		const crossBranchReason = crossBranchMoveReason(movedTask, "reordered");
		if (crossBranchReason) {
			throw new Error(crossBranchReason);
		}

		const { updatedTask, changedTasks } = planTaskReorder(
			taskId,
			targetStatus,
			orderedTaskIds,
			validTasks,
			params.targetMilestone,
			defaultStep,
			normalizeTargetMilestone,
		);

		if (changedTasks.length > 0) {
			await this.updateTasksBulk(
				changedTasks,
				params.commitMessage ?? `Reorder tasks in ${targetStatus}`,
				params.autoCommit,
			);
		}

		return { updatedTask, changedTasks };
	}

	/**
	 * Move a set of tasks into a status column, reporting problems per task instead of aborting the
	 * batch. Without `orderedTaskIds` the moved tasks append to the end of the column. With it, the
	 * caller names the column's final order and the moved tasks land exactly there, seeded with
	 * block ordinals the way {@link reorderTask} places a single task.
	 */
	async moveTasksToStatus(params: {
		taskIds: string[];
		targetStatus: string;
		orderedTaskIds?: string[];
		targetMilestone?: string | null;
		commitMessage?: string;
		autoCommit?: boolean;
		defaultStep?: number;
	}): Promise<{ movedTasks: Task[]; changedTasks: Task[]; failures: Array<{ taskId: string; reason: string }> }> {
		const targetStatus = String(params.targetStatus || "").trim();
		if (!targetStatus) throw new Error("targetStatus is required");
		const plan = await this.planTasksToStatus(params, targetStatus);

		if (plan.changedTasks.length > 0) {
			await this.updateTasksBulk(
				plan.changedTasks,
				params.commitMessage ?? `Move ${plan.changedTasks.length} tasks to ${targetStatus}`,
				params.autoCommit,
			);
		}

		return plan;
	}

	private async planTasksToStatus(
		params: Parameters<Core["moveTasksToStatus"]>[0],
		targetStatus: string,
	): Promise<MoveTasksPlan> {
		const { store, resolutions } = await this.resolveTasksForBoardMove(params.taskIds);
		if (resolutions.length === 0) throw new Error("taskIds must include at least one task");

		const failures: Array<{ taskId: string; reason: string }> = [];
		const tasksToMove: Task[] = [];
		for (const { taskId, task, ambiguity } of resolutions) {
			if (ambiguity) failures.push({ taskId, reason: ambiguity.message });
			else if (!task) failures.push({ taskId, reason: `Task ${taskId} not found.` });
			else {
				const crossBranchReason = crossBranchMoveReason(task, "moved");
				if (crossBranchReason) failures.push({ taskId, reason: crossBranchReason });
				else tasksToMove.push(task);
			}
		}
		if (tasksToMove.length === 0) return { movedTasks: [], changedTasks: [], failures };

		const hasTargetMilestone = params.targetMilestone !== undefined;
		const normalizedTargetMilestone = normalizeTargetMilestone(params.targetMilestone);
		const applyMove = (task: Task): Task => ({
			...task,
			status: targetStatus,
			...(hasTargetMilestone ? { milestone: normalizedTargetMilestone } : {}),
		});
		const placement = params.orderedTaskIds
			? this.planOrderedTaskMove(
					store,
					params.orderedTaskIds,
					tasksToMove,
					failures,
					applyMove,
					params.defaultStep ?? DEFAULT_ORDINAL_STEP,
				)
			: this.planAppendedTaskMove(
					store,
					targetStatus,
					tasksToMove,
					applyMove,
					hasTargetMilestone,
					normalizedTargetMilestone,
					params.defaultStep ?? DEFAULT_ORDINAL_STEP,
				);
		return { ...placement, failures, changedTasks: placement.changedTasks.filter((task) => !task.branch) };
	}

	private planOrderedTaskMove(
		store: ContentStore,
		orderedTaskIds: string[],
		tasksToMove: Task[],
		failures: Array<{ taskId: string; reason: string }>,
		applyMove: (task: Task) => Task,
		defaultStep: number,
	): MoveTaskPlacement {
		const { tasksInOrder, originalTasks, requiresRebalance } = planOrderedTaskPlacement({
			store,
			orderedTaskIds,
			tasksToMove,
			failures,
			applyMove,
			defaultStep,
		});
		return this.reconcileMovedTasks(
			tasksInOrder,
			resolveOrdinalConflicts(tasksInOrder, {
				defaultStep,
				startOrdinal: defaultStep,
				forceSequential: requiresRebalance,
			}),
			originalTasks,
			tasksToMove,
			applyMove,
		);
	}

	private planAppendedTaskMove(
		store: ContentStore,
		targetStatus: string,
		tasksToMove: Task[],
		applyMove: (task: Task) => Task,
		hasTargetMilestone: boolean,
		normalizedTargetMilestone: string | undefined,
		defaultStep: number,
	): MoveTaskPlacement {
		const stayingIds = new Set(tasksToMove.filter((task) => task.status === targetStatus).map((task) => task.id));
		const arriving = tasksToMove.filter((task) => !stayingIds.has(task.id));
		if (arriving.length === 0) {
			const movedTasks = tasksToMove.map(applyMove);
			return {
				movedTasks,
				changedTasks: movedTasks.filter((task, index) => {
					const original = tasksToMove[index];
					return !original || original.status !== task.status || (original.milestone ?? "") !== (task.milestone ?? "");
				}),
			};
		}

		const movedIds = new Set(tasksToMove.map((task) => task.id));
		const sanitizeOrdinal = (task: Task): Task =>
			task.ordinal === undefined || Number.isFinite(task.ordinal) ? task : { ...task, ordinal: undefined };
		const inTargetLane = (task: Task): boolean =>
			!hasTargetMilestone || (task.milestone?.trim() || "") === (normalizedTargetMilestone ?? "");
		const columnTasks = sortByOrdinal(
			store
				.getTasks({ status: targetStatus })
				.filter((task) => (stayingIds.has(task.id) ? true : !movedIds.has(task.id) && inTargetLane(task)))
				.map(sanitizeOrdinal),
		);
		const tasksInOrder = [
			...columnTasks.map((task) => (stayingIds.has(task.id) ? applyMove(task) : task)),
			...arriving.map((task) => ({ ...applyMove(task), ordinal: undefined })),
		];
		return this.reconcileMovedTasks(
			tasksInOrder,
			resolveOrdinalConflicts(tasksInOrder, { defaultStep, startOrdinal: defaultStep }),
			store.getTasks({ status: targetStatus }),
			tasksToMove,
			applyMove,
		);
	}

	private reconcileMovedTasks(
		tasksInOrder: Task[],
		resolutionUpdates: Task[],
		originalTasks: Task[],
		tasksToMove: Task[],
		applyMove: (task: Task) => Task,
	): { movedTasks: Task[]; changedTasks: Task[] } {
		const updatesMap = new Map(tasksInOrder.map((task) => [task.id, task]));
		for (const update of resolutionUpdates) {
			updatesMap.set(update.id, update);
		}
		const originalMap = new Map([
			...originalTasks.map((task) => [task.id, task] as const),
			...tasksToMove.map((task) => [task.id, task] as const),
		]);
		const movedTasks = tasksToMove.map((task) => updatesMap.get(task.id) ?? applyMove(task));
		const changedTasks = Array.from(updatesMap.values()).filter((task) => {
			const original = originalMap.get(task.id);
			return (
				!original ||
				(original.status ?? "") !== (task.status ?? "") ||
				(original.ordinal ?? null) !== (task.ordinal ?? null) ||
				(original.milestone ?? "") !== (task.milestone ?? "")
			);
		});
		return { movedTasks, changedTasks };
	}

	async archiveTask(taskId: string, autoCommit?: boolean, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		return await this.taskLifecycle.archive(taskId, autoCommit, options);
	}

	async archiveMilestone(
		identifier: string,
		autoCommit?: boolean,
	): Promise<{ success: boolean; sourcePath?: string; targetPath?: string; milestone?: Milestone }> {
		return await this.projectContent.archiveMilestone(identifier, autoCommit);
	}

	async renameMilestone(
		identifier: string,
		title: string,
		autoCommit?: boolean,
		dueDate?: string | null,
	): Promise<{
		success: boolean;
		sourcePath?: string;
		targetPath?: string;
		milestone?: Milestone;
		previousTitle?: string;
		previousDueDate?: string;
	}> {
		return await this.projectContent.renameMilestone(identifier, title, autoCommit, dueDate);
	}

	async completeTask(taskId: string, autoCommit?: boolean, options: TaskReadOptions = {}): Promise<boolean> {
		return await this.taskLifecycle.complete(taskId, autoCommit, options);
	}

	async getTerminalStatusTasksByAge(olderThanDays: number): Promise<Task[]> {
		return await this.taskLifecycle.getTerminalStatusTasksByAge(olderThanDays);
	}

	async archiveDraft(draftId: string, autoCommit?: boolean): Promise<boolean> {
		return await this.taskLifecycle.archiveDraft(draftId, autoCommit);
	}

	async promoteDraft(draftId: string, autoCommit?: boolean): Promise<boolean> {
		return await this.taskLifecycle.promoteDraft(draftId, autoCommit);
	}

	async demoteTask(taskId: string, autoCommit?: boolean, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		return await this.taskLifecycle.demoteTask(taskId, autoCommit, options);
	}

	/**
	 * Add acceptance criteria to a task
	 */
	async addAcceptanceCriteria(taskId: string, criteria: string[], autoCommit?: boolean): Promise<void> {
		const task = await this.fs.loadTask(taskId);
		if (!task) {
			throw new Error(`Task not found: ${taskId}`);
		}

		// Get existing criteria or initialize empty array
		const current = Array.isArray(task.acceptanceCriteriaItems) ? [...task.acceptanceCriteriaItems] : [];

		// Calculate next index (1-based)
		let nextIndex = current.length > 0 ? Math.max(...current.map((c) => c.index)) + 1 : 1;

		// Append new criteria
		const newCriteria = criteria.map((text) => ({ index: nextIndex++, text, checked: false }));
		task.acceptanceCriteriaItems = [...current, ...newCriteria];

		// Save the task
		await this.updateTask(task, autoCommit);
	}

	private async mutateAcceptanceCriteria<T>(
		taskId: string,
		autoCommit: boolean | undefined,
		mutate: (items: AcceptanceCriterion[]) => { items: AcceptanceCriterion[]; result: T },
	): Promise<T> {
		const task = await this.fs.loadTask(taskId);
		if (!task) throw new Error(`Task not found: ${taskId}`);
		assertValidChecklistMarks(task.rawContent ?? "", "AC");
		const { items, result } = mutate(
			Array.isArray(task.acceptanceCriteriaItems) ? [...task.acceptanceCriteriaItems] : [],
		);
		task.acceptanceCriteriaItems = items;
		await this.updateTask(task, autoCommit);
		return result;
	}

	/**
	 * Remove acceptance criteria by indices (supports batch operations)
	 * @returns Array of removed indices
	 */
	async removeAcceptanceCriteria(taskId: string, indices: number[], autoCommit?: boolean): Promise<number[]> {
		return await this.mutateAcceptanceCriteria(taskId, autoCommit, (items) => {
			let remaining = items;
			const removed = [...indices]
				.sort((a, b) => b - a)
				.filter((index) => {
					const before = remaining.length;
					remaining = remaining.filter((item) => item.index !== index);
					return remaining.length < before;
				});
			if (removed.length === 0) throw new Error("No criteria were removed. Check that the specified indices exist.");
			return {
				items: remaining.map((item, index) => ({ ...item, index: index + 1 })),
				result: removed.sort((a, b) => a - b),
			};
		});
	}

	/**
	 * Check or uncheck acceptance criteria by indices (supports batch operations)
	 * Silently ignores invalid indices and only updates valid ones.
	 * @returns Array of updated indices
	 */
	async checkAcceptanceCriteria(
		taskId: string,
		indices: number[],
		checked: boolean,
		autoCommit?: boolean,
	): Promise<number[]> {
		return await this.mutateAcceptanceCriteria(taskId, autoCommit, (items) => {
			let updatedItems = items;
			const updated: number[] = [];
			for (const index of indices) {
				if (!updatedItems.some((item) => item.index === index)) continue;
				updatedItems = updatedItems.map((item) => (item.index === index ? { ...item, checked } : item));
				updated.push(index);
			}
			if (updated.length === 0) throw new Error("No criteria were updated.");
			return { items: updatedItems, result: updated.sort((a, b) => a - b) };
		});
	}

	/**
	 * List all acceptance criteria for a task
	 */
	async listAcceptanceCriteria(taskId: string): Promise<AcceptanceCriterion[]> {
		const task = await this.fs.loadTask(taskId);
		if (!task) {
			throw new Error(`Task not found: ${taskId}`);
		}

		return task.acceptanceCriteriaItems || [];
	}

	/**
	 * Stage and commit a single written file, scoped to exactly the paths this write touched
	 * (the new file, plus any previous paths it replaced). Never sweeps in unrelated dirty state.
	 */
	async commitWrittenFile(
		message: string,
		previousPaths: string[],
		newPath: string,
		alsoWrittenPaths: string[] = [],
	): Promise<void> {
		await this.taskMutations.commitWrittenFile(message, previousPaths, newPath, alsoWrittenPaths);
	}

	async createDecision(decision: Decision, autoCommit?: boolean): Promise<void> {
		return await this.projectContent.createDecision(decision, autoCommit);
	}

	async updateDecisionFromContent(decisionId: string, content: string, autoCommit?: boolean): Promise<void> {
		return await this.projectContent.updateDecisionFromContent(decisionId, content, autoCommit);
	}

	async createDecisionWithTitle(title: string, autoCommit?: boolean): Promise<Decision> {
		return await this.projectContent.createDecisionWithTitle(title, autoCommit);
	}

	async createDocument(doc: Document, autoCommit?: boolean, subPath = ""): Promise<void> {
		return await this.projectContent.createDocument(doc, autoCommit, subPath);
	}

	async updateDocument(existingDoc: Document, content: string, autoCommit?: boolean): Promise<void> {
		await this.updateDocumentFromInput(
			{
				id: existingDoc.id,
				title: existingDoc.title,
				type: existingDoc.type,
				tags: existingDoc.tags,
				content,
				...(existingDoc.path !== undefined && { path: getDocumentSubPathFromRelativePath(existingDoc.path) }),
			},
			autoCommit,
		);
	}

	async createDocumentWithId(title: string, content: string, autoCommit?: boolean): Promise<Document> {
		return await this.createDocumentFromInput({ title, content }, autoCommit);
	}

	async createDocumentFromInput(input: DocumentCreateInput, autoCommit?: boolean): Promise<Document> {
		return await this.projectContent.createDocumentFromInput(input, autoCommit);
	}

	async updateDocumentFromInput(input: DocumentUpdateInput, autoCommit?: boolean): Promise<Document> {
		return await this.projectContent.updateDocumentFromInput(input, autoCommit);
	}

	async listTasksWithMetadata(
		includeBranchMeta = false,
		filesystem = this.fs,
		git = this.git,
	): Promise<Array<Task & { lastModified?: Date; branch?: string }>> {
		const tasks = await filesystem.listTasks();
		return await Promise.all(
			tasks.map(async (task) => {
				const filePath = task.filePath ?? (await getTaskPath(task.id, { filesystem }));

				if (filePath) {
					const bunFile = Bun.file(filePath);
					const stats = await bunFile.stat();
					return {
						...task,
						lastModified: new Date(stats.mtime),
						// Only include branch if explicitly requested
						...(includeBranchMeta && {
							branch: (await git.getFileLastModifiedBranch(filePath)) || undefined,
						}),
					};
				}
				return task;
			}),
		);
	}

	/**
	 * Open a file in the configured editor with minimal interference
	 * @param filePath - Path to the file to edit
	 * @param screen - Optional blessed screen to suspend (for TUI contexts)
	 */
	async editTaskInTui(taskId: string, screen: BlessedScreen, selectedTask?: Task): Promise<TuiTaskEditResult> {
		return await editTaskInTuiSession(taskId, screen, selectedTask, {
			fs: this.fs,
			getTask: (id) => this.getTask(id),
			getTaskPath: (id) => getTaskPath(id, this),
			getContentStore: () => this.contentStore,
		});
	}

	/**
	 * Load and process all tasks with the same logic as CLI overview
	 * This method extracts the common task loading logic for reuse
	 */
	async loadAllTasksForStatistics(
		progressCallback?: (msg: string) => void,
	): Promise<{ tasks: Task[]; drafts: Task[]; statuses: string[]; priorities: string[] }> {
		const snapshot = await this.loadTaskCorpusSnapshot(progressCallback);
		const config = snapshot.config;
		const statuses = (config?.statuses || DEFAULT_STATUSES) as string[];
		const priorities = config?.priorities ?? [];
		if (!snapshot.identityIndex) throw new Error("Task corpus identity index was not initialized");
		const tasks = snapshot.identityIndex.getTasks(true);

		// Load drafts
		progressCallback?.("Loading drafts...");
		const drafts = await this.fs.listDrafts();

		return { tasks, drafts, statuses: statuses as string[], priorities };
	}

	/**
	 * Load all tasks with cross-branch support
	 * This is the single entry point for loading tasks across all interfaces
	 */
	async loadTasks(
		progressCallback?: (msg: string) => void,
		abortSignal?: AbortSignal,
		options?: { includeCompleted?: boolean },
	): Promise<Task[]> {
		return (
			await this.loadTasksWithStableBranchSnapshot({
				progressCallback,
				abortSignal,
				includeCompleted: options?.includeCompleted,
			})
		).tasks;
	}

	private async loadTaskCorpusSnapshot(
		progressCallback?: (message: string) => void,
		options?: { publishSharedState?: boolean },
	): Promise<TaskCorpusSnapshot> {
		return await this.loadTasksWithStableBranchSnapshot({
			progressCallback,
			includeCompleted: true,
			visibleCompleted: false,
			publishSharedState: options?.publishSharedState,
		});
	}

	/**
	 * The ContentStore's corpus loader. By default its result becomes the shared cross-branch
	 * state; pass { publish: false } for a throwaway load (e.g. resolving one task's identity)
	 * whose result must not be installed on the store's behalf.
	 */
	private async loadContentStoreCorpus(
		progressCallback?: (message: string) => void,
		options?: { publish?: boolean },
	): Promise<TaskCorpusSnapshot> {
		if (Object.hasOwn(this, "loadTasks")) {
			const [activeTasks, completedTasks, config] = await Promise.all([
				this.loadTasks(progressCallback),
				this.fs.listCompletedTasks(),
				this.fs.loadConfig(),
			]);
			const identityIndex = await this.buildTaskIdentityIndex(
				activeTasks,
				completedTasks,
				[],
				config?.statuses ?? [...DEFAULT_STATUSES],
				config?.taskResolutionStrategy ?? "most_progressed",
			);
			return {
				tasks: identityIndex.getTasks(false),
				activeTasks,
				completedTasks,
				identityIndex,
				branchStateEntries: [],
				config,
			};
		}
		return await this.loadTaskCorpusSnapshot(progressCallback, { publishSharedState: options?.publish ?? true });
	}

	private assertTaskLoadNotCancelled(abortSignal?: AbortSignal): void {
		if (abortSignal?.aborted) throw new Error("Loading cancelled");
	}

	private async loadBranchTaskState(
		shouldLoadBranches: boolean,
		config: BacklogConfig | null,
		loader: BranchTaskLoader,
		snapshot: ActiveBranchSnapshot,
		localTasks: Task[],
		includeCompleted: boolean,
		backlogDirName: string,
		progressCallback?: (message: string) => void,
	): Promise<{ entries: BranchTaskStateEntry[]; complete: boolean; backlogDir: string | null }> {
		if (!shouldLoadBranches) return { entries: [], complete: true, backlogDir: null };
		progressCallback?.(getTaskLoadingMessage(config));
		const result = await loader.load(
			snapshot.branchTips,
			config,
			localTasks,
			includeCompleted,
			backlogDirName,
			progressCallback,
			snapshot.currentBranch,
		);
		return { entries: result.entries, complete: result.complete, backlogDir: backlogDirName };
	}

	private retainBranchTaskSnapshot(
		loader: BranchTaskLoader,
		snapshot: ActiveBranchSnapshot,
		config: BacklogConfig | null,
		shouldLoadBranches: boolean,
		backlogDir: string | null,
	): void {
		if (!shouldLoadBranches || !backlogDir) {
			loader.clear();
			return;
		}
		loader.retainSnapshot(snapshot.branchTips, {
			backlogDir,
			prefix: config?.prefixes?.task ?? "task",
			activeBranchDays: config?.activeBranchDays ?? 30,
		});
	}

	private async loadTasksWithStableBranchSnapshot(options: TaskCorpusLoadOptions): Promise<TaskCorpusSnapshot> {
		let retrySnapshot: ActiveBranchSnapshot | undefined;
		for (let attempt = 0; attempt <= 2; attempt += 1) {
			try {
				return await this.loadTaskCorpusSnapshotAttempt(options, retrySnapshot);
			} catch (error) {
				if (!(error instanceof TaskCorpusSnapshotRetry)) throw error;
				retrySnapshot = error.snapshot;
			}
		}
		throw new Error("Project root or active branch refs kept changing while tasks were loading");
	}

	/** One stable corpus read; its caller owns the bounded retry policy. */
	private async loadTaskCorpusSnapshotAttempt(
		options: TaskCorpusLoadOptions,
		retrySnapshot?: ActiveBranchSnapshot,
	): Promise<TaskCorpusSnapshot> {
		const { progressCallback, abortSignal } = options;
		const generation = this.projectGeneration;
		const filesystem = this.fs;
		const git = this.git;
		const branchTaskLoader = this.branchTaskLoader;
		const projectRoot = filesystem.rootDir;
		const backlogRoot = filesystem.backlogDir;
		const projectChanged = () =>
			generation !== this.projectGeneration ||
			filesystem !== this.fs ||
			git !== this.git ||
			branchTaskLoader !== this.branchTaskLoader ||
			projectRoot !== this.fs.rootDir ||
			backlogRoot !== filesystem.backlogDir;
		const assertCurrentProject = () => {
			if (projectChanged()) throw new TaskCorpusSnapshotRetry();
		};

		const config = await filesystem.loadConfig();
		assertCurrentProject();
		git.setConfig(config);
		// A cancelled load must not wait out the fetch timeout before noticing.
		this.assertTaskLoadNotCancelled(abortSignal);
		await this.refreshRemoteRefsForTaskRead(config, { force: options.forceRemoteRefresh });
		assertCurrentProject();
		const settingsKey = JSON.stringify(this.getActiveBranchSettings(config));
		const snapshotBefore =
			retrySnapshot?.settingsKey === settingsKey ? retrySnapshot : await this.getActiveBranchSnapshot(config);
		assertCurrentProject();
		const statuses = config?.statuses || [...DEFAULT_STATUSES];
		const resolutionStrategy = config?.taskResolutionStrategy || "most_progressed";
		const includeCompleted = options.includeCompleted ?? false;
		const shouldLoadBranches = config?.checkActiveBranches !== false && config?.filesystemOnly !== true;

		this.assertTaskLoadNotCancelled(abortSignal);

		// Load local filesystem tasks first (needed for optimization)
		const [localTasks, completedTasks] = await Promise.all([
			this.listTasksWithMetadata(false, filesystem, git),
			filesystem.listCompletedTasks(),
		]);
		assertCurrentProject();

		this.assertTaskLoadNotCancelled(abortSignal);
		const branchLoad = await this.loadBranchTaskState(
			shouldLoadBranches,
			config,
			branchTaskLoader,
			snapshotBefore,
			localTasks,
			includeCompleted,
			filesystem.backlogDirName,
			progressCallback,
		);
		assertCurrentProject();

		this.assertTaskLoadNotCancelled(abortSignal);

		if (shouldLoadBranches) {
			progressCallback?.("Applying latest task states from branch scans...");
		}
		const identityIndex = await this.buildTaskIdentityIndex(
			localTasks,
			completedTasks,
			branchLoad.entries,
			statuses,
			resolutionStrategy,
			undefined,
			filesystem,
			git,
		);
		assertCurrentProject();
		const filteredTasks = identityIndex.getTasks(options.visibleCompleted ?? includeCompleted);

		// This read must begin after this scan finishes. Reusing an unrelated
		// in-flight pre-scan snapshot could otherwise publish a generation that
		// moved while immutable commit trees were still being indexed.
		const snapshotAfter = await this.computeActiveBranchSnapshot(await filesystem.loadConfig());
		assertCurrentProject();
		if (snapshotBefore.stabilityFingerprint !== snapshotAfter.stabilityFingerprint) {
			throw new TaskCorpusSnapshotRetry(snapshotAfter);
		}
		// Only the corpus this Core installs into its ContentStore may advance shared
		// freshness state. A standalone load (statistics, ID allocation, a TUI board
		// read) that publishes its refs would make every later read believe the store
		// already holds them and serve the older corpus until the refs move again.
		// Healthy branches remain publishable after a partial read, but an
		// incomplete generation must retry even while its refs stay unchanged.
		if (options.publishSharedState) {
			this.activeBranchFingerprint = branchLoad.complete ? snapshotAfter.fingerprint : null;
		}
		this.retainBranchTaskSnapshot(branchTaskLoader, snapshotAfter, config, shouldLoadBranches, branchLoad.backlogDir);
		return {
			tasks: filteredTasks,
			activeTasks: localTasks,
			completedTasks,
			identityIndex,
			branchStateEntries: branchLoad.entries,
			config,
		};
	}
}

/**
 * Builds a Core bound to the project every interface resolves the same way: the runtime working
 * directory (`--cwd`/`BACKLOG_CWD`, else `process.cwd()`), then walked up to the project root just
 * like the CLI commands do. When no project is found the resolved directory is used as-is, so
 * callers keep degrading to their own fallbacks instead of failing.
 * Prefer passing an existing Core; use this only where no instance is available.
 */
export async function createRuntimeCore(options?: { enableWatchers?: boolean }): Promise<Core> {
	const { cwd } = await resolveRuntimeCwd();
	return new Core((await findBacklogRoot(cwd)) ?? cwd, options);
}
