import { dirname, join, relative } from "node:path";
import type { Core } from "../core/backlog.ts";

const mimeTypes: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	svg: "image/svg+xml",
	webp: "image/webp",
	avif: "image/avif",
	pdf: "application/pdf",
	txt: "text/plain",
	css: "text/css",
	js: "application/javascript",
};

export async function serveAsset(req: Request, core: Core): Promise<Response> {
	try {
		const pathname = decodeURIComponent(new URL(req.url).pathname);
		if (!pathname.startsWith("/assets/")) return new Response("Not Found", { status: 404 });
		const root = join(dirname(core.filesystem.docsDir), "assets");
		const path = join(root, pathname.slice("/assets/".length));
		if (relative(root, path).startsWith("..")) return new Response("Not Found", { status: 404 });
		const file = Bun.file(path);
		if (!(await file.exists())) return new Response("Not Found", { status: 404 });
		const extension = path.match(/\.([^./]+)$/)?.[1]?.toLowerCase() ?? "";
		return new Response(file, { headers: { "Content-Type": mimeTypes[extension] ?? "application/octet-stream" } });
	} catch (error) {
		console.error("Error serving asset:", error);
		return new Response("Internal Server Error", { status: 500 });
	}
}
