import type { Core } from "../index.ts";

async function collectBranchIds(
	core: Core,
	directory: string,
	prefix: string,
	resourceName: string,
	remoteOperations: boolean | undefined,
): Promise<string[]> {
	try {
		if (remoteOperations === false) {
			if (process.env.DEBUG) {
				console.log(`Remote operations disabled - generating ID from local ${directory} only`);
			}
		} else {
			await core.gitOps.fetch();
		}

		const backlogDir = core.filesystem.backlogDirName;
		const branches = await core.gitOps.listAllBranches();
		const results = await Promise.all(
			branches.map(async (branch) => {
				const files = await core.gitOps.listFilesInTree(branch, `${backlogDir}/${directory}`);
				return files
					.map((file) => file.match(new RegExp(`${prefix}-(\\d+)`))?.[1])
					.filter((id): id is string => id !== undefined)
					.map((id) => `${prefix}-${id}`);
			}),
		);
		return results.flat();
	} catch (error) {
		if (process.env.DEBUG) {
			console.error(`Could not fetch remote ${resourceName} IDs:`, error);
		}
		return [];
	}
}

function nextId(ids: readonly string[], prefix: string, padding: unknown): string {
	let max = 0;
	const pattern = new RegExp(`^${prefix}-(\\d+)$`);
	for (const id of ids) {
		const match = id.match(pattern);
		if (match) max = Math.max(max, Number.parseInt(match[1] || "0", 10));
	}
	const next = max + 1;
	return `${prefix}-${typeof padding === "number" && padding > 0 ? String(next).padStart(padding, "0") : next}`;
}

/**
 * Generate the next available document ID by checking all branches and local documents
 * @param core Core instance for filesystem and git operations
 * @returns Promise<string> Next available document ID (e.g., "doc-001")
 */
export async function generateNextDocId(core: Core): Promise<string> {
	const config = await core.filesystem.loadConfig();
	const docs = await core.filesystem.listDocuments();
	return nextId(
		[
			...(await collectBranchIds(core, "docs", "doc", "document", config?.remoteOperations)),
			...docs.map((doc) => doc.id),
		],
		"doc",
		config?.zeroPaddedIds,
	);
}

/**
 * Generate the next available decision ID by checking all branches and local decisions
 * @param core Core instance for filesystem and git operations
 * @returns Promise<string> Next available decision ID (e.g., "decision-001")
 */
export async function generateNextDecisionId(core: Core): Promise<string> {
	const config = await core.filesystem.loadConfig();
	const decisions = await core.filesystem.listDecisions();
	return nextId(
		[
			...(await collectBranchIds(core, "decisions", "decision", "decision", config?.remoteOperations)),
			...decisions.map((decision) => decision.id),
		],
		"decision",
		config?.zeroPaddedIds,
	);
}
