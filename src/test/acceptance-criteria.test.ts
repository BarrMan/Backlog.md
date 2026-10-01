import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
const cliCommand = getTestCliCommand();

describe("Acceptance Criteria CLI", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("acceptance-criteria");
		await mkdir(testDir, { recursive: true });
		await initializeFilesystemTestProject(new Core(testDir), "Acceptance criteria");
	});
	afterEach(async () => safeCleanup(testDir));

	it("stores, updates, and checks criteria in frontmatter", async () => {
		await $`${[...cliCommand, "task", "create", "Criteria", "--ac", "First", "--ac", "Second"]}`.cwd(testDir).quiet();
		const core = new Core(testDir);
		await $`${[...cliCommand, "task", "edit", "1", "--check-ac", "2", "--ac", "Third"]}`.cwd(testDir).quiet();
		expect((await core.filesystem.loadTask("task-1"))?.acceptanceCriteriaItems).toEqual([
			{ index: 1, text: "First", checked: false },
			{ index: 2, text: "Second", checked: true },
			{ index: 3, text: "Third", checked: false },
		]);
	});

	it("does not interpret body checkboxes as criteria", async () => {
		const core = new Core(testDir);
		await core.createTask(
			{
				id: "task-1",
				title: "Opaque",
				status: "To Do",
				assignee: [],
				createdDate: "2026-09-30",
				labels: [],
				dependencies: [],
				rawContent: "## Example\n\n- [ ] Body checkbox",
			},
			false,
		);
		await $`${[...cliCommand, "task", "edit", "1", "--ac", "Stored"]}`.cwd(testDir).quiet();
		const task = await core.filesystem.loadTask("task-1");
		expect(task?.acceptanceCriteriaItems).toEqual([{ index: 1, text: "Stored", checked: false }]);
		expect(task?.rawContent).toContain("- [ ] Body checkbox");
	});

	it("keeps the Acceptance Criteria plain-output heading", async () => {
		await $`${[...cliCommand, "task", "create", "Criteria", "--ac", "Visible"]}`.cwd(testDir).quiet();
		const result = await $`${[...cliCommand, "task", "view", "1", "--plain"]}`.cwd(testDir).quiet();
		expect(result.stdout.toString()).toContain("Acceptance Criteria:");
	});
});
