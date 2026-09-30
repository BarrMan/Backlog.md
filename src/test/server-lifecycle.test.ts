import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { createBacklogApp } from "../server/app.ts";
import { BrowserServices } from "../server/lifecycle.ts";
import { ProjectScope } from "../server/project-scope.ts";
import { WebSocketHub } from "../server/websocket-hub.ts";
import { createUniqueTestDir, retry, safeCleanup, sleep } from "./test-utils.ts";

let testDirectories: string[] = [];

async function createProject(prefix: string): Promise<{ directory: string; core: Core }> {
	const directory = createUniqueTestDir(prefix);
	testDirectories.push(directory);
	const core = new Core(directory);
	await core.filesystem.ensureBacklogStructure();
	await core.filesystem.saveConfig({
		projectName: prefix,
		statuses: ["To Do", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
		checkActiveBranches: false,
	});
	return { directory, core };
}

beforeEach(() => {
	testDirectories = [];
});

afterEach(async () => {
	await Promise.all(testDirectories.map(safeCleanup));
});

describe("BrowserServices lifecycle", () => {
	it("retains only its immutable scope and notification infrastructure", async () => {
		const { core } = await createProject("server-runtime-state");
		const services = new BrowserServices(core, new WebSocketHub());

		expect(Object.keys(services)).toEqual(expect.arrayContaining(["deploymentRoot", "hub", "watchers"]));
		expect(Object.keys(services)).not.toEqual(expect.arrayContaining(["core", "store", "search", "session"]));
		expect(services.scope).toEqual(expect.objectContaining({ root: core.filesystem.rootDir }));
	});

	it("uses a configured relative path for request cores when its canonical backlog target is a symlink", async () => {
		const { directory } = await createProject("server-symlink-scope");
		const target = join(directory, "external-backlog-target");
		const link = join(directory, "linked-backlog");
		await mkdir(target, { recursive: true });
		await symlink(target, link, "dir");
		await Bun.write(
			join(directory, "backlog.config.yml"),
			[
				`project_name: ${"server-symlink-scope"}`,
				"backlog_directory: linked-backlog",
				"statuses: [To Do, Done]",
				"labels: []",
				"milestones: []",
				"date_format: YYYY-MM-DD",
				"remote_operations: false",
				"check_active_branches: false",
			].join("\n"),
		);

		const scope = new ProjectScope(new Core(directory));
		expect(scope.directory).toBe("linked-backlog");
		expect(scope.backlog).toBe(target);
		expect(scope.requestCore().filesystem.backlogDirName).toBe("linked-backlog");
	});

	it("publishes external filesystem changes and stops publishing after disposal", async () => {
		const { core } = await createProject("server-watcher");
		const publications: string[] = [];
		const hub = {
			disconnectAll: () => {},
			publishLoading: () => {},
			publishData: () => publications.push("data"),
			publishConfig: () => publications.push("config"),
		};
		const services = new BrowserServices(core, hub as never);
		await services.initialize();
		publications.length = 0;

		await Bun.write(join(core.filesystem.tasksDir, "external.md"), "# External change\n");
		await retry(async () => {
			if (!publications.includes("data")) throw new Error("watcher did not publish the external change");
		});

		await services.dispose();
		const publicationCount = publications.length;
		await Bun.write(join(core.filesystem.tasksDir, "after-dispose.md"), "# No notification\n");
		await sleep(100);
		expect(publications).toHaveLength(publicationCount);
	});

	it("watches the configured external backlog target", async () => {
		const { directory } = await createProject("server-external-watcher");
		const external = join(directory, "..", "server-external-watcher-target");
		const link = join(directory, "external-backlog");
		testDirectories.push(external);
		await mkdir(external, { recursive: true });
		await symlink(external, link, "dir");
		await Bun.write(
			join(directory, "backlog.config.yml"),
			["project_name: External", "backlog_directory: external-backlog", "statuses: [To Do, Done]"].join("\n"),
		);
		const selected = new Core(directory);
		await selected.filesystem.ensureBacklogStructure();
		const publications: string[] = [];
		const hub = {
			disconnectAll: () => {},
			publishLoading: () => {},
			publishData: () => publications.push("data"),
			publishConfig: () => publications.push("config"),
		};
		const services = new BrowserServices(selected, hub as never);
		await services.initialize();
		publications.length = 0;
		await Bun.write(join(external, "tasks", "external.md"), "# external\n");
		await retry(async () => {
			if (!publications.includes("data")) throw new Error("external backlog watcher did not publish");
		});
		await services.dispose();
	});

	it("ignores Git index traffic but publishes Git ref changes", async () => {
		const { directory, core } = await createProject("server-git-watcher");
		const initialized = Bun.spawn(["git", "init"], {
			cwd: directory,
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
		});
		expect(await initialized.exited).toBe(0);
		const publications: string[] = [];
		const hub = {
			publishLoading: () => {},
			publishData: () => publications.push("data"),
			publishConfig: () => publications.push("config"),
		};
		const services = new BrowserServices(core, hub as never);
		await services.initialize();
		publications.length = 0;

		await Bun.write(join(directory, ".git", "index"), "read traffic must not invalidate\n");
		await sleep(100);
		expect(publications).toEqual([]);

		await mkdir(join(directory, ".git", "refs", "heads"), { recursive: true });
		await Bun.write(join(directory, ".git", "refs", "heads", "external"), "0000000000000000000000000000000000000000\n");
		await retry(async () => {
			if (!publications.includes("data")) throw new Error("Git ref watcher did not publish");
		});
		await services.dispose();
	});

	it("rejects startup when the graph cannot load and never reports loaded", async () => {
		const { core } = await createProject("server-startup-failure");
		const states: string[] = [];
		const hub = {
			disconnectAll: () => {},
			publishLoading: (state: { type: string }) => states.push(state.type),
			publishData: () => {},
			publishConfig: () => {},
		};
		const originalLoad = Core.prototype.loadTaskSnapshot;
		Core.prototype.loadTaskSnapshot = async () => {
			throw new Error("snapshot failed");
		};
		try {
			await expect(new BrowserServices(core, hub as never).initialize()).rejects.toThrow("snapshot failed");
			expect(states).toContain("error");
			expect(states).not.toContain("loaded");
		} finally {
			Core.prototype.loadTaskSnapshot = originalLoad;
		}
	});

	it("replaces a pending config selection when another config change arrives during graph loading", async () => {
		const { directory, core } = await createProject("server-config-build-event");
		const first = join(directory, "..", "server-config-build-first");
		const second = join(directory, "..", "server-config-build-second");
		testDirectories.push(first, second);
		await Promise.all([mkdir(first, { recursive: true }), mkdir(second, { recursive: true })]);
		await Promise.all([
			symlink(first, join(directory, "first-backlog"), "dir"),
			symlink(second, join(directory, "second-backlog"), "dir"),
		]);
		const services = new BrowserServices(core, new WebSocketHub());
		await services.initialize();
		const originalLoad = Core.prototype.loadTaskSnapshot;
		let loadCount = 0;
		let release: (() => void) | undefined;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		Core.prototype.loadTaskSnapshot = async function () {
			loadCount++;
			if (loadCount === 1) await blocked;
			return await originalLoad.call(this);
		};
		try {
			await Bun.write(
				join(directory, "backlog.config.yml"),
				["project_name: First", "backlog_directory: first-backlog", "statuses: [To Do, Done]"].join("\n"),
			);
			const rebuilding = services.configChanged();
			await retry(async () => {
				if (loadCount < 1) throw new Error("config graph load did not start");
			});
			await Bun.write(
				join(directory, "backlog.config.yml"),
				["project_name: Second", "backlog_directory: second-backlog", "statuses: [To Do, Done]"].join("\n"),
			);
			const latest = services.configChanged();
			release?.();
			await rebuilding;
			await latest;
			expect(services.scope.backlog).toBe(second);
			expect(services.createRequestScope().graph).toBeDefined();
		} finally {
			Core.prototype.loadTaskSnapshot = originalLoad;
			await services.dispose();
		}
	});

	it("surfaces failed explicit reconciliation and reports a successful recovery", async () => {
		const { core } = await createProject("server-refresh-recovery");
		const states: string[] = [];
		const hub = {
			disconnectAll: () => {},
			publishLoading: (state: { type: string }) => states.push(state.type),
			publishData: () => {},
			publishConfig: () => {},
		};
		const services = new BrowserServices(core, hub as never);
		await services.initialize();
		states.length = 0;
		const originalLoad = Core.prototype.loadTaskSnapshot;
		Core.prototype.loadTaskSnapshot = async () => {
			throw new Error("refresh failed");
		};
		try {
			await expect(services.reconcile()).rejects.toThrow("refresh failed");
			Core.prototype.loadTaskSnapshot = originalLoad;
			await services.reconcile();
			expect(services.createRequestScope().graph).toBeDefined();
			expect(states).toEqual(["error", "loaded"]);
		} finally {
			Core.prototype.loadTaskSnapshot = originalLoad;
			await services.dispose();
		}
	});

	it("closes watcher handles that finish setup after disposal", async () => {
		const { core } = await createProject("server-dispose-watchers");
		const services = new BrowserServices(core, new WebSocketHub());
		let release: ((watchers: { close: () => void }[]) => void) | undefined;
		const watchers = new Promise<{ close: () => void }[]>((resolve) => {
			release = resolve;
		});
		let closes = 0;
		(services as unknown as { createWatchers: () => Promise<{ close: () => void }[]> }).createWatchers = () => watchers;

		const initializing = services.initialize();
		await services.dispose();
		release?.([{ close: () => closes++ }]);
		await expect(initializing).rejects.toThrow("did not prepare");
		expect(closes).toBe(1);
	});

	it("does not publish after disposal while a graph load is in flight", async () => {
		const { core } = await createProject("server-dispose-build");
		const publications: string[] = [];
		let release: (() => void) | undefined;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		core.loadTaskSnapshot = async () => {
			await blocked;
			return await new Core(core.filesystem.rootDir).loadTaskSnapshot();
		};
		const hub = {
			disconnectAll: () => {},
			publishLoading: (state: { type: string }) => publications.push(state.type),
			publishData: () => publications.push("data"),
			publishConfig: () => publications.push("config"),
		};
		const services = new BrowserServices(core, hub as never);
		const initializing = services.initialize();
		await sleep(20);
		await services.dispose();
		release?.();
		await expect(initializing).rejects.toThrow("did not prepare");
		expect(publications).toEqual([]);
	});
});

describe("project-scoped API requests", () => {
	it("rejects missing and mismatched scopes while allowing independent concurrent bindings", async () => {
		const [first, second] = await Promise.all([createProject("server-scope-one"), createProject("server-scope-two")]);
		const firstHub = new WebSocketHub();
		const secondHub = new WebSocketHub();
		const firstServices = new BrowserServices(first.core, firstHub);
		const secondServices = new BrowserServices(second.core, secondHub);
		const firstApp = createBacklogApp({ services: firstServices, hub: firstHub });
		const secondApp = createBacklogApp({ services: secondServices, hub: secondHub });
		const status = await firstApp.handle(new Request("http://localhost/api/status"));
		expect(status.status).toBe(200);
		expect((await status.json()) as { projectScope: string; initialized: boolean }).toEqual(
			expect.objectContaining({ projectScope: firstServices.scope.token, initialized: true }),
		);
		expect(firstServices.scope.token).not.toContain(first.directory);

		const missing = await firstApp.handle(new Request("http://localhost/api/config"));
		expect(missing.status).toBe(400);
		expect(await missing.json()).toEqual({ error: "Project scope is required", code: "PROJECT_SCOPE_REQUIRED" });

		const mismatch = await firstApp.handle(
			new Request("http://localhost/api/config", {
				headers: { "X-Backlog-Project-Scope": secondServices.scope.token },
			}),
		);
		expect(mismatch.status).toBe(409);
		expect(await mismatch.json()).toEqual({
			error: "Project scope does not match this server",
			code: "PROJECT_SCOPE_MISMATCH",
		});

		const [firstResponse, secondResponse] = await Promise.all([
			firstApp.handle(
				new Request("http://localhost/api/config", {
					headers: { "X-Backlog-Project-Scope": firstServices.scope.token },
				}),
			),
			secondApp.handle(
				new Request("http://localhost/api/config", {
					headers: { "X-Backlog-Project-Scope": secondServices.scope.token },
				}),
			),
		]);
		expect((await firstResponse.json()) as { projectName: string }).toEqual(
			expect.objectContaining({ projectName: "server-scope-one" }),
		);
		expect((await secondResponse.json()) as { projectName: string }).toEqual(
			expect.objectContaining({ projectName: "server-scope-two" }),
		);
	});
});
