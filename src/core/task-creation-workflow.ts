import { readFile } from "node:fs/promises";
import { FALLBACK_STATUS } from "../constants/index.ts";
import { EntityType, type Task, type TaskCreateInput } from "../types/index.ts";
import { formatStoredDate } from "../utils/date.ts";
import { validateDependencies } from "../utils/task-builders.ts";
import { getTaskPath } from "../utils/task-path.ts";
import type { Core } from "./backlog.ts";
import { buildCreatedTask, prepareTaskCreationInput } from "./task-creation-input.ts";
import { readFileIfPresent } from "./task-creation-transaction.ts";

/** Owns one allocation and write transaction against a Core project session. */
export class TaskCreationService {
	constructor(private readonly core: Core) {}

	async create(input: TaskCreateInput, autoCommit?: boolean): Promise<{ task: Task; filePath?: string }> {
		const prepared = prepareTaskCreationInput(input);
		const requestedStatus = input.status?.trim();
		const status = requestedStatus
			? prepared.isDraft
				? "Draft"
				: await this.core.requireCanonicalStatus(requestedStatus)
			: "";
		const priority = await this.core.normalizePriority(input.priority);
		const type = await this.core.normalizeTaskType(input.type);
		const project = await this.core.normalizeProject(input.project);
		const createdDate = formatStoredDate();
		const config = await this.core.filesystem.loadConfig();
		const autoCommitEnabled = await this.core.shouldAutoCommit(autoCommit);

		const { task, write } = await this.core.withCreateLock(async () => {
			const parentTaskId = prepared.requestedParentTaskId
				? await this.core.resolveParentTaskIdForCreate(prepared.requestedParentTaskId)
				: undefined;
			const id = await this.core.generateNextId(prepared.isDraft ? EntityType.Draft : EntityType.Task, parentTaskId);
			const { valid, invalid } = await validateDependencies(prepared.dependencies, this.core.filesystem, {
				id,
				title: prepared.title,
				status: prepared.isDraft ? "Draft" : status || config?.defaultStatus || FALLBACK_STATUS,
				assignee: [],
				createdDate,
				labels: [],
				dependencies: [],
			});
			if (invalid.length > 0) throw this.core.formatMissingDependenciesError(invalid);
			const task = buildCreatedTask(input, prepared, config, {
				id,
				parentTaskId,
				dependencies: valid,
				status,
				priority,
				type,
				project,
				ordinal: await this.core.resolveCreateOrdinal(input.ordinal, prepared.isDraft),
				createdDate,
			});
			const previousPath = prepared.isDraft
				? await this.core.filesystem.resolveDraftFilePath(task.id)
				: await getTaskPath(task.id, this.core);
			const targetPath = await this.core.filesystem.getTaskWritePath(task, prepared.isDraft);
			const targetContent = await readFileIfPresent(targetPath);
			const previousIndexEntries = autoCommitEnabled ? await this.core.git.getIndexEntries(targetPath) : undefined;
			const filePath = await this.core.writePreparedTask(task, prepared.isDraft);
			return {
				task,
				write: {
					filePath,
					createdContent: await readFile(filePath),
					previousPath: targetContent ? targetPath : previousPath,
					previousContent: targetContent ?? (await readFileIfPresent(previousPath)),
					previousIndexEntries,
				},
			};
		});

		try {
			const savedTask = await this.core.finalizeCreatedTask(
				task,
				write.filePath,
				prepared.isDraft,
				autoCommitEnabled,
				write,
			);
			return { task: savedTask ?? task, filePath: write.filePath };
		} catch (error) {
			const rollback = await this.core.rollbackCreatedTask(write).catch((rollbackError) => {
				const message = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
				throw new Error(`Task creation failed and cleanup also failed: ${message}`, { cause: error });
			});
			if (!rollback.workingPathRestored || !rollback.indexRestored) {
				if (!rollback.indexRestored) {
					throw new Error(
						`Task creation failed, and Backlog no longer owned the staged entry for ${write.filePath}. The task file and staged Git state were preserved, ${task.id} remains in use, and manual Git review is required before retrying.`,
						{ cause: error },
					);
				}
				throw new Error(
					`Task creation failed, and cleanup could not safely remove the changed file at ${write.filePath}. Your changes were preserved. Review or remove the preserved file before retrying because ${task.id} remains in use.`,
					{ cause: error },
				);
			}
			throw error;
		}
	}
}
