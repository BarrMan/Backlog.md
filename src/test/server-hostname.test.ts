import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Core } from "../core/backlog.ts";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import { ServerHost } from "../server/server-host.ts";
import { closeServer, createUniqueTestDir, listenOnEphemeralPort, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let server: BacklogServer | null = null;

class TestServerHost extends ServerHost {
	hostname: string | undefined;

	override start(...args: Parameters<ServerHost["start"]>): void {
		super.start(...args);
		this.hostname = args[0].server?.hostname;
	}
}

async function unusedLoopbackPort(): Promise<number> {
	const { server: portProbe, port } = await listenOnEphemeralPort();
	await closeServer(portProbe);
	return port;
}

describe("BacklogServer loopback binding", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("server-hostname");
		const filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureBacklogStructure();
		await filesystem.saveConfig({
			projectName: "Server Hostname",
			statuses: ["To Do", "In Progress", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
			checkActiveBranches: false,
		});
	});

	afterEach(async () => {
		if (server) {
			await server.stop();
			server = null;
		}
		await safeCleanup(TEST_DIR);
	});

	it("binds, displays, and automatically opens the same 127.0.0.1 URL", async () => {
		const port = await unusedLoopbackPort();
		const logs: string[] = [];
		let openedUrl: string | undefined;
		const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			logs.push(args.join(" "));
		});

		const host = new TestServerHost();
		const openBrowser = spyOn(host, "openBrowser").mockImplementation(async (url) => {
			openedUrl = url;
		});
		try {
			server = new BacklogServer(TEST_DIR, { host });
			await server.start(port, true);

			expect(host.hostname).toBe("127.0.0.1");
			expect(logs).toContain(`🚀 Backlog.md browser interface running at http://127.0.0.1:${port}`);
			expect(openedUrl).toBe(`http://127.0.0.1:${port}`);
		} finally {
			openBrowser.mockRestore();
			logSpy.mockRestore();
		}
	});

	it("keeps --no-open behavior while displaying the 127.0.0.1 URL", async () => {
		const port = await unusedLoopbackPort();
		const logs: string[] = [];
		let opened = false;
		const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			logs.push(args.join(" "));
		});

		const host = new TestServerHost();
		const openBrowser = spyOn(host, "openBrowser").mockImplementation(async () => {
			opened = true;
		});
		try {
			server = new BacklogServer(TEST_DIR, { host });
			await server.start(port, false);

			expect(opened).toBe(false);
			expect(logs).toContain(`🚀 Backlog.md browser interface running at http://127.0.0.1:${port}`);
			expect(logs).toContain("💡 Open your browser and navigate to the URL above");
			expect(logs).not.toContain("🌐 Opening browser...");
		} finally {
			openBrowser.mockRestore();
			logSpy.mockRestore();
		}
	});

	it("serves lightweight browser bootstrap before the shared content corpus finishes loading", async () => {
		const port = await unusedLoopbackPort();
		let releaseLoad: () => void = () => {};
		let markLoadStarted: () => void = () => {};
		const heldLoad = new Promise<void>((resolve) => {
			releaseLoad = resolve;
		});
		const loadStarted = new Promise<void>((resolve) => {
			markLoadStarted = resolve;
		});

		const core = new Core(TEST_DIR, { enableWatchers: true });
		const originalGetContentStore = core.getContentStore.bind(core);
		core.getContentStore = async () => {
			markLoadStarted();
			await heldLoad;
			return await originalGetContentStore();
		};
		server = new BacklogServer(TEST_DIR, { createCore: () => core });

		await server.start(port, false);
		const searchResponse = fetch(`http://127.0.0.1:${port}/api/search`);
		await loadStarted;
		let statisticsResolved = false;
		const statisticsResponse = fetch(`http://127.0.0.1:${port}/api/statistics`).then((result) => {
			statisticsResolved = true;
			return result;
		});
		const response = await fetch(`http://127.0.0.1:${port}/api/status`);
		expect(response.status).toBe(200);
		await Bun.sleep(20);
		expect(statisticsResolved).toBe(false);

		releaseLoad();
		await searchResponse;
		expect((await statisticsResponse).status).toBe(200);
	});
});
