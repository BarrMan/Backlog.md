import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
const cliCommand = getTestCliCommand();

describe("Implementation Plan CLI", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("implementation-plan");
		await mkdir(testDir, { recursive: true });
		await initializeFilesystemTestProject(new Core(testDir), "Implementation plan");
	});
	afterEach(async () => safeCleanup(testDir));

	it("creates and replaces plans in frontmatter", async () => {
		let result = await $`${cliCommand} task create Plan --plan ${"1. Design\n2. Build"}`.cwd(testDir).quiet().nothrow();
		expect(result.exitCode).toBe(0);
		const core = new Core(testDir);
		expect((await core.filesystem.loadTask("task-1"))?.implementationPlan).toBe("1. Design\n2. Build");
		result = await $`${cliCommand} task edit 1 --plan "1. Verify"`.cwd(testDir).quiet().nothrow();
		expect(result.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("task-1"))?.implementationPlan).toBe("1. Verify");
	});

	it("renders a human-readable plan heading", async () => {
		await $`${cliCommand} task create Plan --plan "1. Design"`.cwd(testDir).quiet();
		const result = await $`${cliCommand} task view 1 --plain`.cwd(testDir).quiet();
		expect(result.stdout.toString()).toContain("Implementation Plan:");
		expect(result.stdout.toString()).toContain("1. Design");
	});
});
