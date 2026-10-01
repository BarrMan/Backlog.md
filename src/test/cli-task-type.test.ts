import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand, runTestCli } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const CLI_COMMAND = getTestCliCommand();
let TEST_DIR: string;
let core: Core;

describe("CLI task types", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-task-type");
		await mkdir(TEST_DIR, { recursive: true });

		core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "CLI Task Type Project");
		const config = await core.filesystem.loadConfig();
		if (!config) throw new Error("Expected test config");
		config.types = ["Bug", "Epic"];
		await core.filesystem.saveConfig(config);
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("creates and edits typed tasks with configured canonical casing", async () => {
		const created = await $`${CLI_COMMAND} task create "Typed task" --type ePiC --plain`.cwd(TEST_DIR).quiet();
		expect(created.exitCode).toBe(0);
		expect(created.stdout.toString()).toContain("Type: Epic");
		expect((await core.filesystem.loadTask("TASK-1"))?.type).toBe("Epic");
		const viewed = await $`${CLI_COMMAND} task view TASK-1 --plain`.cwd(TEST_DIR).quiet();
		expect(viewed.stdout.toString()).toContain("Type: Epic");

		const edited = await $`${CLI_COMMAND} task edit TASK-1 --type BUG --plain`.cwd(TEST_DIR).quiet();
		expect(edited.exitCode).toBe(0);
		expect(edited.stdout.toString()).toContain("Type: Bug");
		expect((await core.filesystem.loadTask("TASK-1"))?.type).toBe("Bug");

		await $`${CLI_COMMAND} task edit TASK-1 --title "Still typed"`.cwd(TEST_DIR).quiet();
		expect((await core.filesystem.loadTask("TASK-1"))?.type).toBe("Bug");

		const cleared = await runTestCli(["task", "edit", "TASK-1", "--type", "", "--plain"], { cwd: TEST_DIR });
		expect(cleared.stdout.toString()).not.toContain("Type:");
		expect((await core.filesystem.loadTask("TASK-1"))?.type).toBeUndefined();
	});

	it("rejects invalid values and keeps untyped tasks untyped", async () => {
		const invalidCreate = await $`${CLI_COMMAND} task create "Invalid type" --type feature`
			.cwd(TEST_DIR)
			.quiet()
			.nothrow();
		expect(invalidCreate.exitCode).toBe(1);
		expect(invalidCreate.stderr.toString()).toContain("Invalid type: feature. Valid types are: Bug, Epic");

		await $`${CLI_COMMAND} task create "Untyped task"`.cwd(TEST_DIR).quiet();
		const invalidEdit = await $`${CLI_COMMAND} task edit TASK-1 --type feature`.cwd(TEST_DIR).quiet().nothrow();
		expect(invalidEdit.exitCode).toBe(1);
		expect(invalidEdit.stderr.toString()).toContain("Invalid type: feature. Valid types are: Bug, Epic");

		const edited = await $`${CLI_COMMAND} task edit TASK-1 --title "Still untyped" --plain`.cwd(TEST_DIR).quiet();
		expect(edited.stdout.toString()).not.toContain("Type:");
		expect((await core.filesystem.loadTask("TASK-1"))?.type).toBeUndefined();
	});

	it("shows type badges in plain task lists and omits them for untyped tasks", async () => {
		await $`${CLI_COMMAND} task create "Typed list task" --type epic --priority high`.cwd(TEST_DIR).quiet();
		await $`${CLI_COMMAND} task create "Untyped list task"`.cwd(TEST_DIR).quiet();

		const result = await $`${CLI_COMMAND} task list --plain`.cwd(TEST_DIR).quiet();
		const output = result.stdout.toString();
		expect(output).toContain("[HIGH] [Epic] TASK-1 - Typed list task");
		expect(output).toContain("  TASK-2 - Untyped list task");

		const sortedResult = await $`${CLI_COMMAND} task list --plain --sort priority`.cwd(TEST_DIR).quiet();
		const sortedOutput = sortedResult.stdout.toString();
		expect(sortedOutput).toContain("[HIGH] [Epic] TASK-1 - Typed list task (To Do)");
		expect(sortedOutput).toContain("  TASK-2 - Untyped list task (To Do)");
	});

	it("documents configured values and exposes them through read-only config commands", async () => {
		const getOutput = await $`${CLI_COMMAND} config get types`.cwd(TEST_DIR).text();
		expect(getOutput.trim()).toBe("Bug, Epic");

		const listOutput = await $`${CLI_COMMAND} config list`.cwd(TEST_DIR).text();
		expect(listOutput).toContain("types: [Bug, Epic]");

		const createHelp = await $`${CLI_COMMAND} task create --help`.cwd(TEST_DIR).text();
		const editHelp = await $`${CLI_COMMAND} task edit --help`.cwd(TEST_DIR).text();
		for (const output of [createHelp, editHelp]) {
			expect(output).toContain("--type <type>");
			expect(output).toContain("type: one of configured task types: Bug, Epic");
		}
		expect(createHelp).toContain('backlog task create "Fix session expiry" --type "Bug"');
		expect(editHelp).toContain('backlog task edit TASK-1 --type "Bug"');
		expect(createHelp).not.toContain("--type bug");
		expect(editHelp).not.toContain("--type feature");
	});

	it("completes configured task types only for task type flags", async () => {
		for (const line of ["backlog task create --type ", "backlog task edit TASK-1 --type "]) {
			const result = await $`${CLI_COMMAND} completion __complete ${line} ${String(line.length)}`.cwd(TEST_DIR).quiet();
			expect(result.stdout.toString().trim().split("\n")).toEqual(["Bug", "Epic"]);
		}

		const searchLine = "backlog search --type ";
		const searchResult = await $`${CLI_COMMAND} completion __complete ${searchLine} ${String(searchLine.length)}`
			.cwd(TEST_DIR)
			.quiet();
		expect(searchResult.stdout.toString()).not.toContain("Epic");
	});
});
