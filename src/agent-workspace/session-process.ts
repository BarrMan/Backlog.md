import { realpathSync } from "node:fs";
import { captureProcessOutput } from "../process/capture.ts";
import { buildAgentLaunchCommand, buildAgentResumeCommand } from "./bootstrap.ts";
import { fail, type SessionCommandResult } from "./session-utils.ts";
import type { AgentPreset, AgentSession } from "./types.ts";

const LAUNCH_SETTLE_DELAY_MS = 25;
const TMUX_PLACEHOLDER_COMMAND = "exec sleep 2147483647";
const PANE_METADATA_FORMAT = "#{pane_id}\t#{pane_dead}\t#{@backlog_root}\t#{@backlog_task}\t#{@backlog_role}";
const PANE_OPTION_ROOT = "@backlog_root";
const PANE_OPTION_TASK = "@backlog_task";
const PANE_OPTION_ROLE = "@backlog_role";
const LIVE_PREVIEW_ROLE = "live-preview";
const RETIRED_SESSION_ROLE = "retired-session";

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
	private readonly rootDir: string;

	constructor(
		private readonly runner: AgentSessionRunner,
		rootDir: string,
	) {
		this.rootDir = realpathSync(rootDir);
	}

	async prepare(command: string, cwd: string, env: Record<string, string>): Promise<void> {
		const result = await this.runner.run(["/bin/sh", "-lc", command], { cwd, env });
		if (result.exitCode !== 0) throw fail("Agent preparation failed", result);
	}

	async create(session: AgentSession, env: Record<string, string>): Promise<void> {
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
		for (const [option, value] of [
			[PANE_OPTION_ROOT, this.rootDir],
			[PANE_OPTION_TASK, session.taskId],
			[PANE_OPTION_ROLE, LIVE_PREVIEW_ROLE],
		] as const) {
			const tagged = await this.runner.run(["tmux", "set-option", "-p", "-t", paneId, option, value]);
			if (tagged.exitCode !== 0) throw fail(`Could not tag tmux session ${session.id}`, tagged);
		}
		const titled = await this.runner.run(["tmux", "select-pane", "-t", paneId, "-T", `${session.taskId} agent`]);
		if (titled.exitCode !== 0) throw fail(`Could not title tmux session ${session.id}`, titled);
	}

	async preparePane(session: AgentSession, options: { includeDead?: boolean } = {}): Promise<void> {
		const paneId = await this.paneId(session, options);
		for (const args of [
			["tmux", "set-option", "-t", session.tmuxName, "remain-on-exit", "on"],
			["tmux", "pipe-pane", "-o", "-t", paneId, `cat >> ${quote(session.outputPath)}`],
		]) {
			const result = await this.runner.run(args);
			if (result.exitCode !== 0) throw fail(`Could not prepare tmux session ${session.id}`, result);
		}
	}

	async launch(session: AgentSession, preset: AgentPreset): Promise<void> {
		await this.launchCommand(
			session,
			`exec ${buildAgentLaunchCommand(preset, session.bootstrapPath, session.nativeSessionId)}`,
		);
	}

	async resume(session: AgentSession, preset: AgentPreset, options: { includeDead?: boolean } = {}): Promise<void> {
		await this.launchCommand(session, `exec ${buildAgentResumeCommand(preset, session.nativeSessionId)}`, options);
	}

	private async launchCommand(
		session: AgentSession,
		command: string,
		options: { includeDead?: boolean } = {},
	): Promise<void> {
		const paneId = await this.paneId(session, options);
		const launched = await this.runner.run(["tmux", "respawn-pane", "-k", "-t", paneId, "/bin/sh", "-lc", command]);
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

	async demote(session: AgentSession): Promise<void> {
		if (await this.findPane(session, { roles: [RETIRED_SESSION_ROLE] })) return;
		const paneId = await this.findPane(session);
		if (!paneId) return;
		const tagged = await this.runner.run([
			"tmux",
			"set-option",
			"-p",
			"-t",
			paneId,
			PANE_OPTION_ROLE,
			RETIRED_SESSION_ROLE,
		]);
		if (tagged.exitCode !== 0) throw fail(`Could not retag tmux session ${session.id}`, tagged);
	}

	async promote(session: AgentSession): Promise<void> {
		const paneId = await this.findPane(session, { roles: [RETIRED_SESSION_ROLE] });
		if (!paneId) return;
		const tagged = await this.runner.run([
			"tmux",
			"set-option",
			"-p",
			"-t",
			paneId,
			PANE_OPTION_ROLE,
			LIVE_PREVIEW_ROLE,
		]);
		if (tagged.exitCode !== 0) throw fail(`Could not retag tmux session ${session.id}`, tagged);
	}

	async kill(session: AgentSession): Promise<void> {
		await this.killPane(session, [LIVE_PREVIEW_ROLE]);
	}

	async killRetired(session: AgentSession): Promise<void> {
		await this.killPane(session, [RETIRED_SESSION_ROLE]);
	}

	private async killPane(session: AgentSession, roles: string[]): Promise<void> {
		const paneId =
			(await this.findPane(session, { roles })) ?? (await this.findPane(session, { includeDead: true, roles }));
		if (!paneId) return;
		const result = await this.runner.run(["tmux", "kill-pane", "-t", paneId]);
		if (result.exitCode !== 0 && !/no server running|can't find pane/i.test(result.stderr))
			throw fail(`Could not stop session ${session.id}`, result);
	}
	async attach(session: AgentSession): Promise<void> {
		const command = process.env.TMUX ? "switch-client" : "attach-session";
		const result = await this.runner.run(["tmux", command, "-t", await this.paneId(session)], { inherit: true });
		if (result.exitCode !== 0) throw fail(`Could not attach to session ${session.id}`, result);
	}

	async alive(session: AgentSession) {
		const paneId = (await this.findPane(session)) ?? (await this.findPane(session, { includeDead: true }));
		if (!paneId) return { exitCode: 1, stdout: "", stderr: `tmux pane for session ${session.id} not found` };
		const result = await this.runner.run(["tmux", "display-message", "-p", "-t", paneId, "#{pane_id} #{pane_dead}"]);
		if (result.exitCode !== 0) return result;
		const [actualPaneId, paneDead] = result.stdout.trim().split(/\s+/);
		if (actualPaneId !== paneId || (paneDead !== "0" && paneDead !== "1"))
			return { exitCode: 1, stdout: "", stderr: result.stderr || `tmux pane ${paneId} not found` };
		return { ...result, stdout: `${paneDead}\n` };
	}

	private async paneId(
		session: AgentSession,
		options: { includeDead?: boolean; roles?: string[] } = {},
	): Promise<string> {
		const paneId = await this.findPane(session, options);
		if (!paneId) throw new Error(`Agent pane for session ${session.id} no longer exists`);
		return paneId;
	}

	private async findPane(
		session: AgentSession,
		options: { includeDead?: boolean; roles?: string[] } = {},
	): Promise<string | undefined> {
		const roles = options.roles ?? [LIVE_PREVIEW_ROLE];
		const listed = await this.runner.run(["tmux", "list-panes", "-a", "-F", PANE_METADATA_FORMAT]);
		if (listed.exitCode !== 0) {
			if (/no server running/i.test(listed.stderr)) return undefined;
			throw fail(`Could not find tmux pane for session ${session.id}`, listed);
		}
		const matches = listed.stdout
			.split("\n")
			.map((line) => line.split("\t"))
			.filter(
				([paneId, dead, root, taskId, role]) =>
					paneId?.startsWith("%") &&
					(options.includeDead || dead !== "1") &&
					root === this.rootDir &&
					taskId === session.taskId &&
					roles.includes(role ?? ""),
			);
		if (matches.length > 1) throw new Error(`Multiple tmux panes match agent session ${session.id}.`);
		return matches[0]?.[0];
	}
}
