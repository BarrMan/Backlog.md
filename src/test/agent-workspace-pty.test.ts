import { describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import {
	getEditableAgentConfiguration,
	loadAgentConfiguration,
	upsertAgentConfiguration,
} from "../agent-workspace/config.ts";
import { Core } from "../core/backlog.ts";
import { getTestCliPath } from "./test-cli.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const expectPath = Bun.which("expect");
const interactive =
	process.env.RUN_INTERACTIVE_TUI_TESTS === "1" && expectPath && process.platform !== "win32" ? it : it.skip;

describe("agent workspace PTY", () => {
	interactive(
		"saves scoped configuration from the panel",
		async () => {
			const directory = createUniqueTestDir("agent-workspace-pty");
			const script = `${directory}/workspace.expect`;
			const transcript = `${directory}/workspace.log`;
			const configHome = join(directory, "user-config");
			const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
			try {
				process.env.XDG_CONFIG_HOME = configHome;
				await mkdir(directory, { recursive: true });
				await $`git init -b main`.cwd(directory).quiet();
				const core = new Core(directory);
				await initializeTestProject(core, "Workspace PTY");
				const { task } = await core.createTaskFromInput({ title: "First task", status: "To Do" }, false);
				const projectConfiguration = await getEditableAgentConfiguration(core, "project");
				const selectedPreset = projectConfiguration.presets[projectConfiguration.selectedPreset];
				if (!selectedPreset) throw new Error("Built-in selected preset is missing.");
				projectConfiguration.presets[projectConfiguration.selectedPreset] = {
					...selectedPreset,
					command: "workspace-save-ready-command",
				};
				await upsertAgentConfiguration(core, "project", projectConfiguration);
				expect(await loadAgentConfiguration(core, "card", task.id)).toBeNull();
				await writeFile(
					script,
					`#!/usr/bin/expect -f
set timeout 20
log_user 0
log_file -a {${transcript}}
set env(TERM) {xterm-256color}
set env(COLUMNS) {120}
set env(LINES) {40}
set env(NO_COLOR) {1}
set env(BACKLOG_CWD) {${directory}}
set env(XDG_CONFIG_HOME) {${configHome}}
set stty_init {rows 40 columns 120 -ixon}
spawn {bun} {${getTestCliPath()}} workspace
expect {
	-re {First task} {}
	timeout { exit 91 }
}
send -- "p"
expect {
	-re {Scope} {}
	timeout { exit 92 }
}
expect {
	-re {workspace-save-ready-command} {}
	timeout { exit 93 }
}
send -- "\\023"
expect {
	-re {Saved card preset.} {}
	timeout { exit 94 }
}
send -- "q"
expect {
	eof {}
	timeout { exit 95 }
}
exit 0
`,
				);
				const child = Bun.spawn([expectPath as string, "-f", script], {
					cwd: directory,
					stdout: "pipe",
					stderr: "pipe",
				});
				const exitCode = await Promise.race([
					child.exited,
					Bun.sleep(25_000).then(() => {
						child.kill();
						return -1;
					}),
				]);
				const [stdout, stderr, terminal] = await Promise.all([
					child.stdout ? new Response(child.stdout).text() : Promise.resolve(""),
					child.stderr ? new Response(child.stderr).text() : Promise.resolve(""),
					Bun.file(transcript)
						.text()
						.catch(() => "(no transcript captured)"),
				]);
				if (exitCode !== 0)
					throw new Error(`Interactive workspace failed with ${exitCode}.\n${stdout}\n${stderr}\n${terminal}`);
				expect(await core.getTask(task.id)).not.toBeNull();
				expect(await loadAgentConfiguration(core, "card", task.id)).toEqual(projectConfiguration);
			} finally {
				if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
				else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
				await safeCleanup(directory);
			}
		},
		30_000,
	);
});
