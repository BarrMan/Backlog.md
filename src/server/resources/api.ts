import { Elysia } from "elysia";
import type { Core } from "../../core/backlog.ts";
import type { WebSocketHub } from "../websocket-hub.ts";
import { decisionsResource } from "./decisions.ts";
import { documentsResource } from "./documents.ts";
import { milestonesResource } from "./milestones.ts";
import { projectResource } from "./project.ts";
import { searchResource } from "./search.ts";
import { tasksResource } from "./tasks.ts";

export type ServerServices = {
	ready(): Promise<void>;
	store(): ReturnType<Core["getContentStore"]>;
	search(): ReturnType<Core["getSearchService"]>;
	wasReady(): boolean;
	configChanged(projectName: string): void;
};

export type ResourceDependencies = { core: Core; services: ServerServices; publishData: WebSocketHub["publishData"] };

export function createApiPlugin(core: Core, services: ServerServices, hub: Pick<WebSocketHub, "publishData">) {
	const dependencies = { core, services, publishData: hub.publishData.bind(hub) };
	return new Elysia({ name: "api" })
		.use(tasksResource(dependencies))
		.use(milestonesResource(dependencies))
		.use(documentsResource(dependencies))
		.use(decisionsResource(dependencies))
		.use(projectResource(dependencies))
		.use(searchResource(dependencies));
}
