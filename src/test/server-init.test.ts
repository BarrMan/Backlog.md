import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { BacklogServer } from "../server/index.ts";
import { createUniqueTestDir, scopedFetch as fetch, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

function initRequest(port: number, scope: string, body: Record<string, unknown>): Request {
	return new Request(`http://127.0.0.1:${port}/api/init`, {
		method: "POST",
		headers: { "content-type": "application/json", "X-Backlog-Project-Scope": scope },
		body: JSON.stringify({
			projectName: "Server Init",
			integrationMode: "none",
			...body,
		}),
	});
}

describe("BacklogServer init endpoint", () => {
	let server: BacklogServer | null = null;
	beforeEach(() => {
		TEST_DIR = createUniqueTestDir("server-init");
	});

	afterEach(async () => {
		await server?.stop();
		server = null;
		await safeCleanup(TEST_DIR);
	});

	const initialize = async (body: Record<string, unknown>): Promise<Response> => {
		server = new BacklogServer(TEST_DIR);
		await server.start(0, false);
		const port = server.getPort() ?? 0;
		const status = (await fetch(`http://127.0.0.1:${port}/api/status`)).json() as Promise<{ projectScope: string }>;
		return fetch(initRequest(port, (await status).projectScope, body));
	};

	it("parses string false filesystemOnly without enabling filesystem-only mode", async () => {
		const response = await initialize({ filesystemOnly: "false" });

		expect(response.status).toBe(200);

		const config = await new Core(TEST_DIR).filesystem.loadConfig();
		expect(config?.filesystemOnly).toBe(false);
		expect(config?.remoteOperations).toBe(true);
		expect(config?.checkActiveBranches).toBe(true);
	});

	it("rejects reserved task prefixes before writing config", async () => {
		const response = await initialize({
			advancedConfig: { taskPrefix: "draft" },
		});
		const body = (await response.json()) as { error?: string };

		expect(response.status).toBe(400);
		expect(body.error).toContain("reserved for drafts, docs, or decisions");
		expect(await Bun.file(join(TEST_DIR, "backlog", "config.yml")).exists()).toBe(false);
	});

	it("accepts string true filesystemOnly for loose init callers", async () => {
		const response = await initialize({ filesystemOnly: "true" });

		expect(response.status).toBe(200);

		const config = await new Core(TEST_DIR).filesystem.loadConfig();
		expect(config?.filesystemOnly).toBe(true);
		expect(config?.remoteOperations).toBe(false);
		expect(config?.checkActiveBranches).toBe(false);
	});

	it("initializes a custom backlog and returns a new scope", async () => {
		const response = await initialize({
			backlogDirectory: "planning/custom-backlog",
			backlogDirectorySource: "custom",
			configLocation: "root",
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { projectScope: string };
		expect(body.projectScope).toBeString();
		expect(await Bun.file(join(TEST_DIR, "backlog.config.yml")).exists()).toBe(true);
		expect((await new Core(TEST_DIR).filesystem.loadConfig())?.backlogDirectory).toBe("planning/custom-backlog");
	});

	it("rejects the old scope after explicit custom initialization and accepts the returned scope", async () => {
		server = new BacklogServer(TEST_DIR);
		await server.start(0, false);
		const port = server.getPort() ?? 0;
		const before = (await (await fetch(`http://127.0.0.1:${port}/api/status`)).json()) as { projectScope: string };
		const initialized = await fetch(
			initRequest(port, before.projectScope, {
				backlogDirectory: ".backlog",
				backlogDirectorySource: ".backlog",
				configLocation: "root",
			}),
		);
		const after = (await initialized.json()) as { projectScope: string };
		expect(initialized.status).toBe(200);
		expect(after.projectScope).not.toBe(before.projectScope);
		expect(
			(
				await fetch(`http://127.0.0.1:${port}/api/config`, {
					headers: { "X-Backlog-Project-Scope": before.projectScope },
				})
			).status,
		).toBe(409);
		expect(
			(
				await fetch(`http://127.0.0.1:${port}/api/config`, {
					headers: { "X-Backlog-Project-Scope": after.projectScope },
				})
			).status,
		).toBe(200);
	});
});
