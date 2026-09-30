import type { TaskDetail } from "../../core/task-detail";

export const DEFAULT_TASK_DETAIL_CACHE_CAPACITY = 10;
const CAPACITY_STORAGE_KEY = "backlog.taskDetailCacheCapacity";

function localStorageOrUndefined(): Storage | undefined {
	try {
		return globalThis.localStorage;
	} catch {
		return undefined;
	}
}

export function taskDetailCacheCapacity(storage: Storage | undefined = localStorageOrUndefined()): number {
	try {
		const value = storage?.getItem(CAPACITY_STORAGE_KEY) ?? "";
		return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
			? Number(value)
			: DEFAULT_TASK_DETAIL_CACHE_CAPACITY;
	} catch {
		return DEFAULT_TASK_DETAIL_CACHE_CAPACITY;
	}
}

export function setTaskDetailCacheCapacity(
	capacity: number,
	storage: Storage | undefined = localStorageOrUndefined(),
): number {
	const normalized = Number.isSafeInteger(capacity) && capacity > 0 ? capacity : DEFAULT_TASK_DETAIL_CACHE_CAPACITY;
	try {
		storage?.setItem(CAPACITY_STORAGE_KEY, String(normalized));
	} catch {
		// Browser privacy settings must not prevent detail loading.
	}
	return normalized;
}

export class TaskDetailCache {
	private readonly values = new Map<string, TaskDetail>();
	private readonly pending = new Map<string, Promise<TaskDetail>>();
	private readonly accessOrder = new Map<string, number>();
	private generation = 0;
	private accessSequence = 0;

	constructor(
		private readonly load: (id: string) => Promise<TaskDetail>,
		private capacity = taskDetailCacheCapacity(),
	) {}

	get(scope: string, id: string): TaskDetail | undefined {
		const key = this.key(scope, id);
		const value = this.values.get(key);
		if (!value) return undefined;
		this.touch(key);
		return value;
	}

	loadDetail(scope: string, id: string): Promise<TaskDetail> {
		const key = this.key(scope, id);
		const cached = this.get(scope, id);
		if (cached) return Promise.resolve(cached);
		this.touch(key);
		const existing = this.pending.get(key);
		if (existing) return existing;
		const generation = this.generation;
		const request = this.load(id)
			.then((detail) => {
				if (generation === this.generation) this.store(key, detail);
				return detail;
			})
			.finally(() => {
				if (this.pending.get(key) === request) this.pending.delete(key);
			});
		this.pending.set(key, request);
		return request;
	}

	invalidate(scope?: string, id?: string) {
		this.generation += 1;
		const key = scope && id ? this.key(scope, id) : undefined;
		if (key) this.values.delete(key);
		else this.values.clear();
		if (key) this.accessOrder.delete(key);
		else this.accessOrder.clear();
		this.pending.clear();
	}

	setCapacity(capacity: number) {
		this.capacity = Number.isSafeInteger(capacity) && capacity > 0 ? capacity : DEFAULT_TASK_DETAIL_CACHE_CAPACITY;
		setTaskDetailCacheCapacity(this.capacity);
		this.evict();
	}

	private store(key: string, detail: TaskDetail) {
		this.values.set(key, detail);
		this.evict();
	}

	private key(scope: string, id: string) {
		return JSON.stringify([scope, id]);
	}

	private touch(id: string) {
		this.accessSequence += 1;
		this.accessOrder.set(id, this.accessSequence);
	}

	private evict() {
		while (this.values.size > this.capacity) {
			const oldest = [...this.values.keys()].reduce((oldestId, id) =>
				(this.accessOrder.get(id) ?? 0) < (this.accessOrder.get(oldestId) ?? 0) ? id : oldestId,
			);
			this.values.delete(oldest);
			this.accessOrder.delete(oldest);
		}
	}
}
