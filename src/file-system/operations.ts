import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import lockfile from "proper-lockfile";
import { DEFAULT_DIRECTORIES, DEFAULT_FILES, FALLBACK_STATUS } from "../constants/index.ts";
import { parseDecision, parseDocument, parseTask, TaskDependenciesParseError } from "../markdown/parser.ts";
import { serializeDecision, serializeDocument, serializeTask } from "../markdown/serializer.ts";
import type { BacklogConfig, Decision, Document, Milestone, Task, TaskListFilter } from "../types/index.ts";
import type { BacklogConfigSource } from "../utils/backlog-directory.ts";
import {
	normalizeProjectBacklogDirectory,
	resolveBacklogDirectory,
	resolveBacklogDirectoryFromRootConfig,
} from "../utils/backlog-directory.ts";
import { findDecisionById } from "../utils/decision-id.ts";
import { documentIdsEqual, findDocumentById, normalizeDocumentId } from "../utils/document-id.ts";
import { normalizeDocumentRelativePath, normalizeDocumentSubPath } from "../utils/document-path.ts";
import type { DraftIdentityFindings } from "../utils/duplicate-detection.ts";
import { AmbiguousIdError, isAmbiguousIdError } from "../utils/entity-id.ts";
import {
	buildGlobPattern,
	extractAnyPrefix,
	filenameMatchesId,
	generateNextId,
	idForFilename,
	normalizeId,
} from "../utils/prefix-config.ts";
import { withoutVacatedTaskLinks } from "../utils/task-links.ts";
import {
	AmbiguousTaskIdError,
	draftIdsMatchLoosely,
	extractDraftIdFromFilename,
	findDuplicateDraftFilenameGroups,
	getTaskFilename,
	getTaskPath,
	isAmbiguousTaskIdError,
	normalizeTaskIdentity,
	taskIdsEqual,
} from "../utils/task-path.ts";
import { applyTaskFilters } from "../utils/task-search.ts";
import { sortByTaskId } from "../utils/task-sorting.ts";
import { isConfigValueError, normalizedDefinitionOfDone, parseConfig, serializeConfig } from "./config.ts";
import { MilestoneStore } from "./milestones.ts";

// Interface for task path resolution context
interface TaskPathContext {
	filesystem: {
		tasksDir: string;
		completedDir?: string;
	};
}

interface CreateLockOptions {
	timeoutMs?: number;
	retryDelayMs?: number;
	staleMs?: number;
}

interface CreateLockTarget {
	targetPath: string;
	locksDir: string;
}

interface LockAttemptSettings {
	staleMs: number;
	retries: number;
	retryDelayMs: number;
}

/** True when an error already explains an unreadable config value, so it needs no extra framing. */
export { isConfigValueError };

const DEFAULT_CREATE_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_CREATE_LOCK_RETRY_DELAY_MS = 100;
const DEFAULT_CREATE_LOCK_STALE_MS = 10_000;
const TASK_FILE_READ_CONCURRENCY = 32;

interface ParsedTaskFile {
	content: string;
	task: Task;
}

const CREATE_LOCK_ERROR_CODE = "ECREATELOCK";
export const CREATE_LOCK_ERROR_MESSAGE =
	"Another task create/promote/demote operation is already in progress. Please try again.";

const CREATE_LOCK_ERROR_NAME = "CreateLockError";
const TASK_LOCK_ERROR_NAME = "TaskLockError";
const TASK_LOCK_ERROR_CODE = "ETASKLOCK";

function lockError(name: string, code: string, message: string, cause?: unknown): Error {
	const error = new Error(message, cause === undefined ? undefined : { cause }) as Error & { code?: string };
	error.name = name;
	error.code = code;
	return error;
}

function isLockError(error: unknown, name: string, code: string): error is Error {
	return error instanceof Error && error.name === name && (error as Error & { code?: string }).code === code;
}

function createLockError(message: string, cause?: unknown): Error {
	return lockError(CREATE_LOCK_ERROR_NAME, CREATE_LOCK_ERROR_CODE, message, cause);
}

function taskLockError(message: string, cause?: unknown): Error {
	return lockError(TASK_LOCK_ERROR_NAME, TASK_LOCK_ERROR_CODE, message, cause);
}

/**
 * Records a directory-level listing failure so callers can report it instead of treating an
 * unreadable directory as an empty one. A directory that does not exist yet is normal and is
 * reported as empty; anything else means the contents could not be inspected. The empty string
 * denotes the content directory itself.
 */
function recordUnreadableDirectory(error: unknown, unreadable?: string[]): void {
	if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return;
	unreadable?.push("");
}

export function isCreateLockError(error: unknown): error is Error {
	return isLockError(error, CREATE_LOCK_ERROR_NAME, CREATE_LOCK_ERROR_CODE);
}

export function isTaskLockError(error: unknown): error is Error {
	return isLockError(error, TASK_LOCK_ERROR_NAME, TASK_LOCK_ERROR_CODE);
}

/** Raises the shared fail-fast lock failure for contention detected outside an acquisition. */
export function newTaskLockError(taskId: string): Error {
	return taskLockError(taskLockErrorMessage(taskId));
}

export function taskLockErrorMessage(taskId: string): string {
	return `Edit failed: ${taskId} is being modified by another process; retry if appropriate.`;
}

/**
 * The only handle through which a draft may be read or mutated: the exact file plus the id
 * derived from that file's name. Nothing may re-resolve a draft id to a different path.
 */
export interface DraftFileReference {
	filePath: string;
	canonicalId: string;
}

export class DraftParseError extends Error {
	constructor(filename: string) {
		super(`Draft file ${filename} could not be parsed. Repair or remove the file, then rerun the edit.`);
		this.name = "DraftParseError";
	}
}

export class DraftIdentityError extends Error {
	constructor(filename: string, frontmatterId: string, filenameId: string | null) {
		super(
			`Draft file ${filename} declares frontmatter id ${frontmatterId}, which does not match its filename id ${filenameId ?? "(unreadable)"}. Fix the frontmatter id or rename the file so they agree, then rerun the edit.`,
		);
		this.name = "DraftIdentityError";
	}
}

export class FileSystem {
	private resolvedBacklogDir: string;
	private resolvedBacklogDirName: string;
	private resolvedConfigPath: string;
	private configSource: BacklogConfigSource;
	private readonly projectRoot: string;
	private cachedConfig: BacklogConfig | null = null;
	private cachedConfigSnapshot: { path: string; content: string } | null = null;
	private readonly parsedTaskFiles = new Map<string, ParsedTaskFile>();
	private taskParseCacheEpoch = 0;
	private taskFileReadGeneration = 0;
	private readonly taskFileReadGenerations = new Map<string, number>();
	private activeTaskFileReads = 0;
	private readonly pendingTaskFileReads: Array<() => void> = [];
	private readonly milestones: MilestoneStore;

	constructor(projectRoot: string) {
		this.projectRoot = projectRoot;
		const resolution = resolveBacklogDirectory(projectRoot);
		this.resolvedBacklogDirName = resolution.backlogDir ?? DEFAULT_DIRECTORIES.BACKLOG;
		this.resolvedBacklogDir = resolution.backlogPath ?? join(projectRoot, DEFAULT_DIRECTORIES.BACKLOG);
		this.resolvedConfigPath = resolution.configPath ?? join(this.resolvedBacklogDir, DEFAULT_FILES.CONFIG);
		this.configSource = resolution.configSource ?? "folder";
		this.milestones = new MilestoneStore({
			activeDirectory: () => this.getMilestonesDir(),
			archiveDirectory: () => this.getArchiveMilestonesDir(),
			ensureDirectory: (directory) => this.ensureDirectoryExists(directory),
			withCreateLock: (operation) => this.withCreateLock(operation),
		});
	}

	private async getBacklogDir(): Promise<string> {
		return this.resolvedBacklogDir;
	}

	// Public accessors for directory paths
	get backlogDir(): string {
		return this.resolvedBacklogDir;
	}
	get backlogDirName(): string {
		return this.resolvedBacklogDirName;
	}
	get tasksDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.TASKS);
	}
	get completedDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.COMPLETED);
	}

	get archiveTasksDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.ARCHIVE_TASKS);
	}
	get archiveMilestonesDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.ARCHIVE_MILESTONES);
	}
	get decisionsDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.DECISIONS);
	}

	get docsDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.DOCS);
	}

	get milestonesDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.MILESTONES);
	}

	get configFilePath(): string {
		return this.resolvedConfigPath;
	}

	/** Get the project root directory */
	get rootDir(): string {
		return this.projectRoot;
	}

	invalidateConfigCache(): void {
		this.cachedConfig = null;
		this.cachedConfigSnapshot = null;
		this.refreshConfigResolution();
	}

	getCachedConfigContent(sourceConfigPath: string): string | null {
		return this.cachedConfigSnapshot && resolve(this.cachedConfigSnapshot.path) === resolve(sourceConfigPath)
			? this.cachedConfigSnapshot.content
			: null;
	}

	publishConfig(config: BacklogConfig, sourceConfigPath: string, content: string): boolean {
		const rootConfigPath = join(this.projectRoot, DEFAULT_FILES.ROOT_CONFIG);
		if (resolve(sourceConfigPath) === resolve(rootConfigPath)) {
			if (config.backlogDirectory !== undefined && normalizeProjectBacklogDirectory(config.backlogDirectory) === null) {
				return false;
			}
			const resolution = resolveBacklogDirectoryFromRootConfig(this.projectRoot, config.backlogDirectory);
			if (!resolution.backlogDir || !resolution.backlogPath || resolution.configSource !== "root") {
				return false;
			}
			this.applyConfigResolution(resolution);
		}
		this.cachedConfig = config;
		this.cachedConfigSnapshot = { path: sourceConfigPath, content };
		return true;
	}

	private refreshConfigResolution(): void {
		this.applyConfigResolution(resolveBacklogDirectory(this.projectRoot));
	}

	private applyConfigResolution(resolution: ReturnType<typeof resolveBacklogDirectory>): void {
		const backlogDirName = resolution.backlogDir ?? DEFAULT_DIRECTORIES.BACKLOG;
		const backlogDir = resolution.backlogPath ?? join(this.projectRoot, DEFAULT_DIRECTORIES.BACKLOG);
		if (resolve(backlogDir) !== resolve(this.resolvedBacklogDir)) {
			this.invalidateTaskParseCache();
		}
		this.resolvedBacklogDirName = backlogDirName;
		this.resolvedBacklogDir = backlogDir;
		this.resolvedConfigPath = resolution.configPath ?? join(this.resolvedBacklogDir, DEFAULT_FILES.CONFIG);
		this.configSource = resolution.configSource ?? "folder";
	}

	setBacklogDirectory(backlogDir: string): void {
		const normalized = normalizeProjectBacklogDirectory(backlogDir);
		if (!normalized) {
			throw new Error("Backlog directory must be a project-relative path.");
		}
		const nextBacklogDir = join(this.projectRoot, normalized);
		if (resolve(nextBacklogDir) !== resolve(this.resolvedBacklogDir)) {
			this.invalidateTaskParseCache();
		}
		this.resolvedBacklogDirName = normalized;
		this.resolvedBacklogDir = nextBacklogDir;
		if (this.configSource === "folder") {
			this.resolvedConfigPath = join(this.resolvedBacklogDir, DEFAULT_FILES.CONFIG);
		}
	}

	private invalidateTaskParseCache(): void {
		this.taskParseCacheEpoch++;
		this.parsedTaskFiles.clear();
		this.taskFileReadGenerations.clear();
	}

	setConfigLocation(configSource: BacklogConfigSource): void {
		this.configSource = configSource;
		this.resolvedConfigPath =
			configSource === "root"
				? join(this.projectRoot, DEFAULT_FILES.ROOT_CONFIG)
				: join(this.resolvedBacklogDir, DEFAULT_FILES.CONFIG);
	}

	resolveBacklogDirectoryInfo() {
		return resolveBacklogDirectory(this.projectRoot);
	}

	private async getTasksDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.TASKS);
	}

	async getDraftsDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.DRAFTS);
	}

	async getArchiveTasksDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_TASKS);
	}

	private async getArchiveMilestonesDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_MILESTONES);
	}

	private async getArchiveDraftsDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_DRAFTS);
	}

	private async getDecisionsDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.DECISIONS);
	}

	private async getDocsDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.DOCS);
	}

	private async getMilestonesDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.MILESTONES);
	}

	private async getCompletedDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.COMPLETED);
	}

	async ensureBacklogStructure(): Promise<void> {
		const backlogDir = await this.getBacklogDir();
		const directories = [
			backlogDir,
			join(backlogDir, DEFAULT_DIRECTORIES.TASKS),
			join(backlogDir, DEFAULT_DIRECTORIES.DRAFTS),
			join(backlogDir, DEFAULT_DIRECTORIES.COMPLETED),
			join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_TASKS),
			join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_DRAFTS),
			join(backlogDir, DEFAULT_DIRECTORIES.MILESTONES),
			join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_MILESTONES),
			join(backlogDir, DEFAULT_DIRECTORIES.DOCS),
			join(backlogDir, DEFAULT_DIRECTORIES.DECISIONS),
		];

		for (const dir of directories) {
			try {
				await mkdir(dir, { recursive: true });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				if (!(await stat(dir)).isDirectory()) throw error;
			}
		}
	}

	private toCreateLockError(error: unknown): Error {
		if (isCreateLockError(error)) {
			return error;
		}

		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === "ELOCKED") {
			return createLockError(CREATE_LOCK_ERROR_MESSAGE, error);
		}
		if (code === "ECOMPROMISED") {
			return createLockError("Task creation lock was interrupted. Please try again.", error);
		}
		return error instanceof Error ? error : new Error(String(error));
	}

	private toTaskLockError(error: unknown, taskId: string): Error {
		if (isTaskLockError(error)) {
			return error;
		}

		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === "ELOCKED") {
			return taskLockError(taskLockErrorMessage(taskId), error);
		}
		if (code === "ENOENT") {
			// The file was moved or removed between loading the snapshot and locking it.
			return taskLockError(`Edit failed: ${taskId} was moved or removed by another process.`, error);
		}
		if (code === "ECOMPROMISED") {
			return taskLockError(`Edit failed: the lock on ${taskId} was interrupted; retry if appropriate.`, error);
		}
		return error instanceof Error ? error : new Error(String(error));
	}

	private async getGitCommonDir(): Promise<string | null> {
		try {
			const config = await this.loadConfig();
			if (config?.filesystemOnly) {
				return null;
			}
		} catch {
			// If config cannot be read, still try git and fall back to the backlog directory on failure.
		}

		try {
			const subprocess = Bun.spawn(["git", "rev-parse", "--git-common-dir"], {
				cwd: this.projectRoot,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "ignore",
				env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } as Record<string, string>,
			});
			const stdoutPromise = subprocess.stdout ? new Response(subprocess.stdout).text() : Promise.resolve("");
			const [exitCode, stdout] = await Promise.all([subprocess.exited, stdoutPromise]);
			if (exitCode !== 0) return null;
			const commonDir = stdout.trim();
			if (!commonDir) return null;
			return isAbsolute(commonDir) ? commonDir : resolve(this.projectRoot, commonDir);
		} catch {
			return null;
		}
	}

	private async getCreateLockTarget(backlogDir: string): Promise<CreateLockTarget> {
		const commonGitDir = await this.getGitCommonDir();
		if (commonGitDir) {
			return {
				targetPath: commonGitDir,
				locksDir: join(commonGitDir, "backlog.md", "locks"),
			};
		}

		return {
			targetPath: backlogDir,
			locksDir: join(backlogDir, ".locks"),
		};
	}

	// Uses a maintained lockfile with stale-lock recovery; USE_GLOBAL_TASK_ID_LOCK=false restores legacy behavior.
	async withCreateLock<T>(fn: () => Promise<T>, options: CreateLockOptions = {}): Promise<T> {
		if (process.env.USE_GLOBAL_TASK_ID_LOCK?.toLowerCase() === "false") {
			return await fn();
		}

		const backlogDir = await this.getBacklogDir();
		const lockTarget = await this.getCreateLockTarget(backlogDir);
		const timeoutMs = options.timeoutMs ?? DEFAULT_CREATE_LOCK_TIMEOUT_MS;
		const retryDelayMs = options.retryDelayMs ?? DEFAULT_CREATE_LOCK_RETRY_DELAY_MS;
		return await this.withLockTarget(
			lockTarget.targetPath,
			join(lockTarget.locksDir, "create"),
			{
				staleMs: options.staleMs ?? DEFAULT_CREATE_LOCK_STALE_MS,
				retryDelayMs,
				retries: Math.max(Math.ceil(timeoutMs / retryDelayMs) - 1, 0),
			},
			(error) => this.toCreateLockError(error),
			fn,
		);
	}

	/**
	 * Per-task counterpart of the create lock, used to serialize a task's read-modify-write.
	 * It fails fast instead of waiting: on contention the caller (human or agent) decides
	 * whether to retry, and nothing is merged or overwritten behind their back.
	 *
	 * The lock target is the task file itself because proper-lockfile keys its in-process
	 * lock registry by target path: a shared target with per-task lockfile paths would
	 * clobber concurrent locks held by one process. Unlike the create lock, the lockfile
	 * lives under this project's backlog directory rather than the shared git common dir:
	 * an edit protects one file, so sibling worktrees editing their own copy of a task must
	 * not fail each other. USE_GLOBAL_TASK_ID_LOCK=false bypasses it like the create lock.
	 */
	async withTaskLock<T>(task: Pick<Task, "id" | "filePath">, fn: () => Promise<T>): Promise<T> {
		if (process.env.USE_GLOBAL_TASK_ID_LOCK?.toLowerCase() === "false") {
			return await fn();
		}

		const filePath = task.filePath?.trim();
		if (!filePath) {
			throw new Error(`Cannot lock task ${task.id} for editing without its file path.`);
		}
		return await this.withEntityFileLock("task", task.id, filePath, fn);
	}

	/**
	 * Draft counterpart of the per-task lock. The lock key is namespaced by store so a project
	 * whose task prefix is "draft" does not make an unrelated task contend with its draft twin,
	 * while two editors of the same draft file still fail fast against each other.
	 */
	async withDraftLock<T>(reference: DraftFileReference, fn: () => Promise<T>): Promise<T> {
		if (process.env.USE_GLOBAL_TASK_ID_LOCK?.toLowerCase() === "false") {
			return await fn();
		}
		return await this.withEntityFileLock("draft", reference.canonicalId, reference.filePath, fn);
	}

	private async withEntityFileLock<T>(
		scope: "task" | "draft",
		entityId: string,
		filePath: string,
		fn: () => Promise<T>,
	): Promise<T> {
		const lockKey = entityId
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^\.+/, "");
		return await this.withLockTarget(
			filePath,
			join(await this.getBacklogDir(), ".locks", `${scope}-${lockKey || "unknown"}`),
			{ staleMs: DEFAULT_CREATE_LOCK_STALE_MS, retries: 0, retryDelayMs: 0 },
			(error) => this.toTaskLockError(error, entityId),
			fn,
		);
	}

	/**
	 * Hold a stable set of task locks for one operation. The callback runs only after every
	 * lock is acquired, so a contended task cannot leave an earlier write from a bulk operation
	 * on disk. Sorting also keeps multi-task operations from acquiring the same locks in opposite
	 * orders and deadlocking each other.
	 */
	async withTaskLocks<T>(tasks: Array<Pick<Task, "id" | "filePath">>, fn: () => Promise<T>): Promise<T> {
		const uniqueTasks = Array.from(new Map(tasks.map((task) => [task.id.trim().toLowerCase(), task])).values()).sort(
			(left, right) => left.id.localeCompare(right.id),
		);

		const acquire = async (index: number): Promise<T> => {
			const task = uniqueTasks[index];
			if (!task) return await fn();
			return await this.withTaskLock(task, async () => await acquire(index + 1));
		};

		return await acquire(0);
	}

	private async withLockTarget<T>(
		targetPath: string,
		lockDir: string,
		settings: LockAttemptSettings,
		toError: (error: unknown) => Error,
		fn: () => Promise<T>,
	): Promise<T> {
		await mkdir(dirname(lockDir), { recursive: true });

		let release: (() => Promise<void>) | undefined;
		try {
			release = await lockfile.lock(targetPath, {
				lockfilePath: lockDir,
				realpath: true,
				stale: Math.max(settings.staleMs, 2_000),
				retries: {
					retries: settings.retries,
					factor: 1,
					minTimeout: settings.retryDelayMs,
					maxTimeout: settings.retryDelayMs,
					randomize: false,
				},
			});
		} catch (error) {
			throw toError(error);
		}

		try {
			const result = await fn();
			try {
				await release?.();
			} catch (error) {
				throw toError(error);
			}
			return result;
		} catch (error) {
			if (release) {
				try {
					await release();
				} catch {
					// Preserve the original operation error if lock cleanup also fails.
				}
			}
			throw error;
		}
	}

	// Task operations
	private async resolveTaskWriteTarget(
		task: Task,
		isDraft = false,
	): Promise<{ id: string; filename: string; filePath: string }> {
		let prefix = isDraft ? "draft" : extractAnyPrefix(task.id);
		if (!prefix) prefix = (await this.loadConfig())?.prefixes?.task ?? "task";
		const id = normalizeId(task.id, prefix);
		const filename = `${idForFilename(id)} - ${this.sanitizeFilename(task.title)}.md`;
		const directory = isDraft ? await this.getDraftsDir() : await this.getTasksDir();
		const preservesPath = !isDraft && typeof task.filePath === "string" && task.filePath.trim().length > 0;
		return { id, filename, filePath: preservesPath ? (task.filePath as string) : join(directory, filename) };
	}

	async getTaskWritePath(task: Task, isDraft = false): Promise<string> {
		return (await this.resolveTaskWriteTarget(task, isDraft)).filePath;
	}

	async saveTask(task: Task): Promise<string> {
		const { id: taskId, filename, filePath: filepath } = await this.resolveTaskWriteTarget(task);
		const prefix = extractAnyPrefix(taskId) ?? "task";
		const tasksDir = await this.getTasksDir();
		const shouldPreservePath = typeof task.filePath === "string" && task.filePath.trim().length > 0;
		let existingTask: Task | null = null;

		if (shouldPreservePath) {
			try {
				existingTask = parseTask(await Bun.file(filepath).text());
			} catch (error) {
				if (error instanceof TaskDependenciesParseError) throw error;
				existingTask = null;
			}
		}

		const persistedTaskId = existingTask?.id && taskIdsEqual(existingTask.id, task.id) ? existingTask.id : taskId;
		const normalizedParentTaskId = task.parentTaskId
			? normalizeId(task.parentTaskId, extractAnyPrefix(task.parentTaskId) ?? prefix)
			: undefined;
		const persistedParentTaskId =
			existingTask?.parentTaskId && task.parentTaskId && taskIdsEqual(existingTask.parentTaskId, task.parentTaskId)
				? existingTask.parentTaskId
				: normalizedParentTaskId;

		// Normalize new task IDs before serialization, but preserve existing file identity on updates.
		const normalizedTask = {
			...task,
			id: persistedTaskId,
			parentTaskId: persistedParentTaskId,
		};
		const content = serializeTask(normalizedTask);

		if (!shouldPreservePath) {
			// Delete any existing task files with the same ID but different filenames
			try {
				const core = { filesystem: { tasksDir } };
				const existingPath = await getTaskPath(taskId, core as TaskPathContext);
				if (existingPath && !existingPath.endsWith(filename)) {
					await unlink(existingPath);
				}
			} catch (error) {
				if (isAmbiguousTaskIdError(error)) throw error;
				// Ignore errors if no existing files found
			}
		}

		await this.ensureDirectoryExists(dirname(filepath));
		await Bun.write(filepath, content);
		return filepath;
	}

	async loadTask(taskId: string): Promise<Task | null> {
		try {
			const tasksDir = await this.getTasksDir();
			const [activeTasks, completedTasks] = await Promise.all([this.listTasks(), this.listCompletedTasks()]);
			const identityMatches = [...activeTasks, ...completedTasks].filter((task) => taskIdsEqual(taskId, task.id));
			if (identityMatches.length > 1) {
				throw new AmbiguousTaskIdError(
					taskId,
					identityMatches.map((task) => task.filePath ?? task.id),
				);
			}
			const activeMatch = activeTasks.find((task) => taskIdsEqual(taskId, task.id));
			if (activeMatch?.filePath) return activeMatch;
			if (identityMatches.length === 1) return null;

			const core = { filesystem: { tasksDir, completedDir: this.completedDir } };
			const filepath = await getTaskPath(taskId, core as TaskPathContext);

			if (!filepath) return null;

			const content = await Bun.file(filepath).text();
			const task = normalizeTaskIdentity(parseTask(content));
			return { ...task, filePath: filepath };
		} catch (error) {
			if (isAmbiguousTaskIdError(error) || error instanceof TaskDependenciesParseError) throw error;
			return null;
		}
	}

	private async withTaskFileReadSlot<T>(read: () => Promise<T>): Promise<T> {
		if (this.activeTaskFileReads < TASK_FILE_READ_CONCURRENCY) {
			this.activeTaskFileReads++;
		} else {
			await new Promise<void>((resolve) => this.pendingTaskFileReads.push(resolve));
		}

		try {
			return await read();
		} finally {
			const next = this.pendingTaskFileReads.shift();
			if (next) {
				// Transfer this slot directly to the next reader before it resumes.
				next();
			} else {
				this.activeTaskFileReads--;
			}
		}
	}

	/** Re-read for freshness, but only reparse when the exact text changed. */
	private async readParsedTaskFile(filepath: string, cacheEpoch = this.taskParseCacheEpoch): Promise<Task> {
		const cacheKey = resolve(filepath);
		const generation = ++this.taskFileReadGeneration;
		if (cacheEpoch === this.taskParseCacheEpoch) {
			this.taskFileReadGenerations.set(cacheKey, generation);
		}
		const content = await this.withTaskFileReadSlot(async () => await Bun.file(filepath).text());
		const cached = this.parsedTaskFiles.get(cacheKey);
		if (cached?.content === content) {
			return structuredClone(cached.task);
		}

		const parsed = parseTask(content);
		if (cacheEpoch === this.taskParseCacheEpoch && this.taskFileReadGenerations.get(cacheKey) === generation) {
			this.parsedTaskFiles.set(cacheKey, { content, task: parsed });
		}
		// Task consumers mutate nested lists while preparing edits and branch metadata.
		return structuredClone(parsed);
	}

	private async readTaskFiles(
		directory: string,
		files: string[],
		options: { normalizeIdentity: boolean; debugLabel: string },
		cacheEpoch = this.taskParseCacheEpoch,
	): Promise<Task[]> {
		const directoryPath = resolve(directory);
		const livePaths = new Set(files.map((file) => resolve(directory, file)));
		if (cacheEpoch === this.taskParseCacheEpoch) {
			const trackedPaths = new Set([...this.parsedTaskFiles.keys(), ...this.taskFileReadGenerations.keys()]);
			for (const trackedPath of trackedPaths) {
				if (dirname(trackedPath) === directoryPath && !livePaths.has(trackedPath)) {
					this.parsedTaskFiles.delete(trackedPath);
					this.taskFileReadGenerations.delete(trackedPath);
				}
			}
		}

		const tasks = new Array<Task | undefined>(files.length);
		let nextIndex = 0;
		const worker = async () => {
			while (nextIndex < files.length) {
				const index = nextIndex++;
				const file = files[index];
				if (!file) continue;
				const filepath = join(directory, file);
				try {
					const parsed = await this.readParsedTaskFile(filepath, cacheEpoch);
					const task = options.normalizeIdentity ? normalizeTaskIdentity(parsed) : parsed;
					tasks[index] = { ...task, filePath: filepath };
				} catch (error) {
					if (process.env.DEBUG) {
						console.error(`Failed to parse ${options.debugLabel} ${filepath}`, error);
					}
				}
			}
		};

		await Promise.all(Array.from({ length: Math.min(TASK_FILE_READ_CONCURRENCY, files.length) }, () => worker()));
		return tasks.filter((task): task is Task => task !== undefined);
	}

	private async listConfiguredTaskFiles(directory: string): Promise<string[]> {
		const config = await this.loadConfig();
		const taskPrefix = (config?.prefixes?.task ?? "task").toLowerCase();
		return await Array.fromAsync(
			new Bun.Glob(buildGlobPattern(taskPrefix)).scan({ cwd: directory, followSymlinks: true }),
		);
	}

	async listTasks(filter?: TaskListFilter): Promise<Task[]> {
		const cacheEpoch = this.taskParseCacheEpoch;
		let tasksDir: string;
		try {
			tasksDir = await this.getTasksDir();
		} catch (_error) {
			return [];
		}

		let taskFiles: string[];
		try {
			taskFiles = await this.listConfiguredTaskFiles(tasksDir);
		} catch (_error) {
			return [];
		}

		let tasks = await this.readTaskFiles(
			tasksDir,
			taskFiles,
			{
				normalizeIdentity: true,
				debugLabel: "task file",
			},
			cacheEpoch,
		);

		if (filter) tasks = applyTaskFilters(tasks, filter);

		return sortByTaskId(tasks);
	}

	async listCompletedTasks(): Promise<Task[]> {
		const cacheEpoch = this.taskParseCacheEpoch;
		let completedDir: string;
		try {
			completedDir = await this.getCompletedDir();
		} catch (_error) {
			return [];
		}

		let taskFiles: string[];
		try {
			taskFiles = await this.listConfiguredTaskFiles(completedDir);
		} catch (_error) {
			return [];
		}

		const tasks = await this.readTaskFiles(
			completedDir,
			taskFiles,
			{
				normalizeIdentity: false,
				debugLabel: "completed task file",
			},
			cacheEpoch,
		);

		return sortByTaskId(tasks);
	}

	async listArchivedTasks(): Promise<Task[]> {
		let archiveTasksDir: string;
		try {
			archiveTasksDir = await this.getArchiveTasksDir();
		} catch (_error) {
			return [];
		}

		let taskFiles: string[];
		try {
			taskFiles = await this.listConfiguredTaskFiles(archiveTasksDir);
		} catch (_error) {
			return [];
		}

		const tasks = await this.readTaskFiles(archiveTasksDir, taskFiles, {
			normalizeIdentity: false,
			debugLabel: "archived task file",
		});

		return sortByTaskId(tasks);
	}

	async archiveTask(taskId: string): Promise<boolean> {
		try {
			const tasksDir = await this.getTasksDir();
			const archiveTasksDir = await this.getArchiveTasksDir();
			const core = { filesystem: { tasksDir, completedDir: this.completedDir } };
			const sourcePath = await getTaskPath(taskId, core as TaskPathContext);
			const taskFile = await getTaskFilename(taskId, core as TaskPathContext);

			if (!sourcePath || !taskFile) return false;

			const targetPath = join(archiveTasksDir, taskFile);

			// Ensure target directory exists
			await this.ensureDirectoryExists(dirname(targetPath));

			// Use rename for proper Git move detection
			await rename(sourcePath, targetPath);

			return true;
		} catch (error) {
			if (isAmbiguousTaskIdError(error)) throw error;
			return false;
		}
	}

	async completeTask(taskId: string): Promise<boolean> {
		try {
			const tasksDir = await this.getTasksDir();
			const completedDir = await this.getCompletedDir();
			const core = { filesystem: { tasksDir, completedDir } };
			const sourcePath = await getTaskPath(taskId, core as TaskPathContext);
			const taskFile = await getTaskFilename(taskId, core as TaskPathContext);

			if (!sourcePath || !taskFile) return false;

			const targetPath = join(completedDir, taskFile);

			// Ensure target directory exists
			await this.ensureDirectoryExists(dirname(targetPath));

			// Use rename for proper Git move detection
			await rename(sourcePath, targetPath);

			return true;
		} catch (error) {
			if (isAmbiguousTaskIdError(error)) throw error;
			return false;
		}
	}

	async archiveDraft(draftId: string): Promise<{ sourcePath: string; targetPath: string } | null> {
		// Whole-file operation: the argument names the file to move, so filename binding is the
		// identity that matters and frontmatter equivalence is not required. The draft lock spans
		// read-copy-unlink so a concurrent edit cannot be archived in pre-edit form or lost.
		const sourcePath = await this.resolveDraftFilePath(draftId);
		if (!sourcePath) return null;
		const canonicalId = extractDraftIdFromFilename(basename(sourcePath));
		if (!canonicalId) return null;
		const archiveDraftsDir = await this.getArchiveDraftsDir();

		return await this.withDraftLock({ filePath: sourcePath, canonicalId }, async () => {
			const filename = basename(sourcePath);
			const targetPath = join(archiveDraftsDir, filename);

			const content = await Bun.file(sourcePath).text();
			await this.ensureDirectoryExists(dirname(targetPath));
			await Bun.write(targetPath, content);

			await unlink(sourcePath);

			return { sourcePath, targetPath };
		});
	}

	/**
	 * Parses one exact draft file path without identity validation; whole-file operations
	 * (archive/promote) are bound by filename and must tolerate frontmatter drift.
	 */
	async loadDraftFromFile(filePath: string): Promise<Task | null> {
		try {
			const task = normalizeTaskIdentity(parseTask(await Bun.file(filePath).text()));
			return { ...task, filePath };
		} catch {
			return null;
		}
	}

	async promoteDraft(draftId: string): Promise<boolean> {
		// Whole-file operation: filename binding decides which file is promoted; frontmatter
		// equivalence is not required. Duplicate numeric identities still fail closed.
		const sourcePath = await this.resolveDraftFilePath(draftId);
		if (!sourcePath) return false;

		try {
			return await this.withCreateLock(async () => {
				const draft = await this.loadDraftFromFile(sourcePath);
				if (!draft) return false;

				// Get task prefix from config (default: "task")
				const config = await this.loadConfig();
				const taskPrefix = config?.prefixes?.task ?? "task";

				// Get existing task IDs to generate next ID
				// Include both active and completed tasks to prevent ID collisions
				const existingTasks = await this.listTasks();
				const completedTasks = await this.listCompletedTasks();
				const existingIds = [...existingTasks, ...completedTasks].map((t) => t.id);

				// Generate new task ID
				const newTaskId = generateNextId(existingIds, taskPrefix, config?.zeroPaddedIds);

				const promotedStatus =
					!draft.status || draft.status.trim().toLowerCase() === "draft"
						? config?.defaultStatus || FALLBACK_STATUS
						: draft.status;

				// Draft-only statuses should enter the normal task workflow.
				const promotedTask: Task = {
					...draft,
					id: newTaskId,
					status: promotedStatus,
					filePath: undefined, // Will be set by saveTask
				};

				await this.saveTask(promotedTask);

				// Delete old draft file
				await unlink(sourcePath);

				return true;
			});
		} catch (error) {
			if (isCreateLockError(error) || isAmbiguousTaskIdError(error)) {
				throw error;
			}
			return false;
		}
	}

	async demoteTask(taskId: string, onMoved?: (fromPath: string, toPath: string) => void): Promise<boolean> {
		return await this.withCreateLock(async () => {
			// Load the task. A missing task is the only false result; filesystem failures must reach
			// callers so the Web API can distinguish an operational failure from a 404.
			const task = await this.loadTask(taskId);
			if (!task?.filePath) return false;

			// Get existing draft IDs to generate next ID
			// Draft prefix is always "draft" (not configurable like task prefix)
			// Occupancy includes filename-derived ids: an unparsable file still reserves its id.
			const [existingDrafts, occupiedFileIds] = await Promise.all([this.listDrafts(), this.listOccupiedDraftFileIds()]);
			const existingIds = [...existingDrafts.map((d) => d.id), ...occupiedFileIds];

			// Generate new draft ID
			const config = await this.loadConfig();
			const newDraftId = generateNextId(existingIds, "draft", config?.zeroPaddedIds);

			// Update task with new draft ID and save as draft. The record's own links are cleaned of
			// the task ID it vacates here: carried into the draft, such a link would rebind to
			// whatever task is allocated that ID next.
			const demotedDraft: Task = {
				...(withoutVacatedTaskLinks(task, task.id) ?? task),
				id: newDraftId,
				filePath: undefined, // Will be set by saveDraft
			};

			const savedPath = await this.saveDraft(demotedDraft);

			// Delete old task file. If that fails, remove the newly written draft so a retry cannot
			// encounter two copies of the task.
			try {
				await unlink(task.filePath);
			} catch (error) {
				try {
					await unlink(savedPath);
				} catch (cleanupError) {
					const failure = error instanceof Error ? error : new Error(String(error));
					(failure as Error & { demotionState?: string }).demotionState = "partial";
					failure.cause = cleanupError;
					throw failure;
				}
				throw error;
			}
			onMoved?.(task.filePath, savedPath);

			return true;
		});
	}

	// Draft operations
	private async listDraftFiles(draftsDir: string): Promise<string[]> {
		return await Array.fromAsync(
			new Bun.Glob(buildGlobPattern("draft")).scan({ cwd: draftsDir, followSymlinks: true }),
		);
	}

	private async readDraftFile(filepath: string): Promise<Task> {
		return { ...normalizeTaskIdentity(parseTask(await Bun.file(filepath).text())), filePath: filepath };
	}

	async saveDraft(task: Task): Promise<string> {
		const { id: draftId, filename, filePath: filepath } = await this.resolveTaskWriteTarget(task, true);
		const draftsDir = await this.getDraftsDir();
		// Normalize the draft ID to uppercase before serialization
		const normalizedTask = { ...task, id: draftId };
		const content = serializeTask(normalizedTask);
		await this.ensureDirectoryExists(dirname(filepath));

		// Remove every existing draft file whose numeric identity matches the saved id but
		// whose filename differs (title change, zero-padding drift): a save must converge
		// to one file instead of breeding duplicates that future edits report as ambiguous.
		// A candidate that fails to parse is never deleted: its identity was not validated,
		// and its content may be a real draft only its filename proclaims. A candidate that
		// cannot be removed aborts the save: writing past it would mint a duplicate identity.
		const filenameId = idForFilename(draftId);
		const existingFiles = await this.listDraftFiles(draftsDir);
		for (const existingFile of existingFiles.filter(
			(f) => f !== filename && (filenameMatchesId(f, filenameId) || draftIdsMatchLoosely(draftId, f)),
		)) {
			const candidatePath = join(draftsDir, existingFile);
			if (!(await this.loadDraftFromFile(candidatePath))) continue;
			try {
				await unlink(candidatePath);
			} catch (error) {
				throw new Error(
					`Could not remove superseded draft file ${existingFile} while saving ${filename}: ${
						error instanceof Error ? error.message : String(error)
					}. No changes were written; resolve the file conflict, then retry.`,
				);
			}
		}

		await Bun.write(filepath, content);
		return filepath;
	}

	async loadDraft(draftId: string): Promise<Task | null> {
		try {
			const filePath = await this.resolveDraftFilePath(draftId);
			if (!filePath) return null;
			return await this.loadDraftFromFile(filePath);
		} catch (error) {
			if (isAmbiguousIdError(error)) throw error;
			return null;
		}
	}

	async listDrafts(): Promise<Task[]> {
		try {
			const draftsDir = await this.getDraftsDir();
			const taskFiles = await this.listDraftFiles(draftsDir);

			const tasks: Task[] = [];
			for (const file of taskFiles) {
				tasks.push(await this.readDraftFile(join(draftsDir, file)));
			}

			return sortByTaskId(tasks);
		} catch {
			return [];
		}
	}

	/**
	 * Lists drafts while skipping individual files that fail to parse, so one damaged
	 * file cannot hide the healthy drafts from interactive selection.
	 */
	async listHealthyDrafts(): Promise<Task[]> {
		try {
			const draftsDir = await this.getDraftsDir();
			const taskFiles = (await this.listDraftFiles(draftsDir)).sort();

			const tasks: Task[] = [];
			for (const file of taskFiles) {
				try {
					tasks.push(await this.readDraftFile(join(draftsDir, file)));
				} catch {}
			}

			return sortByTaskId(tasks);
		} catch {
			return [];
		}
	}

	/**
	 * The single validation authority for one draft file: parse it and require its frontmatter
	 * id to agree with its filename under the loose matching rules. Throws with actionable
	 * context when the file is damaged or its identity drifted.
	 */
	async draftReferenceFromPath(filePath: string): Promise<DraftFileReference & { task: Task }> {
		const filename = basename(filePath);
		let task: Task;
		try {
			task = normalizeTaskIdentity(parseTask(await Bun.file(filePath).text()));
		} catch {
			throw new DraftParseError(filename);
		}
		const canonicalId = extractDraftIdFromFilename(filename);
		if (!canonicalId || !draftIdsMatchLoosely(task.id, filename)) {
			throw new DraftIdentityError(filename, task.id, canonicalId);
		}
		return { filePath, canonicalId, task: { ...task, filePath } };
	}

	/**
	 * Resolve a user-supplied draft id to a validated reference. Candidate filenames are matched
	 * by exact prefix and loose numeric rules together, so duplicate numeric identities fail
	 * closed; only the matched file is parsed.
	 */
	async resolveDraftReference(draftId: string): Promise<(DraftFileReference & { task: Task }) | null> {
		const filePath = await this.resolveDraftFilePath(draftId);
		if (!filePath) return null;
		return await this.draftReferenceFromPath(filePath);
	}

	/**
	 * Filename-bound resolution for whole-file operations (archive, promote). These move or
	 * delete the matched file itself, so frontmatter equivalence does not apply; duplicate
	 * numeric identities still fail closed.
	 */
	async resolveDraftFilePath(draftId: string): Promise<string | null> {
		const draftsDir = await this.getDraftsDir();
		let files: string[] = [];
		try {
			files = await Array.fromAsync(
				new Bun.Glob(buildGlobPattern("draft")).scan({ cwd: draftsDir, followSymlinks: true }),
			);
		} catch {
			return null;
		}
		const normalizedId = normalizeId(draftId, "draft");
		const candidates = new Set(
			files
				.filter((f) => filenameMatchesId(f, idForFilename(normalizedId)))
				.concat(files.filter((f) => draftIdsMatchLoosely(draftId, f))),
		);
		const matches = [...candidates].sort();
		if (matches.length > 1) {
			throw new AmbiguousIdError(
				"Draft",
				normalizedId,
				matches,
				"Rename one file to a distinct numeric id, then make its frontmatter agree.",
			);
		}
		const filename = matches.at(0);
		return filename ? join(draftsDir, filename) : null;
	}

	/**
	 * Numeric draft identities occupied on disk, derived from filenames: files that fail to
	 * parse still reserve their id against future allocation.
	 */
	async listOccupiedDraftFileIds(): Promise<string[]> {
		const filenames = await this.listDraftFilenames();
		return filenames.map(extractDraftIdFromFilename).filter((id): id is string => id !== null);
	}

	async listDraftFilenames(unreadable?: string[]): Promise<string[]> {
		const draftsDir = await this.getDraftsDir();
		try {
			return (await this.listDraftFiles(draftsDir)).sort();
		} catch {
			// A directory that cannot be scanned is a finding, not an empty store: surface it so
			// doctor never reports draft identities as healthy without having checked them.
			unreadable?.push(draftsDir);
			return [];
		}
	}

	/**
	 * Draft identity findings for doctor: duplicate numeric identities (filename-derived, so
	 * unparsable files count), drifted frontmatter-vs-filename records, and unreadable files.
	 */
	async diagnoseDraftIdentity(): Promise<DraftIdentityFindings> {
		const unreadableDirectories: string[] = [];
		const filenames = await this.listDraftFilenames(unreadableDirectories);
		const duplicates = findDuplicateDraftFilenameGroups(filenames).map((paths) => ({
			id: extractDraftIdFromFilename(paths[0] ?? "") ?? "",
			paths,
		}));
		const draftsDir = await this.getDraftsDir();
		const unreadable: string[] = [...unreadableDirectories];
		const drifted: Array<{ path: string; frontmatterId: string; filenameId: string }> = [];
		for (const filename of filenames) {
			let parsed: Task | null;
			try {
				parsed = normalizeTaskIdentity(parseTask(await Bun.file(join(draftsDir, filename)).text()));
			} catch {
				unreadable.push(filename);
				continue;
			}
			const declaredId = extractDraftIdFromFilename(filename);
			if (!declaredId || !draftIdsMatchLoosely(parsed.id, filename)) {
				drifted.push({ path: filename, frontmatterId: parsed.id, filenameId: declaredId ?? "(unreadable)" });
			}
		}
		return { duplicates, unreadable, drifted };
	}

	// Decision log operations
	async saveDecision(decision: Decision): Promise<{ filepath: string; removedFilepaths: string[] }> {
		// Normalize ID - remove "decision-" prefix if present
		const normalizedId = decision.id.replace(/^decision-/, "");
		const filename = `decision-${normalizedId} - ${this.sanitizeFilename(decision.title)}.md`;
		const decisionsDir = await this.getDecisionsDir();
		const filepath = join(decisionsDir, filename);
		const content = serializeDecision(decision);
		await this.ensureDirectoryExists(dirname(filepath));

		const matches = await Array.fromAsync(
			new Bun.Glob("decision-*.md").scan({ cwd: decisionsDir, followSymlinks: true }),
		);
		const removedFilepaths: string[] = [];
		for (const match of matches) {
			if (match === filename) continue;
			if (!match.startsWith(`decision-${normalizedId} -`)) continue;
			try {
				const matchPath = join(decisionsDir, match);
				await unlink(matchPath);
				removedFilepaths.push(matchPath);
			} catch {
				// Ignore cleanup errors
			}
		}

		await Bun.write(filepath, content);

		return { filepath, removedFilepaths };
	}

	async loadDecision(decisionId: string): Promise<Decision | null> {
		return findDecisionById(await this.listDecisions(), decisionId);
	}

	// Document operations
	async saveDocument(document: Document, subPath = ""): Promise<{ relativePath: string; removedFilepaths: string[] }> {
		const docsDir = await this.getDocsDir();
		const canonicalId = normalizeDocumentId(document.id);
		document.id = canonicalId;
		const filename = `${canonicalId} - ${this.sanitizeFilename(document.title)}.md`;
		const normalizedSubPath = normalizeDocumentSubPath(subPath);
		const relativePath = normalizedSubPath ? `${normalizedSubPath}/${filename}` : filename;
		const filepath = join(docsDir, ...relativePath.split("/"));
		const content = serializeDocument(document);

		await this.ensureDirectoryExists(dirname(filepath));

		const glob = new Bun.Glob("**/doc-*.md");
		const existingMatches = (await Array.fromAsync(glob.scan({ cwd: docsDir, followSymlinks: true }))).map((relative) =>
			normalizeDocumentRelativePath(relative),
		);
		const matchesForId = existingMatches.filter((relative) => {
			const base = relative.split("/").pop() || relative;
			const [candidateId] = base.split(" - ");
			if (!candidateId) return false;
			return documentIdsEqual(canonicalId, candidateId);
		});

		let sourceRelativePath = document.path ? normalizeDocumentRelativePath(document.path) : undefined;
		if (!sourceRelativePath && matchesForId.length > 0) {
			sourceRelativePath = normalizeDocumentRelativePath(matchesForId[0] ?? "");
		}

		const removedFilepaths: string[] = [];
		if (sourceRelativePath && sourceRelativePath !== relativePath) {
			const sourcePath = join(docsDir, ...sourceRelativePath.split("/"));
			try {
				await this.ensureDirectoryExists(dirname(filepath));
				await rename(sourcePath, filepath);
				removedFilepaths.push(sourcePath);
			} catch (error) {
				const code = (error as NodeJS.ErrnoException | undefined)?.code;
				if (code !== "ENOENT") {
					throw error;
				}
			}
		}

		for (const match of matchesForId) {
			const matchPath = join(docsDir, ...normalizeDocumentRelativePath(match).split("/"));
			if (matchPath === filepath) {
				continue;
			}
			try {
				await unlink(matchPath);
				removedFilepaths.push(matchPath);
			} catch {
				// Ignore cleanup errors - file may have been removed already
			}
		}

		await Bun.write(filepath, content);

		document.path = relativePath;
		return { relativePath, removedFilepaths };
	}

	/** Lists decisions, skipping files that cannot be read or parsed and collecting their paths in `unreadable`. */
	async listDecisions(unreadable?: string[]): Promise<Decision[]> {
		try {
			const decisionsDir = await this.getDecisionsDir();
			const decisionFiles = await Array.fromAsync(
				new Bun.Glob("decision-*.md").scan({ cwd: decisionsDir, followSymlinks: true }),
			);
			const decisions: Decision[] = [];
			for (const file of decisionFiles) {
				// Filter out README files as they're just instruction files
				if (file.toLowerCase().match(/^readme\.md$/i)) {
					continue;
				}
				const filepath = join(decisionsDir, file);
				try {
					const content = await Bun.file(filepath).text();
					decisions.push({ ...parseDecision(content), path: file });
				} catch {
					// One malformed file must not hide every other decision from lookups.
					unreadable?.push(file);
				}
			}
			return sortByTaskId(decisions);
		} catch (error) {
			recordUnreadableDirectory(error, unreadable);
			return [];
		}
	}

	/** Lists documents, skipping files that cannot be read or parsed and collecting their paths in `unreadable`. */
	async listDocuments(unreadable?: string[]): Promise<Document[]> {
		try {
			const docsDir = await this.getDocsDir();
			// Recursively include all markdown files under docs, excluding README.md variants
			const glob = new Bun.Glob("**/*.md");
			const docFiles = await Array.fromAsync(glob.scan({ cwd: docsDir, followSymlinks: true }));
			const docs: Document[] = [];
			for (const file of docFiles) {
				const relativePath = normalizeDocumentRelativePath(file);
				const base = relativePath.split("/").pop() || relativePath;
				if (base.toLowerCase() === "readme.md") continue;
				const filepath = join(docsDir, ...relativePath.split("/"));
				try {
					const content = await Bun.file(filepath).text();
					docs.push({ ...parseDocument(content), path: relativePath });
				} catch {
					// One malformed file must not hide every other document from lookups.
					unreadable?.push(relativePath);
				}
			}

			// Sort by title for UI/CLI listing; the path breaks title ties so paged CLI windows never overlap.
			return docs.sort((a, b) => a.title.localeCompare(b.title) || (a.path ?? "").localeCompare(b.path ?? ""));
		} catch (error) {
			recordUnreadableDirectory(error, unreadable);
			return [];
		}
	}

	async loadDocument(id: string): Promise<Document> {
		const document = findDocumentById(await this.listDocuments(), id);
		if (!document) {
			throw new Error(`Document not found: ${id}`);
		}
		return document;
	}

	async listMilestones(): Promise<Milestone[]> {
		return this.milestones.listActive();
	}

	async listArchivedMilestones(): Promise<Milestone[]> {
		return this.milestones.listArchived();
	}

	async getMilestoneFilePath(identifier: string): Promise<string | null> {
		return this.milestones.filePath(identifier);
	}

	async loadMilestone(id: string): Promise<Milestone | null> {
		return this.milestones.load(id);
	}

	async createMilestone(title: string, description?: string, dueDate?: string): Promise<Milestone> {
		return this.milestones.create(title, description, dueDate);
		/*
		return await this.withCreateLock(async () => {
			const milestonesDir = await this.getMilestonesDir();

			// Ensure milestones directory exists
			await mkdir(milestonesDir, { recursive: true });

			// Find next available milestone ID
			const archiveMilestonesDir = await this.getArchiveMilestonesDir();
			await mkdir(archiveMilestonesDir, { recursive: true });
			const [existingFiles, archivedFiles] = await Promise.all([
				Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: milestonesDir, followSymlinks: true })),
				Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: archiveMilestonesDir, followSymlinks: true })),
			]);
			const parseMilestoneId = async (dir: string, file: string): Promise<number | null> => {
				if (file.toLowerCase() === "readme.md") {
					return null;
				}
				const filepath = join(dir, file);
				try {
					const content = await Bun.file(filepath).text();
					const parsed = parseMilestone(content);
					const parsedIdMatch = parsed.id.match(/^m-(\d+)$/i);
					if (parsedIdMatch?.[1]) {
						return Number.parseInt(parsedIdMatch[1], 10);
					}
				} catch {
					// Fall through to filename-based fallback.
				}
				const filenameIdMatch = file.match(/^m-(\d+)/i);
				if (filenameIdMatch?.[1]) {
					return Number.parseInt(filenameIdMatch[1], 10);
				}
				return null;
			};
			const existingIds = (
				await Promise.all([
					...existingFiles.map((file) => parseMilestoneId(milestonesDir, file)),
					...archivedFiles.map((file) => parseMilestoneId(archiveMilestonesDir, file)),
				])
			).filter((id): id is number => typeof id === "number" && id >= 0);

			const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 0;
			const id = `m-${nextId}`;

			const filename = this.buildMilestoneFilename(id, title);
			const content = this.serializeMilestoneContent(
				id,
				title,
				`## Description

${description || `Milestone: ${title}`}`,
				normalizedDueDate,
			);

			const filepath = join(milestonesDir, filename);
			await Bun.write(filepath, content);

			return parseMilestone(content);
		}); */
	}

	async renameMilestone(
		identifier: string,
		title: string,
		dueDate?: string | null,
	): Promise<{
		success: boolean;
		sourcePath?: string;
		targetPath?: string;
		milestone?: Milestone;
		previousTitle?: string;
		previousDueDate?: string;
	}> {
		return this.milestones.rename(identifier, title, dueDate);
		/*
		const normalizedTitle = title.trim();
		if (!normalizedTitle) {
			return { success: false };
		}

		const normalizedDueDate = dueDate === null ? undefined : normalizeDueDate(dueDate, "Due date");
		let sourcePath: string | undefined;
		let targetPath: string | undefined;
		let movedFile = false;
		let originalContent: string | undefined;

		try {
			const milestoneMatch = await this.findMilestoneFile(identifier, "active");
			if (!milestoneMatch) {
				return { success: false };
			}

			const { milestone } = milestoneMatch;
			const milestonesDir = await this.getMilestonesDir();
			const targetFilename = this.buildMilestoneFilename(milestone.id, normalizedTitle);
			targetPath = join(milestonesDir, targetFilename);
			sourcePath = milestoneMatch.filepath;
			originalContent = milestoneMatch.content;
			const nextRawContent = this.rewriteDefaultMilestoneDescription(
				milestone.rawContent,
				milestone.title,
				normalizedTitle,
			);
			const nextDueDate = dueDate === undefined ? milestone.dueDate : normalizedDueDate;
			const updatedContent = this.serializeMilestoneContent(milestone.id, normalizedTitle, nextRawContent, nextDueDate);

			if (sourcePath !== targetPath) {
				if (await Bun.file(targetPath).exists()) {
					return { success: false };
				}
				await rename(sourcePath, targetPath);
				movedFile = true;
			}
			await Bun.write(targetPath, updatedContent);

			return {
				success: true,
				sourcePath,
				targetPath,
				milestone: parseMilestone(updatedContent),
				previousTitle: milestone.title,
				previousDueDate: milestone.dueDate,
			};
		} catch {
			try {
				if (movedFile && sourcePath && targetPath && sourcePath !== targetPath) {
					await rename(targetPath, sourcePath);
					if (originalContent) {
						await Bun.write(sourcePath, originalContent);
					}
				} else if (originalContent) {
					const restorePath = sourcePath ?? targetPath;
					if (restorePath) {
						await Bun.write(restorePath, originalContent);
					}
				}
			} catch {
				// Ignore rollback failures and surface operation failure to caller.
			}
			return { success: false };
		}
		*/
	}

	async archiveMilestone(identifier: string): Promise<{
		success: boolean;
		sourcePath?: string;
		targetPath?: string;
		milestone?: Milestone;
	}> {
		return this.milestones.archive(identifier);
		/*
		const normalized = identifier.trim();
		if (!normalized) {
			return { success: false };
		}

		try {
			const milestoneMatch = await this.findMilestoneFile(normalized, "active");
			if (!milestoneMatch) {
				return { success: false };
			}

			const archiveDir = await this.getArchiveMilestonesDir();
			const targetPath = join(archiveDir, milestoneMatch.file);
			await this.ensureDirectoryExists(dirname(targetPath));
			await rename(milestoneMatch.filepath, targetPath);

			return {
				success: true,
				sourcePath: milestoneMatch.filepath,
				targetPath,
				milestone: milestoneMatch.milestone,
			};
		} catch (_error) {
			return { success: false };
		}
		*/
	}

	// Config operations
	async loadConfig(): Promise<BacklogConfig | null> {
		// Return cached config if available
		if (this.cachedConfig !== null) {
			return this.cachedConfig;
		}

		const configPath = this.resolvedConfigPath;
		let content: string;
		try {
			// Check if file exists first to avoid hanging on Windows
			const file = Bun.file(configPath);
			if (!(await file.exists())) {
				return null;
			}
			content = await file.text();
		} catch (_error) {
			return null;
		}

		// A value Backlog cannot read is reported, not swallowed: callers must not silently
		// fall back to defaults while the config file says something else.
		const config = parseConfig(content, this.resolvedConfigPath);
		this.cachedConfig = config;
		this.cachedConfigSnapshot = { path: configPath, content };
		return config;
	}

	async saveConfig(config: BacklogConfig): Promise<void> {
		const normalizedConfig: BacklogConfig = {
			...config,
			...(this.configSource === "root" ? { backlogDirectory: this.resolvedBacklogDirName } : {}),
			definitionOfDone: normalizedDefinitionOfDone(config.definitionOfDone),
		};
		if (this.configSource === "folder") {
			delete normalizedConfig.backlogDirectory;
		}
		const configPath = this.resolvedConfigPath;
		const content = serializeConfig(normalizedConfig);
		await Bun.write(configPath, content);
		this.cachedConfig = normalizedConfig;
		this.cachedConfigSnapshot = { path: configPath, content };
	}

	// Utility methods
	private sanitizeFilename(filename: string): string {
		// Remove path-unsafe characters, then strip noisy punctuation before normalizing whitespace
		const sanitized = filename
			.replace(/[<>:"/\\|?*]/g, "-")
			// biome-ignore lint/complexity/noUselessEscapeInRegex: we need explicit escapes inside the character class
			.replace(/['(),!@#$%^&+=\[\]{};]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
		// A punctuation-only title sanitizes to nothing; fall back so filenames keep the "<id> - <title>.md" shape
		return sanitized || "untitled";
	}

	private async ensureDirectoryExists(dirPath: string): Promise<void> {
		try {
			await mkdir(dirPath, { recursive: true });
		} catch (_error) {
			// Directory creation failed, ignore
		}
	}

	parseConfig(content: string): BacklogConfig {
		return parseConfig(content, this.resolvedConfigPath);
	}
}
