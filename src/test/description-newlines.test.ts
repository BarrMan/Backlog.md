import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../index.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
const cliCommand = getTestCliCommand();
const description = "First line\nSecond line\n\nThird paragraph";

describe("CLI description newlines", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("description-newlines");
		await mkdir(testDir, { recursive: true });
		await initializeFilesystemTestProject(new Core(testDir), "Description newlines");
	});
	afterEach(async () => safeCleanup(testDir));

	it("stores literal newlines in description frontmatter on create and edit", async () => {
		await $`${cliCommand} task create "Multi-line" --desc ${description}`.cwd(testDir).quiet();
		const core = new Core(testDir);
		expect((await core.filesystem.loadTask("task-1"))?.description).toBe(description);
		await $`${cliCommand} task edit 1 --desc ${"Replacement\ntext"}`.cwd(testDir).quiet();
		expect((await core.filesystem.loadTask("task-1"))?.description).toBe("Replacement\ntext");
	});

	it("does not interpret escaped newline text", async () => {
		await $`${cliCommand} task create Literal --desc ${"First line\\nSecond line"}`.cwd(testDir).quiet();
		expect((await new Core(testDir).filesystem.loadTask("task-1"))?.description).toBe("First line\\nSecond line");
	});
});
