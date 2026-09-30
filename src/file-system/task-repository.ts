import { dirname, join, resolve } from "node:path";
import { parseTask } from "../markdown/parser.ts";
import type { Task } from "../types/index.ts";
import { buildGlobPattern } from "../utils/prefix-config.ts";
import { normalizeTaskIdentity } from "../utils/task-path.ts";

const TASK_FILE_READ_CONCURRENCY = 32;

type ParsedTaskFile = { content: string; task: Task };

export interface TaskRepositoryContext {
	config(): Promise<{ prefixes?: { task?: string } } | null>;
}

/**
 * Reads task files with a bounded, content-addressed parse cache. It deliberately owns only
 * task discovery and parsing; task mutations remain coordinated by FileSystem locks.
 */
export class TaskRepository {
	readonly parsedFiles = new Map<string, ParsedTaskFile>();
	readonly fileReadGenerations = new Map<string, number>();
	private cacheEpoch = 0;
	private fileReadGeneration = 0;
	private activeReads = 0;
	private readonly pendingReads: Array<() => void> = [];

	constructor(private readonly context: TaskRepositoryContext) {}

	get epoch(): number {
		return this.cacheEpoch;
	}

	invalidate(): void {
		this.cacheEpoch++;
		this.parsedFiles.clear();
		this.fileReadGenerations.clear();
	}

	private async withReadSlot<T>(read: () => Promise<T>): Promise<T> {
		if (this.activeReads < TASK_FILE_READ_CONCURRENCY) this.activeReads++;
		else await new Promise<void>((resume) => this.pendingReads.push(resume));
		try {
			return await read();
		} finally {
			const next = this.pendingReads.shift();
			if (next) next();
			else this.activeReads--;
		}
	}

	/** Re-read for freshness, but only parse again when the exact file content changed. */
	async readParsedFile(filepath: string, epoch = this.cacheEpoch): Promise<Task> {
		const cacheKey = resolve(filepath);
		const generation = ++this.fileReadGeneration;
		if (epoch === this.cacheEpoch) this.fileReadGenerations.set(cacheKey, generation);
		const content = await this.withReadSlot(async () => await Bun.file(filepath).text());
		const cached = this.parsedFiles.get(cacheKey);
		if (cached?.content === content) return structuredClone(cached.task);

		const task = parseTask(content);
		if (epoch === this.cacheEpoch && this.fileReadGenerations.get(cacheKey) === generation) {
			this.parsedFiles.set(cacheKey, { content, task });
		}
		return structuredClone(task);
	}

	async readFiles(
		directory: string,
		files: string[],
		options: { normalizeIdentity: boolean; debugLabel: string },
		epoch = this.cacheEpoch,
	): Promise<Task[]> {
		const directoryPath = resolve(directory);
		const livePaths = new Set(files.map((file) => resolve(directory, file)));
		if (epoch === this.cacheEpoch) {
			for (const path of new Set([...this.parsedFiles.keys(), ...this.fileReadGenerations.keys()])) {
				if (dirname(path) === directoryPath && !livePaths.has(path)) {
					this.parsedFiles.delete(path);
					this.fileReadGenerations.delete(path);
				}
			}
		}

		const tasks = new Array<Task | undefined>(files.length);
		let nextIndex = 0;
		const worker = async () => {
			while (nextIndex < files.length) {
				const index = nextIndex++;
				const file = files[index];
				if (!file) continue;
				const filepath = join(directory, file);
				try {
					const parsed = await this.readParsedFile(filepath, epoch);
					const task = options.normalizeIdentity ? normalizeTaskIdentity(parsed) : parsed;
					tasks[index] = { ...task, filePath: filepath };
				} catch (error) {
					if (process.env.DEBUG) console.error(`Failed to parse ${options.debugLabel} ${filepath}`, error);
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(TASK_FILE_READ_CONCURRENCY, files.length) }, worker));
		return tasks.filter((task): task is Task => task !== undefined);
	}

	async listFiles(directory: string): Promise<string[]> {
		const config = await this.context.config();
		const prefix = (config?.prefixes?.task ?? "task").toLowerCase();
		return await Array.fromAsync(new Bun.Glob(buildGlobPattern(prefix)).scan({ cwd: directory, followSymlinks: true }));
	}
}
