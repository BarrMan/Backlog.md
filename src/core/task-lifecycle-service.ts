import { mkdir, rename as moveFile, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { DEFAULT_DONE_STATUS, DEFAULT_STATUSES, FALLBACK_STATUS } from "../constants/index.ts";
import type { FileSystem } from "../file-system/operations.ts";
import { type DraftFileReference, isConfigValueError, isCreateLockError } from "../file-system/operations.ts";
import type { GitOperations } from "../git/operations.ts";
import { EntityType, type Task, type TaskUpdateInput } from "../types/index.ts";
import { normalizeAssignee } from "../utils/assignee.ts";
import { formatStoredDate } from "../utils/date.ts";
import { normalizeId } from "../utils/prefix-config.ts";
import { validateDependencies } from "../utils/task-builders.ts";
import { withoutVacatedTaskLinks } from "../utils/task-links.ts";
import { extractDraftIdFromFilename, getTaskPath, normalizeTaskId } from "../utils/task-path.ts";
import { getTerminalStatus, isTerminalStatus } from "../utils/terminal-status.ts";
import type { ProjectSession, VacatedTaskResult } from "./backlog.ts";
import type { ProjectTaskMutations } from "./task-mutation-service.ts";
import type { TaskReadOptions } from "./task-query-workflow.ts";
import { markVacatedTaskMoved, type VacatedTaskReferenceService } from "./vacated-task-reference-service.ts";

export class TaskArchiveStatusError extends Error {
	constructor(taskId: string, terminalStatus: string) {
		super(
			`Task ${taskId} is ${terminalStatus}. Use Complete to move finished work to completed storage and preserve its links. Use: backlog task complete ${taskId}`,
		);
		this.name = "TaskArchiveStatusError";
	}
}

export interface TaskEditLifecycleResult {
	task: Task;
	cleanedTaskIds: string[];
}

/** Owns task and draft transitions, including vacated-ID cleanup. */
export class TaskLifecycleService {
	constructor(
		private readonly filesystem: FileSystem,
		private readonly git: GitOperations,
		private readonly session: ProjectSession,
		private readonly mutations: ProjectTaskMutations,
		private readonly vacatedTaskReferences: VacatedTaskReferenceService,
	) {}

	async promoteDraftWithUpdates(
		reference: DraftFileReference,
		input: TaskUpdateInput,
		autoCommit?: boolean,
	): Promise<Task> {
		const targetStatus = input.status?.trim();
		if (!targetStatus || targetStatus.toLowerCase() === "draft") {
			throw new Error("Promoting a draft requires a non-draft status.");
		}

		const canonicalStatus = await this.mutations.requireCanonicalStatus(targetStatus);
		return await this.filesystem.withDraftLock(reference, async () => {
			const current = await this.filesystem.draftReferenceFromPath(reference.filePath);
			const draft = current.task;
			draft.id = reference.canonicalId;
			const { mutated } = await this.mutations.applyTaskUpdateInput(
				draft,
				{ ...input, status: undefined },
				async (status) => {
					if (status.trim().toLowerCase() !== "draft") throw new Error("Drafts must use status Draft.");
					return "Draft";
				},
			);

			const { promotedTask, savedPath } = await this.mutations.withCreateLock(async () => {
				const newTaskId = await this.mutations.generateNextId(EntityType.Task, draft.parentTaskId);
				await validateDependencies(draft.dependencies ?? [], this.filesystem, { ...draft, id: newTaskId });
				const promotedTask: Task = {
					...draft,
					id: newTaskId,
					status: canonicalStatus,
					filePath: undefined,
					...(mutated || draft.status !== canonicalStatus ? { updatedDate: formatStoredDate() } : {}),
				};
				normalizeAssignee(promotedTask);
				const savedPath = await this.filesystem.saveTask(promotedTask);
				if (current.filePath) await unlink(current.filePath);
				return { promotedTask, savedPath };
			});

			const savedTask = await this.filesystem.loadTask(promotedTask.id);
			if (savedTask) this.session.publishActiveTask(savedTask);
			if (await this.mutations.shouldAutoCommit(autoCommit)) {
				await this.mutations.commitWrittenFile(
					`backlog: Promote draft ${normalizeId(reference.canonicalId, "draft")}`,
					[reference.filePath],
					savedPath,
				);
			}
			return savedTask ?? { ...promotedTask, filePath: savedPath };
		});
	}

	async demoteTaskWithUpdates(
		task: Task,
		input: TaskUpdateInput,
		autoCommit?: boolean,
		options: TaskReadOptions = {},
	): Promise<TaskEditLifecycleResult> {
		return await this.vacatedTaskReferences.withLockedCleanup(task, task.id, async (cleanup) => {
			const current = await this.mutations.loadTaskForMutation(task.id, options);
			if (!current) throw new Error(`Task not found: ${task.id}`);
			const { mutated } = await this.mutations.applyTaskUpdateInput(
				current,
				{ ...input, status: undefined },
				async (status) => {
					return status.trim().toLowerCase() === "draft"
						? "Draft"
						: await this.mutations.requireCanonicalStatus(status);
				},
			);
			const vacating = withoutVacatedTaskLinks(current, current.id) ?? current;
			const { demotedDraft, savedPath } = await this.mutations.withCreateLock(async () => {
				const newDraftId = await this.mutations.generateNextId(EntityType.Draft);
				await validateDependencies(vacating.dependencies ?? [], this.filesystem, { ...vacating, id: newDraftId });
				const demotedDraft: Task = {
					...vacating,
					id: newDraftId,
					status: "Draft",
					filePath: undefined,
					...(mutated || current.status !== "Draft" ? { updatedDate: formatStoredDate() } : {}),
				};
				normalizeAssignee(demotedDraft);
				const savedPath = await this.filesystem.saveDraft(demotedDraft);
				if (current.filePath) await unlink(current.filePath);
				return { demotedDraft, savedPath };
			});

			let cleanedTaskIds: string[] = [];
			let cleanedPaths: string[] = [];
			try {
				const written = await this.vacatedTaskReferences.write(cleanup);
				cleanedTaskIds = written.cleanedTaskIds;
				cleanedPaths = written.filePaths;
			} catch (error) {
				throw markVacatedTaskMoved(error, "demotionState", "cleanup");
			}
			try {
				if (await this.mutations.shouldAutoCommit(autoCommit)) {
					await this.mutations.commitWrittenFile(
						`backlog: Demote task ${normalizeTaskId(current.id)}`,
						current.filePath ? [current.filePath] : [],
						savedPath,
						cleanedPaths,
					);
				}
			} catch (error) {
				throw markVacatedTaskMoved(error, "demotionState", "commit");
			}
			return {
				task: (await this.filesystem.loadDraft(demotedDraft.id)) ?? { ...demotedDraft, filePath: savedPath },
				cleanedTaskIds,
			};
		});
	}

	async archive(taskId: string, autoCommit?: boolean, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		const taskToArchive = await this.mutations.loadTaskForMutation(taskId, options);
		if (!taskToArchive) return { success: false, cleanedTaskIds: [] };
		return await this.vacatedTaskReferences.withLockedCleanup(taskToArchive, taskToArchive.id, async (cleanup) => {
			const current = await this.mutations.loadTaskForMutation(taskToArchive.id, options);
			if (!current) return { success: false, cleanedTaskIds: [] };
			const config = await this.filesystem.loadConfig();
			const statuses = config?.statuses ?? [...DEFAULT_STATUSES];
			if (isTerminalStatus(current.status, statuses)) {
				throw new TaskArchiveStatusError(current.id, getTerminalStatus(statuses) ?? DEFAULT_DONE_STATUS);
			}
			const fromPath = current.filePath ?? (await getTaskPath(current.id, { filesystem: this.filesystem }));
			const filename = fromPath ? basename(fromPath) : null;
			if (!fromPath || !filename) return { success: false, cleanedTaskIds: [] };
			const toPath = join(await this.filesystem.getArchiveTasksDir(), filename);
			try {
				await mkdir(dirname(toPath), { recursive: true });
				await moveFile(fromPath, toPath);
			} catch {
				return { success: false, cleanedTaskIds: [] };
			}
			this.session.publishTaskTransition(current.id);
			try {
				const { cleanedTaskIds, filePaths } = await this.vacatedTaskReferences.write(cleanup);
				if (await this.mutations.shouldAutoCommit(autoCommit)) {
					const repoRoot = await this.git.stageFileMove(fromPath, toPath);
					for (const path of filePaths) await this.git.addFile(path);
					await this.git.commitFiles(`backlog: Archive task ${current.id}`, [fromPath, toPath, ...filePaths], repoRoot);
				}
				return { success: true, cleanedTaskIds };
			} catch (error) {
				throw markVacatedTaskMoved(error, "archiveState");
			}
		});
	}

	async promoteDraft(draftId: string, autoCommit?: boolean): Promise<boolean> {
		const sourcePath = await this.filesystem.resolveDraftFilePath(draftId);
		if (!sourcePath) return false;
		const canonicalId = extractDraftIdFromFilename(basename(sourcePath));
		if (!canonicalId) return false;
		return await this.filesystem.withDraftLock({ filePath: sourcePath, canonicalId }, async () => {
			let moved: { previousPath: string; savedPath: string } | null = null;
			try {
				moved = await this.mutations.withCreateLock(async () => {
					const draft = await this.filesystem.loadDraftFromFile(sourcePath);
					if (!draft) return null;
					const config = await this.filesystem.loadConfig();
					const promotedTask: Task = {
						...draft,
						id: await this.mutations.generateNextId(EntityType.Task, draft.parentTaskId),
						status:
							!draft.status || draft.status.trim().toLowerCase() === "draft"
								? config?.defaultStatus || FALLBACK_STATUS
								: draft.status,
						filePath: undefined,
					};
					normalizeAssignee(promotedTask);
					const savedPath = await this.filesystem.saveTask(promotedTask);
					await unlink(sourcePath);
					const savedTask = await this.filesystem.loadTask(promotedTask.id);
					if (savedTask) this.session.publishActiveTask(savedTask);
					return { previousPath: sourcePath, savedPath };
				});
			} catch (error) {
				if (isCreateLockError(error) || isConfigValueError(error)) throw error;
				return false;
			}
			if (moved && (await this.mutations.shouldAutoCommit(autoCommit))) {
				await this.mutations.commitWrittenFile(
					`backlog: Promote draft ${normalizeId(draftId, "draft")}`,
					[moved.previousPath],
					moved.savedPath,
				);
			}
			return moved !== null;
		});
	}

	async demoteTask(taskId: string, autoCommit?: boolean, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		const task = await this.mutations.loadTaskForMutation(taskId, options);
		if (!task) return { success: false, cleanedTaskIds: [] };
		const demotion = {
			success: false,
			moved: undefined as { previousPath: string; savedPath: string } | undefined,
			cleanedTaskIds: [] as string[],
			cleanedPaths: [] as string[],
		};
		let result: typeof demotion;
		try {
			result = await this.vacatedTaskReferences.withLockedCleanup(task, task.id, async (cleanup) => {
				const movedPaths: Array<{ previousPath: string; savedPath: string }> = [];
				const success = await this.filesystem.demoteTask(task.id, (previousPath, savedPath) =>
					movedPaths.push({ previousPath, savedPath }),
				);
				demotion.success = success;
				demotion.moved = movedPaths[0];
				if (success) {
					this.session.publishTaskTransition(task.id);
					try {
						const written = await this.vacatedTaskReferences.write(cleanup);
						demotion.cleanedTaskIds = written.cleanedTaskIds;
						demotion.cleanedPaths = written.filePaths;
					} catch (error) {
						throw markVacatedTaskMoved(error, "demotionState", "cleanup");
					}
				}
				return demotion;
			});
		} catch (error) {
			if (demotion.success && demotion.moved) throw markVacatedTaskMoved(error, "demotionState");
			throw error;
		}
		if (result.success && result.moved) {
			try {
				if (await this.mutations.shouldAutoCommit(autoCommit)) {
					await this.mutations.commitWrittenFile(
						`backlog: Demote task ${task.id}`,
						[result.moved.previousPath],
						result.moved.savedPath,
						result.cleanedPaths,
					);
				}
			} catch (error) {
				throw markVacatedTaskMoved(error, "demotionState", "commit");
			}
		}
		return { success: result.success, cleanedTaskIds: result.cleanedTaskIds };
	}

	async complete(taskId: string, autoCommit?: boolean, options: TaskReadOptions = {}): Promise<boolean> {
		const task = await this.mutations.loadTaskForMutation(taskId, options);
		if (!task) return false;
		const taskPath = task.filePath ?? (await getTaskPath(task.id, { filesystem: this.filesystem }));
		const filename = taskPath ? basename(taskPath) : null;
		if (!taskPath || !filename) return false;
		const targetPath = join(this.filesystem.completedDir, filename);
		try {
			await mkdir(dirname(targetPath), { recursive: true });
			await moveFile(taskPath, targetPath);
		} catch {
			return false;
		}
		this.session.publishTaskTransition(task.id, { ...task, filePath: targetPath, source: "completed" });
		if (await this.mutations.shouldAutoCommit(autoCommit)) {
			const repoRoot = await this.git.stageFileMove(taskPath, targetPath);
			await this.git.commitFiles(`backlog: Complete task ${task.id}`, [taskPath, targetPath], repoRoot);
		}
		return true;
	}

	async archiveDraft(draftId: string, autoCommit?: boolean): Promise<boolean> {
		const autoCommitEnabled = await this.mutations.shouldAutoCommit(autoCommit);
		const moved = await this.filesystem.archiveDraft(draftId);
		if (moved && autoCommitEnabled) {
			await this.mutations.commitWrittenFile(
				`backlog: Archive draft ${normalizeId(draftId, "draft")}`,
				[moved.sourcePath],
				moved.targetPath,
			);
		}
		return moved !== null;
	}

	async getTerminalStatusTasksByAge(olderThanDays: number): Promise<Task[]> {
		const [tasks, config] = await Promise.all([this.filesystem.listTasks(), this.filesystem.loadConfig()]);
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - olderThanDays);
		const statuses = config?.statuses ?? [...DEFAULT_STATUSES];
		return tasks.filter((task) => {
			if (!isTerminalStatus(task.status, statuses)) return false;
			const storedDate = task.updatedDate || task.createdDate;
			return Boolean(storedDate) && new Date(storedDate) < cutoff;
		});
	}
}
