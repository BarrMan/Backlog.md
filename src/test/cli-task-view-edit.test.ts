import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../index.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
const cliCommand = getTestCliCommand();

describe("CLI task view and edit", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("cli-task-view-edit");
		await mkdir(testDir, { recursive: true });
		await $`git init -b main`.cwd(testDir).quiet();
		await initializeTestProject(new Core(testDir), "CLI task view");
	});
	afterEach(async () => safeCleanup(testDir));

	it("edits structured fields without interpreting an opaque body", async () => {
		const core = new Core(testDir);
		await core.createTask(
			{
				id: "task-1",
				title: "Original",
				status: "To Do",
				assignee: [],
				createdDate: "2026-09-30",
				labels: [],
				dependencies: [],
				rawContent: "## Description\n\nBody text",
			},
			false,
		);
		await $`${[...cliCommand, "task", "edit", "1", "--title", "Updated", "--desc", "Structured description", "--status", "In Progress"]}`
			.cwd(testDir)
			.quiet();
		const task = await core.filesystem.loadTask("task-1");
		expect(task).toMatchObject({
			title: "Updated",
			description: "Structured description",
			status: "In Progress",
			rawContent: "## Description\n\nBody text",
		});
		expect(await Bun.file(task?.filePath ?? "").text()).toContain("task_schema_version: 2");
	});

	it("retains formatted plain task output", async () => {
		await $`${[...cliCommand, "task", "create", "Visible", "--desc", "Description", "--plan", "Plan"]}`
			.cwd(testDir)
			.quiet();
		const result = await $`${[...cliCommand, "task", "view", "1", "--plain"]}`.cwd(testDir).quiet();
		expect(result.stdout.toString()).toContain("Task TASK-1 - Visible");
		expect(result.stdout.toString()).toContain("Description:");
		expect(result.stdout.toString()).toContain("Implementation Plan:");
	});
});
