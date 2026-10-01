import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { toTaskDetail } from "../core/task-detail.ts";
import { formatTaskPlainText } from "../formatters/task-plain-text.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

describe("opaque task body integration", () => {
	let testDir: string;
	let core: Core;

	beforeEach(async () => {
		testDir = createUniqueTestDir("task-opaque-body");
		await mkdir(testDir, { recursive: true });
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Opaque task body");
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	it("uses frontmatter checklist fields even when the body has malformed checkbox text", async () => {
		await core.createTask(
			{
				id: "task-1",
				title: "Opaque body",
				status: "To Do",
				assignee: [],
				createdDate: "2026-09-30 12:00",
				labels: [],
				dependencies: [],
				acceptanceCriteriaItems: [{ index: 1, text: "Stored criterion", checked: false }],
				rawContent: "## Example\n\n- [~] This is free-form body text.",
			},
			false,
		);

		await core.checkAcceptanceCriteria("task-1", [1], true, false);

		const task = await core.filesystem.loadTask("task-1");
		if (!task) throw new Error("Expected created task");
		expect(task.acceptanceCriteriaItems).toEqual([{ index: 1, text: "Stored criterion", checked: true }]);
		expect(task.rawContent).toContain("- [~] This is free-form body text.");

		const output = formatTaskPlainText(toTaskDetail(task, { tasks: [task], completedTasks: [], statuses: ["To Do"] }));
		expect(output).toContain("Acceptance Criteria:");
		expect(output).toContain("- [x] #1 Stored criterion");
	});
});
