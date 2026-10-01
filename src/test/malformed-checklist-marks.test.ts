import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { McpServer } from "../mcp/server.ts";
import { TaskHandlers } from "../mcp/tools/tasks/handlers.ts";
import { createServerFixture } from "./server-fixture.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const families = [
	{
		name: "acceptance criteria",
		cliFlag: "--check-ac",
		input: { uncheckAcceptanceCriteria: [2] },
		mcpInput: { acceptanceCriteriaCheck: [2] },
	},
	{
		name: "definition of done",
		cliFlag: "--check-dod",
		input: { uncheckDefinitionOfDone: [2] },
		mcpInput: { definitionOfDoneCheck: [2] },
	},
];

const opaqueBody = "## Example\n\n- [~] alpha\n- [ ] #2 bravo\n- [ ] #3 charlie";

function taskMarkdown(): string {
	return `---
task_schema_version: 2
id: TASK-1
title: Mixed checklist
status: To Do
assignee: []
created_date: "2026-09-27"
labels: []
dependencies: []
acceptance_criteria:
  - index: 2
    text: bravo
    checked: false
definition_of_done:
  - index: 2
    text: bravo
    checked: false
---

${opaqueBody}
`;
}

describe("malformed checklist marks remain opaque", () => {
	let testDir: string;
	let core: Core;
	let taskPath: string;

	beforeEach(async () => {
		testDir = createUniqueTestDir("test-malformed-checklist-marks");
		await mkdir(testDir, { recursive: true });
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Malformed checklist marks");
		taskPath = join(core.filesystem.tasksDir, "task-1 - Mixed-checklist.md");
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	for (const family of families) {
		it(`CLI indexed ${family.name} edits use frontmatter and preserve the body`, async () => {
			await Bun.write(taskPath, taskMarkdown());
			const result = await $`${getTestCliCommand()} task edit TASK-1 ${family.cliFlag} 2`
				.cwd(testDir)
				.nothrow()
				.quiet();
			expect(result.exitCode).toBe(0);
			await core.updateTaskFromInput("TASK-1", family.input, false);
			expect(await Bun.file(taskPath).text()).toContain(opaqueBody);
		});

		it(`MCP indexed ${family.name} edits use frontmatter and preserve the body`, async () => {
			await Bun.write(taskPath, taskMarkdown());
			const server = new McpServer(testDir, "Test instructions");
			try {
				await new TaskHandlers(server.application).editTask({ id: "TASK-1", ...family.mcpInput });
				expect(await Bun.file(taskPath).text()).toContain(opaqueBody);
			} finally {
				await server.stop();
			}
		});
	}

	it("browser checklist updates leave malformed opaque body rows untouched", async () => {
		await Bun.write(taskPath, taskMarkdown());
		const fixture = await createServerFixture(testDir);
		try {
			const result = await fixture.app.handle(
				new Request("http://localhost/api/tasks/TASK-1", {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						acceptanceCriteriaItems: [{ index: 2, text: "bravo", checked: true }],
					}),
				}),
			);
			expect(result.ok).toBe(true);
			expect(await Bun.file(taskPath).text()).toContain(opaqueBody);
		} finally {
			await fixture.dispose();
		}
	});
});
