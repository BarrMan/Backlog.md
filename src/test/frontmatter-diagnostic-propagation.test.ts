import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { BranchTaskLoader } from "../core/task-loader.ts";
import { ContentRepository } from "../file-system/content-repository.ts";
import { MilestoneStore } from "../file-system/milestones.ts";
import type { GitOperations } from "../git/operations.ts";
import { UnsupportedRecordFrontmatterSchemaError, UnsupportedTaskFrontmatterSchemaError } from "../markdown/parser.ts";
import { serializeDecision, serializeMilestone, serializeTask } from "../markdown/serializer.ts";
import type { BacklogConfig, Decision, Milestone, Task } from "../types/index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const task: Task = {
	id: "TASK-1",
	title: "Task",
	status: "To Do",
	assignee: [],
	createdDate: "2026-09-30",
	labels: [],
	dependencies: [],
	rawContent: "",
};
const decision: Decision = {
	id: "decision-1",
	title: "Decision",
	date: "2026-09-30",
	status: "proposed",
	context: "",
	decision: "",
	consequences: "",
	rawContent: "",
};
const milestone: Milestone = { id: "m-1", title: "Milestone", description: "", rawContent: "" };
const config: BacklogConfig = {
	projectName: "Diagnostic propagation",
	statuses: ["To Do"],
	labels: [],
	milestones: [],
	dateFormat: "YYYY-MM-DD",
	checkActiveBranches: true,
	activeBranchDays: 30,
	remoteOperations: false,
	prefixes: { task: "task" },
};

function unsupported(content: string, schema: string): string {
	return content.replace(new RegExp(`${schema}: \\d+`), `${schema}: 99`);
}

describe("frontmatter diagnostic propagation", () => {
	it("propagates unsupported decision schema diagnostics through list and load", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-decision-diagnostics-"));
		try {
			const repository = new ContentRepository({
				decisionsDirectory: async () => root,
				documentsDirectory: async () => root,
				ensureDirectory: async () => {},
			});
			await Bun.write(
				join(root, "decision-1 - Decision.md"),
				unsupported(serializeDecision(decision), "decision_schema_version"),
			);
			await expect(repository.listDecisions()).rejects.toBeInstanceOf(UnsupportedRecordFrontmatterSchemaError);
			await expect(repository.loadDecision("decision-1")).rejects.toBeInstanceOf(
				UnsupportedRecordFrontmatterSchemaError,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("propagates unsupported milestone schema diagnostics through list and load", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-milestone-diagnostics-"));
		const active = join(root, "active");
		try {
			await mkdir(active);
			const store = new MilestoneStore({
				activeDirectory: async () => active,
				archiveDirectory: async () => join(root, "archive"),
				ensureDirectory: async () => {},
				withCreateLock: async (operation) => await operation(),
			});
			await Bun.write(
				join(active, "m-1 - Milestone.md"),
				unsupported(serializeMilestone(milestone), "milestone_schema_version"),
			);
			await expect(store.listActive()).rejects.toBeInstanceOf(UnsupportedRecordFrontmatterSchemaError);
			await expect(store.load("m-1")).rejects.toBeInstanceOf(UnsupportedRecordFrontmatterSchemaError);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("task frontmatter diagnostic propagation", () => {
	let testDirectory: string;
	let core: Core;

	beforeEach(async () => {
		testDirectory = createUniqueTestDir("task-diagnostics");
		await mkdir(testDirectory, { recursive: true });
		core = new Core(testDirectory);
		await initializeFilesystemTestProject(core, "Task diagnostics");
	});

	afterEach(async () => {
		await safeCleanup(testDirectory);
	});

	it("propagates unsupported task schema diagnostics through local list and load", async () => {
		await Bun.write(
			join(core.filesystem.tasksDir, "task-1 - Task.md"),
			unsupported(serializeTask(task), "task_schema_version"),
		);
		await expect(core.filesystem.listTasks()).rejects.toBeInstanceOf(UnsupportedTaskFrontmatterSchemaError);
		await expect(core.filesystem.loadTask("TASK-1")).rejects.toBeInstanceOf(UnsupportedTaskFrontmatterSchemaError);
	});

	it("propagates task diagnostics from branch hydration while malformed YAML remains tolerant", async () => {
		const commit = "1".repeat(40);
		const path = "backlog/tasks/task-1 - Task.md";
		const loader = new BranchTaskLoader({
			listFilesInTree: async () => [path],
			getBranchLastModifiedMap: async () => new Map([[path, new Date("2026-09-30T00:00:00Z")]]),
			showFile: async () => unsupported(serializeTask(task), "task_schema_version"),
		} as unknown as GitOperations);
		await expect(
			loader.load(
				[
					{ name: "main", commit: "0".repeat(40), current: true },
					{ name: "feature/unsupported", commit, current: false },
				],
				config,
				[],
				false,
			),
		).rejects.toBeInstanceOf(UnsupportedTaskFrontmatterSchemaError);

		const malformedLoader = new BranchTaskLoader({
			listFilesInTree: async () => [path],
			getBranchLastModifiedMap: async () => new Map([[path, new Date("2026-09-30T00:00:00Z")]]),
			showFile: async () => "---\nid: [unterminated\n---",
		} as unknown as GitOperations);
		const result = await malformedLoader.load(
			[
				{ name: "main", commit: "0".repeat(40), current: true },
				{ name: "feature/malformed", commit, current: false },
			],
			config,
			[],
			false,
		);
		expect(result.complete).toBe(true);
		expect(result.entries[0]?.task).toBeUndefined();
	});
});
