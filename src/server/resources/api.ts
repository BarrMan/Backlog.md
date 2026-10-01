import { Elysia, ElysiaCustomStatusResponse } from "elysia";
import { API_ROUTES, HTTP_METHOD, PROJECT_SCOPE_HEADER } from "../api-routes.ts";
import type { ServerRequestScope } from "../project-scope.ts";
import { decisionsResource } from "./decisions.ts";
import { documentsResource } from "./documents.ts";
import { milestonesResource } from "./milestones.ts";
import { projectResource } from "./project.ts";
import { searchResource } from "./search.ts";
import { tasksResource } from "./tasks.ts";

export type ServerServices = {
	createRequestScope(requireReady?: boolean): ServerRequestScope;
	configChanged(): Promise<void>;
	reconcile(scope?: ServerRequestScope["scope"], publication?: "tasks" | "milestones"): Promise<void>;
};

export type ResourceDependencies = { services: ServerServices };

export function scopedResource(services: ServerServices, name: string) {
	return new Elysia({ name })
		.derive(() => services.createRequestScope())
		.onBeforeHandle(({ request, scope, set }) => {
			const path = new URL(request.url).pathname;
			if (path === API_ROUTES.STATUS || path === API_ROUTES.VERSION) return;
			services.createRequestScope(true);
			return scope.validate(request.headers.get(PROJECT_SCOPE_HEADER), set);
		})
		.onAfterHandle(async ({ request, response, scope, set }) => {
			const responseStatus =
				response instanceof Response
					? response.status
					: response instanceof ElysiaCustomStatusResponse
						? Number(response.code)
						: Number(set.status ?? 200);
			if (request.method === HTTP_METHOD.GET || request.method === HTTP_METHOD.HEAD || responseStatus >= 400) return;
			const path = new URL(request.url).pathname;
			if (path === API_ROUTES.CONFIG || path === API_ROUTES.INIT) return;
			await services.reconcile(scope, path.startsWith(API_ROUTES.MILESTONES) ? "milestones" : "tasks");
		});
}

export function createApiPlugin(services: ServerServices) {
	const dependencies = { services };
	return new Elysia({ name: "api" })
		.use(tasksResource(dependencies))
		.use(milestonesResource(dependencies))
		.use(documentsResource(dependencies))
		.use(decisionsResource(dependencies))
		.use(projectResource(dependencies))
		.use(searchResource(dependencies));
}
