import { Elysia, t } from "elysia";
import { isAmbiguousIdError } from "../../utils/entity-id.ts";
import {
	documentUpdateErrorResponse,
	parseCreateDocumentPath,
	parseDocumentTags,
	parseDocumentType,
} from "../transport.ts";
import { parseDocumentUpdate } from "../validation.ts";
import type { ResourceDependencies } from "./api.ts";

const params = t.Object({ id: t.String() });
const documentBody = t.Object(
	{
		content: t.Optional(t.Any()),
		title: t.Optional(t.Any()),
		filename: t.Optional(t.Any()),
		path: t.Optional(t.Any()),
		type: t.Optional(t.Any()),
		tags: t.Optional(t.Any()),
	},
	{ additionalProperties: true },
);

export function documentsResource({ core, services }: ResourceDependencies): Elysia {
	const app = new Elysia({ name: "documents" });
	const get = async (id: string) => {
		try {
			const value = await core.getDocument(id);
			return value ? Response.json(value) : Response.json({ error: "Document not found" }, { status: 404 });
		} catch (error) {
			if (isAmbiguousIdError(error)) return Response.json({ error: error.message }, { status: 409 });
			console.error("Error loading document:", error);
			return Response.json({ error: "Document not found" }, { status: 404 });
		}
	};
	app.get("/api/docs", async () => {
		try {
			return Response.json(
				(await services.store()).getDocuments().map((doc) => ({
					name: doc.path?.split(/[\\/]+/).pop() ?? `${doc.title}.md`,
					id: doc.id,
					title: doc.title,
					type: doc.type,
					path: doc.path,
					createdDate: doc.createdDate,
					updatedDate: doc.updatedDate,
					lastModified: doc.updatedDate || doc.createdDate,
					tags: doc.tags || [],
				})),
			);
		} catch (error) {
			console.error("Error listing documents:", error);
			return Response.json([]);
		}
	});
	app.post(
		"/api/docs",
		async ({ body }) => {
			try {
				const filename = typeof body.filename === "string" ? body.filename : undefined;
				const title = typeof body.title === "string" ? body.title : filename?.replace(/\.md$/i, "");
				if (!title?.trim()) return Response.json({ error: "Document title is required" }, { status: 400 });
				const value = await core.createDocumentFromInput({
					title,
					content: typeof body.content === "string" ? body.content : "",
					type: parseDocumentType(body.type),
					path: parseCreateDocumentPath(body.path),
					tags: parseDocumentTags(body.tags),
				});
				return Response.json({ success: true, ...value }, { status: 201 });
			} catch (error) {
				if (
					error instanceof Error &&
					(error.name === "DocumentPayloadValidationError" ||
						error.message.startsWith("Document type ") ||
						error.message.startsWith("Document path "))
				)
					return Response.json({ error: error.message }, { status: 400 });
				console.error("Error creating document:", error);
				return Response.json({ error: "Failed to create document" }, { status: 500 });
			}
		},
		{ body: documentBody },
	);
	app.get("/api/doc/:id", ({ params }) => get(params.id), { params });
	app.get("/api/docs/:id", ({ params }) => get(params.id), { params });
	app.put(
		"/api/docs/:id",
		async ({ params, body }) => {
			try {
				const parsed = parseDocumentUpdate(body);
				if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
				const { content, title, path, type, tags } = parsed.value;
				const value = await core.updateDocumentFromInput({
					id: params.id,
					content,
					...(title && { title }),
					...(path !== undefined && { path }),
					...(parseDocumentType(type) !== undefined && { type: parseDocumentType(type) }),
					...(tags !== undefined && { tags }),
				});
				return Response.json({ success: true, ...value });
			} catch (error) {
				return documentUpdateErrorResponse(error);
			}
		},
		{ params, body: documentBody },
	);
	return app;
}
