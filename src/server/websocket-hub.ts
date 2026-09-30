import type { BrowserLoadingState } from "../utils/browser-loading-state.ts";

export class WebSocketHub {
	private sockets = new Set<{ send(message: string): unknown; close(): unknown }>();
	private state: BrowserLoadingState = { type: "loading", message: null };

	open = (ws: { send(message: string): unknown; close(): unknown }) => {
		this.sockets.add(ws);
		ws.send(JSON.stringify(this.state));
	};
	message = (ws: { send(message: string): unknown }) => {
		ws.send("pong");
	};
	socketClose = (ws: { send(message: string): unknown; close(): unknown }) => {
		this.sockets.delete(ws);
	};

	publishLoading(state: BrowserLoadingState): void {
		this.state = state;
		this.broadcast(JSON.stringify(state));
	}

	publishData(scope: "tasks" | "milestones" = "tasks"): void {
		this.broadcast(scope === "milestones" ? "milestones-updated" : "tasks-updated");
	}

	publishConfig(): void {
		this.broadcast("config-updated");
	}

	async close(): Promise<void> {
		this.disconnectAll();
		this.state = { type: "loading", message: null };
	}

	disconnectAll(): void {
		for (const socket of this.sockets) {
			try {
				socket.close();
			} catch {}
		}
		this.sockets.clear();
	}

	private broadcast(message: string): void {
		for (const socket of this.sockets) {
			try {
				socket.send(message);
			} catch {}
		}
	}
}
