import { type FSWatcher, watch } from "node:fs";
import { stat } from "node:fs/promises";
import type { Core } from "../core/backlog.ts";
import type { Task } from "../types/index.ts";
import { hasAnyPrefix } from "./prefix-config.ts";
import { extractTaskIdFromFilename, normalizeTaskId, normalizeTaskIdentity, taskIdsEqual } from "./task-path.ts";

export interface TaskWatcherCallbacks {
	/** Called when a new task file is created */
	onTaskAdded?: (task: Task) => void | Promise<void>;
	/** Called when an existing task file is modified */
	onTaskChanged?: (task: Task) => void | Promise<void>;
	/** Called when a task file is removed */
	onTaskRemoved?: (taskId: string) => void | Promise<void>;
}

interface TaskReconciliation {
	generation: number;
	processing: boolean;
	pending: boolean;
	hasPublishedState: boolean;
	lastPublishedSignature: string | null;
}

type TaskReadResult = { kind: "retry" } | { kind: "absent" } | { kind: "candidate"; task: Task; signature: string };

type TaskFileSnapshot = { state: "complete"; taskIds: Set<string> } | { state: "incomplete" };

const TASK_SETTLE_DELAY_MS = 50;
const TASK_RETRY_DELAY_MS = 35;
const TASK_READ_ATTEMPTS = 8;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUsableTask(task: Task | null, taskId: string): task is Task {
	return Boolean(task && taskIdsEqual(task.id, taskId) && task.title.trim() && task.status.trim());
}

/**
 * Identity of a task's content, ignoring where it was read from and when.
 * Re-reading the same task after a write yields the same signature, so consumers can
 * tell a real edit from a watcher echo.
 */
export function taskContentSignature(task: Task): string {
	const { branch: _branch, filePath: _filePath, lastModified: _lastModified, source: _source, ...content } = task;
	return JSON.stringify(content);
}

function createReconciliation(initialTask?: Task): TaskReconciliation {
	return {
		generation: 0,
		processing: false,
		pending: false,
		hasPublishedState: initialTask !== undefined,
		lastPublishedSignature: initialTask ? taskContentSignature(initialTask) : null,
	};
}

async function readTaskFileSnapshot(tasksDir: string): Promise<TaskFileSnapshot> {
	try {
		const directory = await stat(tasksDir);
		if (!directory.isDirectory()) return { state: "incomplete" };
		const files = await Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: tasksDir, followSymlinks: true }));
		await stat(tasksDir);
		const taskIds = new Set<string>();
		for (const file of files) {
			const taskId = extractTaskIdFromFilename(file);
			if (taskId) taskIds.add(normalizeTaskId(taskId));
		}
		return { state: "complete", taskIds };
	} catch {
		return { state: "incomplete" };
	}
}

async function classifyTaskRead(core: Core, taskId: string, tasksDir: string): Promise<TaskReadResult> {
	let task: Task | null;
	try {
		task = await core.filesystem.loadTask(taskId);
	} catch {
		return { kind: "retry" };
	}
	if (isUsableTask(task, taskId)) return { kind: "candidate", task, signature: taskContentSignature(task) };
	if (task !== null) return { kind: "retry" };
	const snapshot = await readTaskFileSnapshot(tasksDir);
	return snapshot.state === "complete" && !snapshot.taskIds.has(normalizeTaskId(taskId))
		? { kind: "absent" }
		: { kind: "retry" };
}

async function publishTaskRemoval(
	taskId: string,
	state: TaskReconciliation,
	callbacks: TaskWatcherCallbacks,
): Promise<void> {
	if (state.hasPublishedState && state.lastPublishedSignature === null) return;
	try {
		await callbacks.onTaskRemoved?.(taskId);
		state.hasPublishedState = true;
		state.lastPublishedSignature = null;
	} catch {
		// Callback failures are bounded by the same finite reconciliation budget.
	}
}

async function publishTaskCandidate(
	task: Task,
	signature: string,
	state: TaskReconciliation,
	callbacks: TaskWatcherCallbacks,
): Promise<boolean> {
	if (state.hasPublishedState && state.lastPublishedSignature === signature) return true;
	try {
		if (!state.hasPublishedState || state.lastPublishedSignature === null)
			await callbacks.onTaskAdded?.(normalizeTaskIdentity(task));
		else await callbacks.onTaskChanged?.(normalizeTaskIdentity(task));
		state.hasPublishedState = true;
		state.lastPublishedSignature = signature;
		return true;
	} catch {
		return false;
	}
}

async function reconcileReadResult(
	result: TaskReadResult,
	attempt: number,
	taskId: string,
	state: TaskReconciliation,
	callbacks: TaskWatcherCallbacks,
	previousSignature: string | null | undefined,
): Promise<{ done: boolean; signature: string | null | undefined }> {
	if (result.kind === "retry") return { done: false, signature: previousSignature };
	if (result.kind === "absent") {
		if (attempt === TASK_READ_ATTEMPTS - 1) await publishTaskRemoval(taskId, state, callbacks);
		return { done: attempt === TASK_READ_ATTEMPTS - 1, signature: previousSignature };
	}
	if (result.signature !== previousSignature) return { done: false, signature: result.signature };
	return {
		done: await publishTaskCandidate(result.task, result.signature, state, callbacks),
		signature: previousSignature,
	};
}

async function readDirectoryTasks(
	core: Core,
	tasksDir: string,
): Promise<{ taskFileIds: Set<string>; tasks: Task[] } | null> {
	const snapshot = await readTaskFileSnapshot(tasksDir);
	if (snapshot.state === "incomplete") return null;
	try {
		return { taskFileIds: snapshot.taskIds, tasks: await core.filesystem.listTasks() };
	} catch {
		return null;
	}
}

function scheduleVisibleTasks(
	tasks: Task[],
	reconciliations: ReadonlyMap<string, TaskReconciliation>,
	visibleTaskIds: Set<string>,
	schedule: (taskId: string) => void,
): void {
	for (const task of tasks) {
		if (!isUsableTask(task, task.id)) continue;
		const taskId = normalizeTaskId(task.id);
		visibleTaskIds.add(taskId);
		const state = reconciliations.get(taskId);
		if (!state?.hasPublishedState || state.lastPublishedSignature !== taskContentSignature(task)) schedule(taskId);
	}
}

function scheduleMissingTasks(
	reconciliations: ReadonlyMap<string, TaskReconciliation>,
	visibleTaskIds: ReadonlySet<string>,
	taskFileIds: ReadonlySet<string>,
	schedule: (taskId: string) => void,
): void {
	for (const taskId of reconciliations.keys())
		if (!visibleTaskIds.has(taskId) && !taskFileIds.has(taskId)) schedule(taskId);
}

/**
 * Watch the current checkout's backlog/tasks directory and emit incremental updates.
 * A single filesystem event is reconciled until task content is stable or absence is
 * confirmed, because atomic writes can make the event visible before the file is.
 */
export function watchTasks(
	core: Core,
	callbacks: TaskWatcherCallbacks,
	initialTasks: readonly Task[] = [],
): { stop: () => void } {
	const tasksDir = core.filesystem.tasksDir;
	const reconciliations = new Map(
		initialTasks.filter((task) => !task.branch).map((task) => [normalizeTaskId(task.id), createReconciliation(task)]),
	);
	let stopped = false;
	let directoryGeneration = 0;

	const reconcile = async (taskId: string, state: TaskReconciliation, eventGeneration: number): Promise<void> => {
		let previousCandidateSignature: string | null | undefined;

		for (let attempt = 0; attempt < TASK_READ_ATTEMPTS; attempt++) {
			await delay(attempt === 0 ? TASK_SETTLE_DELAY_MS : TASK_RETRY_DELAY_MS);
			if (stopped || eventGeneration !== state.generation) return;

			const result = await classifyTaskRead(core, taskId, tasksDir);
			const resolution = await reconcileReadResult(
				result,
				attempt,
				taskId,
				state,
				callbacks,
				previousCandidateSignature,
			);
			previousCandidateSignature = resolution.signature;
			if (resolution.done) return;
		}
	};

	const drain = async (taskId: string, state: TaskReconciliation): Promise<void> => {
		if (state.processing) return;
		state.processing = true;
		try {
			do {
				state.pending = false;
				await reconcile(taskId, state, state.generation);
			} while (!stopped && state.pending);
		} finally {
			state.processing = false;
			if (!stopped && state.pending) void drain(taskId, state).catch(() => {});
		}
	};

	const schedule = (taskId: string) => {
		const normalizedTaskId = normalizeTaskId(taskId);
		const state = reconciliations.get(normalizedTaskId) ?? createReconciliation();
		reconciliations.set(normalizedTaskId, state);
		state.generation += 1;
		state.pending = true;
		void drain(normalizedTaskId, state).catch(() => {});
	};
	const scheduleDirectoryReconciliation = () => {
		const eventGeneration = ++directoryGeneration;
		const reconcileDirectory = async () => {
			const visibleTaskIds = new Set<string>();
			let taskFileIds: Set<string> | null = null;
			for (let attempt = 0; attempt < TASK_READ_ATTEMPTS; attempt++) {
				await delay(attempt === 0 ? TASK_SETTLE_DELAY_MS : TASK_RETRY_DELAY_MS);
				if (stopped || eventGeneration !== directoryGeneration) return;

				const directoryTasks = await readDirectoryTasks(core, tasksDir);
				if (!directoryTasks) continue;
				taskFileIds = directoryTasks.taskFileIds;
				visibleTaskIds.clear();
				scheduleVisibleTasks(directoryTasks.tasks, reconciliations, visibleTaskIds, schedule);
			}

			if (stopped || eventGeneration !== directoryGeneration || !taskFileIds) return;
			scheduleMissingTasks(reconciliations, visibleTaskIds, taskFileIds, schedule);
		};
		void reconcileDirectory().catch(() => {});
	};

	const watcher: FSWatcher = watch(tasksDir, { recursive: false }, (eventType, filename) => {
		if (eventType !== "change" && eventType !== "rename") return;

		const rawFilename: unknown = filename;
		const fileName =
			typeof rawFilename === "string" ? rawFilename : rawFilename != null ? String(rawFilename) : undefined;
		const [taskId] = fileName?.split(" ") ?? [];
		if (!fileName || !taskId || !hasAnyPrefix(taskId) || !fileName.endsWith(".md")) {
			scheduleDirectoryReconciliation();
			return;
		}

		schedule(taskId);
	});
	watcher.on("error", (error) => {
		if (process.env.DEBUG) console.warn("Task watcher error", error);
	});

	return {
		stop() {
			stopped = true;
			directoryGeneration += 1;
			for (const state of reconciliations.values()) {
				state.generation += 1;
				state.pending = false;
			}
			try {
				watcher.close();
			} catch {}
		},
	};
}
