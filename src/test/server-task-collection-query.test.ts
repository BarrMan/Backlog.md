import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { FileSystem } from "../file-system/operations.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { createServerFixture } from "./server-fixture.ts";
import { createUniqueTestDir, safeCleanup, withTimeout } from "./test-utils.ts";

describe("task collection query endpoint", () => {
	let testDir: string;
	let fixture: Awaited<ReturnType<typeof createServerFixture>> | null = null;

	const request = async (path: string) => {
		if (!fixture) throw new Error("Server fixture not initialized");
		return await fixture.app.handle(new Request(`http://localhost${path}`));
	};

	beforeEach(async () => {
		testDir = createUniqueTestDir("server-task-collection-query");
		const filesystem = new FileSystem(testDir);
		await filesystem.ensureBacklogStructure();
		await filesystem.saveConfig({
			projectName: "Collection queries",
			statuses: ["To Do", "Done"],
			priorities: ["High", "Low"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
			prefixes: { task: "BACK" },
		});
		const task = (id: string, input: Partial<Task> = {}): Task => ({
			id,
			title: id,
			status: "To Do",
			assignee: ["@owner"],
			labels: ["one,two", "three", ",four,five,", "six", "four", "five"],
			priority: "High",
			dependencies: [],
			createdDate: "2026-01-01",
			...input,
		});
		await filesystem.saveTask(task("BACK-001.02"));
		await filesystem.saveTask(task("BACK-002", { parentTaskId: "BACK-001.02" }));
		await filesystem.saveTask(task("BACK-003", { parentTaskId: "BACK-001.02", status: "Done" }));
		await Bun.write(join(filesystem.tasksDir, "back-1 - First collision.md"), serializeTask(task("BACK-1")));
		await Bun.write(join(filesystem.tasksDir, "back-001 - Second collision.md"), serializeTask(task("BACK-001")));
		fixture = await createServerFixture(testDir);
	});

	afterEach(async () => {
		await fixture?.dispose();
		fixture = null;
		await safeCleanup(testDir);
	});

	it("resolves custom-prefix numeric dotted parents for a local collection", async () => {
		const response = await request("/api/tasks?parent=1.02&crossBranch=false");
		expect(response.status).toBe(200);
		expect(((await response.json()) as Task[]).map((task) => task.id)).toEqual(["BACK-002", "BACK-003"]);
	});

	it("fails closed for missing and ambiguous parent IDs", async () => {
		expect((await request("/api/tasks?parent=BACK-999")).status).toBe(404);
		expect((await request("/api/tasks?parent=1")).status).toBe(409);
	});

	it("applies legacy repeated and malformed query filters to the actual collection", async () => {
		const response = await request(
			"/api/tasks?status=To%20Do&status=Done&assignee=%40owner&assignee=%40other&priority=high&priority=low&excludeStatus=Done,Later&exclude-status=Done&label=one,two&label=three&label=%20&labels=,four,five,&labels=six",
		);
		expect(response.status).toBe(400);

		const validResponse = await request(
			"/api/tasks?status=To%20Do&status=Done&assignee=%40owner&assignee=%40other&priority=high&priority=low&excludeStatus=Done&label=one,two&label=three&label=%20&labels=,four,five,&labels=six",
		);
		expect(validResponse.status).toBe(200);
		expect(((await validResponse.json()) as Task[]).map((task) => task.id)).toEqual([
			"BACK-001",
			"BACK-1",
			"BACK-001.02",
			"BACK-002",
		]);
	});

	it("reconciles filesystem changes into the prepared graph", async () => {
		expect(((await (await request("/api/tasks")).json()) as Task[]).find((task) => task.id === "BACK-002")?.title).toBe(
			"BACK-002",
		);
		if (!fixture) throw new Error("Server fixture was not initialized");
		const publication = fixture.awaitNextPublication("tasks-updated");
		await new FileSystem(testDir).saveTask({
			id: "BACK-002",
			title: "Changed on disk",
			status: "To Do",
			assignee: ["@owner"],
			labels: [],
			dependencies: [],
			createdDate: "2026-01-01",
			parentTaskId: "BACK-001.02",
		});
		await withTimeout(publication, "filesystem task reconciliation", 3_000);
		const task = ((await (await request("/api/tasks")).json()) as Task[]).find((item) => item.id === "BACK-002");
		expect(task?.title).toBe("Changed on disk");
	});

	it("pins request-local reads and mutations while the root config changes directories", async () => {
		const primary = new FileSystem(testDir, { backlogDirectory: "primary-backlog", configLocation: "root" });
		await primary.ensureBacklogStructure();
		await primary.saveConfig({
			projectName: "Pinned request",
			statuses: ["To Do"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
			backlogDirectory: "primary-backlog",
		});
		await primary.saveTask({
			id: "TASK-1",
			title: "Primary task",
			status: "To Do",
			assignee: [],
			labels: [],
			dependencies: [],
			createdDate: "2026-01-01",
		});
		const replacement = new FileSystem(testDir, {
			backlogDirectory: "replacement-backlog",
			configLocation: "root",
		});
		await replacement.ensureBacklogStructure();
		await replacement.saveTask({
			id: "TASK-1",
			title: "Replacement task",
			status: "To Do",
			assignee: [],
			labels: [],
			dependencies: [],
			createdDate: "2026-01-01",
		});

		const core = new Core(testDir);
		const originalLoadConfig = core.filesystem.loadConfig.bind(core.filesystem);
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		core.filesystem.loadConfig = async () => {
			started.resolve();
			await release.promise;
			return await originalLoadConfig();
		};
		const read = core.getTask("TASK-1");
		await started.promise;
		await Bun.write(
			join(testDir, "backlog.config.yml"),
			[
				"project_name: Replacement request",
				"backlog_directory: replacement-backlog",
				"statuses: [To Do]",
				"labels: []",
				"milestones: []",
				"date_format: YYYY-MM-DD",
				"remote_operations: false",
			].join("\n"),
		);
		release.resolve();
		expect((await read)?.title).toBe("Primary task");
		expect((await new Core(testDir).getTask("TASK-1"))?.title).toBe("Replacement task");
		await core.updateTaskFromInput("TASK-1", { title: "Pinned mutation" });
		expect((await primary.loadTask("TASK-1"))?.title).toBe("Pinned mutation");
		expect((await replacement.loadTask("TASK-1"))?.title).toBe("Replacement task");
	});
});
