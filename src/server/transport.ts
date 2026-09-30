import type { Document } from "../types/index.ts";
import { DOCUMENT_TYPE_VALUES } from "../types/index.ts";
import { isAmbiguousIdError } from "../utils/entity-id.ts";

const documentTypes = new Set<Document["type"]>(DOCUMENT_TYPE_VALUES);

class DocumentPayloadValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DocumentPayloadValidationError";
	}
}

export function parseDocumentType(value: unknown): Document["type"] | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw new DocumentPayloadValidationError("Document type must be a string.");
	if (!documentTypes.has(value as Document["type"]))
		throw new DocumentPayloadValidationError(`Document type must be one of: ${DOCUMENT_TYPE_VALUES.join(", ")}.`);
	return value as Document["type"];
}

export function parseDocumentTags(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string"))
		throw new DocumentPayloadValidationError("Document tags must be an array of strings.");
	return Array.from(new Set(value.map((tag) => tag.trim()).filter(Boolean)));
}

export function parseCreateDocumentPath(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw new DocumentPayloadValidationError("Document path must be a string.");
	return value;
}

export function collectDelimitedSearchParams(url: URL, names: string[]): string[] {
	return names
		.flatMap((name) => url.searchParams.getAll(name))
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);
}

export function documentUpdateErrorResponse(error: unknown): Response {
	if (error instanceof SyntaxError) return Response.json({ error: "Invalid request payload" }, { status: 400 });
	if (isAmbiguousIdError(error)) return Response.json({ error: error.message }, { status: 409 });
	if (error instanceof Error && error.message.startsWith("Document not found"))
		return Response.json({ error: error.message }, { status: 404 });
	if (
		error instanceof DocumentPayloadValidationError ||
		(error instanceof Error &&
			(error.message.startsWith("Document type ") ||
				error.message.startsWith("Document path ") ||
				error.message === "Document title cannot be empty."))
	)
		return Response.json({ error: (error as Error).message }, { status: 400 });
	console.error("Error updating document:", error);
	return Response.json({ error: "Failed to update document" }, { status: 500 });
}

export function movedState(error: unknown, key: "archiveState" | "demotionState"): "moved" | "partial" | undefined {
	const value = typeof error === "object" && error ? (error as Record<string, unknown>)[key] : undefined;
	return value === "moved" || value === "partial" ? value : undefined;
}

export function demotionFailureCause(error: unknown): "cleanup" | "commit" | undefined {
	const value =
		typeof error === "object" && error ? (error as Record<string, unknown>).demotionFailureCause : undefined;
	return value === "cleanup" || value === "commit" ? value : undefined;
}
