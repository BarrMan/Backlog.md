import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { parseTask } from "../markdown/parser.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
const cliCommand = getTestCliCommand();
const notesMarker = "<!-- SECTION:NOTES:END -->";

async function findTaskFile(): Promise<string> {
	const tasksDir = join(testDir, "backlog", "tasks");
	const name = (await readdir(tasksDir)).find((entry) => entry.startsWith("task-1 "));
	if (!name) throw new Error("Task file not found");
	return join(tasksDir, name);
}

describe("section marker safety", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("test-section-marker-safety");
		await mkdir(testDir, { recursive: true });
		await initializeFilesystemTestProject(new Core(testDir), "Section Marker Safety Test");
	});

	afterEach(async () => safeCleanup(testDir));

	it("stores marker lines in structured frontmatter fields", async () => {
		const notes = `quoting:\n${notesMarker}`;
		await $`${[...cliCommand, "task", "create", "Marker task", "--desc", "<!-- SECTION:DESCRIPTION:BEGIN -->", "--notes", notes]}`
			.cwd(testDir)
			.quiet();
		await $`${[...cliCommand, "task", "edit", "1", "--plan", "<!-- SECTION:PLAN:END -->"]}`.cwd(testDir).quiet();
		const task = await new Core(testDir).filesystem.loadTask("task-1");
		expect(task?.description).toBe("<!-- SECTION:DESCRIPTION:BEGIN -->");
		expect(task?.implementationNotes).toBe(notes);
		expect(task?.implementationPlan).toBe("<!-- SECTION:PLAN:END -->");
	});

	it("appends marker-like text without truncating notes", async () => {
		const existing = `Terminator is ${notesMarker} inline\n\nTail content`;
		await $`${[...cliCommand, "task", "create", "Quoting task", "--notes", existing]}`.cwd(testDir).quiet();
		await $`${[...cliCommand, "task", "edit", "1", "--append-notes", "APPENDED"]}`.cwd(testDir).quiet();
		expect((await new Core(testDir).filesystem.loadTask("task-1"))?.implementationNotes).toBe(
			`${existing}\n\nAPPENDED`,
		);
	});

	it("keeps existing nested markers in the opaque body during a frontmatter rewrite", async () => {
		await $`${[...cliCommand, "task", "create", "repro"]}`.cwd(testDir).quiet();
		const path = await findTaskFile();
		const content = `---
task_schema_version: 2
id: task-1
title: repro
status: To Do
assignee: []
created_date: "2026-08-30 00:00"
labels: []
dependencies: []
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
<!-- SECTION:NOTES:BEGIN -->
FIRST NOTE
<!-- SECTION:NOTES:END -->

SECOND NOTE
<!-- SECTION:NOTES:END -->`;
		await Bun.write(path, content);
		expect(parseTask(content).implementationNotes).toBeUndefined();
		await $`${[...cliCommand, "task", "edit", "1", "--notes", "Stored in frontmatter"]}`.cwd(testDir).quiet();
		const saved = await Bun.file(path).text();
		expect(saved).toContain("FIRST NOTE");
		expect(saved).toContain("SECOND NOTE");
		expect((await new Core(testDir).filesystem.loadTask("task-1"))?.implementationNotes).toBe("Stored in frontmatter");
	});
});
