import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { upsertAgentConfiguration } from "../agent-workspace/config.ts";
import { type AgentSessionRunner, AgentSessionService } from "../agent-workspace/sessions.ts";
import { Core } from "../core/backlog.ts";
import { getTestCliPath } from "./test-cli.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const itRealTmux = process.env.RUN_INTERACTIVE_TUI_TESTS === "1" && Bun.which("tmux") ? it : it.skip;

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

class FakeTmux implements AgentSessionRunner {
	readonly commands: string[][] = [];
	failPrepare = false;
	failLaunch = false;
	prepareDelay = 0;
	captureFails = false;

	async run(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		this.commands.push(args);
		if (args[0] === "/bin/sh" && this.failPrepare) {
			await Bun.sleep(this.prepareDelay);
			return { exitCode: 1, stdout: "", stderr: "prepare failed" };
		}
		if (args[0] === "tmux" && args[1] === "respawn-pane" && this.failLaunch)
			return { exitCode: 1, stdout: "", stderr: "launch failed" };
		if (args[0] === "git" && args[1] === "rev-parse") return { exitCode: 0, stdout: ".git\n", stderr: "" };
		if (args[0] === "tmux" && args[1] === "capture-pane")
			return this.captureFails
				? { exitCode: 1, stdout: "", stderr: "gone" }
				: { exitCode: 0, stdout: ">\n", stderr: "" };
		if (args[0] === "tmux" && args[1] === "list-panes") return { exitCode: 0, stdout: "0 0\n", stderr: "" };
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
		runner.captureFails = true;
		await Bun.write(session.outputPath, "retired output\n");
		expect(await service.preview("task-1", session.id)).toBe("retired output\n");
		await expect(service.attach("task-1", session.id)).rejects.toThrow("not active");
		runner.captureFails = false;
		const second = await service.start("TASK-1");
		expect(second.status).toBe("running");
		expect((await service.list("task-1")).sessions).toHaveLength(2);
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

	it("keeps one handoff document and starts exactly one replacement", async () => {
		const service = new AgentSessionService(core, { runner });
		const first = await service.start("task-1");
		const request = await service.requestHandoff("task-1");
		const sends = runner.commands.filter((command) => command[0] === "tmux" && command[1] === "send-keys");
		expect(sends).toHaveLength(1);
		await service.recover("task-1");
		expect(runner.commands.filter((command) => command[0] === "tmux" && command[1] === "send-keys")).toHaveLength(1);
		await expect(service.requestHandoff("task-1")).rejects.toThrow("already has a handoff");
		await service.completeHandoff("task-1", request.id, "Completed work and verification.");
		const replacement = await service.continueHandoff("task-1");
		expect(replacement?.predecessorId).toBe(first.id);
		expect(await service.continueHandoff("task-1")).toBeNull();
		const state = await service.list("task-1");
		expect(state.sessions.find((session) => session.id === first.id)?.status).toBe("handed-off");
		expect(state.handoff?.status).toBe("completed");
		const documentId = (state as { handoffDocumentId?: string }).handoffDocumentId;
		const secondRequest = await service.requestHandoff("task-1");
		expect(await Bun.file(join(core.fs.docsDir, secondRequest.documentPath)).exists()).toBe(false);
		expect((await core.loadTaskById("task-1", { includeCrossBranch: false }))?.documentation).toContain(documentId);
		await service.completeHandoff("task-1", secondRequest.id, "Second handoff.");
		const secondState = await service.list("task-1");
		expect((secondState as { handoffDocumentId?: string }).handoffDocumentId).toBe(documentId);
		const document = await core.getDocument(documentId ?? "");
		expect(document?.path).toBeDefined();
		expect(await Bun.file(join(core.fs.docsDir, document?.path ?? "")).exists()).toBe(true);
	});

	it("reconstructs a failed replacement handoff without duplicate active sessions", async () => {
		const service = new AgentSessionService(core, { runner });
		const first = await service.start("task-1");
		const request = await service.requestHandoff("task-1");
		await service.completeHandoff("task-1", request.id, "Completed work and verification.");
		runner.failLaunch = true;
		await expect(service.continueHandoff("task-1")).rejects.toThrow("Could not launch agent session");
		const failed = await service.list("task-1");
		expect(failed.handoff?.status).toBe("failed");
		expect(failed.sessions.filter((session) => session.status === "running")).toHaveLength(0);

		runner.failLaunch = false;
		const reconstructed = new AgentSessionService(core, { runner });
		await reconstructed.recover("task-1");
		const recovered = await reconstructed.list("task-1");
		expect(recovered.handoff?.status).toBe("completed");
		expect(recovered.sessions.filter((session) => session.status === "running")).toHaveLength(1);
		expect(recovered.sessions.find((session) => session.status === "running")?.predecessorId).toBe(first.id);
		await reconstructed.recover("task-1");
		expect((await reconstructed.list("task-1")).sessions).toHaveLength(recovered.sessions.length);
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

	itRealTmux("delivers an H handoff to a real tmux agent without replacing its prompt", async () => {
		const agent = join(root, "fake-agent.sh");
		const handoffFile = join(root, "agent-handoff.md");
		const cli = getTestCliPath();
		const runtime = process.env.BACKLOG_TEST_CLI_BUNDLE?.trim() ? "" : "bun ";
		await Bun.write(
			agent,
			[
				"#!/bin/sh",
				"printf '> '",
				"while IFS= read -r line; do",
				'  case "$line" in',
				"    *handoff-complete*)",
				`      printf 'Fake agent handoff.' > ${handoffFile}`,
				'      request=$(printf "%s" "$line" | sed -n "s/.*--request \\([^ ]*\\).*/\\1/p")',
				`      ${runtime}${shellQuote(cli)} agent-session handoff-complete TASK-1 --request "$request" --file ${shellQuote(handoffFile)}`,
				"      exit 0 ;;",
				"  esac",
				"done",
			].join("\n"),
		);
		await chmod(agent, 0o755);
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "fake",
			presets: {
				fake: { command: `${agent} {prompt}`, env: {}, prepare: "", worktree: false, bootstrap: "prompt" },
			},
		});
		const service = new AgentSessionService(core);
		const session = await service.start("task-1");
		try {
			for (let attempt = 0; attempt < 30; attempt++) {
				if ((await service.preview("task-1", session.id)).trimEnd().endsWith(">")) break;
				await Bun.sleep(100);
			}
			await service.requestHandoff("task-1");
			for (let attempt = 0; attempt < 100; attempt++) {
				const state = await service.list("task-1");
				if (state.handoff?.status === "ready" || state.handoff?.status === "completed") break;
				await Bun.sleep(100);
			}
			expect((await service.list("task-1")).handoff?.status).toMatch(/ready|completed/);
		} finally {
			await service.stop("task-1").catch(() => undefined);
		}
	});
});
