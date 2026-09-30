import { expect, test } from "bun:test";
import type { TaskDetail } from "../../core/task-detail";
import {
	DEFAULT_TASK_DETAIL_CACHE_CAPACITY,
	setTaskDetailCacheCapacity,
	TaskDetailCache,
	taskDetailCacheCapacity,
} from "./task-detail-cache";

const detail = (id: string) => ({ id }) as TaskDetail;

test("uses the default detail cache capacity and persists a valid browser setting", () => {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value),
	} as Storage;
	expect(taskDetailCacheCapacity(storage)).toBe(DEFAULT_TASK_DETAIL_CACHE_CAPACITY);
	expect(setTaskDetailCacheCapacity(3, storage)).toBe(3);
	expect(taskDetailCacheCapacity(storage)).toBe(3);
	expect(setTaskDetailCacheCapacity(0, storage)).toBe(DEFAULT_TASK_DETAIL_CACHE_CAPACITY);
	values.set("backlog.taskDetailCacheCapacity", "2garbage");
	expect(taskDetailCacheCapacity(storage)).toBe(DEFAULT_TASK_DETAIL_CACHE_CAPACITY);
	expect(
		taskDetailCacheCapacity({
			getItem: () => {
				throw new Error("blocked");
			},
		} as unknown as Storage),
	).toBe(DEFAULT_TASK_DETAIL_CACHE_CAPACITY);
});

test("touches cache hits and evicts the least recently used detail", async () => {
	let calls = 0;
	const cache = new TaskDetailCache(async (id) => {
		calls += 1;
		return detail(id);
	}, 2);
	await cache.loadDetail("project-a", "one");
	await cache.loadDetail("project-a", "two");
	expect(cache.get("project-a", "one")?.id).toBe("one");
	await cache.loadDetail("project-a", "three");
	expect(cache.get("project-a", "two")).toBeUndefined();
	await cache.loadDetail("project-a", "one");
	expect(calls).toBe(3);
});

test("selection prefetch and Enter share one pending detail request", async () => {
	let resolve!: (value: TaskDetail) => void;
	let calls = 0;
	const cache = new TaskDetailCache(() => {
		calls += 1;
		return new Promise((resolveRequest) => {
			resolve = resolveRequest;
		});
	}, 2);
	const prefetch = cache.loadDetail("project-a", "BACK-709");
	const open = cache.loadDetail("project-a", "BACK-709");
	expect(calls).toBe(1);
	resolve(detail("BACK-709"));
	expect((await prefetch).id).toBe("BACK-709");
	expect((await open).id).toBe("BACK-709");
});

test("evicts by access order when pending requests complete out of order", async () => {
	const resolvers = new Map<string, (value: TaskDetail) => void>();
	const cache = new TaskDetailCache(
		(id) =>
			new Promise((resolve) => {
				resolvers.set(id, resolve);
			}),
		2,
	);
	const first = cache.loadDetail("project-a", "A");
	const second = cache.loadDetail("project-a", "B");
	resolvers.get("B")?.(detail("B"));
	await second;
	resolvers.get("A")?.(detail("A"));
	await first;
	const third = cache.loadDetail("project-a", "C");
	resolvers.get("C")?.(detail("C"));
	await third;
	expect(cache.get("project-a", "A")).toBeUndefined();
	expect(cache.get("project-a", "B")?.id).toBe("B");
});

test("does not cache failures and rejects stale completions after invalidation", async () => {
	let attempts = 0;
	const cache = new TaskDetailCache(async () => {
		attempts += 1;
		throw new Error("not found");
	}, 2);
	await expect(cache.loadDetail("project-a", "missing")).rejects.toThrow("not found");
	await expect(cache.loadDetail("project-a", "missing")).rejects.toThrow("not found");
	expect(attempts).toBe(2);

	let resolve!: (value: TaskDetail) => void;
	const racing = new TaskDetailCache(
		() =>
			new Promise((resolveRequest) => {
				resolve = resolveRequest;
			}),
		2,
	);
	const request = racing.loadDetail("project-a", "old");
	racing.invalidate();
	resolve(detail("old"));
	await request;
	expect(racing.get("project-a", "old")).toBeUndefined();
});

test("isolates values and pending requests by project scope", async () => {
	let calls = 0;
	const cache = new TaskDetailCache(async (id) => {
		calls += 1;
		return detail(id);
	});
	await cache.loadDetail("project-a", "BACK-709");
	await cache.loadDetail("project-b", "BACK-709");
	expect(calls).toBe(2);
	expect(cache.get("project-a", "BACK-709")?.id).toBe("BACK-709");
	expect(cache.get("project-b", "BACK-709")?.id).toBe("BACK-709");
});
