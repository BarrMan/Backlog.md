import { readFile, unlink, writeFile } from "node:fs/promises";
import type { GitIndexEntry } from "../git/operations.ts";

export interface CreatedTaskWrite {
	filePath: string;
	createdContent: Buffer;
	previousPath: string | null;
	previousContent: Buffer | null;
	previousIndexEntries?: GitIndexEntry[];
	generatedIndexEntries?: GitIndexEntry[];
}

export interface CreatedTaskRollbackResult {
	indexRestored: boolean;
	workingPathRestored: boolean;
}

type CreationTransactionDependencies = {
	restoreIndexEntriesIfMatches: (
		filePath: string,
		generated: GitIndexEntry[],
		previous: GitIndexEntry[],
	) => Promise<boolean>;
};

export async function readFileIfPresent(filePath: string | null): Promise<Buffer | null> {
	if (!filePath) return null;
	try {
		return await readFile(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

async function restoreCreatedPath(write: CreatedTaskWrite, indexRestored: boolean): Promise<boolean> {
	const currentContent = await readFileIfPresent(write.filePath);
	if (currentContent === null) {
		if (write.previousPath !== write.filePath || !write.previousContent) return true;
		try {
			await writeFile(write.filePath, write.previousContent, { flag: "wx" });
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
			throw error;
		}
	}
	if (!currentContent.equals(write.createdContent) || !indexRestored) return false;
	if (write.previousPath === write.filePath && write.previousContent) {
		await writeFile(write.filePath, write.previousContent);
	} else {
		await unlink(write.filePath);
	}
	return true;
}

async function restorePreviousPath(write: CreatedTaskWrite): Promise<void> {
	if (!write.previousPath || write.previousPath === write.filePath || !write.previousContent) return;
	if ((await readFileIfPresent(write.previousPath)) === null) {
		await writeFile(write.previousPath, write.previousContent);
	}
}

export async function rollbackCreatedTask(
	write: CreatedTaskWrite,
	dependencies: CreationTransactionDependencies,
): Promise<CreatedTaskRollbackResult> {
	const indexRestored = write.generatedIndexEntries
		? await dependencies.restoreIndexEntriesIfMatches(
				write.filePath,
				write.generatedIndexEntries,
				write.previousIndexEntries ?? [],
			)
		: true;
	const workingPathRestored = await restoreCreatedPath(write, indexRestored);
	await restorePreviousPath(write);
	return { indexRestored, workingPathRestored };
}
