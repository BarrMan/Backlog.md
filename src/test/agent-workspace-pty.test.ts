import { describe, expect, it } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import {
	getEditableAgentConfiguration,
	loadAgentConfiguration,
	upsertAgentConfiguration,
} from "../agent-workspace/config.ts";
import { Core } from "../core/backlog.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";
import { killTmuxServer, uniqueTmuxSocket } from "./tmux-test-server.ts";

const expectPath = Bun.which("expect");
const tmuxPath = Bun.which("tmux");
const escapedCliCommand = getTestCliCommand()
	.map((argument) => `{${argument.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}")}}`)
	.join(" ");
const interactive =
	process.env.RUN_INTERACTIVE_TUI_TESTS === "1" && expectPath && tmuxPath && process.platform !== "win32"
		? it
		: it.skip;

describe("agent workspace PTY", () => {
	interactive(
		"saves scoped configuration from the navigation pane",
		async () => {
			const directory = createUniqueTestDir("agent-workspace-pty");
			const bin = join(directory, "bin");
			const socket = uniqueTmuxSocket("workspace-pty");
			const script = `${directory}/workspace.expect`;
			const transcript = `${directory}/workspace.log`;
			const configHome = join(directory, "user-config");
			const environment = {
				...process.env,
				PATH: `${bin}:${process.env.PATH}`,
				TMUX: "",
				BACKLOG_CWD: directory,
				XDG_CONFIG_HOME: configHome,
			};
			try {
				await mkdir(directory, { recursive: true });
				await mkdir(bin, { recursive: true });
				await writeFile(join(bin, "tmux"), `#!/bin/sh\nexec ${tmuxPath as string} -f /dev/null -L ${socket} "$@"\n`);
				await chmod(join(bin, "tmux"), 0o755);
				await $`git init -b main`.cwd(directory).quiet();
				const core = new Core(directory);
				await initializeTestProject(core, "Workspace PTY");
				const { task } = await core.createTaskFromInput({ title: "First task", status: "To Do" }, false);
				const configuration = await getEditableAgentConfiguration(core, "project");
				const selected = configuration.presets[configuration.selectedPreset];
				if (!selected) throw new Error("Built-in selected preset is missing.");
				configuration.presets[configuration.selectedPreset] = { ...selected, command: "workspace-save-ready-command" };
				await upsertAgentConfiguration(core, "project", configuration);
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
spawn ${escapedCliCommand} workspace
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
  -re {card[^\r\n]*preset} {}
  timeout { exit 94 }
}
send -- "q"
expect {
  eof {}
  timeout { exit 95 }
}
`,
				);
				const child = Bun.spawn([expectPath as string, "-f", script], {
					cwd: directory,
					env: environment,
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
				expect(await loadAgentConfiguration(core, "card", task.id)).toEqual(configuration);
			} finally {
				// Address the socket directly rather than through the PATH stub: a stub that was
				// never written would silently turn this into a kill-server on the default socket,
				// which destroys every unrelated live tmux session on the machine.
				await killTmuxServer(socket);
				await safeCleanup(directory);
			}
		},
		30_000,
	);
});
