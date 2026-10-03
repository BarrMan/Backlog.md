import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmod, mkdir } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { upsertAgentConfiguration } from "../agent-workspace/config.ts";
import { AgentSessionService, type ProcessRunner, type TmuxServer } from "../agent-workspace/sessions.ts";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const itRealTmux = process.env.RUN_INTERACTIVE_TUI_TESTS === "1" && Bun.which("tmux") ? it : it.skip;

async function waitUntil(predicate: () => Promise<boolean> | boolean, message: string): Promise<void> {
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		if (await predicate()) return;
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	throw new Error(`Timed out waiting for ${message}`);
}

type ProcessOptions = { cwd?: string; env?: Record<string, string>; stdin?: string; inherit?: boolean };

type TmuxAction =
	| { type: "newSession"; options: { name?: string; environment?: Readonly<Record<string, string>> } }
	| { type: "setOption"; pane: string; name: string; value: string }
	| { type: "setWindowOption"; pane: string; name: string; value: string }
	| { type: "setTitle"; pane: string; title: string }
	| { type: "pipeTo"; pane: string; command?: string }
	| { type: "respawn"; pane: string; command?: string }
	| { type: "kill"; pane: string }
	| { type: "cmd"; command: string; args: readonly string[] };

function isRespawnAction(action: TmuxAction): action is Extract<TmuxAction, { type: "respawn" }> {
	return action.type === "respawn";
}

class FakeWindow {
	constructor(
		private readonly owner: FakeTmux,
		private readonly paneId: string,
	) {}

	async setOption(name: string, value: string): Promise<void> {
		this.owner.actions.push({ type: "setWindowOption", pane: this.paneId, name, value });
	}
}

class FakePane {
	readonly window: FakeWindow;

	constructor(
		private readonly owner: FakeTmux,
		readonly id: string,
	) {
		this.window = new FakeWindow(owner, id);
	}

	async setOption(name: string, value: string): Promise<void> {
		const metadata = this.owner.paneMetadata.get(this.id) ?? {};
		metadata[name] = value;
		this.owner.paneMetadata.set(this.id, metadata);
		this.owner.actions.push({ type: "setOption", pane: this.id, name, value });
	}

	async setTitle(title: string): Promise<void> {
		this.owner.paneTitles.set(this.id, title);
		this.owner.actions.push({ type: "setTitle", pane: this.id, title });
	}

	async pipeTo(command?: string): Promise<void> {
		this.owner.actions.push({ type: "pipeTo", pane: this.id, command });
	}

	async respawn(command?: string): Promise<void> {
		if (this.owner.failLaunch) throw new Error("launch failed");
		this.owner.missingPanes.delete(this.id);
		this.owner.actions.push({ type: "respawn", pane: this.id, command });
	}

	async displayMessage(message: string): Promise<readonly string[]> {
		if (message === "#{pane_id} #{pane_dead}")
			return [`${this.id} ${this.owner.missingPanes.has(this.id) ? "1" : "0"}`];
		if (message === "#{pane_dead} #{pane_dead_status}") return [this.owner.missingPanes.has(this.id) ? "1 0" : "0 0"];
		return [""];
	}

	async kill(): Promise<void> {
		if (this.owner.failStop) throw new Error("stop failed");
		this.owner.missingPanes.add(this.id);
		this.owner.actions.push({ type: "kill", pane: this.id });
	}
}

class FakeTmux implements ProcessRunner, TmuxServer {
	readonly processCommands: string[][] = [];
	readonly processOptions: (ProcessOptions | undefined)[] = [];
	readonly actions: TmuxAction[] = [];
	failPrepare = false;
	failLaunch = false;
	failStop = false;
	prepareGate: Promise<void> | undefined;
	createdPanes = 0;
	missingPanes = new Set<string>();
	paneMetadata = new Map<string, Record<string, string>>();
	paneSessions = new Map<string, string>();
	paneHandles = new Map<string, FakePane>();
	paneTitles = new Map<string, string>();

	async run(args: string[], options?: ProcessOptions): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		this.processCommands.push(args);
		this.processOptions.push(options);
		if (args[0] === "/bin/sh" && this.failPrepare) {
			await this.prepareGate;
			return { exitCode: 1, stdout: "", stderr: "prepare failed" };
		}
		if (args[0] === "git" && args[1] === "rev-parse") return { exitCode: 0, stdout: ".git\n", stderr: "" };
		return { exitCode: 0, stdout: "", stderr: "" };
	}

	async newSession(
		options: { name?: string; environment?: Readonly<Record<string, string>> } = {},
	): Promise<{ activePane?: FakePane }> {
		const id = `%${++this.createdPanes}`;
		const pane = new FakePane(this, id);
		this.paneHandles.set(id, pane);
		this.paneSessions.set(id, options.name ?? "");
		this.paneMetadata.set(id, {});
		this.actions.push({ type: "newSession", options });
		return { activePane: pane };
	}

	async panes(): Promise<Iterable<FakePane>> {
		return [...this.paneMetadata.keys()].flatMap((id) => this.paneHandles.get(id) ?? []);
	}

	async cmd(command: string, args: readonly string[] = []): Promise<readonly string[]> {
		this.actions.push({ type: "cmd", command, args });
		if (command === "list-panes") {
			return [...this.paneMetadata.entries()].map(([pane, metadata]) =>
				[
					pane,
					this.missingPanes.has(pane) ? "1" : "0",
					"@agent",
					metadata["@backlog_root"] ?? "",
					metadata["@backlog_task"] ?? "",
					metadata["@backlog_role"] ?? "",
					this.paneTitles.get(pane) ?? "",
				].join("\t"),
			);
		}
		if (command === "display-message") {
			const target = args[args.indexOf("-t") + 1] ?? "";
			return [`${target} ${this.missingPanes.has(target) ? "1" : "0"}`];
		}
		return [];
	}
}

describe("AgentSessionService", () => {
	let root: string;
	let core: Core;
	let runner: FakeTmux;

	beforeEach(async () => {
		root = createUniqueTestDir("agent-sessions");
		await mkdir(root, { recursive: true });
		core = new Core(root);
		await initializeTestProject(core, "Agent sessions");
		await core.createTaskFromInput({ title: "Session task", status: "To Do" }, false);
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "test",
			presets: {
				test: { command: "agent {prompt}", env: {}, prepare: "", worktree: false, bootstrap: "prompt" },
			},
		});
		runner = new FakeTmux();
	});

	it("tags the placeholder pane before launching the agent", async () => {
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		expect("paneId" in session).toBe(false);
		expect("paneId" in ((await service.list("task-1")).sessions[0] ?? {})).toBe(false);
		expect(session.nativeSessionId).toBeUndefined();
		const created = runner.actions.find((action) => action.type === "newSession");
		expect(created).toMatchObject({ type: "newSession", options: { name: session.tmuxName } });
		expect(runner.paneMetadata.get("%1")?.["@backlog_task"]).toBe("TASK-1");
		expect(runner.paneMetadata.get("%1")?.["@backlog_session"]).toBeUndefined();
		expect(runner.paneMetadata.get("%1")?.["@backlog_role"]).toBe("live-preview");
		expect(runner.actions).toContainEqual({ type: "setTitle", pane: "%1", title: "TASK-1 live-preview" });
		expect(runner.actions).toContainEqual({ type: "respawn", pane: "%1", command: expect.anything() });
	});

	it("finds panes with a tmux task and role filter", async () => {
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		await service.start("task-1");
		await service.recover("task-1");
		const lookup = runner.actions.find(
			(action): action is Extract<TmuxAction, { type: "cmd" }> =>
				action.type === "cmd" && action.command === "list-panes",
		);
		expect(lookup?.args).toContain("-f");
		expect(lookup?.args.join(" ")).toContain("@backlog_task");
		expect(lookup?.args.join(" ")).toContain("@backlog_role");
	});

	it("stores native session ids for agents that support launch-time ids", async () => {
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "claude",
			presets: {
				claude: { command: "claude", env: {}, prepare: "", worktree: false, bootstrap: "claude" },
			},
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		expect(session.nativeSessionId).toBe(session.id);
		expect((await service.list("task-1")).sessions[0]?.nativeSessionId).toBe(session.id);
		const launched = runner.actions.filter(isRespawnAction).find((action) => action.pane === "%1")?.command;
		expect(launched).toContain("exec claude --session-id");
		expect(launched).toContain(session.id);
	});

	it("puts the development backlog binary first on the agent PATH", async () => {
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "test",
			presets: {
				test: {
					command: "agent {prompt}",
					env: { PATH: "/custom/bin" },
					prepare: "",
					worktree: false,
					bootstrap: "prompt",
				},
			},
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		await service.start("task-1");
		const created = runner.actions.find((action) => action.type === "newSession");
		expect(created?.options.environment?.PATH).toBe(`${join(root, "dist")}${delimiter}/custom/bin`);
	});

	it("requests replacement without injecting input or creating a handover document", async () => {
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		await service.start("task-1");
		const beforePaste = runner.actions.length;
		const request = await service.requestHandoff("task-1");
		expect(request.status).toBe("ready");
		expect(request.documentPath).toBeUndefined();
		expect(runner.actions.slice(beforePaste)).toEqual([]);
	});

	it("attaches outside tmux and switches the current client inside tmux", async () => {
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const previousTmux = process.env.TMUX;
		try {
			delete process.env.TMUX;
			await service.attach("task-1", session.id);
			expect(runner.actions.at(-1)).toEqual({ type: "cmd", command: "attach-session", args: ["-t", "%1"] });
			process.env.TMUX = "/tmp/tmux-1/default,1,0";
			await service.attach("task-1", session.id);
			expect(runner.actions.at(-1)).toEqual({ type: "cmd", command: "switch-client", args: ["-t", "%1"] });
		} finally {
			if (previousTmux === undefined) delete process.env.TMUX;
			else process.env.TMUX = previousTmux;
		}
	});

	afterEach(async () => {
		await safeCleanup(root);
	});

	it("canonicalizes task identity, persists sessions, and transitions only its first launch", async () => {
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("TASK-1");
		expect(session.taskId).toBe("TASK-1");
		expect((await service.list("task-1")).activeSessionId).toBe(session.id);
		expect((await core.loadTaskById("task-1", { includeCrossBranch: false }))?.status).toBe("In Progress");
		await expect(service.start("task-1")).rejects.toThrow("already has an active");
		await service.stop("task-1");
		expect(runner.actions.filter((action) => action.type === "kill").at(-1)).toEqual({ type: "kill", pane: "%1" });
		await Bun.write(session.outputPath, "retired output\n");
		expect(await service.output("task-1", session.id)).toBe("retired output\n");
		await expect(service.attach("task-1", session.id)).rejects.toThrow("not active");
		const second = await service.start("TASK-1");
		expect(second.status).toBe("running");
		expect((await service.list("task-1")).sessions).toHaveLength(2);
	});

	it("auto-stops the least-used live session when the running cap is reached", async () => {
		await core.createTaskFromInput({ title: "Second", status: "To Do" }, false);
		await core.createTaskFromInput({ title: "Third", status: "To Do" }, false);
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.start("task-1", { maxRunningSessions: 99 });
		await service.start("task-2", { maxRunningSessions: 99 });
		await service.touchUsage("task-1", first.id);
		const third = await service.start("task-3", { maxRunningSessions: 2 });

		expect((await service.list("task-1")).sessions[0]?.status).toBe("running");
		expect((await service.list("task-2")).sessions[0]?.status).toBe("stopped");
		expect((await service.list("task-3")).sessions[0]?.id).toBe(third.id);
		expect((await service.list("task-3")).sessions[0]?.status).toBe("running");
	});

	it("records launch failures durably and lets a later start retry", async () => {
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "test",
			presets: {
				test: { command: "agent {prompt}", env: {}, prepare: "false", worktree: false, bootstrap: "prompt" },
			},
		});
		runner.failPrepare = true;
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		await expect(service.start("task-1")).rejects.toThrow("preparation failed");
		expect((await service.list("task-1")).sessions[0]?.status).toBe("failed");
		runner.failPrepare = false;
		await service.start("task-1");
		expect((await service.list("task-1")).activeSessionId).toBeDefined();
	});

	it("creates worktree sessions on their task-owned branch", async () => {
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "test",
			presets: {
				test: { command: "agent {prompt}", env: {}, prepare: "", worktree: true, bootstrap: "prompt" },
			},
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		expect(runner.processCommands).toContainEqual([
			"git",
			"worktree",
			"add",
			"-b",
			"backlog/session/task-1",
			session.cwd,
		]);
	});

	it("starts one replacement before stopping its predecessor and preserves task context and output", async () => {
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.start("task-1");
		await core.updateTaskFromInput("task-1", { description: "Verified step one. Next: step two." }, false);
		await Bun.write(first.outputPath, "Previous session output");
		await service.requestHandoff("task-1");
		await expect(service.requestHandoff("task-1")).rejects.toThrow("already has a handoff");
		const replacements = await Promise.all([service.continueHandoff("task-1"), service.continueHandoff("task-1")]);
		const replacement = replacements.find(Boolean);
		expect(replacements.filter(Boolean)).toHaveLength(1);
		expect(replacement?.predecessorId).toBe(first.id);
		expect(await service.continueHandoff("task-1")).toBeNull();
		const state = await service.list("task-1");
		expect(state.sessions.find((session) => session.id === first.id)?.status).toBe("handed-off");
		expect(state.handoff?.status).toBe("completed");
		expect(state.activeSessionId).toBe(replacement?.id);
		expect(await service.output("task-1", first.id)).toBe("Previous session output");
		expect((await core.loadTaskById("task-1"))?.description).toBe("Verified step one. Next: step two.");
		expect(await Bun.file(replacement?.bootstrapPath ?? "").text()).toContain("backlog task view TASK-1 --plain");
		const launched = runner.actions.findIndex((action) => action.type === "respawn" && action.pane === "%2");
		const stopped = runner.actions.findIndex((action) => action.type === "kill" && action.pane === "%1");
		expect(launched).toBeGreaterThan(-1);
		expect(stopped).toBeGreaterThan(launched);
	});

	it("resumes an active running session whose tmux pane is missing", async () => {
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "codex",
			presets: {
				codex: { command: "codex", env: {}, prepare: "", worktree: false, bootstrap: "codex" },
			},
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		runner.paneMetadata.delete("%1");

		await service.recover("task-1");

		const recovered = await service.list("task-1");
		expect(recovered.sessions[0]?.status).toBe("running");
		expect(recovered.activeSessionId).toBe(session.id);
		expect(runner.paneMetadata.get("%2")?.["@backlog_role"]).toBe("live-preview");
		expect(runner.actions.filter((action) => action.type === "respawn").at(-1)).toMatchObject({
			type: "respawn",
			pane: "%2",
			command: expect.stringContaining("exec codex resume --last"),
		});
	});

	it("resumes an active running session whose tmux pane is dead with its exact native id", async () => {
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "claude",
			presets: {
				claude: { command: "claude", env: {}, prepare: "", worktree: false, bootstrap: "claude" },
			},
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		runner.missingPanes.add("%1");

		await service.recover("task-1");

		const recovered = await service.list("task-1");
		expect(recovered.sessions[0]?.status).toBe("running");
		expect(recovered.activeSessionId).toBe(session.id);
		const resumed = runner.actions.filter((action) => action.type === "respawn").at(-1);
		expect(resumed).toMatchObject({ type: "respawn", pane: "%1" });
		expect(resumed?.command).toContain("exec claude --resume");
		expect(resumed?.command).toContain(session.id);
	});

	it("reconstructs a failed replacement handoff without duplicate active sessions", async () => {
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.start("task-1");
		await service.requestHandoff("task-1");
		runner.failLaunch = true;
		await expect(service.continueHandoff("task-1")).rejects.toThrow("Could not launch agent session");
		const failed = await service.list("task-1");
		expect(failed.handoff?.status).toBe("failed");
		expect(failed.sessions.filter((session) => session.status === "running")).toHaveLength(1);
		expect(failed.activeSessionId).toBe(first.id);
		expect(runner.actions).not.toContainEqual({ type: "kill", pane: "%1" });

		runner.failLaunch = false;
		const reconstructed = new AgentSessionService(core, { runner, tmuxServer: runner });
		await reconstructed.continueHandoff("task-1");
		const recovered = await reconstructed.list("task-1");
		expect(recovered.handoff?.status).toBe("completed");
		expect(recovered.sessions.filter((session) => session.status === "running")).toHaveLength(1);
		expect(recovered.sessions.find((session) => session.status === "running")?.predecessorId).toBe(first.id);
		await reconstructed.recover("task-1");
		expect((await reconstructed.list("task-1")).sessions).toHaveLength(recovered.sessions.length);
	});

	it("retries stopping a predecessor without launching another replacement", async () => {
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.start("task-1");
		await service.requestHandoff("task-1");
		runner.failStop = true;
		await expect(service.continueHandoff("task-1")).rejects.toThrow("Could not stop session");
		const failed = await service.list("task-1");
		expect(failed.sessions).toHaveLength(2);
		expect(failed.activeSessionId).not.toBe(first.id);
		runner.failStop = false;
		await service.requestHandoff("task-1");
		await service.continueHandoff("task-1");
		const completed = await service.list("task-1");
		expect(completed.sessions).toHaveLength(2);
		expect(completed.activeSessionId).toBe(failed.activeSessionId);
		expect(completed.sessions[0]?.status).toBe("handed-off");
		expect(completed.handoff?.status).toBe("completed");
	});

	it("reserves a starting session before preparation so concurrent launches cannot duplicate it", async () => {
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "test",
			presets: {
				test: { command: "agent {prompt}", env: {}, prepare: "false", worktree: false, bootstrap: "prompt" },
			},
		});
		runner.failPrepare = true;
		let releasePrepare: (() => void) | undefined;
		runner.prepareGate = new Promise((resolve) => {
			releasePrepare = resolve;
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = service.start("task-1");
		await waitUntil(async () => (await service.list("task-1")).sessions.length === 1, "reserved starting session");
		const second = service.start("task-1");
		const secondResult = await Promise.resolve(second).then(
			(value) => ({ status: "fulfilled" as const, value }),
			(reason) => ({ status: "rejected" as const, reason }),
		);
		releasePrepare?.();
		const firstResult = await Promise.resolve(first).then(
			(value) => ({ status: "fulfilled" as const, value }),
			(reason) => ({ status: "rejected" as const, reason }),
		);
		const results = [firstResult, secondResult];
		expect(results.filter((result) => result.status === "rejected")).toHaveLength(2);
		expect(
			results.some((result) => result.status === "rejected" && /already has an active/.test(String(result.reason))),
		).toBe(true);
		expect((await service.list("task-1")).sessions).toHaveLength(1);
	});

	itRealTmux("replaces a real tmux agent and retains its stopped session output", async () => {
		const agent = join(root, "fake-agent.sh");
		await Bun.write(agent, ["#!/bin/sh", "printf 'Saved session output\\n'", "exec sleep 300"].join("\n"));
		await chmod(agent, 0o755);
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "fake",
			presets: {
				fake: { command: `${agent} {prompt}`, env: {}, prepare: "", worktree: false, bootstrap: "prompt" },
			},
		});
		const service = new AgentSessionService(core);
		const first = await service.start("task-1");
		try {
			await service.requestHandoff("task-1");
			await waitUntil(async () => {
				const state = await service.list("task-1");
				return state.handoff?.status === "completed" || state.handoff?.status === "failed";
			}, "handoff completion");
			const state = await service.list("task-1");
			expect(state.handoff?.status).toBe("completed");
			expect(state.sessions.find((session) => session.id === first.id)?.status).toBe("handed-off");
			expect(state.activeSessionId).not.toBe(first.id);
			expect(await service.output("task-1", first.id)).toContain("Saved session output");
		} finally {
			await service.stop("task-1").catch(() => undefined);
		}
	});
});
