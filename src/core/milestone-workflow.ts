import { rename as moveFile } from "node:fs/promises";
import type { Milestone, Task } from "../types/index.ts";
import { normalizeDueDate } from "../utils/due-date.ts";
import type { Core } from "./backlog.ts";
import { buildMilestoneMatchKeys, findActiveMilestoneByAlias, keySetsIntersect } from "./milestone-resolution.ts";
import { milestoneKey, normalizeMilestoneName } from "./milestones.ts";

export type MilestoneRenameInput = { from: string; to: string; updateTasks?: boolean; dueDate?: string | null };
export type MilestoneRemoveInput = { name: string; taskHandling?: "clear" | "keep" | "reassign"; reassignTo?: string };

export class MilestoneWorkflowError extends Error {
	constructor(
		message: string,
		readonly code: "VALIDATION_ERROR" | "NOT_FOUND" | "INTERNAL_ERROR",
	) {
		super(message);
		this.name = "MilestoneWorkflowError";
	}
}

export type MilestoneRenameResult = {
	source: Milestone;
	milestone: Milestone;
	titleChanged: boolean;
	dueDateChanged: boolean;
	updatedTaskIds: string[];
	skippedTaskUpdate: boolean;
	sourcePath?: string;
	targetPath?: string;
};

export type MilestoneRemoveResult = {
	milestone: Milestone;
	taskHandling: "clear" | "keep" | "reassign";
	reassignedMilestone?: Milestone;
	updatedTaskIds: string[];
};

type MilestoneTaskUpdate = {
	previousMilestones: Map<string, string | undefined>;
	updatedTaskIds: string[];
	updatedTaskFilePaths: Set<string>;
};

async function updateTaskMilestones(core: Core, tasks: Task[], milestone: string | null): Promise<MilestoneTaskUpdate> {
	const previousMilestones = new Map<string, string | undefined>();
	const updatedTaskFilePaths = new Set<string>();
	const updatedTaskIds: string[] = [];
	for (const task of tasks) {
		previousMilestones.set(task.id, task.milestone);
		const updatedTask = await core.editTask(task.id, { milestone }, false);
		const taskFilePath = updatedTask.filePath ?? task.filePath;
		if (taskFilePath) updatedTaskFilePaths.add(taskFilePath);
		updatedTaskIds.push(task.id);
	}
	return {
		previousMilestones,
		updatedTaskIds: updatedTaskIds.sort((a, b) => a.localeCompare(b)),
		updatedTaskFilePaths,
	};
}

async function rollbackTaskMilestones(
	core: Core,
	previousMilestones: Map<string, string | undefined>,
): Promise<string[]> {
	const failedTaskIds: string[] = [];
	for (const [taskId, milestone] of previousMilestones) {
		try {
			await core.editTask(taskId, { milestone: milestone ?? null }, false);
		} catch {
			failedTaskIds.push(taskId);
		}
	}
	return failedTaskIds.sort((a, b) => a.localeCompare(b));
}

function recordMatchKeys(milestone: Milestone): Set<string> {
	const keys = buildMilestoneMatchKeys(milestone.id, [milestone]);
	const titleKey = milestoneKey(milestone.title);
	if (titleKey) keys.add(titleKey);
	return keys;
}

function titleAliasCollides(source: Milestone, candidates: Milestone[]): boolean {
	const titleKey = milestoneKey(source.title);
	return (
		Boolean(titleKey) &&
		candidates.some(
			(candidate) => milestoneKey(candidate.id) !== milestoneKey(source.id) && recordMatchKeys(candidate).has(titleKey),
		)
	);
}

function taskMatchKeys(input: string, milestone: Milestone, includeTitle: boolean): Set<string> {
	const keys = buildMilestoneMatchKeys(includeTitle ? input : milestone.id, [milestone]);
	for (const key of buildMilestoneMatchKeys(milestone.id, [milestone])) keys.add(key);
	const titleKey = milestoneKey(milestone.title);
	if (titleKey && includeTitle) keys.add(titleKey);
	if (titleKey && !includeTitle) keys.delete(titleKey);
	return keys;
}

export class MilestoneWorkflow {
	constructor(private readonly core: Core) {}

	private async commit(
		commitMessage: string,
		options: { sourcePath?: string; targetPath?: string; taskFilePaths?: Iterable<string> },
	): Promise<void> {
		if (!(await this.core.shouldAutoCommit())) return;
		let repoRoot: string | null = null;
		const paths: string[] = [];
		if (options.sourcePath && options.targetPath) {
			repoRoot = await this.core.git.stageFileMove(options.sourcePath, options.targetPath);
			paths.push(options.sourcePath, options.targetPath);
		}
		for (const path of options.taskFilePaths ?? []) {
			await this.core.git.addFile(path);
			paths.push(path);
		}
		try {
			await this.core.git.commitFiles(commitMessage, paths, repoRoot);
		} catch (error) {
			await this.core.git.resetPaths(paths, repoRoot);
			throw error;
		}
	}

	async rename(input: MilestoneRenameInput): Promise<MilestoneRenameResult> {
		const from = normalizeMilestoneName(input.from);
		const to = normalizeMilestoneName(input.to);
		if (!from || !to)
			throw new MilestoneWorkflowError("Both 'from' and 'to' milestone names are required.", "VALIDATION_ERROR");
		const [active, archived] = await Promise.all([
			this.core.filesystem.listMilestones(),
			this.core.filesystem.listArchivedMilestones(),
		]);
		const source = findActiveMilestoneByAlias(from, active);
		if (!source) throw new MilestoneWorkflowError(`Milestone not found: "${from}"`, "NOT_FOUND");
		let dueDate: string | undefined;
		try {
			dueDate =
				input.dueDate === undefined
					? source.dueDate
					: input.dueDate === null
						? undefined
						: normalizeDueDate(input.dueDate, "Due date");
		} catch (error) {
			throw new MilestoneWorkflowError(error instanceof Error ? error.message : String(error), "VALIDATION_ERROR");
		}
		const titleChanged = to !== source.title.trim();
		const dueDateChanged = dueDate !== source.dueDate;
		if (!titleChanged && !dueDateChanged)
			return { source, milestone: source, titleChanged, dueDateChanged, updatedTaskIds: [], skippedTaskUpdate: false };
		const conflict = active.find(
			(milestone) =>
				milestoneKey(milestone.id) !== milestoneKey(source.id) &&
				keySetsIntersect(buildMilestoneMatchKeys(to, active), recordMatchKeys(milestone)),
		);
		if (conflict)
			throw new MilestoneWorkflowError(
				`Milestone alias conflict: "${to}" matches existing milestone "${conflict.title}" (${conflict.id}).`,
				"VALIDATION_ERROR",
			);
		const shouldUpdateTasks = titleChanged && (input.updateTasks ?? true);
		const tasks = shouldUpdateTasks ? await this.core.filesystem.listTasks() : [];
		const keys = shouldUpdateTasks
			? taskMatchKeys(from, source, !titleAliasCollides(source, [...active, ...archived]))
			: new Set<string>();
		const renamed = await this.core.renameMilestone(source.id, to, false, input.dueDate);
		if (!renamed.success || !renamed.milestone)
			throw new MilestoneWorkflowError(`Failed to rename milestone "${source.title}".`, "INTERNAL_ERROR");
		let updates: MilestoneTaskUpdate = {
			previousMilestones: new Map(),
			updatedTaskIds: [],
			updatedTaskFilePaths: new Set(),
		};
		const rollback = async () => {
			const taskFailures = await rollbackTaskMilestones(this.core, updates.previousMilestones);
			const renameResult = await this.core.renameMilestone(source.id, source.title, false, source.dueDate ?? null);
			const details = [
				!renameResult.success ? "failed to rollback milestone file rename" : "",
				taskFailures.length ? `failed to rollback task milestones for: ${taskFailures.join(", ")}` : "",
			].filter(Boolean);
			return details.length ? ` (${details.join("; ")})` : "";
		};
		try {
			if (shouldUpdateTasks)
				updates = await updateTaskMilestones(
					this.core,
					tasks.filter((task) => keys.has(milestoneKey(task.milestone ?? ""))),
					source.id,
				);
			await this.commit(`backlog: ${titleChanged ? "Rename" : "Update"} milestone ${source.id}`, {
				sourcePath: renamed.sourcePath,
				targetPath: renamed.targetPath,
				taskFilePaths: updates.updatedTaskFilePaths,
			});
		} catch {
			throw new MilestoneWorkflowError(
				`Failed while finalizing milestone rename "${source.title}"${await rollback()}.`,
				"INTERNAL_ERROR",
			);
		}
		return {
			source,
			milestone: renamed.milestone,
			titleChanged,
			dueDateChanged,
			updatedTaskIds: updates.updatedTaskIds,
			skippedTaskUpdate: titleChanged && !shouldUpdateTasks,
			sourcePath: renamed.sourcePath,
			targetPath: renamed.targetPath,
		};
	}

	async remove(input: MilestoneRemoveInput): Promise<MilestoneRemoveResult> {
		const name = normalizeMilestoneName(input.name);
		if (!name) throw new MilestoneWorkflowError("Milestone name cannot be empty.", "VALIDATION_ERROR");
		const [active, archived] = await Promise.all([
			this.core.filesystem.listMilestones(),
			this.core.filesystem.listArchivedMilestones(),
		]);
		const source = findActiveMilestoneByAlias(name, active);
		if (!source) throw new MilestoneWorkflowError(`Milestone not found: "${name}"`, "NOT_FOUND");
		const taskHandling = input.taskHandling ?? "clear";
		const reassignedMilestone =
			taskHandling === "reassign"
				? findActiveMilestoneByAlias(normalizeMilestoneName(input.reassignTo ?? ""), active)
				: undefined;
		if (taskHandling === "reassign" && !input.reassignTo?.trim())
			throw new MilestoneWorkflowError("reassignTo is required when taskHandling is reassign.", "VALIDATION_ERROR");
		if (taskHandling === "reassign" && !reassignedMilestone)
			throw new MilestoneWorkflowError(`Target milestone not found: "${input.reassignTo}"`, "VALIDATION_ERROR");
		if (reassignedMilestone && milestoneKey(reassignedMilestone.id) === milestoneKey(source.id))
			throw new MilestoneWorkflowError("reassignTo must be different from the removed milestone.", "VALIDATION_ERROR");
		const tasks = taskHandling === "keep" ? [] : await this.core.filesystem.listTasks();
		const keys = taskMatchKeys(name, source, !titleAliasCollides(source, [...active, ...archived]));
		let updates: MilestoneTaskUpdate = {
			previousMilestones: new Map(),
			updatedTaskIds: [],
			updatedTaskFilePaths: new Set(),
		};
		try {
			if (taskHandling !== "keep")
				updates = await updateTaskMilestones(
					this.core,
					tasks.filter((task) => keys.has(milestoneKey(task.milestone ?? ""))),
					reassignedMilestone?.id ?? null,
				);
		} catch {
			const failures = await rollbackTaskMilestones(this.core, updates.previousMilestones);
			throw new MilestoneWorkflowError(
				`Failed while updating tasks for milestone removal "${source.title}"${failures.length ? ` (failed rollback for: ${failures.join(", ")})` : ""}.`,
				"INTERNAL_ERROR",
			);
		}
		const archivedResult = await this.core.archiveMilestone(source.id, false);
		if (!archivedResult.success) {
			const failures = await rollbackTaskMilestones(this.core, updates.previousMilestones);
			throw new MilestoneWorkflowError(
				`Failed to archive milestone "${source.title}" before removal.${failures.length ? ` (failed rollback for: ${failures.join(", ")})` : ""}`,
				"INTERNAL_ERROR",
			);
		}
		try {
			await this.commit(`backlog: Remove milestone ${source.id}`, {
				sourcePath: archivedResult.sourcePath,
				targetPath: archivedResult.targetPath,
				taskFilePaths: updates.updatedTaskFilePaths,
			});
		} catch {
			const details: string[] = [];
			if (archivedResult.sourcePath && archivedResult.targetPath)
				try {
					await moveFile(archivedResult.targetPath, archivedResult.sourcePath);
				} catch {
					details.push("failed to rollback milestone archive");
				}
			const failures = await rollbackTaskMilestones(this.core, updates.previousMilestones);
			if (failures.length) details.push(`failed rollback for: ${failures.join(", ")}`);
			throw new MilestoneWorkflowError(
				`Failed while finalizing milestone removal "${source.title}"${details.length ? ` (${details.join("; ")})` : ""}.`,
				"INTERNAL_ERROR",
			);
		}
		return { milestone: source, taskHandling, reassignedMilestone, updatedTaskIds: updates.updatedTaskIds };
	}
}
