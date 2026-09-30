import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import { createUniqueTestDir, scopedFetch as fetch, retry, safeCleanup, withTimeout } from "./test-utils.ts";

let testDir: string;
let server: BacklogServer | null = null;
const sockets: WebSocket[] = [];

async function openSocket(url: string): Promise<{ socket: WebSocket; messages: string[] }> {
	const messages: string[] = [];
	const socket = new WebSocket(url);
	sockets.push(socket);
	socket.onmessage = (event) => messages.push(String(event.data));
	await withTimeout(
		new Promise<void>((resolve, reject) => {
			socket.onopen = () => resolve();
			socket.onerror = () => reject(new Error("WebSocket failed to open"));
		}),
		"scoped WebSocket",
		2000,
	);
	return { socket, messages };
}

beforeEach(async () => {
	testDir = createUniqueTestDir("server-loading-progress");
	const filesystem = new FileSystem(testDir);
	await filesystem.ensureBacklogStructure();
	await filesystem.saveConfig({
		projectName: "Server loading progress",
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
		checkActiveBranches: false,
	});
	server = new BacklogServer(testDir);
	await server.start(0, false);
});

afterEach(async () => {
	for (const socket of sockets.splice(0)) socket.close();
	await server?.stop();
	server = null;
	await safeCleanup(testDir);
});

describe("browser change notifications", () => {
	it("validates WebSocket scope and publishes an external task change without polling", async () => {
		const port = server?.getPort() ?? 0;
		const status = (await (await fetch(`http://127.0.0.1:${port}/api/status`)).json()) as { projectScope: string };
		const valid = await openSocket(`ws://127.0.0.1:${port}/?projectScope=${encodeURIComponent(status.projectScope)}`);

		await expect(openSocket(`ws://127.0.0.1:${port}/?projectScope=wrong-scope`)).rejects.toThrow(
			"WebSocket failed to open",
		);
		await Bun.write(join(testDir, "backlog", "tasks", "external.md"), "# Changed outside the server\n");
		await retry(async () => {
			if (!valid.messages.includes("tasks-updated")) throw new Error("external change was not published");
		});
	});
});
