import type { TaskComment } from "../types/index.ts";

export const COMMENTS_SECTION_HEADER = "## Comments";
export const COMMENTS_TITLE = "Comments";
export const COMMENTS_BEGIN_MARKER = "<!-- COMMENTS:BEGIN -->";
export const COMMENTS_END_MARKER = "<!-- COMMENTS:END -->";
const COMMENT_DELIMITER = "---";

function normalizeMetadata(value: string | undefined): string | undefined {
	const normalized = value?.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
	return normalized || undefined;
}

function containsMarker(value: string | undefined): boolean {
	return /<!--\s*COMMENTS?:/i.test(value ?? "");
}

function containsDelimiter(value: string | undefined): boolean {
	return /^\s*---\s*$/m.test((value ?? "").replace(/\r\n/g, "\n"));
}

function parseMetadata(lines: string[], fallbackIndex: number): Pick<TaskComment, "index" | "author" | "createdDate"> {
	let index = fallbackIndex;
	let author: string | undefined;
	let createdDate = "";
	for (const line of lines) {
		const match = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
		if (!match?.[1]) continue;
		const key = match[1].toLowerCase();
		const value = match[2] ?? "";
		if (key === "index") {
			const parsed = Number.parseInt(value, 10);
			if (Number.isFinite(parsed) && parsed > 0) index = parsed;
		} else if (key === "author") author = normalizeMetadata(value);
		else if (key === "created") createdDate = value.trim();
	}
	return { index, ...(author && { author }), createdDate };
}

function readDelimitedPart(lines: string[], start: number): { lines: string[]; nextLine: number } | undefined {
	const part: string[] = [];
	let nextLine = start;
	while (nextLine < lines.length && (lines[nextLine] ?? "").trim() !== COMMENT_DELIMITER) {
		part.push(lines[nextLine] ?? "");
		nextLine += 1;
	}
	return nextLine < lines.length ? { lines: part, nextLine: nextLine + 1 } : undefined;
}

function parseDelimitedComments(sectionBody: string): TaskComment[] {
	const lines = sectionBody.replace(/\r\n/g, "\n").split("\n");
	const comments: TaskComment[] = [];
	let lineIndex = 0;
	while (lineIndex < lines.length) {
		while (lines[lineIndex]?.trim() === "") lineIndex += 1;
		if (lineIndex >= lines.length) break;
		const metadata = readDelimitedPart(lines, lineIndex);
		if (!metadata) break;
		const bodyPart = readDelimitedPart(lines, metadata.nextLine);
		if (!bodyPart) break;
		lineIndex = bodyPart.nextLine;
		const body = bodyPart.lines.join("\n").trim();
		if (!body) continue;
		const { author, createdDate } = parseMetadata(metadata.lines, comments.length + 1);
		comments.push({ index: comments.length + 1, body, createdDate, ...(author && { author }) });
	}
	return comments;
}

function parseLegacyBlock(block: string, fallbackIndex: number): TaskComment | undefined {
	const normalized = block.replace(/\r\n/g, "\n").trim();
	if (!normalized) return undefined;
	const separatorIndex = normalized.search(/\n\s*\n/);
	const metadata = separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : "";
	const body = separatorIndex >= 0 ? normalized.slice(separatorIndex).replace(/^\s+/, "").trim() : normalized;
	if (!body) return undefined;
	return { ...parseMetadata(metadata.split("\n"), fallbackIndex), body };
}

/** Parses the contents between COMMENTS begin/end markers without locating the section. */
export function parseCommentSection(sectionBody: string): TaskComment[] {
	if (!sectionBody.includes("<!-- COMMENT:BEGIN -->")) return parseDelimitedComments(sectionBody);
	const blockRegex = /<!-- COMMENT:BEGIN -->\s*\n([\s\S]*?)<!-- COMMENT:END -->/gi;
	const comments: TaskComment[] = [];
	for (const match of sectionBody.matchAll(blockRegex)) {
		const parsed = parseLegacyBlock(match[1] ?? "", comments.length + 1);
		if (parsed) comments.push(parsed);
	}
	return comments.map((comment, index) => ({
		...comment,
		index: Number.isFinite(comment.index) && comment.index > 0 ? comment.index : index + 1,
	}));
}

function formatCommentBlock(comment: TaskComment): string {
	const body = String(comment.body ?? "")
		.replace(/\r\n/g, "\n")
		.trim();
	if (containsMarker(body)) throw new Error("Comment body cannot contain Backlog comment markers.");
	if (containsDelimiter(body)) throw new Error("Comment body cannot contain standalone '---' delimiter lines.");
	const lines: string[] = [];
	const author = normalizeMetadata(comment.author);
	if (author) {
		if (containsMarker(author)) throw new Error("Comment author cannot contain Backlog comment markers.");
		if (containsDelimiter(author)) throw new Error("Comment author cannot contain standalone '---' delimiter lines.");
		lines.push(`author: ${author}`);
	}
	const createdDate = String(comment.createdDate ?? "").trim();
	if (containsMarker(createdDate)) throw new Error("Comment created date cannot contain Backlog comment markers.");
	if (containsDelimiter(createdDate))
		throw new Error("Comment created date cannot contain standalone '---' delimiter lines.");
	if (createdDate) lines.push(`created: ${createdDate}`);
	lines.push(COMMENT_DELIMITER, body, COMMENT_DELIMITER);
	return lines.join("\n");
}

/** Formats the canonical comments section; placement among other sections remains structural ownership. */
export function formatCommentSection(comments: TaskComment[]): string {
	const normalized = comments
		.map((comment, index) => ({
			...comment,
			index: Number.isFinite(comment.index) && comment.index > 0 ? comment.index : index + 1,
			body: String(comment.body ?? "").trim(),
		}))
		.filter((comment) => comment.body.length > 0);
	if (normalized.length === 0) return "";
	const lines = [COMMENTS_SECTION_HEADER, "", COMMENTS_BEGIN_MARKER];
	normalized.forEach((comment, index) => {
		if (index > 0) lines.push("");
		lines.push(formatCommentBlock(comment));
	});
	lines.push(COMMENTS_END_MARKER);
	return lines.join("\n");
}
