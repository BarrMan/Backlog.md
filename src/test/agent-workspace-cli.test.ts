import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let testDir: string;
let configHome: string;
const cli = getTestCliCommand();

describe("agent workspace CLI", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("agent-workspace-cli");
		configHome = join(testDir, "config");
		await mkdir(testDir, { recursive: true });
		await $`${cli} init Workspace --defaults --integration-mode none`.cwd(testDir).quiet();
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	it("registers lifecycle commands and the lazy workspace guide", async () => {
		const [workspace, sessions, output, handoff, config, configSet, guide] = await Promise.all([
			$`${cli} workspace --help`.cwd(testDir).text(),
			$`${cli} agent-session --help`.cwd(testDir).text(),
			$`${cli} agent-session output --help`.cwd(testDir).text(),
			$`${cli} agent-session handoff-complete --help`.cwd(testDir).text(),
			$`${cli} agent-config --help`.cwd(testDir).text(),
			$`${cli} agent-config set --help`.cwd(testDir).text(),
			$`${cli} instructions agent-workspace`.cwd(testDir).text(),
		]);

		expect(workspace).toContain("Native tmux Board and Workspace windows");
		expect(sessions).toContain("handoff-complete");
		expect(sessions).toContain("handoff-continue");
		expect(sessions).toContain("output");
		expect(sessions).not.toContain("preview");
		expect(sessions).not.toContain("input <taskId>");
		expect(output).toContain("persisted session output");
		expect(handoff).toContain("--request <id>");
		expect(handoff).toContain("--file <path>");
		expect(config).toContain("--bootstrap");
		expect(config).toContain("selectively edit scoped agent configuration");
		expect(configSet).toContain("--worktree <true|false>");
		expect(configSet).toContain("--prepare <command>");
		expect(guide).toContain("backlog agent-session list TASK-123");
		expect(guide).toContain("Interactive input belongs in the native agent pane");
	});

	it("rejects the internal UI command outside its tmux host", async () => {
		const result = await $`${cli} workspace-ui board`.cwd(testDir).nothrow().quiet();

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain("workspace-ui can only run inside a Backlog tmux workspace.");
	});

	it("copies an effective parent once and selectively retains custom presets", async () => {
		const env = { ...process.env, XDG_CONFIG_HOME: configHome };
		await $`${cli} agent-config create root --preset custom --command ${"custom-agent {prompt}"} --env ${"TOKEN=secret"}`
			.cwd(testDir)
			.env(env)
			.quiet();
		await $`${cli} agent-config set project --preset custom --worktree false`.cwd(testDir).env(env).quiet();
		await $`${cli} agent-config create project --preset second --command ${"second-agent {prompt}"}`
			.cwd(testDir)
			.env(env)
			.quiet();
		const config = JSON.parse(await $`${cli} agent-config show project`.cwd(testDir).env(env).text());

		expect(config.selectedPreset).toBe("second");
		expect(config.presets.opencode).toBeDefined();
		expect(config.presets.custom).toMatchObject({
			command: "custom-agent {prompt}",
			env: { TOKEN: "secret" },
			worktree: false,
		});
		expect(config.presets.second).toMatchObject({ command: "second-agent {prompt}", bootstrap: "prompt" });
	});

	it("allows root configuration outside an initialized project", async () => {
		const outside = join(testDir, "outside");
		await mkdir(outside);
		const result = await $`${cli} agent-config show root`
			.cwd(outside)
			.env({ ...process.env, XDG_CONFIG_HOME: configHome })
			.text();

		expect(result).toBe("null\n");
	});
});
