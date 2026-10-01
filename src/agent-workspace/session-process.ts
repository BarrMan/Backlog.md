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

	async create(session: AgentSession, env: Record<string, string>): Promise<string> {
		const environment = Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
		const created = await this.runner.run(
			[
				"tmux",
				"new-session",
				"-d",
				"-P",
				"-F",
				"#{pane_id}",
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
		const paneId = created.stdout.trim();
		if (!/^%\d+$/.test(paneId)) throw new Error(`Could not determine tmux pane for session ${session.id}.`);
		return paneId;
	}

	async preparePane(session: AgentSession): Promise<void> {
		const paneId = this.paneId(session);
		for (const args of [
			["tmux", "set-option", "-t", session.tmuxName, "remain-on-exit", "on"],
			["tmux", "pipe-pane", "-o", "-t", paneId, `cat >> ${quote(session.outputPath)}`],
		]) {
			const result = await this.runner.run(args);
			if (result.exitCode !== 0) throw fail(`Could not prepare tmux session ${session.id}`, result);
		}
	}

	async launch(session: AgentSession, preset: AgentPreset): Promise<void> {
		const paneId = this.paneId(session);
		const launched = await this.runner.run([
			"tmux",
			"respawn-pane",
			"-k",
			"-t",
			paneId,
			"/bin/sh",
			"-lc",
			`exec ${buildAgentLaunchCommand(preset, session.bootstrapPath)}`,
		]);
		if (launched.exitCode !== 0) throw fail(`Could not launch agent session ${session.id}`, launched);
		await Bun.sleep(LAUNCH_SETTLE_DELAY_MS);
		const pane = await this.runner.run([
			"tmux",
			"display-message",
			"-p",
			"-t",
			paneId,
			"#{pane_dead} #{pane_dead_status}",
		]);
		if (pane.exitCode !== 0 || /^1\s+127/.test(pane.stdout.trim()))
			throw fail(`Agent command failed to launch for session ${session.id}`, pane);
	}

	async capture(session: AgentSession) {
		return await this.runner.run(["tmux", "capture-pane", "-p", "-e", "-t", this.paneId(session)]);
	}
	async cursorRow(session: AgentSession): Promise<number | undefined> {
		const result = await this.runner.run(["tmux", "display-message", "-p", "-t", this.paneId(session), "#{cursor_y}"]);
		return /^\d+$/.test(result.stdout.trim()) ? Number(result.stdout.trim()) : undefined;
	}
	async settledCapture(session: AgentSession) {
		const initial = await this.capture(session);
		await Bun.sleep(HANDOFF_SETTLE_DELAY_MS);
		return { initial, settled: await this.capture(session) };
	}
	async sendEnter(session: AgentSession): Promise<void> {
		const result = await this.runner.run(["tmux", "send-keys", "-t", this.paneId(session), "Enter"]);
		if (result.exitCode !== 0) throw fail(`Could not deliver handoff request to session ${session.id}`, result);
	}
	async paste(session: AgentSession, input: string): Promise<void> {
		const buffer = `backlog-${randomUUID()}`;
		const loaded = await this.runner.run(["tmux", "load-buffer", "-b", buffer, "-"], { stdin: input });
		if (loaded.exitCode !== 0) throw fail(`Could not send input to session ${session.id}`, loaded);
		let pasted = false;
		try {
			const result = await this.runner.run(["tmux", "paste-buffer", "-d", "-b", buffer, "-t", this.paneId(session)]);
			if (result.exitCode !== 0) throw fail(`Could not send input to session ${session.id}`, result);
			pasted = true;
		} finally {
			if (!pasted) await this.runner.run(["tmux", "delete-buffer", "-b", buffer]);
		}
	}
	async kill(session: AgentSession): Promise<void> {
		const result = await this.runner.run(["tmux", "kill-pane", "-t", this.paneId(session)]);
		if (result.exitCode !== 0 && !/no server running|can't find pane/i.test(result.stderr))
			throw fail(`Could not stop session ${session.id}`, result);
	}
	async attach(session: AgentSession): Promise<void> {
		const command = process.env.TMUX ? "switch-client" : "attach-session";
		const result = await this.runner.run(["tmux", command, "-t", this.paneId(session)], { inherit: true });
		if (result.exitCode !== 0) throw fail(`Could not attach to session ${session.id}`, result);
	}

	async alive(session: AgentSession) {
		return await this.runner.run(["tmux", "display-message", "-p", "-t", this.paneId(session), "#{pane_dead}"]);
	}

	private paneId(session: AgentSession): string {
		if (!session.paneId) throw new Error(`Agent session ${session.id} has no tmux pane ID.`);
		return session.paneId;
	}
}
