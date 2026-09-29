import { randomUUID } from "node:crypto";
import { captureProcessOutput } from "../process/capture.ts";
import { buildAgentLaunchCommand } from "./bootstrap.ts";
import { fail, type SessionCommandResult } from "./session-utils.ts";
import type { AgentPreset, AgentSession } from "./types.ts";

const HANDOFF_SETTLE_DELAY_MS = 50;
const LAUNCH_SETTLE_DELAY_MS = 25;
const TMUX_PLACEHOLDER_COMMAND = "exec sleep 2147483647";

export interface AgentSessionRunner {
	run(
		args: string[],
		options?: { cwd?: string; env?: Record<string, string>; stdin?: string; inherit?: boolean },
	): Promise<SessionCommandResult>;
}

export class BunRunner implements AgentSessionRunner {
	async run(
		args: string[],
		options: { cwd?: string; env?: Record<string, string>; stdin?: string; inherit?: boolean } = {},
	): Promise<SessionCommandResult> {
		const child = Bun.spawn(args, {
			cwd: options.cwd,
			env: options.env,
			stdin: options.inherit
				? "inherit"
				: options.stdin === undefined
					? "ignore"
					: new TextEncoder().encode(options.stdin),
			stdout: options.inherit ? "inherit" : "pipe",
			stderr: options.inherit ? "inherit" : "pipe",
		});
		if (options.inherit) return { exitCode: await child.exited, stdout: "", stderr: "" };
		return await captureProcessOutput(child);
	}
}

function quote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export class SessionProcess {
	constructor(private readonly runner: AgentSessionRunner) {}

	async prepare(command: string, cwd: string, env: Record<string, string>): Promise<void> {
		const result = await this.runner.run(["/bin/sh", "-lc", command], { cwd, env });
		if (result.exitCode !== 0) throw fail("Agent preparation failed", result);
	}

	async launch(session: AgentSession, preset: AgentPreset, env: Record<string, string>): Promise<void> {
		const environment = Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
		const created = await this.runner.run(
			[
				"tmux",
				"new-session",
				"-d",
				"-s",
				session.tmuxName,
				"-c",
				session.cwd,
				...environment,
				"/bin/sh",
				"-lc",
				TMUX_PLACEHOLDER_COMMAND,
			],
			{ env },
		);
		if (created.exitCode !== 0) throw fail(`Could not start tmux session ${session.id}`, created);
		for (const args of [
			["tmux", "set-option", "-t", session.tmuxName, "remain-on-exit", "on"],
			["tmux", "pipe-pane", "-o", "-t", session.tmuxName, `cat >> ${quote(session.outputPath)}`],
		]) {
			const result = await this.runner.run(args);
			if (result.exitCode !== 0) throw fail(`Could not prepare tmux session ${session.id}`, result);
		}
		const launched = await this.runner.run([
			"tmux",
			"respawn-pane",
			"-k",
			"-t",
			session.tmuxName,
			"/bin/sh",
			"-lc",
			`exec ${buildAgentLaunchCommand(preset, session.bootstrapPath)}`,
		]);
		if (launched.exitCode !== 0) throw fail(`Could not launch agent session ${session.id}`, launched);
		await Bun.sleep(LAUNCH_SETTLE_DELAY_MS);
		const pane = await this.runner.run([
			"tmux",
			"list-panes",
			"-t",
			session.tmuxName,
			"-F",
			"#{pane_dead} #{pane_dead_status}",
		]);
		if (pane.exitCode !== 0 || /^1\s+127/.test(pane.stdout.trim()))
			throw fail(`Agent command failed to launch for session ${session.id}`, pane);
	}

	async capture(tmuxName: string) {
		return await this.runner.run(["tmux", "capture-pane", "-p", "-e", "-t", tmuxName]);
	}
	async cursorRow(tmuxName: string): Promise<number | undefined> {
		const result = await this.runner.run(["tmux", "display-message", "-p", "-t", tmuxName, "#{cursor_y}"]);
		return /^\d+$/.test(result.stdout.trim()) ? Number(result.stdout.trim()) : undefined;
	}
	async settledCapture(tmuxName: string) {
		const initial = await this.capture(tmuxName);
		await Bun.sleep(HANDOFF_SETTLE_DELAY_MS);
		return { initial, settled: await this.capture(tmuxName) };
	}
	async sendEnter(tmuxName: string, sessionId: string): Promise<void> {
		const result = await this.runner.run(["tmux", "send-keys", "-t", tmuxName, "Enter"]);
		if (result.exitCode !== 0) throw fail(`Could not deliver handoff request to session ${sessionId}`, result);
	}
	async paste(tmuxName: string, sessionId: string, input: string): Promise<void> {
		const buffer = `backlog-${randomUUID()}`;
		const loaded = await this.runner.run(["tmux", "load-buffer", "-b", buffer, "-"], { stdin: input });
		if (loaded.exitCode !== 0) throw fail(`Could not send input to session ${sessionId}`, loaded);
		try {
			const pasted = await this.runner.run(["tmux", "paste-buffer", "-d", "-b", buffer, "-t", tmuxName]);
			if (pasted.exitCode !== 0) throw fail(`Could not send input to session ${sessionId}`, pasted);
		} finally {
			await this.runner.run(["tmux", "delete-buffer", "-b", buffer]);
		}
	}
	async kill(tmuxName: string): Promise<void> {
		const result = await this.runner.run(["tmux", "kill-session", "-t", tmuxName]);
		if (result.exitCode !== 0 && !/no server running|can't find session/i.test(result.stderr))
			throw fail(`Could not stop session ${tmuxName}`, result);
	}
	async resize(tmuxName: string, sessionId: string, cols: number, rows: number): Promise<void> {
		const result = await this.runner.run([
			"tmux",
			"resize-window",
			"-t",
			tmuxName,
			"-x",
			String(cols),
			"-y",
			String(rows),
		]);
		if (result.exitCode !== 0) throw fail(`Could not resize session ${sessionId}`, result);
	}
	async resetSize(tmuxName: string, sessionId: string): Promise<void> {
		const result = await this.runner.run(["tmux", "set-option", "-w", "-t", tmuxName, "window-size", "latest"]);
		if (result.exitCode !== 0) throw fail(`Could not restore session ${sessionId} size`, result);
	}
	async attach(tmuxName: string, sessionId: string): Promise<void> {
		const result = await this.runner.run(["tmux", "attach-session", "-t", tmuxName], {
			inherit: true,
			env: { ...process.env, TMUX: "" } as Record<string, string>,
		});
		if (result.exitCode !== 0) throw fail(`Could not attach to session ${sessionId}`, result);
	}
}
