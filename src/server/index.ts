import net from "node:net";
import type { Core } from "../core/backlog.ts";
import { Core as BacklogCore } from "../core/backlog.ts";
import { browserHtmlRoutes, createBacklogApp, markHtmlBundleNoStore } from "./app.ts";
import { BrowserServices } from "./lifecycle.ts";
import { BROWSER_HOST, DEFAULT_BROWSER_PORT, ServerHost } from "./server-host.ts";
import { WebSocketHub } from "./websocket-hub.ts";

const BUNDLE_ASSET_DIR_ENV = "BACKLOG_BUNDLE_ASSET_DIR";

export { markHtmlBundleNoStore };

export async function isPortAvailable(port: number): Promise<boolean> {
	if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
	return new Promise((resolve) => {
		const server = net.createServer();
		server.listen(port, BROWSER_HOST, () => server.close(() => resolve(true)));
		server.on("error", () => resolve(false));
	});
}

export async function findNextAvailablePort(startPort: number, maxPort = 65535): Promise<number | null> {
	if (!Number.isInteger(startPort) || !Number.isInteger(maxPort)) return null;
	for (let port = Math.max(startPort, 1); port <= Math.min(maxPort, 65535); port++) {
		if (await isPortAvailable(port)) return port;
	}
	return null;
}

export class BacklogServer {
	private readonly host: ServerHost;
	private readonly hub = new WebSocketHub();
	private readonly services: BrowserServices;
	private runtimeWorkingDirectory: string | null = null;

	constructor(projectPath: string, dependencies: { createCore?: (path: string) => Core; host?: ServerHost } = {}) {
		const core = (dependencies.createCore ?? ((path) => new BacklogCore(path)))(projectPath);
		this.host = dependencies.host ?? new ServerHost();
		this.services = new BrowserServices(core, this.hub);
	}

	getPort(): number | null {
		return this.host.port;
	}

	async start(port?: number, openBrowser = true): Promise<void> {
		if (this.host.running) {
			console.log("Server already running");
			return;
		}
		const config = await this.services.scope.requestCore().filesystem.loadConfig();
		const finalPort = port ?? config?.defaultPort ?? DEFAULT_BROWSER_PORT;
		const projectName = config?.projectName || "Untitled Project";
		const bundleDirectory = process.env[BUNDLE_ASSET_DIR_ENV]?.trim();
		if (bundleDirectory) {
			this.runtimeWorkingDirectory = process.cwd();
			process.chdir(bundleDirectory);
		}
		try {
			await this.services.initialize();
			this.host.start(createBacklogApp({ services: this.services, hub: this.hub }), finalPort, browserHtmlRoutes());
		} catch (error) {
			await this.host.stop();
			await this.services.dispose();
			await this.hub.close();
			this.restoreWorkingDirectory();
			throw error;
		}
		const url = `http://${BROWSER_HOST}:${this.getPort() ?? finalPort}`;
		console.log(`🚀 Backlog.md browser interface running at ${url}`);
		console.log(`📊 Project: ${projectName}`);
		console.log(`⏹️  Press ${process.platform === "darwin" ? "Cmd+C" : "Ctrl+C"} to stop the server`);
		if (openBrowser && (config?.autoOpenBrowser ?? true)) {
			console.log("🌐 Opening browser...");
			await this.host.openBrowser(url);
		} else {
			console.log("💡 Open your browser and navigate to the URL above");
		}
	}

	async stop(): Promise<void> {
		const hostStopped = this.host.stop();
		await this.services.dispose();
		await this.hub.close();
		await hostStopped;
		this.restoreWorkingDirectory();
		console.log("Server stopped");
	}

	private restoreWorkingDirectory(): void {
		if (!this.runtimeWorkingDirectory) return;
		process.chdir(this.runtimeWorkingDirectory);
		this.runtimeWorkingDirectory = null;
	}
}
