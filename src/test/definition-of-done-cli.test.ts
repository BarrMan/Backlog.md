import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
const cliCommand = getTestCliCommand();

describe("Definition of Done CLI", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("definition-of-done-cli");
		await mkdir(testDir, { recursive: true });
		const core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Definition of done");
		const config = await core.filesystem.loadConfig();
		if (config) await core.filesystem.saveConfig({ ...config, definitionOfDone: ["Run tests", "Update docs"] });
	});
	afterEach(async () => safeCleanup(testDir));

	it("creates and edits frontmatter checklist items", async () => {
		await $`${cliCommand} task create DoD --dod Ship`.cwd(testDir).quiet();
		await $`${cliCommand} task edit 1 --check-dod 2 --remove-dod 1`.cwd(testDir).quiet();
		expect((await new Core(testDir).filesystem.loadTask("task-1"))?.definitionOfDoneItems).toEqual([
			{ index: 1, text: "Update docs", checked: true },
			{ index: 2, text: "Ship", checked: false },
		]);
	});

	it("keeps the Definition of Done plain-output heading", async () => {
		await $`${cliCommand} task create DoD`.cwd(testDir).quiet();
		const result = await $`${cliCommand} task view 1 --plain`.cwd(testDir).quiet();
		expect(result.stdout.toString()).toContain("Definition of Done:");
	});
});
