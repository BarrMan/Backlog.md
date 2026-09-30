import type { FileSystem } from "../file-system/operations.ts";
import type { SearchFilters, Task, TaskListFilter } from "../types/index.ts";
import { isLocalEditableTask } from "../types/index.ts";
import { createMilestoneFilterValueResolver } from "../utils/milestone-filter.ts";
import { AmbiguousTaskIdError } from "../utils/task-path.ts";
import { applyTaskFilters, createTaskSearchIndex } from "../utils/task-search.ts";
import { attachSubtaskSummaries } from "../utils/task-subtasks.ts";
import type { ProjectSession } from "./backlog.ts";
import type { ContentStore } from "./content-store.ts";
import type { ProjectTaskMutations } from "./task-mutation-service.ts";

export type TaskQueryOptions = {
	filters?: TaskListFilter;
	query?: string;
	limit?: number;
	includeCrossBranch?: boolean;
	refreshCrossBranch?: boolean;
};

export type TaskReadOptions = {
	includeCrossBranch?: boolean;
	refreshCrossBranch?: boolean;
};

async function filterTaskQueryResults(
	collection: Task[],
	options: TaskQueryOptions,
	filesystem: FileSystem,
): Promise<Task[]> {
	const resolveMilestoneLabel = options.filters?.milestone
		? await Promise.all([filesystem.listMilestones(), filesystem.listArchivedMilestones()]).then(([active, archived]) =>
				createMilestoneFilterValueResolver([...active, ...archived]),
			)
		: undefined;
	const tasks = options.filters
		? applyTaskFilters(collection, { ...options.filters, resolveMilestoneLabel })
		: [...collection];
	const visibleTasks = options.includeCrossBranch === false ? tasks.filter(isLocalEditableTask) : tasks;
	return typeof options.limit === "number" && options.limit >= 0 ? visibleTasks.slice(0, options.limit) : visibleTasks;
}

/** Owns a generation-stable task read and rejects stale cache results after every await. */
export class TaskReadSession {
	constructor(
		private readonly session: ProjectSession,
		private readonly generation: number,
		private readonly filesystem: FileSystem,
		private readonly backlogRoot: string,
		private readonly storeAlreadyReady: boolean,
		private readonly mutations: ProjectTaskMutations,
	) {}

	private get current(): boolean {
		return this.session.isCurrent(this.generation, this.filesystem, this.backlogRoot);
	}

	private async queryCrossBranch(options: TaskQueryOptions): Promise<Task[] | null> {
		let store: ContentStore;
		try {
			store = await this.session.getContentStore();
		} catch (error) {
			if (!this.current) return null;
			throw error;
		}
		if (!this.current || !this.session.isActiveContentStore(store)) return null;
		try {
			await this.session.refreshCachedTasksForCrossBranchRead(
				true,
				this.storeAlreadyReady && options.refreshCrossBranch !== false,
			);
		} catch (error) {
			if (!this.current) return null;
			throw error;
		}
		if (!this.current || !this.session.isActiveContentStore(store)) return null;
		const query = options.query?.trim();
		if (!query) return this.current ? await filterTaskQueryResults(store.getTasks(), options, this.filesystem) : null;
		const filters: SearchFilters = {};
		for (const field of ["status", "excludeStatus", "type", "project", "priority", "assignee", "labels"] as const) {
			if (options.filters?.[field]) filters[field] = options.filters[field];
		}
		if (options.filters?.labels) filters.labelMatch = options.filters.labelMatch;
		const seen = new Set<string>();
		const tasks = (await this.session.getSearchService())
			.search({
				query,
				limit: options.limit,
				types: ["task"],
				filters: Object.keys(filters).length ? filters : undefined,
			})
			.flatMap((result) => {
				if (result.type !== "task" || seen.has(result.task.id)) return [];
				seen.add(result.task.id);
				return [result.task];
			});
		return this.current && this.session.isActiveContentStore(store)
			? await filterTaskQueryResults(tasks, options, this.filesystem)
			: null;
	}

	async query(options: TaskQueryOptions): Promise<Task[] | null> {
		if (options.includeCrossBranch !== false) return await this.queryCrossBranch(options);
		const localTasks = await this.filesystem.listTasks();
		const query = options.query?.trim();
		const tasks = query ? createTaskSearchIndex(localTasks).search({ query }) : localTasks;
		const filtered = await filterTaskQueryResults(tasks, options, this.filesystem);
		return this.current ? filtered : null;
	}

	async get(taskId: string, options: { refreshCrossBranch?: boolean } = {}): Promise<Task | null | undefined> {
		let store: ContentStore;
		try {
			store = await this.session.getContentStore();
		} catch (error) {
			if (!this.current) return undefined;
			throw error;
		}
		if (!this.current || !this.session.isActiveContentStore(store)) return undefined;
		try {
			if (this.storeAlreadyReady && options.refreshCrossBranch !== false) await this.session.refreshTasksForTaskRead();
		} catch (error) {
			if (!this.current) return undefined;
			throw error;
		}
		if (!this.current || !this.session.isActiveContentStore(store)) return undefined;
		const resolution = store.resolveTaskForRead(taskId);
		if (resolution.status === "ambiguous") throw new AmbiguousTaskIdError(taskId, resolution.candidates);
		if (resolution.status === "found") return resolution.task;
		try {
			await this.filesystem.loadTask(taskId);
		} catch (error) {
			if (!this.current) return undefined;
			throw error;
		}
		return this.current ? null : undefined;
	}

	async getWithSubtasks(
		taskId: string,
		localTasks: Task[] | undefined,
		options: { includeCrossBranch?: boolean; refreshCrossBranch?: boolean },
	): Promise<Task | null | undefined> {
		const task =
			options.includeCrossBranch === false
				? await this.mutations.loadWorkingCopyTask(taskId, false, localTasks)
				: await this.get(taskId, options);
		if (!this.current || !task) return this.current ? task : undefined;
		const tasks = localTasks ?? (await this.filesystem.listTasks());
		return this.current ? attachSubtaskSummaries(task, tasks) : undefined;
	}
}
