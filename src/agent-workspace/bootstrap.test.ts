import { describe, expect, it } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAgentLaunchCommand, renderSessionBootstrap } from "./bootstrap.ts";
import type { AgentPreset } from "./types.ts";

const preset: AgentPreset = {
	command: "",
	env: {},
	prepare: "",
	worktree: false,
	bootstrap: "opencode",
};

describe("agent session bootstrap", () => {
	it("binds every session to durable task context without mandatory workflow loading", () => {
		const bootstrap = renderSessionBootstrap({
			taskId: "BACK-123",
			sessionId: "session-1",
			projectRoot: "/project",
			cwd: "/project/worktree",
			configScope: "card",
			worktree: true,
		});

		expect(bootstrap.length).toBeLessThan(900);
		expect(bootstrap).toContain("BACKLOG_CWD=/project backlog task view BACK-123 --plain");
		expect(bootstrap).toContain("You are working on Backlog task BACK-123");
		expect(bootstrap).toContain("backlog task view/create/edit/delete/migrate-legacy --help");
		expect(bootstrap).toContain("backlog task edit BACK-123");
		expect(bootstrap).not.toContain("never edit files under backlog/ directly");
		expect(bootstrap).toContain("backlog agent-session list BACK-123");
		expect(bootstrap).toContain("If unavailable, ignore");
		expect(bootstrap).not.toContain("backlog instructions");
		expect(bootstrap).not.toContain("### Execution Workflow");
	});

	it("passes bootstrap content as one argv value and preserves configured command flags", async () => {
		const directory = await mkdtemp(join(tmpdir(), "backlog-bootstrap-"));
		const outputPath = join(directory, "argv.txt");
		const agentPath = join(directory, "agent");
		const bootstrapPath = join(directory, "agent's bootstrap.md");
		const bootstrap = "Read this first: $() * and spaces";
		await writeFile(agentPath, '#!/bin/sh\nprintf "%s\\n" "$@" > "$OUTPUT"\n');
		await chmod(agentPath, 0o755);
		await writeFile(bootstrapPath, bootstrap);

		try {
			for (const [bootstrapType, expected] of [
				["opencode", ["--existing", "--prompt", bootstrap]],
				["claude", ["--existing", bootstrap]],
				["codex", ["--existing", bootstrap]],
				["gemini", ["--existing", "--prompt-interactive", bootstrap]],
				["antigravity", ["--existing", "--prompt-interactive", bootstrap]],
			] as const) {
				const command = buildAgentLaunchCommand(
					{ ...preset, command: `${agentPath} --existing`, bootstrap: bootstrapType },
					bootstrapPath,
				);
				const child = Bun.spawn(["/bin/sh", "-lc", command], {
					env: { ...process.env, OUTPUT: outputPath },
					stdout: "ignore",
					stderr: "pipe",
				});
				expect(await child.exited).toBe(0);
				expect((await readFile(outputPath, "utf8")).trimEnd().split("\n")).toEqual([...expected]);
			}

			const custom = buildAgentLaunchCommand(
				{ ...preset, command: `${agentPath} --existing --custom {instructions}`, bootstrap: "prompt" },
				bootstrapPath,
			);
			const child = Bun.spawn(["/bin/sh", "-lc", custom], {
				env: { ...process.env, OUTPUT: outputPath },
				stdout: "ignore",
				stderr: "pipe",
			});
			expect(await child.exited).toBe(0);
			expect((await readFile(outputPath, "utf8")).trimEnd().split("\n")).toEqual(["--existing", "--custom", bootstrap]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("requires a prompt placeholder for custom commands and rejects unsafe built-in suffixes", () => {
		expect(() => buildAgentLaunchCommand({ ...preset, bootstrap: "prompt", command: "my-agent" }, "/tmp/a")).toThrow(
			"must include {prompt} or {instructions}",
		);
		expect(() => buildAgentLaunchCommand({ ...preset, command: "agent | tee output" }, "/tmp/a")).toThrow(
			"not a shell pipeline",
		);
	});
});
