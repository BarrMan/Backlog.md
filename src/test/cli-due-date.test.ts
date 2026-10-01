import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const CLI_COMMAND = getTestCliCommand();

describe("CLI due dates", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = createUniqueTestDir("cli-due-date");
		await mkdir(testDir, { recursive: true });
		await $`git init -b main`.cwd(testDir).quiet();
		await initializeTestProject(new Core(testDir), "CLI due dates");
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	it("creates, lists, edits, and clears task due dates", async () => {
		const created = await $`${CLI_COMMAND} task create "Ship release" --due-date 2026-08-10 --plain`
			.cwd(testDir)
			.text();
		// A due date names a day, so it is shown as written with no time and no (UTC) marker.
		expect(created).toContain("Due: 2026-08-10");
		expect(created).not.toContain("Due: 2026-08-10 ");

		const listed = await $`${CLI_COMMAND} task list --plain`.cwd(testDir).text();
		expect(listed).toContain("due 2026-08-10)");

		const edited = await $`${CLI_COMMAND} task edit 1 --due-date 2026-08-12 --plain`.cwd(testDir).text();
		expect(edited).toContain("Due: 2026-08-12");

		await $`${CLI_COMMAND} task edit 1 --clear-due-date`.cwd(testDir).quiet();
		const task = await new Core(testDir).filesystem.loadTask("task-1");
		expect(task?.dueDate).toBeUndefined();
	});

	it("rejects invalid and conflicting task due date flags", async () => {
		const invalid = await $`${CLI_COMMAND} task create "Invalid due" --due-date 10/08/2026`
			.cwd(testDir)
			.nothrow()
			.quiet();
		expect(invalid.exitCode).toBe(1);
		expect(invalid.stderr.toString()).toContain("YYYY-MM-DD");

		await $`${CLI_COMMAND} task create "Valid task"`.cwd(testDir).quiet();
		const conflict = await $`${CLI_COMMAND} task edit 1 --due-date 2026-08-10 --clear-due-date`
			.cwd(testDir)
			.nothrow()
			.quiet();
		expect(conflict.exitCode).toBe(1);
		expect(conflict.stderr.toString()).toContain("Cannot use --due-date and --clear-due-date together");
	});

	it("supports milestone due dates through add and rename", async () => {
		const added = await $`${CLI_COMMAND} milestone add "Release" --due-date 2026-09-01`.cwd(testDir).text();
		expect(added).toContain("Due: 2026-09-01");

		await $`${CLI_COMMAND} milestone rename Release Release --due-date 2026-09-02`.cwd(testDir).quiet();
		let milestone = await new Core(testDir).filesystem.loadMilestone("m-0");
		expect(milestone?.dueDate).toBe("2026-09-02");

		await $`${CLI_COMMAND} milestone rename Release Release --clear-due-date`.cwd(testDir).quiet();
		milestone = await new Core(testDir).filesystem.loadMilestone("m-0");
		expect(milestone?.dueDate).toBeUndefined();
	});
});
