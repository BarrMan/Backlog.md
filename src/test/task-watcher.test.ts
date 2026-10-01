import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { EventEmitter } from "node:events";
import * as nodeFs from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { watchTasks } from "../utils/task-watcher.ts";
import { getTestCliCommand } from "./test-cli.ts";
import {
	createUniqueTestDir,
	getPlatformTimeout,
	initializeTestProject,
	safeCleanup,
	withTimeout,
} from "./test-utils.ts";

type WatchCallback = (eventType: string, filename: string | Buffer | null) => void;

function sampleTask(id: string, title: string, status = "To Do"): Task {
	return {
		id,
		title,
		status,
		assignee: [],
		createdDate: "2026-07-14 00:00",
		labels: [],
		dependencies: [],
		rawContent: "## Description\n\nWatcher fixture",
	};
}

function observeTaskReads(core: Core, count: number): { reached: Promise<void>; restore: () => void } {
	const loadTask = core.filesystem.loadTask.bind(core.filesystem);
	let reads = 0;
	let resolveReached: () => void = () => {};
	const reached = new Promise<void>((resolve) => {
		resolveReached = resolve;
	});
	core.filesystem.loadTask = async (...args) => {
		reads += 1;
		if (reads >= count) resolveReached();
		return await loadTask(...args);
	};
	return { reached, restore: () => (core.filesystem.loadTask = loadTask) };
}

function observeTaskDirectoryReads(core: Core, count: number): { reached: Promise<void>; restore: () => void } {
	const listTasks = core.filesystem.listTasks.bind(core.filesystem);
	let reads = 0;
	let resolveReached: () => void = () => {};
	const reached = new Promise<void>((resolve) => {
		resolveReached = resolve;
	});
	core.filesystem.listTasks = async (...args) => {
		reads += 1;
		if (reads >= count) resolveReached();
		return await listTasks(...args);
	};
	return { reached, restore: () => (core.filesystem.listTasks = listTasks) };
}

describe("task watcher reconciliation", () => {
	let testDir: string;
	let core: Core;
	let watcherCallback: WatchCallback;
	let watchSpy: ReturnType<typeof spyOn>;
	let stopWatcher: (() => void) | undefined;

	beforeEach(async () => {
		testDir = createUniqueTestDir("task-watcher");
		core = new Core(testDir);
		await core.filesystem.ensureBacklogStructure();
		watchSpy = spyOn(nodeFs, "watch").mockImplementation(((
			_path: Parameters<typeof nodeFs.watch>[0],
			...args: unknown[]
		) => {
			const callback = args.findLast((argument) => typeof argument === "function");
			if (typeof callback !== "function") throw new Error("Expected task watcher callback");
			watcherCallback = callback as WatchCallback;
			const watcher = new EventEmitter() as EventEmitter & { close(): void };
			watcher.close = () => {};
			return watcher as unknown as nodeFs.FSWatcher;
		}) as typeof nodeFs.watch);
	});

	afterEach(async () => {
		stopWatcher?.();
		watchSpy.mockRestore();
		await safeCleanup(testDir);
	});

	it("recovers a partial create after one filesystem event and publishes it once", async () => {
		const fileName = "task-1 - Partial-create.md";
		const filePath = join(core.filesystem.tasksDir, fileName);
		const added: Task[] = [];
		let resolveAdded: (() => void) | undefined;
		const published = new Promise<void>((resolve) => {
			resolveAdded = resolve;
		});
		const handle = watchTasks(core, {
			onTaskAdded(task) {
				added.push(task);
				resolveAdded?.();
			},
		});
		stopWatcher = handle.stop;

		await Bun.write(filePath, "---\nid: task-1\n");
		const firstRead = observeTaskReads(core, 1);
		watcherCallback("rename", fileName);
		await withTimeout(firstRead.reached, "partial task create read", getPlatformTimeout(1200));
		firstRead.restore();
		await Bun.write(filePath, serializeTask(sampleTask("task-1", "Recovered create")));

		await withTimeout(published, "partial task create publication", getPlatformTimeout(1200));
		expect(added.map((task) => task.title)).toEqual(["Recovered create"]);

		const duplicateRead = observeTaskReads(core, 2);
		watcherCallback("change", fileName);
		await withTimeout(duplicateRead.reached, "duplicate task create read", getPlatformTimeout(1200));
		duplicateRead.restore();
		expect(added).toHaveLength(1);
	});

	it("discovers a partial atomic create from one temporary-file event", async () => {
		const fileName = "task-7 - Atomic-create.md";
		const filePath = join(core.filesystem.tasksDir, fileName);
		let resolveAdded: ((task: Task) => void) | undefined;
		const added = new Promise<Task>((resolve) => {
			resolveAdded = resolve;
		});
		const handle = watchTasks(core, {
			onTaskAdded(task) {
				resolveAdded?.(task);
			},
		});
		stopWatcher = handle.stop;

		await Bun.write(filePath, "---\nid: task-7\n");
		const firstRead = observeTaskDirectoryReads(core, 1);
		watcherCallback("rename", ".task-7.atomic-write");
		await withTimeout(firstRead.reached, "partial atomic task read", getPlatformTimeout(1200));
		firstRead.restore();
		await Bun.write(filePath, serializeTask(sampleTask("task-7", "Atomic create")));

		const task = await withTimeout(added, "temporary-file task create publication", getPlatformTimeout(1200));
		expect(task.title).toBe("Atomic create");
	});

	it("recovers a partial edit after one filesystem event", async () => {
		const original = sampleTask("task-2", "Original title");
		const fileName = "task-2 - Original-title.md";
		const filePath = join(core.filesystem.tasksDir, fileName);
		await Bun.write(filePath, serializeTask(original));
		const initial = await core.filesystem.loadTask(original.id);
		if (!initial) throw new Error("Expected initial task");

		let resolveChanged: ((task: Task) => void) | undefined;
		const changed = new Promise<Task>((resolve) => {
			resolveChanged = resolve;
		});
		const handle = watchTasks(
			core,
			{
				onTaskChanged(task) {
					resolveChanged?.(task);
				},
			},
			[initial],
		);
		stopWatcher = handle.stop;

		await Bun.write(filePath, "---\nid: task-2\ntitle: Original title\n");
		const firstRead = observeTaskReads(core, 1);
		watcherCallback("change", fileName);
		await withTimeout(firstRead.reached, "partial task edit read", getPlatformTimeout(1200));
		firstRead.restore();
		await Bun.write(filePath, serializeTask(sampleTask("task-2", "Edited title", "In Progress")));

		const task = await withTimeout(changed, "partial task edit publication", getPlatformTimeout(1200));
		expect(task.title).toBe("Edited title");
		expect(task.status).toBe("In Progress");
	});

	it("confirms archive and delete absence from one event without duplicate removals", async () => {
		const archiveDir = join(testDir, "backlog", "archive", "tasks");
		await mkdir(archiveDir, { recursive: true });
		const tasks = [sampleTask("task-3", "Archived"), sampleTask("task-4", "Deleted")];
		const paths = tasks.map((task) => join(core.filesystem.tasksDir, `${task.id} - ${task.title}.md`));
		await Promise.all(paths.map((path, index) => Bun.write(path, serializeTask(tasks[index] as Task))));
		const initialTasks = await core.filesystem.listTasks();
		const removed: string[] = [];
		let resolveRemoved: (() => void) | undefined;
		const bothRemoved = new Promise<void>((resolve) => {
			resolveRemoved = resolve;
		});
		const handle = watchTasks(
			core,
			{
				onTaskRemoved(taskId) {
					removed.push(taskId);
					if (removed.length === 2) resolveRemoved?.();
				},
			},
			initialTasks,
		);
		stopWatcher = handle.stop;

		await rename(paths[0] as string, join(archiveDir, basename(paths[0] as string)));
		watcherCallback("rename", basename(paths[0] as string));
		await unlink(paths[1] as string);
		watcherCallback("rename", basename(paths[1] as string));

		await withTimeout(bothRemoved, "archive and delete publication", getPlatformTimeout(1500));
		const duplicateReads = observeTaskReads(core, 16);
		watcherCallback("rename", basename(paths[0] as string));
		watcherCallback("rename", basename(paths[1] as string));
		await withTimeout(duplicateReads.reached, "duplicate removal read budget", getPlatformTimeout(1200));
		duplicateReads.restore();
		expect(removed.sort()).toEqual(["TASK-3", "TASK-4"]);
	});

	it("bounds retries for permanently incomplete content and stops pending work", async () => {
		const fileName = "task-5 - Incomplete.md";
		const filePath = join(core.filesystem.tasksDir, fileName);
		await Bun.write(filePath, "---\nid: task-5\n");
		const publications: string[] = [];
		const handle = watchTasks(core, {
			onTaskAdded: (task) => {
				publications.push(task.id);
			},
			onTaskChanged: (task) => {
				publications.push(task.id);
			},
			onTaskRemoved: (taskId) => {
				publications.push(taskId);
			},
		});
		stopWatcher = handle.stop;

		const exhausted = observeTaskReads(core, 8);
		watcherCallback("rename", fileName);
		await withTimeout(exhausted.reached, "incomplete task read budget", getPlatformTimeout(1200));
		exhausted.restore();
		expect(publications).toEqual([]);

		watcherCallback("change", fileName);
		handle.stop();
		await Bun.write(filePath, serializeTask(sampleTask("task-5", "Too late")));
		expect(publications).toEqual([]);
	});

	it("does not remove an existing task when its content is malformed", async () => {
		const task = sampleTask("task-9", "Malformed content");
		const fileName = "task-9 - Malformed-content.md";
		const filePath = join(core.filesystem.tasksDir, fileName);
		await Bun.write(filePath, serializeTask(task));
		const initial = await core.filesystem.loadTask(task.id);
		if (!initial) throw new Error("Expected initial task");

		const removed: string[] = [];
		const handle = watchTasks(
			core,
			{
				onTaskRemoved(taskId) {
					removed.push(taskId);
				},
			},
			[initial],
		);
		stopWatcher = handle.stop;

		await Bun.write(filePath, "---\nid: task-9\ntitle: [unterminated\n---\n");
		const exhausted = observeTaskReads(core, 8);
		watcherCallback("change", fileName);
		await withTimeout(exhausted.reached, "malformed task read budget", getPlatformTimeout(1200));
		exhausted.restore();

		expect(removed).toEqual([]);
	});

	it("does not remove an existing task after persistent read failures", async () => {
		const task = sampleTask("task-10", "Unreadable content");
		const fileName = "task-10 - Unreadable-content.md";
		await Bun.write(join(core.filesystem.tasksDir, fileName), serializeTask(task));
		const initial = await core.filesystem.loadTask(task.id);
		if (!initial) throw new Error("Expected initial task");
		let resolveExhausted: () => void = () => {};
		const exhausted = new Promise<void>((resolve) => {
			resolveExhausted = resolve;
		});
		let reads = 0;
		const loadTaskSpy = spyOn(core.filesystem, "loadTask").mockImplementation(async () => {
			reads += 1;
			if (reads >= 8) resolveExhausted();
			return null;
		});
		const removed: string[] = [];
		const handle = watchTasks(
			core,
			{
				onTaskRemoved(taskId) {
					removed.push(taskId);
				},
			},
			[initial],
		);
		stopWatcher = handle.stop;

		watcherCallback("change", fileName);
		await withTimeout(exhausted, "unreadable task read budget", getPlatformTimeout(1200));
		loadTaskSpy.mockRestore();

		expect(removed).toEqual([]);
	});

	it("preserves malformed files during directory reconciliation and removes true absence", async () => {
		const task = sampleTask("task-11", "Directory reconciliation");
		const fileName = "task-11 - Directory-reconciliation.md";
		const filePath = join(core.filesystem.tasksDir, fileName);
		await Bun.write(filePath, serializeTask(task));
		const initial = await core.filesystem.loadTask(task.id);
		if (!initial) throw new Error("Expected initial task");
		const removed: string[] = [];
		let resolveRemoved: (() => void) | undefined;
		const published = new Promise<void>((resolve) => {
			resolveRemoved = resolve;
		});
		const handle = watchTasks(
			core,
			{
				onTaskRemoved(taskId) {
					removed.push(taskId);
					resolveRemoved?.();
				},
			},
			[initial],
		);
		stopWatcher = handle.stop;

		await Bun.write(filePath, "---\nid: task-11\ntitle: [unterminated\n---\n");
		const malformedReads = observeTaskDirectoryReads(core, 8);
		watcherCallback("rename", ".atomic-write");
		await withTimeout(malformedReads.reached, "malformed directory read budget", getPlatformTimeout(1200));
		malformedReads.restore();
		expect(removed).toEqual([]);

		await unlink(filePath);
		watcherCallback("rename", ".atomic-write");
		await withTimeout(published, "directory reconciliation removal", getPlatformTimeout(1500));
		expect(removed).toEqual(["TASK-11"]);
	});

	it("does not reconcile branch-only tasks from the current checkout watcher", async () => {
		const removed: string[] = [];
		const branchTask = { ...sampleTask("task-8", "Other branch"), branch: "feature/other-worktree" };
		const handle = watchTasks(
			core,
			{
				onTaskRemoved(taskId) {
					removed.push(taskId);
				},
			},
			[branchTask],
		);
		stopWatcher = handle.stop;

		const branchReads = observeTaskDirectoryReads(core, 8);
		watcherCallback("rename", ".unrelated-atomic-write");
		await withTimeout(branchReads.reached, "branch-only directory read budget", getPlatformTimeout(1200));
		branchReads.restore();
		expect(removed).toEqual([]);
	});

	it("reconciles an atomic CLI edit through a real filesystem watcher", async () => {
		watchSpy.mockRestore();
		await initializeTestProject(core, "Real task watcher");
		const original = sampleTask("task-6", "Real watcher");
		const filePath = join(core.filesystem.tasksDir, "task-6 - Real-watcher.md");
		await Bun.write(filePath, serializeTask(original));
		const initial = await core.filesystem.loadTask(original.id);
		if (!initial) throw new Error("Expected real watcher task");

		let resolveChanged: ((task: Task) => void) | undefined;
		const changed = new Promise<Task>((resolve) => {
			resolveChanged = resolve;
		});
		const handle = watchTasks(
			core,
			{
				onTaskChanged(task) {
					resolveChanged?.(task);
				},
			},
			[initial],
		);
		stopWatcher = handle.stop;

		const cliCommand = getTestCliCommand();
		await $`${cliCommand} task edit task-6 --status ${"In Progress"} --plain`.cwd(testDir).quiet();
		const task = await withTimeout(changed, "real atomic CLI edit", getPlatformTimeout(2000));
		expect(task.status).toBe("In Progress");
	});
});
