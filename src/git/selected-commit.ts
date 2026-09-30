import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { BacklogConfig } from "../types/index.ts";

export interface GitIndexEntry {
	mode: string;
	objectId: string;
	stage: number;
}

type GitCommandOptions = {
	readOnly?: boolean;
	cwd?: string;
	input?: string;
	env?: Record<string, string>;
	acceptedExitCodes?: readonly number[];
};

export type TaskCommitRequest = {
	filePath: string;
	pathForAdd: string;
	repoRoot: string;
	expectedWorkingHash: string | null;
};

type PreparedSelectedCommit = {
	entries: Map<string, GitIndexEntry[]>;
	signCommit: boolean;
};

const TASK_COMMIT_MAX_ATTEMPTS = 3;
const TASK_COMMIT_RETRY_DELAY_MS = 100;

function indexEntriesEqual(left: readonly GitIndexEntry[], right: readonly GitIndexEntry[]): boolean {
	return (
		left.length === right.length &&
		left.every(
			(entry, index) =>
				entry.mode === right[index]?.mode &&
				entry.objectId === right[index]?.objectId &&
				entry.stage === right[index]?.stage,
		)
	);
}

export function parseIndexEntries(output: string): GitIndexEntry[] {
	return output
		.split("\0")
		.filter(Boolean)
		.flatMap((record) => {
			const tabIndex = record.indexOf("\t");
			if (tabIndex < 0) return [];
			const [mode, objectId, stageText] = record.slice(0, tabIndex).split(" ");
			const stage = Number(stageText);
			if (!mode || !objectId || !Number.isInteger(stage)) return [];
			return [{ mode, objectId, stage }];
		});
}

export class SelectedCommit {
	private hookRunSupported?: boolean;

	constructor(
		private readonly execGit: (
			args: string[],
			options?: GitCommandOptions,
		) => Promise<{ stdout: string; stderr: string }>,
		private readonly getConfig: () => BacklogConfig | null,
		private readonly hashFile: (filePath: string) => Promise<string | null>,
	) {}

	async commit(message: string, repoRoot: string, relativePaths: readonly string[]): Promise<void> {
		if (!(await this.hasStagedPaths(repoRoot, relativePaths))) return;
		await this.assertNoCommitOperationInProgress(repoRoot);
		const ownedEntries = await this.getIndexEntries(repoRoot, relativePaths);
		const temporaryDirectory = await mkdtemp(join(tmpdir(), "backlog-git-commit-"));
		const env = { GIT_INDEX_FILE: join(temporaryDirectory, "index") };
		const messagePath = join(temporaryDirectory, "message");
		try {
			const prepared = await this.prepareCommit(message, repoRoot, relativePaths, ownedEntries, env, messagePath);
			await this.updateHead(message, repoRoot, relativePaths, ownedEntries, prepared, env, messagePath);
		} finally {
			await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
		}
	}

	async commitTaskFile(
		message: string,
		request: TaskCommitRequest,
		onStaged?: (entries: GitIndexEntry[]) => void,
	): Promise<void> {
		let expectedEntries = await this.getIndexEntries(request.repoRoot, [request.pathForAdd]).then(
			(entries) => entries.get(request.pathForAdd) ?? [],
		);
		let lastError: Error | undefined;
		for (let attempt = 1; attempt <= TASK_COMMIT_MAX_ATTEMPTS; attempt += 1) {
			if ((await this.hashFile(request.filePath)) !== request.expectedWorkingHash) {
				throw lastError ?? new Error(`Task file changed before it could be committed: ${request.filePath}`);
			}
			try {
				await this.execGit(["add", request.pathForAdd], { cwd: request.repoRoot });
				expectedEntries =
					(await this.getIndexEntries(request.repoRoot, [request.pathForAdd])).get(request.pathForAdd) ?? [];
				onStaged?.(expectedEntries);
				await this.commit(message, request.repoRoot, [request.pathForAdd]);
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (attempt === TASK_COMMIT_MAX_ATTEMPTS) break;
				const currentEntries =
					(await this.getIndexEntries(request.repoRoot, [request.pathForAdd])).get(request.pathForAdd) ?? [];
				if (
					(await this.hashFile(request.filePath)) !== request.expectedWorkingHash ||
					!indexEntriesEqual(currentEntries, expectedEntries)
				) {
					throw lastError;
				}
				await new Promise((resolve) => setTimeout(resolve, 2 ** (attempt - 1) * TASK_COMMIT_RETRY_DELAY_MS));
			}
		}
		throw new Error(
			`Git operation 'commit task file ${request.filePath}' failed after ${TASK_COMMIT_MAX_ATTEMPTS} attempts: ${lastError?.message}`,
		);
	}

	async restoreIndexEntriesIfMatches(
		repoRoot: string,
		relativePath: string,
		expectedEntries: readonly GitIndexEntry[],
		restoreEntries: readonly GitIndexEntry[],
	): Promise<boolean> {
		const currentEntries = (await this.getIndexEntries(repoRoot, [relativePath])).get(relativePath) ?? [];
		if (!indexEntriesEqual(currentEntries, expectedEntries)) return false;
		if (indexEntriesEqual(currentEntries, restoreEntries)) return true;
		const objectIdLength = expectedEntries[0]?.objectId.length ?? restoreEntries[0]?.objectId.length ?? 40;
		const records = [
			`0 ${"0".repeat(objectIdLength)}\t${relativePath}\0`,
			...restoreEntries.map((entry) => `${entry.mode} ${entry.objectId} ${entry.stage}\t${relativePath}\0`),
		];
		await this.execGit(["update-index", "-z", "--index-info"], { cwd: repoRoot, input: records.join("") });
		return true;
	}

	private async hasStagedPaths(repoRoot: string, relativePaths: readonly string[]): Promise<boolean> {
		const { stdout } = await this.execGit(["diff", "--name-only", "--cached", "--", ...relativePaths], {
			cwd: repoRoot,
			readOnly: true,
		});
		return Boolean(stdout.trim());
	}

	private async getIndexEntries(
		repoRoot: string,
		relativePaths: readonly string[],
		env?: Record<string, string>,
	): Promise<Map<string, GitIndexEntry[]>> {
		const entries = new Map<string, GitIndexEntry[]>();
		for (const relativePath of relativePaths) {
			const { stdout } = await this.execGit(["ls-files", "-s", "-z", "--", relativePath], {
				cwd: repoRoot,
				readOnly: true,
				env,
			});
			entries.set(relativePath, parseIndexEntries(stdout));
		}
		return entries;
	}

	private async prepareCommit(
		message: string,
		repoRoot: string,
		relativePaths: readonly string[],
		ownedEntries: ReadonlyMap<string, readonly GitIndexEntry[]>,
		env: Record<string, string>,
		messagePath: string,
	): Promise<PreparedSelectedCommit> {
		const baseHead = await this.resolveHead(repoRoot);
		await this.populateTemporaryIndex(repoRoot, env, baseHead, ownedEntries);
		await writeFile(messagePath, `${message}\n`);
		const signCommit = await this.shouldSignCommit(repoRoot);
		if (!this.getConfig()?.bypassGitHooks) await this.runCommitHook("pre-commit", [], repoRoot, env);
		const entries = await this.getIndexEntries(repoRoot, relativePaths, env);
		await this.runCommitHook("prepare-commit-msg", [messagePath, "message"], repoRoot, env);
		if (!this.getConfig()?.bypassGitHooks) await this.runCommitHook("commit-msg", [messagePath], repoRoot, env);
		return { entries, signCommit };
	}

	private async updateHead(
		message: string,
		repoRoot: string,
		relativePaths: readonly string[],
		ownedEntries: Map<string, GitIndexEntry[]>,
		prepared: PreparedSelectedCommit,
		env: Record<string, string>,
		messagePath: string,
	): Promise<void> {
		let currentOwnedEntries = ownedEntries;
		let lastHeadUpdateError: Error | undefined;
		for (let attempt = 1; attempt <= 3; attempt += 1) {
			const { baseHead, commitId } = await this.createCommit(
				repoRoot,
				prepared.entries,
				prepared.signCommit,
				env,
				messagePath,
			);
			for (const relativePath of relativePaths) {
				if (
					!(await this.restoreIndexEntriesIfMatches(
						repoRoot,
						relativePath,
						currentOwnedEntries.get(relativePath) ?? [],
						prepared.entries.get(relativePath) ?? [],
					))
				) {
					throw new Error(`Git index changed before the selected commit could be finalized: ${relativePath}`);
				}
			}
			currentOwnedEntries = new Map(prepared.entries);
			try {
				await this.execGit(
					["update-ref", "-m", `commit: ${message.split("\n", 1)[0]}`, "HEAD", commitId, baseHead ?? ""],
					{ cwd: repoRoot },
				);
				await this.runCommitHook("post-commit", [], repoRoot, {}).catch(() => undefined);
				return;
			} catch (error) {
				lastHeadUpdateError = error instanceof Error ? error : new Error(String(error));
				if ((await this.resolveHead(repoRoot)) === baseHead) throw lastHeadUpdateError;
			}
		}
		throw new Error(`Git HEAD kept changing while committing selected paths: ${lastHeadUpdateError?.message}`);
	}

	private async createCommit(
		repoRoot: string,
		entries: ReadonlyMap<string, readonly GitIndexEntry[]>,
		signCommit: boolean,
		env: Record<string, string>,
		messagePath: string,
	): Promise<{ baseHead: string | null; commitId: string }> {
		await this.assertNoCommitOperationInProgress(repoRoot);
		const baseHead = await this.resolveHead(repoRoot);
		await this.populateTemporaryIndex(repoRoot, env, baseHead, entries);
		const { stdout: treeOutput } = await this.execGit(["write-tree"], { cwd: repoRoot, env });
		const treeId = treeOutput.trim();
		if (baseHead) {
			const { stdout } = await this.execGit(["rev-parse", `${baseHead}^{tree}`], { cwd: repoRoot, readOnly: true });
			if (treeId === stdout.trim()) throw new Error("No staged changes to commit for the selected paths");
		}
		const args = [
			"commit-tree",
			...(signCommit ? ["-S"] : []),
			treeId,
			...(baseHead ? ["-p", baseHead] : []),
			"-F",
			messagePath,
		];
		const { stdout } = await this.execGit(args, { cwd: repoRoot, env });
		return { baseHead, commitId: stdout.trim() };
	}

	private async populateTemporaryIndex(
		repoRoot: string,
		env: Record<string, string>,
		baseHead: string | null,
		entries: ReadonlyMap<string, readonly GitIndexEntry[]>,
	): Promise<void> {
		await this.execGit(baseHead ? ["read-tree", baseHead] : ["read-tree", "--empty"], { cwd: repoRoot, env });
		for (const [relativePath, pathEntries] of entries) {
			await this.execGit(["update-index", "--force-remove", "--", relativePath], { cwd: repoRoot, env });
			if (pathEntries.length > 0)
				await this.execGit(["update-index", "-z", "--index-info"], {
					cwd: repoRoot,
					env,
					input: pathEntries
						.map((entry) => `${entry.mode} ${entry.objectId} ${entry.stage}\t${relativePath}\0`)
						.join(""),
				});
		}
	}

	private async assertNoCommitOperationInProgress(repoRoot: string): Promise<void> {
		for (const marker of [
			{ path: "MERGE_HEAD", name: "merge" },
			{ path: "rebase-merge", name: "rebase" },
			{ path: "rebase-apply", name: "rebase" },
			{ path: "CHERRY_PICK_HEAD", name: "cherry-pick" },
			{ path: "REVERT_HEAD", name: "revert" },
		]) {
			const { stdout } = await this.execGit(["rev-parse", "--git-path", marker.path], {
				cwd: repoRoot,
				readOnly: true,
			});
			const configuredPath = stdout.trim();
			const markerPath = isAbsolute(configuredPath) ? configuredPath : join(repoRoot, configuredPath);
			if (configuredPath && (await stat(markerPath).catch(() => null)))
				throw new Error(`Cannot auto-commit selected files while a Git ${marker.name} is in progress`);
		}
	}

	private async resolveHead(repoRoot: string): Promise<string | null> {
		try {
			const { stdout } = await this.execGit(["rev-parse", "--verify", "HEAD"], { cwd: repoRoot, readOnly: true });
			return stdout.trim() || null;
		} catch {
			return null;
		}
	}

	private async shouldSignCommit(repoRoot: string): Promise<boolean> {
		const { stdout } = await this.execGit(["config", "--bool", "--get", "commit.gpgSign"], {
			cwd: repoRoot,
			readOnly: true,
			acceptedExitCodes: [1],
		});
		return stdout.trim() === "true";
	}

	private async runCommitHook(
		hook: string,
		args: readonly string[],
		repoRoot: string,
		env: Record<string, string>,
	): Promise<void> {
		const hookEnv = { ...env, GIT_EDITOR: ":" };
		if (await this.supportsHookRun(repoRoot)) {
			await this.execGit(["hook", "run", "--ignore-missing", hook, ...(args.length > 0 ? ["--", ...args] : [])], {
				cwd: repoRoot,
				env: hookEnv,
			});
			return;
		}
		const { stdout } = await this.execGit(["rev-parse", "--git-path", `hooks/${hook}`], {
			cwd: repoRoot,
			readOnly: true,
		});
		const configuredPath = stdout.trim();
		const hookPath = isAbsolute(configuredPath) ? configuredPath : join(repoRoot, configuredPath);
		const hookStat = await stat(hookPath).catch((error) => {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		});
		if (!hookStat?.isFile() || (process.platform !== "win32" && (hookStat.mode & 0o111) === 0)) return;
		await this.execGit(["-c", 'alias.backlog-run-hook=!f() { "$@" 1>&2; }; f', "backlog-run-hook", hookPath, ...args], {
			cwd: repoRoot,
			env: hookEnv,
		});
	}

	private async supportsHookRun(repoRoot: string): Promise<boolean> {
		if (this.hookRunSupported !== undefined) return this.hookRunSupported;
		try {
			const { stdout } = await this.execGit(["version"], { cwd: repoRoot, readOnly: true });
			const match = stdout.match(/git version (\d+)\.(\d+)/);
			const major = Number(match?.[1]);
			const minor = Number(match?.[2]);
			this.hookRunSupported =
				Number.isInteger(major) && Number.isInteger(minor) && (major > 2 || (major === 2 && minor >= 36));
		} catch {
			this.hookRunSupported = false;
		}
		return this.hookRunSupported;
	}
}
