import { Elysia } from "elysia";
import type { Core } from "../core/backlog.ts";
import indexHtml from "../web/index.html";
import { serveAsset } from "./assets.ts";
import { createApiPlugin, type ServerServices } from "./resources/api.ts";
import type { WebSocketHub } from "./websocket-hub.ts";

const NO_STORE_HEADERS = {
	"Cache-Control": "no-store, max-age=0, must-revalidate",
	Pragma: "no-cache",
	Expires: "0",
} as const;

export function markHtmlBundleNoStore(bundle: Bun.HTMLBundle): Bun.HTMLBundle {
	for (const file of bundle.files ?? []) {
		if (file.loader === "html" && file.isEntry) Object.assign(file.headers, NO_STORE_HEADERS);
	}
	return bundle;
}

const spaIndexHtml = markHtmlBundleNoStore(indexHtml);
const spaPaths = [
	"/",
	"/tasks",
	"/tasks/*",
	"/board",
	"/board/*",
	"/milestones",
	"/drafts",
	"/documentation",
	"/documentation/*",
	"/decisions",
	"/decisions/*",
	"/statistics",
	"/settings",
];

export type BacklogAppDependencies = {
	core: Core;
	services: ServerServices;
	hub: WebSocketHub;
};

export function browserHtmlRoutes(): Record<string, Bun.HTMLBundle> {
	return Object.fromEntries(spaPaths.map((path) => [path, spaIndexHtml]));
}

export function createBacklogApp({ core, services, hub }: BacklogAppDependencies): Elysia {
	const app = new Elysia({ name: "backlog-browser" });
	app.onError(({ code, error }) => {
		if (code === "NOT_FOUND") return new Response("Not Found", { status: 404 });
		if (code === "PARSE")
			return Response.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
		if (code === "VALIDATION") {
			return Response.json({ error: error.message }, { status: 400 });
		}
		console.error("Server Error:", error);
		return new Response("Internal Server Error", { status: 500 });
	});
	app.ws("/", {
		open: (socket) => {
			hub.open(socket);
			if (!services.wasReady()) void services.ready().catch(() => {});
		},
		message: (socket) => hub.message(socket),
		close: (socket) => hub.socketClose(socket),
	});
	app.get("/assets/*", ({ request }) => serveAsset(request, core));
	for (const path of spaPaths) {
		app.get(
			path,
			() =>
				new Response(Bun.file(spaIndexHtml.index), {
					headers: { ...NO_STORE_HEADERS, "Content-Type": "text/html; charset=utf-8" },
				}),
		);
	}
	app.use(createApiPlugin(core, services, hub));
	return app;
}
