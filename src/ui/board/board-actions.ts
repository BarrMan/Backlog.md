import type { Core } from "../../core/backlog.ts";
import type { Task, TaskCreateInput } from "../../types/index.ts";
import type { Board, BoardMoveCommit } from "./board.ts";

export type BoardMoveFeedback =
	| { status: "idle" }
	| { status: "saved"; commit: BoardMoveCommit }
	| { status: "partial"; commit: BoardMoveCommit; failures: Array<{ taskId: string; reason: string }> }
	| { status: "failed"; commit: BoardMoveCommit; error: Error };

export type BoardSettingFeedback = { status: "saved" } | { status: "failed"; error: Error } | { status: "pending" };

/** Persists board intents and reconciles their results into Board's canonical corpus. */
export class BoardActions {
	private readonly getCore: () => Promise<Core>;
	private writes = new Set<Promise<unknown>>();

	constructor(
		private readonly board: Board,
		core: Core | (() => Promise<Core>),
	) {
		this.getCore = typeof core === "function" ? core : async () => core;
	}

	async confirmMove(): Promise<BoardMoveFeedback> {
		const commit = this.board.completeMove();
		if (!commit) return { status: "idle" };
		const finish = this.board.beginWrite();
		if (!finish) return { status: "idle" };
		return await this.track(
			(async () => {
				try {
					const core = await this.getCore();
					const config = await core.filesystem.loadConfig();
					if (commit.kind === "move") {
						const result = await core.moveTasksToStatus({
							taskIds: commit.taskIds,
							targetStatus: commit.targetStatus,
							orderedTaskIds: commit.orderedTaskIds,
							autoCommit: config?.autoCommit ?? false,
						});
						this.board.upsert([...result.changedTasks, ...result.movedTasks]);
						return result.failures.length > 0
							? { status: "partial" as const, commit, failures: result.failures }
							: { status: "saved" as const, commit };
					}
					const result = await core.reorderTask({
						taskId: commit.taskIds[0] as string,
						targetStatus: commit.targetStatus,
						orderedTaskIds: commit.orderedTaskIds,
						autoCommit: config?.autoCommit ?? false,
					});
					this.board.upsert([...result.changedTasks, result.updatedTask]);
					return { status: "saved" as const, commit };
				} catch (error) {
					return { status: "failed" as const, commit, error: toError(error) };
				} finally {
					finish();
				}
			})(),
		);
	}

	async createTask(input: TaskCreateInput): Promise<Task> {
		const finish = this.board.beginWrite();
		if (!finish) throw new Error("A board write is already in progress.");
		return await this.track(
			(async () => {
				try {
					const core = await this.getCore();
					const config = await core.filesystem.loadConfig();
					const { task } = await core.createTaskFromInput(input, config?.autoCommit ?? false);
					if (task.status.trim().toLowerCase() !== "draft") this.board.upsert([task]);
					return task;
				} finally {
					finish();
				}
			})(),
		);
	}

	async setHideEmptyColumns(value: boolean): Promise<BoardSettingFeedback> {
		const finish = this.board.beginWrite();
		if (!finish) return { status: "pending" };
		const previous = this.board.hideEmptyColumns;
		this.board.setHideEmptyColumns(value);
		return await this.track(
			(async () => {
				try {
					const core = await this.getCore();
					const config = await core.filesystem.loadConfig();
					if (!config) throw new Error("No config found");
					await core.filesystem.saveConfig({ ...config, hideEmptyColumns: value });
					return { status: "saved" as const };
				} catch (error) {
					this.board.setHideEmptyColumns(previous);
					return { status: "failed" as const, error: toError(error) };
				} finally {
					finish();
				}
			})(),
		);
	}

	async settle(): Promise<void> {
		while (this.writes.size > 0) await Promise.all([...this.writes]);
	}

	private async track<T>(write: Promise<T>): Promise<T> {
		this.writes.add(write);
		try {
			return await write;
		} finally {
			this.writes.delete(write);
		}
	}
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
