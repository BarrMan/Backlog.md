import { describe, expect, it } from "bun:test";
import type { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { spawnSessionWorker } from "./session-worker-client.ts";

describe("spawnSessionWorker", () => {
	it("launches source-mode workers through the CLI entrypoint", async () => {
		const child = Object.assign(new EventEmitter(), { unref() {} }) as ChildProcess;
		let command: string | undefined;
		let args: string[] | undefined;
		const spawnProcess = ((nextCommand: string, nextArgs: string[]) => {
			command = nextCommand;
			args = nextArgs;
			queueMicrotask(() => child.emit("spawn"));
			return child;
		}) as typeof spawn;

		await spawnSessionWorker("handoff-continue", "TASK-1", "/project", spawnProcess);

		expect(command).toBe(process.execPath);
		expect(args).toEqual([
			join(process.cwd(), "src", "cli", "index.ts"),
			"agent-session",
			"handoff-continue",
			"TASK-1",
			"--worker",
		]);
	});
});
