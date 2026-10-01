import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;

describe("Definition of Done", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("definition-of-done");
		await mkdir(testDir, { recursive: true });
		await initializeFilesystemTestProject(new Core(testDir), "Definition of done");
	});
	afterEach(async () => safeCleanup(testDir));

	it("loads and saves definition_of_done config", async () => {
		const core = new Core(testDir);
		const config = await core.filesystem.loadConfig();
		if (config) await core.filesystem.saveConfig({ ...config, definitionOfDone: ["Run tests", "Update docs"] });
		expect((await core.filesystem.loadConfig())?.definitionOfDone).toEqual(["Run tests", "Update docs"]);
	});

	it("applies defaults and preserves checklist state in task frontmatter", async () => {
		const core = new Core(testDir);
		const config = await core.filesystem.loadConfig();
		if (config) await core.filesystem.saveConfig({ ...config, definitionOfDone: ["Run tests"] });
		const { task } = await core.createTaskFromInput({ title: "DoD" });
		await core.editTask(task.id, {
			addDefinitionOfDone: [{ text: "Ship", checked: false }],
			checkDefinitionOfDone: [1],
		});
		expect((await core.filesystem.loadTask(task.id))?.definitionOfDoneItems).toEqual([
			{ index: 1, text: "Run tests", checked: true },
			{ index: 2, text: "Ship", checked: false },
		]);
	});
});
