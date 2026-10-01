import { t } from "elysia";
import type { Core } from "../../core/backlog.ts";
import { isAmbiguousIdError } from "../../utils/entity-id.ts";
import { API_ROUTES } from "../api-routes.ts";
import {
	documentUpdateErrorResponse,
	parseCreateDocumentPath,
	parseDocumentTags,
	parseDocumentType,
} from "../transport.ts";
import { parseDocumentUpdate } from "../validation.ts";
import { type ResourceDependencies, scopedResource } from "./api.ts";
import { documentListItemSchema, documentSchema, errorSchema } from "./schemas.ts";

const params = t.Object({ id: t.String() });
const documentCreateBody = t.Object(
	{
		content: t.Optional(t.String()),
		title: t.Optional(t.String()),
		filename: t.Optional(t.String()),
		path: t.Optional(t.String()),
		type: t.Optional(
			t.Union([t.Literal("readme"), t.Literal("guide"), t.Literal("specification"), t.Literal("other")]),
		),
		tags: t.Optional(t.Array(t.String())),
	},
	{ additionalProperties: true },
);
const documentUpdateBody = t.Object(
	{
		content: t.String(),
		title: t.Optional(t.String({ minLength: 1 })),
		path: t.Optional(t.Union([t.String(), t.Null()])),
		type: t.Optional(
			t.Union([t.Literal("readme"), t.Literal("guide"), t.Literal("specification"), t.Literal("other")]),
		),
		tags: t.Optional(t.Array(t.String())),
	},
	{ additionalProperties: true },
);
const documentMutationSchema = t.Object({ success: t.Boolean(), ...documentSchema.properties });

export function documentsResource({ services }: ResourceDependencies) {
	const app = scopedResource(services, "documents");
	const get = async (core: Core, id: string, set: { status?: number | string }) => {
		try {
			const value = await core.getDocument(id);
			if (value) return value;
			set.status = 404;
			return { error: "Document not found" };
		} catch (error) {
			if (isAmbiguousIdError(error)) throw error;
			console.error("Error loading document:", error);
			set.status = 404;
			return { error: "Document not found" };
		}
	};
	app.get(
		API_ROUTES.DOCS,
		async ({ core, set }) => {
			try {
				return (await core.filesystem.listDocuments()).map((doc) => ({
					name: doc.path?.split(/[\\/]+/).pop() ?? `${doc.title}.md`,
					id: doc.id,
					title: doc.title,
					type: doc.type,
					path: doc.path,
					createdDate: doc.createdDate,
					updatedDate: doc.updatedDate,
					lastModified: doc.updatedDate || doc.createdDate,
					tags: doc.tags || [],
				}));
			} catch (error) {
				console.error("Error listing documents:", error);
				set.status = 200;
				return [];
			}
		},
		{ response: t.Array(documentListItemSchema) },
	);
	app.post(
		API_ROUTES.DOCS,
		async ({ body, core, set }) => {
			try {
				const filename = typeof body.filename === "string" ? body.filename : undefined;
				const title = typeof body.title === "string" ? body.title : filename?.replace(/\.md$/i, "");
				if (!title?.trim()) {
					set.status = 400;
					return { error: "Document title is required" };
				}
				const value = await core.createDocumentFromInput({
					title,
					content: typeof body.content === "string" ? body.content : "",
					type: parseDocumentType(body.type),
					path: parseCreateDocumentPath(body.path),
					tags: parseDocumentTags(body.tags),
				});
				set.status = 201;
				return { success: true, ...value };
			} catch (error) {
				if (
					error instanceof Error &&
					(error.name === "DocumentPayloadValidationError" ||
						error.message.startsWith("Document type ") ||
						error.message.startsWith("Document path "))
				) {
					set.status = 400;
					return { error: error.message };
				}
				console.error("Error creating document:", error);
				set.status = 500;
				return { error: "Failed to create document" };
			}
		},
		{
			body: documentCreateBody,
			response: {
				201: documentMutationSchema,
				400: errorSchema,
				500: errorSchema,
			},
		},
	);
	app.get(API_ROUTES.LEGACY_DOC(":id"), ({ params, core, set }) => get(core, params.id, set), {
		params,
		response: { 200: documentSchema, 404: errorSchema, 409: errorSchema },
	});
	app.get(API_ROUTES.DOC(":id"), ({ params, core, set }) => get(core, params.id, set), {
		params,
		response: { 200: documentSchema, 404: errorSchema, 409: errorSchema },
	});
	app.put(
		API_ROUTES.DOC(":id"),
		async ({ params, body, core, set }) => {
			try {
				const parsed = parseDocumentUpdate(body);
				if ("error" in parsed) {
					set.status = 400;
					return { error: parsed.error };
				}
				const { content, title, path, type, tags } = parsed.value;
				const value = await core.updateDocumentFromInput({
					id: params.id,
					content,
					...(title && { title }),
					...(path !== undefined && { path }),
					...(parseDocumentType(type) !== undefined && { type: parseDocumentType(type) }),
					...(tags !== undefined && { tags }),
				});
				return { success: true, ...value };
			} catch (error) {
				const failure = documentUpdateErrorResponse(error);
				set.status = failure.status;
				return failure.body;
			}
		},
		{
			params,
			body: documentUpdateBody,
			response: {
				200: documentMutationSchema,
				400: errorSchema,
				404: errorSchema,
				409: errorSchema,
				500: errorSchema,
			},
		},
	);
	return app;
}
