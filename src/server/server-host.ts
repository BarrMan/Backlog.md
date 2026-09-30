import type { Server } from "bun";
import type { Elysia } from "elysia";
import { launchBrowser } from "../utils/browser-launch.ts";

export const BROWSER_HOST = "127.0.0.1";
export const DEFAULT_BROWSER_PORT = 6420;
const STOP_TIMEOUT_MS = 1500;

export class ServerHost {
	private server: Server<unknown> | null = null;
	private stopping = false;

	get port(): number | null {
		return this.server?.port ?? null;
	}
	get running(): boolean {
		return this.server !== null;
	}

	start(app: Elysia, port: number, routes: Record<string, Bun.HTMLBundle>): void {
		app.config.serve = { ...app.config.serve, routes };
		app.listen({
			port,
			hostname: BROWSER_HOST,
			development: process.env.NODE_ENV === "development",
		});
		if (!app.server) throw new Error("Elysia did not create a server");
		this.server = app.server;
	}

	async stop(): Promise<void> {
		if (this.stopping || !this.server) return;
		this.stopping = true;
		const server = this.server;
		await Promise.race([
			server.stop(true).catch(() => {}),
			new Promise<void>((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS)),
		]);
		this.server = null;
		this.stopping = false;
	}

	async openBrowser(url: string): Promise<void> {
		try {
			await launchBrowser(url);
		} catch (error) {
			console.warn("⚠️  Failed to open browser automatically:", error);
			console.log("💡 Please open your browser manually and navigate to the URL above");
		}
	}
}
