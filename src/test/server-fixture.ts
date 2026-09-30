import { Core } from "../core/backlog.ts";
import { createBacklogApp } from "../server/app.ts";
import { BrowserServices } from "../server/lifecycle.ts";
import { WebSocketHub } from "../server/websocket-hub.ts";

function createCore(projectPath: string): Core {
	return new Core(projectPath, { enableWatchers: true });
}

export function createServerFixture(projectPath: string) {
	const core = createCore(projectPath);
	const hub = new WebSocketHub();
	const services = new BrowserServices(core, hub, () => {});
	return {
		app: createBacklogApp({ core, services, hub }),
		core,
		services,
		async dispose(): Promise<void> {
			await services.dispose();
			await hub.close();
		},
	};
}
