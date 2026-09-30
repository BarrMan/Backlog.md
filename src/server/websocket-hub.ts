import type { BrowserLoadingState } from "../utils/browser-loading-state.ts";

const DATA_BROADCAST_DEBOUNCE_MS = 75;

export class WebSocketHub {
	private sockets = new Set<{ send(message: string): unknown; close(): unknown }>();
	private timer?: ReturnType<typeof setTimeout>;
	private scope: "tasks" | "milestones" = "tasks";
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
		if (scope === "milestones") this.scope = scope;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.broadcast(this.scope === "milestones" ? "milestones-updated" : "tasks-updated");
			this.scope = "tasks";
		}, DATA_BROADCAST_DEBOUNCE_MS);
	}

	publishConfig(): void {
		this.broadcast("config-updated");
	}

	async close(): Promise<void> {
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		for (const socket of this.sockets) {
			try {
				socket.close();
			} catch {}
		}
		this.sockets.clear();
		this.scope = "tasks";
		this.state = { type: "loading", message: null };
	}

	private broadcast(message: string): void {
		for (const socket of this.sockets) {
			try {
				socket.send(message);
			} catch {}
		}
	}
}
