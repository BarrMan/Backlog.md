import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";
import { FileSystem } from "../file-system/operations.ts";
import type { Task } from "../types/index.ts";
import { createServerFixture } from "./server-fixture.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let testDir: string;
let filesystem: FileSystem;
let fixture: Awaited<ReturnType<typeof createServerFixture>> | null = null;
let auxiliaryWorktreeDir: string | null = null;

const createTask = (partial: Partial<Task>): Task => ({
	id: "TASK-1",
	title: "Statistics task",
	status: "To Do",
	assignee: [],
	createdDate: "2026-08-01",
	labels: [],
	dependencies: [],
	...partial,
});

function rootConfig(projectName: string, backlogDirectory: string): string {
	return [
		`project_name: "${projectName}"`,
		`backlog_directory: "${backlogDirectory}"`,
		'statuses: ["Queued", "Done"]',
		"labels: []",
		'priorities: ["Urgent", "Low"]',
		"date_format: YYYY-MM-DD",
		"remote_operations: false",
		"check_active_branches: false",
		'task_prefix: "TASK"',
		"",
	].join("\n");
}

type StatisticsResponse = {
	totalTasks: number;
	completedTasks: number;
	completionPercentage: number;
	draftCount: number;
	statusCounts: Record<string, number>;
	priorityCounts: Record<string, number>;
};

async function requestStatistics(): Promise<StatisticsResponse> {
	if (!fixture) throw new Error("Server fixture not initialized");
	const response = await fixture.app.handle(new Request("http://localhost/api/statistics"));
	expect(response.status).toBe(200);
	return (await response.json()) as StatisticsResponse;
}

async function startStatisticsServer(): Promise<void> {
	fixture = await createServerFixture(testDir);
}

async function restartWithStatisticsBranch(branchTask: Task): Promise<void> {
	await fixture?.dispose();
	fixture = null;
	const config = await filesystem.loadConfig();
	if (!config) throw new Error("Expected statistics test config");
	await filesystem.saveConfig({ ...config, checkActiveBranches: true });

	await $`git init -b main`.cwd(testDir).quiet();
	await $`git add backlog`.cwd(testDir).quiet();
	await $`git commit -m "Add main statistics corpus"`.cwd(testDir).quiet();
	await $`git switch -c statistics-shadow`.cwd(testDir).quiet();
	await filesystem.saveTask(branchTask);
	await $`git add backlog`.cwd(testDir).quiet();
	await $`git commit -m "Add branch statistics task"`.cwd(testDir).quiet();
	await $`git switch main`.cwd(testDir).quiet();
	await startStatisticsServer();
}

async function addStatisticsBranchTask(task: Task): Promise<void> {
	auxiliaryWorktreeDir = createUniqueTestDir("server-statistics-worktree");
	await $`git worktree add ${auxiliaryWorktreeDir} statistics-shadow`.cwd(testDir).quiet();
	try {
		const branchFilesystem = new FileSystem(auxiliaryWorktreeDir);
		await branchFilesystem.saveTask(task);
		await $`git add backlog`.cwd(auxiliaryWorktreeDir).quiet();
		await $`git commit -m "Move statistics branch ref"`.cwd(auxiliaryWorktreeDir).quiet();
	} finally {
		await $`git worktree remove --force ${auxiliaryWorktreeDir}`.cwd(testDir).quiet().nothrow();
		await safeCleanup(auxiliaryWorktreeDir);
		auxiliaryWorktreeDir = null;
	}
}

describe("BacklogServer statistics endpoint", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("server-statistics");
		filesystem = new FileSystem(testDir);
		await filesystem.ensureBacklogStructure();
		await filesystem.saveConfig({
			projectName: "Server Statistics",
			statuses: ["To Do", "In Progress", "Done"],
			labels: [],
			priorities: ["Urgent", "Low"],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
			checkActiveBranches: false,
		});

		await filesystem.saveTask(createTask({ priority: "Urgent" }));
		await filesystem.saveTask(createTask({ id: "TASK-2", title: "Completed task", status: "Done", priority: "Low" }));
		expect(await filesystem.completeTask("TASK-2")).toBe(true);
		await filesystem.saveDraft(createTask({ id: "DRAFT-1", title: "Draft task", status: "Draft" }));

		await startStatisticsServer();
	});

	afterEach(async () => {
		await fixture?.dispose();
		fixture = null;
		if (auxiliaryWorktreeDir) {
			await $`git worktree remove --force ${auxiliaryWorktreeDir}`.cwd(testDir).quiet().nothrow();
			await safeCleanup(auxiliaryWorktreeDir);
			auxiliaryWorktreeDir = null;
		}
		await safeCleanup(testDir);
	});

	it("reads current active, completed and draft Markdown on every request", async () => {
		expect(await requestStatistics()).toMatchObject({
			totalTasks: 2,
			completedTasks: 1,
			completionPercentage: 50,
			draftCount: 1,
			statusCounts: { "To Do": 1, "In Progress": 0, Done: 1 },
			priorityCounts: { urgent: 1, low: 1 },
		});
		const published = fixture?.awaitNextPublication("tasks-updated");
		await filesystem.saveTask(createTask({ id: "TASK-3", title: "Immediate addition" }));
		await published;
		expect(await requestStatistics()).toMatchObject({ totalTasks: 3, completedTasks: 1, draftCount: 1 });
	});

	it("uses current persistent priorities without waiting for a watcher", async () => {
		await requestStatistics();
		const config = await filesystem.loadConfig();
		if (!config) throw new Error("Expected statistics test config");
		const published = fixture?.awaitNextPublication("config-updated");
		await filesystem.saveConfig({ ...config, priorities: ["Critical", "Urgent", "Low"] });
		await published;
		const refreshed = await requestStatistics();
		expect(refreshed.statusCounts).toEqual({ "To Do": 1, "In Progress": 0, Done: 1 });
		expect(refreshed.priorityCounts).toMatchObject({ critical: 0, urgent: 1, low: 1 });
	});

	it("rejects a scope token after the configured backlog directory changes", async () => {
		if (!fixture) throw new Error("Server fixture not initialized");
		const status = await fixture.app.handle(new Request("http://localhost/api/status"));
		expect(status.status).toBe(200);
		const { projectScope } = (await status.json()) as { projectScope: string };

		const rootB = new FileSystem(testDir, { backlogDirectory: "root-b", configLocation: "root" });
		await rootB.ensureBacklogStructure();
		await rootB.saveTask(createTask({ id: "TASK-10", title: "Root B queued", status: "Queued" }));
		await rootB.saveTask(createTask({ id: "TASK-11", title: "Root B queued too", status: "Queued" }));
		await rootB.saveTask(createTask({ id: "TASK-12", title: "Root B done", status: "Done" }));
		expect(await rootB.completeTask("TASK-12")).toBe(true);
		await rootB.saveDraft(createTask({ id: "DRAFT-10", title: "Root B draft", status: "Draft" }));
		await rootB.saveDraft(createTask({ id: "DRAFT-11", title: "Root B draft too", status: "Draft" }));

		const published = fixture.awaitNextPublication("config-updated");
		await Bun.write(join(testDir, "backlog.config.yml"), rootConfig("Root B", "root-b"));
		await published;
		const response = await fixture.app.handle(
			new Request("http://localhost/api/statistics", { headers: { "X-Backlog-Project-Scope": projectScope } }),
		);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "Project scope does not match this server",
			code: "PROJECT_SCOPE_MISMATCH",
		});
	});

	it("refreshes statistics after an active branch ref moves", async () => {
		await restartWithStatisticsBranch(
			createTask({ id: "TASK-10", title: "Branch statistics task", status: "In Progress", priority: "Urgent" }),
		);
		const initial = await requestStatistics();
		expect(initial).toMatchObject({ totalTasks: 3, statusCounts: { "In Progress": 1 } });

		const published = fixture?.awaitNextPublication("tasks-updated");
		await addStatisticsBranchTask(
			createTask({ id: "TASK-11", title: "Moved branch statistics task", status: "In Progress", priority: "Low" }),
		);
		await published;

		const refreshed = await requestStatistics();
		expect(refreshed).toMatchObject({ totalTasks: 4, statusCounts: { "In Progress": 2 } });
	});

	it("loads changed status and priority configuration on the next request", async () => {
		const oldConfig = await filesystem.loadConfig();
		if (!oldConfig) throw new Error("Expected statistics test config");
		await requestStatistics();
		const published = fixture?.awaitNextPublication("config-updated");
		await filesystem.saveConfig({ ...oldConfig, statuses: ["Queued", "Done"], priorities: ["Critical"] });
		await published;
		const refreshed = await requestStatistics();
		expect(refreshed.statusCounts).toMatchObject({ Queued: 0, "To Do": 1, Done: 1 });
		expect(refreshed.statusCounts).not.toHaveProperty("In Progress");
		expect(refreshed.priorityCounts).toMatchObject({ critical: 0, urgent: 1, low: 1 });
	});
});
