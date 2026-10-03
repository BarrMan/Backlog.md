import { realpathSync } from "node:fs";
import {
	type CmdOptions,
	type NewSessionOptions,
	type RespawnOptions,
	Server,
	TmuxCommandError,
	TmuxTransportError,
} from "libtmux";
import { captureProcessOutput } from "../process/capture.ts";
import { buildAgentLaunchCommand, buildAgentResumeCommand } from "./bootstrap.ts";
import { fail, type SessionCommandResult } from "./session-utils.ts";
import { findTmuxPanesByTaskAndRole, paneTitle } from "./tmux-pane-lookup.ts";
import type { AgentPreset, AgentSession } from "./types.ts";

const LAUNCH_SETTLE_DELAY_MS = 25;
const TMUX_PLACEHOLDER_COMMAND = "exec sleep 2147483647";
const PANE_OPTION_ROOT = "@backlog_root";
const PANE_OPTION_TASK = "@backlog_task";
const PANE_OPTION_ROLE = "@backlog_role";
const LIVE_PREVIEW_ROLE = "live-preview";
const RETIRED_SESSION_ROLE = "retired-session";

type ProcessOptions = { cwd?: string; env?: Record<string, string>; stdin?: string; inherit?: boolean };

export interface ProcessRunner {
	run(args: string[], options?: ProcessOptions): Promise<SessionCommandResult>;
}

export class BunRunner implements ProcessRunner {
	async run(args: string[], options: ProcessOptions = {}): Promise<SessionCommandResult> {
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

interface TmuxWindowHandle {
	setOption(name: string, value: string): Promise<void>;
}

interface TmuxPaneHandle {
	readonly id: string;
	readonly window?: TmuxWindowHandle;
	setOption(name: string, value: string): Promise<void>;
	setTitle(title: string): Promise<void>;
	pipeTo(command?: string, options?: { readonly toggle?: boolean }): Promise<void>;
	respawn(command?: string, options?: RespawnOptions): Promise<void>;
	displayMessage(message: string): Promise<readonly string[]>;
	kill(): Promise<void>;
}

interface TmuxSessionHandle {
	readonly activePane?: TmuxPaneHandle;
}

export interface TmuxServer {
	newSession(options?: NewSessionOptions): Promise<TmuxSessionHandle>;
	panes(): Promise<Iterable<TmuxPaneHandle>>;
	cmd(command: string, args?: readonly string[], options?: CmdOptions): Promise<readonly string[]>;
}

function quote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function errorResult(error: unknown): SessionCommandResult {
	if (error instanceof TmuxCommandError)
		return { exitCode: error.exitCode, stdout: error.stdout.join("\n"), stderr: error.stderr.join("\n") };
	if (error instanceof TmuxTransportError)
		return {
			exitCode: 1,
			stdout: new TextDecoder().decode(error.stdout),
			stderr: new TextDecoder().decode(error.stderr) || error.message,
		};
	return { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
}

async function tmux<T>(prefix: string, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		throw fail(prefix, errorResult(error));
	}
}

function isMissingTmux(error: unknown): boolean {
	const result = errorResult(error);
	return /no server running|can't find pane/i.test(result.stderr);
}

function firstLine(lines: readonly string[]): string {
	return lines[0] ?? "";
}

export class SessionProcess {
	private readonly rootDir: string;

	constructor(
		private readonly runner: ProcessRunner,
		rootDir: string,
		private readonly server: TmuxServer = new Server(),
	) {
		this.rootDir = realpathSync(rootDir);
	}

	async prepare(command: string, cwd: string, env: Record<string, string>): Promise<void> {
		const result = await this.runner.run(["/bin/sh", "-lc", command], { cwd, env });
		if (result.exitCode !== 0) throw fail("Agent preparation failed", result);
	}

	async create(session: AgentSession, env: Record<string, string>): Promise<void> {
		const created = await tmux(`Could not start tmux session ${session.id}`, () =>
			this.server.newSession({
				name: session.tmuxName,
				startDirectory: session.cwd,
				environment: env,
				shellCommand: `/bin/sh -lc ${quote(TMUX_PLACEHOLDER_COMMAND)}`,
			}),
		);
		const pane = created.activePane;
		if (!pane?.id || !/^%\d+$/.test(pane.id))
			throw new Error(`Could not determine tmux pane for session ${session.id}.`);
		for (const [option, value] of [
			[PANE_OPTION_ROOT, this.rootDir],
			[PANE_OPTION_TASK, session.taskId],
			[PANE_OPTION_ROLE, LIVE_PREVIEW_ROLE],
		] as const) {
			await tmux(`Could not tag tmux session ${session.id}`, () => pane.setOption(option, value));
		}
		await tmux(`Could not title tmux session ${session.id}`, () =>
			pane.setTitle(paneTitle(session.taskId, LIVE_PREVIEW_ROLE)),
		);
	}

	async preparePane(session: AgentSession, options: { includeDead?: boolean } = {}): Promise<void> {
		const pane = await this.pane(session, options);
		if (!pane.window) throw new Error(`Agent pane for session ${session.id} has no window`);
		await tmux(
			`Could not prepare tmux session ${session.id}`,
			() => pane.window?.setOption("remain-on-exit", "on") ?? Promise.resolve(),
		);
		await tmux(`Could not prepare tmux session ${session.id}`, () =>
			pane.pipeTo(`cat >> ${quote(session.outputPath)}`, { toggle: true }),
		);
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
		const pane = await this.pane(session, options);
		await tmux(`Could not launch agent session ${session.id}`, () =>
			pane.respawn(`/bin/sh -lc ${quote(command)}`, { kill: true }),
		);
		await Bun.sleep(LAUNCH_SETTLE_DELAY_MS);
		const status = await tmux(`Agent command failed to launch for session ${session.id}`, () =>
			pane.displayMessage("#{pane_dead} #{pane_dead_status}"),
		);
		if (/^1\s+127/.test(firstLine(status).trim()))
			throw fail(`Agent command failed to launch for session ${session.id}`, { stdout: firstLine(status), stderr: "" });
	}

	async demote(session: AgentSession): Promise<void> {
		if (await this.findPane(session, { roles: [RETIRED_SESSION_ROLE] })) return;
		const pane = await this.findPaneHandle(session);
		if (!pane) return;
		await tmux(`Could not retag tmux session ${session.id}`, async () => {
			await pane.setOption(PANE_OPTION_ROLE, RETIRED_SESSION_ROLE);
			await pane.setTitle(paneTitle(session.taskId, RETIRED_SESSION_ROLE));
		});
	}

	async promote(session: AgentSession): Promise<void> {
		const pane = await this.findPaneHandle(session, { roles: [RETIRED_SESSION_ROLE] });
		if (!pane) return;
		await tmux(`Could not retag tmux session ${session.id}`, async () => {
			await pane.setOption(PANE_OPTION_ROLE, LIVE_PREVIEW_ROLE);
			await pane.setTitle(paneTitle(session.taskId, LIVE_PREVIEW_ROLE));
		});
	}

	async kill(session: AgentSession): Promise<void> {
		await this.killPane(session, [LIVE_PREVIEW_ROLE]);
	}

	async killRetired(session: AgentSession): Promise<void> {
		await this.killPane(session, [RETIRED_SESSION_ROLE]);
	}

	private async killPane(session: AgentSession, roles: string[]): Promise<void> {
		const pane =
			(await this.findPaneHandle(session, { roles })) ??
			(await this.findPaneHandle(session, { includeDead: true, roles }));
		if (!pane) return;
		try {
			await pane.kill();
		} catch (error) {
			if (!isMissingTmux(error)) throw fail(`Could not stop session ${session.id}`, errorResult(error));
		}
	}

	async attach(session: AgentSession): Promise<void> {
		const command = process.env.TMUX ? "switch-client" : "attach-session";
		const paneId = await this.paneId(session);
		await tmux(`Could not attach to session ${session.id}`, () =>
			this.server.cmd(command, ["-t", paneId], { timeoutMs: null }),
		);
	}

	async alive(session: AgentSession) {
		const paneId = (await this.findPane(session)) ?? (await this.findPane(session, { includeDead: true }));
		if (!paneId) return { exitCode: 1, stdout: "", stderr: `tmux pane for session ${session.id} not found` };
		try {
			const lines = await this.server.cmd("display-message", ["-p", "-t", paneId, "#{pane_id} #{pane_dead}"]);
			const [actualPaneId, paneDead] = firstLine(lines).trim().split(/\s+/);
			if (actualPaneId !== paneId || (paneDead !== "0" && paneDead !== "1"))
				return { exitCode: 1, stdout: "", stderr: `tmux pane ${paneId} not found` };
			return { exitCode: 0, stdout: `${paneDead}\n`, stderr: "" };
		} catch (error) {
			return errorResult(error);
		}
	}

	private async pane(
		session: AgentSession,
		options: { includeDead?: boolean; roles?: string[] } = {},
	): Promise<TmuxPaneHandle> {
		const paneId = await this.paneId(session, options);
		const pane = await this.paneById(paneId);
		if (!pane) throw new Error(`Agent pane for session ${session.id} no longer exists`);
		return pane;
	}

	private async paneId(
		session: AgentSession,
		options: { includeDead?: boolean; roles?: string[] } = {},
	): Promise<string> {
		const paneId = await this.findPane(session, options);
		if (!paneId) throw new Error(`Agent pane for session ${session.id} no longer exists`);
		return paneId;
	}

	private async findPaneHandle(
		session: AgentSession,
		options: { includeDead?: boolean; roles?: string[] } = {},
	): Promise<TmuxPaneHandle | undefined> {
		const paneId = await this.findPane(session, options);
		return paneId ? await this.paneById(paneId) : undefined;
	}

	private async paneById(paneId: string): Promise<TmuxPaneHandle | undefined> {
		try {
			for (const pane of await this.server.panes()) {
				if (pane.id === paneId) return pane;
			}
		} catch (error) {
			if (isMissingTmux(error)) return undefined;
			throw error;
		}
		return undefined;
	}

	private async findPane(
		session: AgentSession,
		options: { includeDead?: boolean; roles?: string[] } = {},
	): Promise<string | undefined> {
		const roles = options.roles ?? [LIVE_PREVIEW_ROLE];
		let matches: Array<{ paneId: string }> = [];
		try {
			for (const role of roles) {
				matches = matches.concat(
					await findTmuxPanesByTaskAndRole({
						cmd: (command, args) => this.server.cmd(command, args),
						rootPath: this.rootDir,
						taskId: session.taskId,
						role,
						includeDead: options.includeDead,
					}),
				);
			}
		} catch (error) {
			if (isMissingTmux(error)) return undefined;
			throw fail(`Could not find tmux pane for session ${session.id}`, errorResult(error));
		}
		if (matches.length > 1) throw new Error(`Multiple tmux panes match agent session ${session.id}.`);
		return matches[0]?.paneId;
	}
}
