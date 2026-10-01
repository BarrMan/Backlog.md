import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
const cliCommand = getTestCliCommand();

describe("Final Summary CLI", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("final-summary");
		await mkdir(testDir, { recursive: true });
		await initializeFilesystemTestProject(new Core(testDir), "Final summary");
	});
	afterEach(async () => safeCleanup(testDir));

	it("sets, appends, and clears the frontmatter summary", async () => {
		await $`${[...cliCommand, "task", "create", "Summary", "--final-summary", "Initial"]}`.cwd(testDir).quiet();
		const core = new Core(testDir);
		await $`${[...cliCommand, "task", "edit", "1", "--append-final-summary", "Second"]}`.cwd(testDir).quiet();
		expect((await core.filesystem.loadTask("task-1"))?.finalSummary).toBe("Initial\n\nSecond");
		await $`${[...cliCommand, "task", "edit", "1", "--clear-final-summary"]}`.cwd(testDir).quiet();
		expect((await core.filesystem.loadTask("task-1"))?.finalSummary).toBe("");
	});

	it("keeps the Final Summary plain-output heading", async () => {
		await $`${[...cliCommand, "task", "create", "Summary", "--final-summary", "Ready"]}`.cwd(testDir).quiet();
		const result = await $`${[...cliCommand, "task", "view", "1", "--plain"]}`.cwd(testDir).quiet();
		expect(result.stdout.toString()).toContain("Final Summary:");
	});
});
