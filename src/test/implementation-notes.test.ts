import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
const cliCommand = getTestCliCommand();

describe("Implementation Notes CLI", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("implementation-notes");
		await mkdir(testDir, { recursive: true });
		await initializeFilesystemTestProject(new Core(testDir), "Implementation notes");
	});
	afterEach(async () => safeCleanup(testDir));

	it("stores multiline notes in frontmatter and renders their heading", async () => {
		const notes = "Completed work\n\n```text\noutput\n\nmore output\n```";
		await $`${cliCommand} task create "Notes" --notes ${notes}`.cwd(testDir).quiet();
		const task = await new Core(testDir).filesystem.loadTask("task-1");
		expect(task?.implementationNotes).toBe(notes);
		const view = await $`${cliCommand} task view 1 --plain`.cwd(testDir).quiet();
		expect(view.stdout.toString()).toContain("Implementation Notes:");
	});
});
