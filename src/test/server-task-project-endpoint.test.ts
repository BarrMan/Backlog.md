import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup, withTimeout } from "./test-utils.ts";

describe("BacklogServer task project field", () => {
	let testDir: string;
	let server: BacklogServer | null;
	let baseUrl: string;

	beforeEach(async () => {
		testDir = createUniqueTestDir("server-task-project");
		await mkdir(testDir, { recursive: true });
		await $`git init -b main`.cwd(testDir).quiet();
		const filesystem = new FileSystem(testDir);
		await filesystem.ensureBacklogStructure();
		await filesystem.saveConfig({
			projectName: "Server project field",
			statuses: ["To Do", "In Progress", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
			checkActiveBranches: false,
			autoCommit: false,
			projects: ["web", "api"],
		});
		server = new BacklogServer(testDir);
		await server.start(0, false);
		baseUrl = `http://127.0.0.1:${server.getPort()}`;
	});

	afterEach(async () => {
		await server?.stop();
		server = null;
		await safeCleanup(testDir);
	});

	const jsonRequest = (path: string, method: string, body: unknown) =>
		new Request(`${baseUrl}${path}`, {
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

	it("persists project selected via the create endpoint", async () => {
		const createdResponse = await withTimeout(
			fetch(jsonRequest("/api/tasks", "POST", { title: "Web task", project: "web" })),
			"server task creation",
			2_000,
		);
		expect(createdResponse.status).toBe(201);
		const created = (await createdResponse.json()) as Task;
		expect(created.project).toBe("web");
	});

	it("persists and clears project through the update endpoint", async () => {
		const createdResponse = await fetch(jsonRequest("/api/tasks", "POST", { title: "Untagged task" }));
		const created = (await createdResponse.json()) as Task;
		expect(created.project).toBeUndefined();

		const updatedResponse = await fetch(jsonRequest(`/api/tasks/${created.id}`, "PUT", { project: "api" }));
		expect(updatedResponse.status).toBe(200);
		expect(((await updatedResponse.json()) as Task).project).toBe("api");

		const clearedResponse = await fetch(jsonRequest(`/api/tasks/${created.id}`, "PUT", { project: null }));
		expect(clearedResponse.status).toBe(200);
		expect(((await clearedResponse.json()) as Task).project).toBeUndefined();
	});
});
