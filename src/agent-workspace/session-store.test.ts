import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSessionRunner } from "./session-process.ts";
import { SessionStore } from "./session-store.ts";
import type { AgentSession } from "./types.ts";

class FakeRunner implements AgentSessionRunner {
	async run(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		return { exitCode: 1, stdout: "", stderr: "not a git repository" };
	}
}

function session(id: string): AgentSession {
	return {
		id,
		taskId: "TASK-1",
		preset: "test",
		configScope: "project",
		tmuxName: id,
		cwd: "/tmp",
		createdAt: "2026-01-01T00:00:00.000Z",
		status: "stopped",
		outputPath: "/tmp/output",
		bootstrapPath: "/tmp/bootstrap",
	};
}

describe("SessionStore", () => {
	const directories: string[] = [];

	afterEach(async () => {
		await Promise.all(
			directories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })),
		);
	});

	it("serializes task mutations and rejects malformed durable state", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-session-store-"));
		directories.push(root);
		const store = new SessionStore(root, new FakeRunner());

		await Promise.all(
			["first", "second"].map(
				async (id) =>
					await store.mutate("TASK-1", async (state) => {
						state.sessions.push(session(id));
					}),
			),
		);
		expect((await store.read("TASK-1")).sessions.map((session) => session.id).sort()).toEqual(["first", "second"]);

		const { statePath } = await store.paths("TASK-1");
		await writeFile(statePath, "{}");
		await expect(store.read("TASK-1")).rejects.toThrow(
			"Invalid agent session state for TASK-1. Reset it with: backlog agent-session reset TASK-1",
		);

		await writeFile(
			statePath,
			JSON.stringify({ version: 1, taskId: "TASK-1", activeSessionId: "missing", sessions: [{ id: "bad" }] }),
		);
		await expect(store.read("TASK-1")).rejects.toThrow(
			"Invalid agent session state for TASK-1. Reset it with: backlog agent-session reset TASK-1",
		);

		const validSession = { ...session("valid-session"), nativeSessionId: "native-session" };
		await writeFile(statePath, JSON.stringify({ version: 1, taskId: "TASK-1", sessions: [validSession] }));
		expect((await store.read("TASK-1")).sessions[0]?.nativeSessionId).toBe("native-session");

		await writeFile(
			statePath,
			JSON.stringify({ version: 1, taskId: "TASK-1", sessions: [{ ...validSession, nativeSessionId: 123 }] }),
		);
		await expect(store.read("TASK-1")).rejects.toThrow(
			"Invalid agent session state for TASK-1. Reset it with: backlog agent-session reset TASK-1",
		);

		await writeFile(
			statePath,
			JSON.stringify({ version: 1, taskId: "TASK-1", sessions: [{ ...validSession, extra: "field" }] }),
		);
		await expect(store.read("TASK-1")).rejects.toThrow(
			"Invalid agent session state for TASK-1. Reset it with: backlog agent-session reset TASK-1",
		);

		await store.reset("TASK-1");
		expect(await store.read("TASK-1")).toEqual({ version: 1, taskId: "TASK-1", sessions: [] });
	});
});
