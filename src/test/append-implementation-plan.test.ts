import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
const cliCommand = getTestCliCommand();

describe("task edit --append-plan", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("append-plan");
		await mkdir(testDir, { recursive: true });
		await initializeFilesystemTestProject(new Core(testDir), "Append plan");
	});
	afterEach(async () => safeCleanup(testDir));

	it("appends multiline plans in frontmatter", async () => {
		const core = new Core(testDir);
		await core.createTask(
			{
				id: "task-1",
				title: "Plan",
				status: "To Do",
				assignee: [],
				createdDate: "2026-09-30",
				labels: [],
				dependencies: [],
				implementationPlan: "Original",
			},
			false,
		);
		const result =
			await $`${[...cliCommand, "task", "edit", "1", "--append-plan", "First\nline", "--append-plan", "Second"]}`
				.cwd(testDir)
				.quiet()
				.nothrow();
		expect(result.exitCode).toBe(0);
		const task = await core.filesystem.loadTask("task-1");
		expect(task?.implementationPlan).toBe("Original\n\nFirst\nline\n\nSecond");
		expect(await Bun.file(task?.filePath ?? "").text()).toContain("implementation_plan: |-");
	});

	it("replaces before appending", async () => {
		const core = new Core(testDir);
		await core.createTask(
			{
				id: "task-1",
				title: "Plan",
				status: "To Do",
				assignee: [],
				createdDate: "2026-09-30",
				labels: [],
				dependencies: [],
			},
			false,
		);
		const result = await $`${[...cliCommand, "task", "edit", "1", "--plan", "Replace", "--append-plan", "Append"]}`
			.cwd(testDir)
			.quiet()
			.nothrow();
		expect(result.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("task-1"))?.implementationPlan).toBe("Replace\n\nAppend");
	});
});
