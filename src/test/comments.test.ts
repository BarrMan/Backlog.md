import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
const cliCommand = getTestCliCommand();

describe("Task comments", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("comments");
		await mkdir(testDir, { recursive: true });
		await initializeFilesystemTestProject(new Core(testDir), "Comments");
	});
	afterEach(async () => safeCleanup(testDir));

	it("stores ordered multiline comments in frontmatter", async () => {
		const core = new Core(testDir);
		await core.createTask(
			{
				id: "task-1",
				title: "Comments",
				status: "To Do",
				assignee: [],
				createdDate: "2026-09-30",
				labels: [],
				dependencies: [],
				rawContent: "## Research\n\nOpaque body",
			},
			false,
		);
		await core.updateTaskFromInput(
			"task-1",
			{
				appendComments: [
					{
						author: "<!-- COMMENT:END -->",
						createdDate: "2026-09-30 12:00",
						body: "First\n---\n<!-- COMMENTS:BEGIN -->\n\n## Nested heading",
					},
				],
			},
			false,
		);
		const task = await core.filesystem.loadTask("task-1");
		expect(task?.comments).toEqual([
			{
				index: 1,
				author: "<!-- COMMENT:END -->",
				createdDate: "2026-09-30 12:00",
				body: "First\n---\n<!-- COMMENTS:BEGIN -->\n\n## Nested heading",
			},
		]);
		expect(task?.rawContent).toBe("## Research\n\nOpaque body");
	});

	it("renders comments through plain CLI output", async () => {
		await $`${[...cliCommand, "task", "create", "Comments"]}`.cwd(testDir).quiet();
		const result =
			await $`${[...cliCommand, "task", "edit", "1", "--comment", "Review\n---\n<!-- COMMENT:END -->", "--comment-author", "---", "--plain"]}`
				.cwd(testDir)
				.quiet();
		expect(result.stdout.toString()).toContain("Comments:");
		expect(result.stdout.toString()).toContain("#1 - ---");
		expect(result.stdout.toString()).toContain("<!-- COMMENT:END -->");
	});
});
