import { Core } from "../core/backlog.ts";
import { createBacklogApp } from "../server/app.ts";
import { BrowserServices } from "../server/lifecycle.ts";
import { WebSocketHub } from "../server/websocket-hub.ts";

function createCore(projectPath: string): Core {
	return new Core(projectPath);
}

export async function createServerFixture(projectPath: string) {
	const core = createCore(projectPath);
	const hub = new WebSocketHub();
	const publicationWaiters = new Map<string, Array<() => void>>();
	const publish = (publication: string) => {
		for (const resolve of publicationWaiters.get(publication) ?? []) resolve();
		publicationWaiters.delete(publication);
	};
	const publishData = hub.publishData.bind(hub);
	hub.publishData = (scope) => {
		publishData(scope);
		publish(scope === "milestones" ? "milestones-updated" : "tasks-updated");
	};
	const publishConfig = hub.publishConfig.bind(hub);
	hub.publishConfig = () => {
		publishConfig();
		publish("config-updated");
	};
	const publishLoading = hub.publishLoading.bind(hub);
	hub.publishLoading = (state) => {
		publishLoading(state);
		publish(state.type);
	};
	const services = new BrowserServices(core, hub);
	await services.initialize();
	const rawApp = createBacklogApp({ services, hub });
	return {
		rawApp,
		app: {
			handle(request: Request) {
				if (!request.headers.has("X-Backlog-Project-Scope"))
					request.headers.set("X-Backlog-Project-Scope", services.createRequestScope().scope.token);
				return rawApp.handle(request);
			},
		},
		core,
		services,
		awaitNextPublication(publication: "tasks-updated" | "config-updated" | "error"): Promise<void> {
			return new Promise((resolve) => {
				const waiters = publicationWaiters.get(publication) ?? [];
				waiters.push(resolve);
				publicationWaiters.set(publication, waiters);
			});
		},
		async dispose(): Promise<void> {
			await services.dispose();
			await hub.close();
		},
	};
}
