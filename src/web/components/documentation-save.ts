import { apiClient } from "../lib/api";

export const addDocPrefix = (id: string) => (id.startsWith("doc-") ? id : `doc-${id}`);

export function getDocumentDirectory(path?: string) {
	return path
		? path
				.split(/[\\/]+/)
				.slice(0, -1)
				.join("/")
		: "";
}

interface SaveDocumentationInput {
	id?: string;
	isNew: boolean;
	title: string;
	path: string;
	originalTitle: string;
	originalPath: string;
	content: string;
}

export async function saveDocumentation(input: SaveDocumentationInput) {
	const title = input.title.trim();
	const path = input.path.trim();
	if (input.isNew) {
		const document = await apiClient.createDoc(title, input.content, path);
		return { id: document.id.replace("doc-", ""), title, path: getDocumentDirectory(document.path) || path };
	}
	if (!input.id) return null;
	const titleChanged = title !== input.originalTitle;
	const pathChanged = path !== input.originalPath;
	const document = await apiClient.updateDoc(
		addDocPrefix(input.id),
		input.content,
		titleChanged ? title : undefined,
		pathChanged ? path : undefined,
	);
	return { id: input.id, title, path: pathChanged ? getDocumentDirectory(document.path) || path : path };
}
