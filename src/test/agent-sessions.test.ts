import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmod, mkdir } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { upsertAgentConfiguration } from "../agent-workspace/config.ts";
import { type AgentSessionRunner, AgentSessionService } from "../agent-workspace/sessions.ts";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const itRealTmux = process.env.RUN_INTERACTIVE_TUI_TESTS === "1" && Bun.which("tmux") ? it : it.skip;

class FakeTmux implements AgentSessionRunner {
	readonly commands: string[][] = [];
	readonly options: ({ cwd?: string; env?: Record<string, string>; stdin?: string; inherit?: boolean } | undefined)[] =
		[];
	failPrepare = false;
	failLaunch = false;
	failStop = false;
	prepareDelay = 0;
	panes = 0;
	missingPanes = new Set<string>();
	paneMetadata = new Map<string, Record<string, string>>();

	async run(
		args: string[],
		options?: { cwd?: string; env?: Record<string, string>; stdin?: string; inherit?: boolean },
	): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		this.commands.push(args);
		this.options.push(options);
		if (args[0] === "/bin/sh" && this.failPrepare) {
			await Bun.sleep(this.prepareDelay);
			return { exitCode: 1, stdout: "", stderr: "prepare failed" };
		}
		if (args[0] === "tmux" && args[1] === "respawn-pane" && this.failLaunch)
			return { exitCode: 1, stdout: "", stderr: "launch failed" };
		if (args[0] === "tmux" && args[1] === "kill-pane" && this.failStop)
			return { exitCode: 1, stdout: "", stderr: "stop failed" };
		if (args[0] === "tmux" && args[1] === "kill-pane") {
			const target = args[args.indexOf("-t") + 1] ?? "";
			this.missingPanes.add(target);
			return { exitCode: 0, stdout: "", stderr: "" };
		}
		if (args[0] === "git" && args[1] === "rev-parse") return { exitCode: 0, stdout: ".git\n", stderr: "" };
		if (args[0] === "tmux" && args[1] === "new-session")
			return { exitCode: 0, stdout: `%${++this.panes}\n`, stderr: "" };
		if (args[0] === "tmux" && args[1] === "set-option" && args.includes("-p")) {
			const target = args[args.indexOf("-t") + 1] ?? "";
			const metadata = this.paneMetadata.get(target) ?? {};
			metadata[args.at(-2) ?? ""] = args.at(-1) ?? "";
			this.paneMetadata.set(target, metadata);
			return { exitCode: 0, stdout: "", stderr: "" };
		}
		if (args[0] === "tmux" && args[1] === "list-panes") {
			const rows = [...this.paneMetadata.entries()].map(([pane, metadata]) =>
				[
					pane,
					this.missingPanes.has(pane) ? "1" : "0",
					metadata["@backlog_root"] ?? "",
					metadata["@backlog_task"] ?? "",
					metadata["@backlog_session"] ?? "",
					metadata["@backlog_role"] ?? "",
				].join("\t"),
			);
			return { exitCode: 0, stdout: `${rows.join("\n")}\n`, stderr: "" };
		}
		if (args[0] === "tmux" && args[1] === "display-message") {
			const target = args[args.indexOf("-t") + 1] ?? "";
			const format = args.at(-1);
			if (this.missingPanes.has(target))
				return { exitCode: 0, stdout: format === "#{pane_id} #{pane_dead}" ? `${target} 1\n` : "\n", stderr: "" };
			if (format === "#{pane_id} #{pane_dead}") return { exitCode: 0, stdout: `${target} 0\n`, stderr: "" };
			return { exitCode: 0, stdout: format === "#{cursor_y}" ? "0\n" : "0 0\n", stderr: "" };
		}
		if (args[0] === "tmux" && args[1] === "capture-pane") return { exitCode: 0, stdout: ">\n", stderr: "" };
		return { exitCode: 0, stdout: "", stderr: "" };
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
		const service = new AgentSessionService(core, { runner });
		const session = await service.start("task-1");
		expect("paneId" in session).toBe(false);
		expect("paneId" in ((await service.list("task-1")).sessions[0] ?? {})).toBe(false);
		const created = runner.commands.find((command) => command[0] === "tmux" && command[1] === "new-session");
		expect(created?.slice(0, 6)).toEqual(["tmux", "new-session", "-d", "-P", "-F", "#{pane_id}"]);
		expect(runner.commands).toContainEqual(["tmux", "set-option", "-p", "-t", "%1", "@backlog_task", "TASK-1"]);
		expect(runner.commands).toContainEqual(["tmux", "set-option", "-p", "-t", "%1", "@backlog_session", session.id]);
		expect(runner.commands).toContainEqual(["tmux", "set-option", "-p", "-t", "%1", "@backlog_role", "agent"]);
		expect(runner.commands).toContainEqual([
			"tmux",
			"respawn-pane",
			"-k",
			"-t",
			"%1",
			"/bin/sh",
			"-lc",
			expect.anything(),
		]);
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
		const service = new AgentSessionService(core, { runner });
		await service.start("task-1");
		const createEnv = runner.options.find(
			(_, index) => runner.commands[index]?.[0] === "tmux" && runner.commands[index]?.[1] === "new-session",
		)?.env;
		expect(createEnv?.PATH).toBe(`${join(root, "dist")}${delimiter}/custom/bin`);
		const created = runner.commands.find((command) => command[0] === "tmux" && command[1] === "new-session");
		expect(created).toContain(`PATH=${join(root, "dist")}${delimiter}/custom/bin`);
	});

	it("requests replacement without injecting input or creating a handover document", async () => {
		const service = new AgentSessionService(core, { runner });
		await service.start("task-1");
		const beforePaste = runner.commands.length;
		const request = await service.requestHandoff("task-1");
		expect(request.status).toBe("ready");
		expect(request.documentPath).toBeUndefined();
		expect(runner.commands.slice(beforePaste).filter(([command]) => command === "tmux")).toEqual([]);
	});

	it("attaches outside tmux and switches the current client inside tmux", async () => {
		const service = new AgentSessionService(core, { runner });
		const session = await service.start("task-1");
		const previousTmux = process.env.TMUX;
		try {
			delete process.env.TMUX;
			await service.attach("task-1", session.id);
			expect(runner.commands.at(-1)).toEqual(["tmux", "attach-session", "-t", "%1"]);
			expect(runner.options.at(-1)).toEqual({ inherit: true });
			process.env.TMUX = "/tmp/tmux-1/default,1,0";
			await service.attach("task-1", session.id);
			expect(runner.commands.at(-1)).toEqual(["tmux", "switch-client", "-t", "%1"]);
			expect(runner.options.at(-1)).toEqual({ inherit: true });
		} finally {
			if (previousTmux === undefined) delete process.env.TMUX;
			else process.env.TMUX = previousTmux;
		}
	});

	afterEach(async () => {
		await safeCleanup(root);
	});

	it("canonicalizes task identity, persists sessions, and transitions only its first launch", async () => {
		const service = new AgentSessionService(core, { runner });
		const session = await service.start("TASK-1");
		expect(session.taskId).toBe("TASK-1");
		expect((await service.list("task-1")).activeSessionId).toBe(session.id);
		expect((await core.loadTaskById("task-1", { includeCrossBranch: false }))?.status).toBe("In Progress");
		await expect(service.start("task-1")).rejects.toThrow("already has an active");
		await service.stop("task-1");
		expect(runner.commands.filter((command) => command[1] === "kill-pane").at(-1)).toEqual([
			"tmux",
			"kill-pane",
			"-t",
			"%1",
		]);
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
		const service = new AgentSessionService(core, { runner });
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
		const service = new AgentSessionService(core, { runner });
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
		const service = new AgentSessionService(core, { runner });
		const session = await service.start("task-1");
		expect(runner.commands).toContainEqual(["git", "worktree", "add", "-b", "backlog/session/task-1", session.cwd]);
	});

	it("starts one replacement before stopping its predecessor and preserves task context and output", async () => {
		const service = new AgentSessionService(core, { runner });
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
		const launched = runner.commands.findIndex((args) => args[1] === "respawn-pane" && args[4] === "%2");
		const stopped = runner.commands.findIndex((args) => args[1] === "kill-pane" && args[3] === "%1");
		expect(launched).toBeGreaterThan(-1);
		expect(stopped).toBeGreaterThan(launched);
	});

	it("recovers a running session whose tmux pane target resolves to no pane", async () => {
		const service = new AgentSessionService(core, { runner });
		await service.start("task-1");
		runner.missingPanes.add("%1");

		await service.recover("task-1");

		const recovered = await service.list("task-1");
		expect(recovered.sessions[0]?.status).toBe("stopped");
		expect(recovered.activeSessionId).toBeUndefined();
	});

	it("reconstructs a failed replacement handoff without duplicate active sessions", async () => {
		const service = new AgentSessionService(core, { runner });
		const first = await service.start("task-1");
		await service.requestHandoff("task-1");
		runner.failLaunch = true;
		await expect(service.continueHandoff("task-1")).rejects.toThrow("Could not launch agent session");
		const failed = await service.list("task-1");
		expect(failed.handoff?.status).toBe("failed");
		expect(failed.sessions.filter((session) => session.status === "running")).toHaveLength(1);
		expect(failed.activeSessionId).toBe(first.id);
		expect(runner.commands).not.toContainEqual(["tmux", "kill-pane", "-t", "%1"]);

		runner.failLaunch = false;
		const reconstructed = new AgentSessionService(core, { runner });
		await reconstructed.continueHandoff("task-1");
		const recovered = await reconstructed.list("task-1");
		expect(recovered.handoff?.status).toBe("completed");
		expect(recovered.sessions.filter((session) => session.status === "running")).toHaveLength(1);
		expect(recovered.sessions.find((session) => session.status === "running")?.predecessorId).toBe(first.id);
		await reconstructed.recover("task-1");
		expect((await reconstructed.list("task-1")).sessions).toHaveLength(recovered.sessions.length);
	});

	it("retries stopping a predecessor without launching another replacement", async () => {
		const service = new AgentSessionService(core, { runner });
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
		runner.prepareDelay = 100;
		const service = new AgentSessionService(core, { runner });
		const first = service.start("task-1");
		await Bun.sleep(20);
		const second = service.start("task-1");
		const results = await Promise.allSettled([first, second]);
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
			for (let attempt = 0; attempt < 100; attempt++) {
				const state = await service.list("task-1");
				if (state.handoff?.status === "completed" || state.handoff?.status === "failed") break;
				await Bun.sleep(100);
			}
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
