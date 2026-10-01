import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../index.ts";
import { migrateLegacyTask } from "../markdown/legacy-task-migration.ts";
import { parseTask, TaskFrontmatterSchemaError, UnsupportedTaskFrontmatterSchemaError } from "../markdown/parser.ts";
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

	it("migrates an explicitly selected legacy task without loosening normal reads", async () => {
		await writeFile(
			`${testDir}/backlog/tasks/task-1 - Legacy.md`,
			"---\nid: TASK-1\ntitle: Legacy\nstatus: To Do\nassignee: []\ncreated_date: '2026-10-01'\nlabels: []\ndependencies: []\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nPreserved\n<!-- SECTION:DESCRIPTION:END -->\n\n## Acceptance Criteria\n<!-- AC:BEGIN -->\n- [x] #1 Converts\n<!-- AC:END -->\n",
		);
		await $`${[...cliCommand, "task", "migrate-legacy", "TASK-1"]}`.cwd(testDir).quiet();
		expect(await new Core(testDir).filesystem.loadTask("TASK-1")).toMatchObject({
			description: "Preserved",
			acceptanceCriteriaItems: [{ index: 1, text: "Converts", checked: true }],
		});
	});

	it("round-trips rich legacy task metadata and rejects unsupported inputs", () => {
		const legacy =
			"---\nid: TASK-9\ntitle: Rich\nstatus: In Progress\nassignee: ['@alex']\nreporter: '@sam'\ncreated_date: '2026-10-01 10:00'\nupdated_date: '2026-10-02 11:00'\ndue_date: '2026-10-03'\nlabels: [one]\ndependencies: [TASK-1]\nreferences: [https://example.com]\ndocumentation: [doc-1]\nmodified_files: [src/file.ts]\nparent_task_id: TASK-1\nsubtasks: [TASK-9.1]\npriority: high\ntype: bug\nproject: cli\nordinal: 9\nonStatusChange: notify\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nDescription\n<!-- SECTION:DESCRIPTION:END -->\n\n## Definition of Done\n<!-- DOD:BEGIN -->\n- [x] #2 Done\n<!-- DOD:END -->\n\n## Comments\n\n<!-- COMMENTS:BEGIN -->\nauthor: @sam\ncreated: 2026-10-02 12:00\n---\nComment body\n---\n<!-- COMMENTS:END -->\n";
		const task = parseTask(migrateLegacyTask(legacy));
		expect(task).toMatchObject({
			reporter: "@sam",
			dueDate: "2026-10-03",
			references: ["https://example.com"],
			documentation: ["doc-1"],
			modifiedFiles: ["src/file.ts"],
			parentTaskId: "TASK-1",
			subtasks: ["TASK-9.1"],
			priority: "high",
			type: "bug",
			project: "cli",
			ordinal: 9,
			onStatusChange: "notify",
			definitionOfDoneItems: [{ index: 2, text: "Done", checked: true }],
			comments: [{ index: 1, author: "@sam", createdDate: "2026-10-02 12:00", body: "Comment body" }],
		});
		expect(() => migrateLegacyTask(legacy.replace("<!-- SECTION:DESCRIPTION:BEGIN -->", ""))).toThrow(
			TaskFrontmatterSchemaError,
		);
		expect(() => migrateLegacyTask(legacy.replace("id: TASK-9", "task_schema_version: 2\nid: TASK-9"))).toThrow(
			UnsupportedTaskFrontmatterSchemaError,
		);
		expect(() => migrateLegacyTask(legacy.replace("labels: [one]", "labels: invalid"))).toThrow(
			TaskFrontmatterSchemaError,
		);
		expect(() => migrateLegacyTask(legacy.replace("<!-- DOD:END -->", ""))).toThrow(TaskFrontmatterSchemaError);
	});

	it("refuses duplicate legacy identities without modifying either file", async () => {
		const content =
			"---\nid: TASK-2\ntitle: Legacy\nstatus: To Do\nassignee: []\ncreated_date: '2026-10-01'\nlabels: []\ndependencies: []\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nPreserved\n<!-- SECTION:DESCRIPTION:END -->\n";
		const first = `${testDir}/backlog/tasks/task-2 - First.md`;
		const second = `${testDir}/backlog/tasks/task-2 - Second.md`;
		await Promise.all([writeFile(first, content), writeFile(second, content)]);
		const result = await $`${[...cliCommand, "task", "migrate-legacy", "TASK-2"]}`.cwd(testDir).quiet().nothrow();
		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain("Task ID TASK-2 is ambiguous");
		expect(await Promise.all([readFile(first, "utf8"), readFile(second, "utf8")])).toEqual([content, content]);
	});
});
