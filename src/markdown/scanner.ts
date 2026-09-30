interface FenceSpec {
	character: string;
	minLength: number;
}

interface HtmlBlockState {
	endRegex?: RegExp;
	endsOnBlankLine: boolean;
}

export interface MarkdownScannerState {
	fence?: FenceSpec;
	htmlBlock?: HtmlBlockState;
	containerColumns: number[];
}

export interface MarkdownSentinelToken {
	family: string;
	kind: "BEGIN" | "END";
	start: number;
	end: number;
}

const FENCE_OPENING_REGEX = /^(`{3,}|~{3,})(.*)$/;
const LIST_ITEM_MARKER_REGEX = /^( *)([-+*]|\d{1,9}[.)])(?:[\t ]+|$)/;
const HTML_BLOCK_TAG_NAMES =
	"address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
const HTML_TYPE1_OPENING_REGEX = /^ {0,3}<(script|pre|style|textarea)(?=[\t />]|$)/i;
const HTML_COMMENT_OPENING_REGEX = /^ {0,3}<!--/;
const HTML_COMMENT_END_REGEX = /--!?>/;
const HTML_PROCESSING_INSTRUCTION_OPENING_REGEX = /^ {0,3}<\?/;
const HTML_DECLARATION_OPENING_REGEX = /^ {0,3}<![a-zA-Z]/;
const HTML_CDATA_OPENING_REGEX = /^ {0,3}<!\[CDATA\[/;
const HTML_BLOCK_TAG_OPENING_REGEX = new RegExp(`^ {0,3}</?(?:${HTML_BLOCK_TAG_NAMES})(?=[\t />]|$)`, "i");
const HTML_COMPLETE_TAG_LINE_REGEX = /^ {0,3}<\/?[a-zA-Z][a-zA-Z0-9-]*(?:[\t ][^<>]*)?\/?>[\t ]*$/;
const SENTINEL_LINE_REGEX = /^<!-- (SECTION:[A-Z][A-Z0-9_]*|COMMENTS|COMMENT|AC|DOD):(BEGIN|END) -->[\t ]*$/;

export function createMarkdownScannerState(): MarkdownScannerState {
	return { containerColumns: [] };
}

export function scanMarkdownLine(line: string, state: MarkdownScannerState): boolean {
	if (state.fence) {
		if (closesFence(line, state.fence, state.containerColumns)) state.fence = undefined;
		return false;
	}
	if (state.htmlBlock) {
		if (state.htmlBlock.endRegex?.test(line) || (state.htmlBlock.endsOnBlankLine && line.trim() === "")) {
			state.htmlBlock = undefined;
		}
		return false;
	}
	updateListContainers(line, state.containerColumns);
	state.fence = matchFenceOpener(line, state.containerColumns);
	if (state.fence) return false;
	state.htmlBlock = matchHtmlBlockStart(line, state.containerColumns);
	return !state.htmlBlock;
}

/**
 * Returns structural marker lines that occur in Markdown prose. Marker-shaped
 * text in fences and raw HTML is ordinary content, not a section boundary.
 */
export function scanMarkdownSentinels(content: string): MarkdownSentinelToken[] {
	const tokens: MarkdownSentinelToken[] = [];
	const scanner = createMarkdownScannerState();
	let offset = 0;
	for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
		const start = offset;
		offset += line.length + 1;
		if (!scanMarkdownLine(line, scanner)) continue;
		const match = SENTINEL_LINE_REGEX.exec(line);
		if (!match) continue;
		tokens.push({
			family: String(match[1]),
			kind: match[2] as MarkdownSentinelToken["kind"],
			start,
			end: start + line.length,
		});
	}
	return tokens;
}

function leadingSpaceCount(line: string): number {
	let count = 0;
	while (line.charAt(count) === " ") count += 1;
	return count;
}

function listItemContentColumn(line: string): number | undefined {
	const match = LIST_ITEM_MARKER_REGEX.exec(line);
	if (!match) return undefined;
	const markerIndent = match[1]?.length ?? 0;
	const marker = String(match[2] ?? "");
	const trailingWhitespace = match[0].length - markerIndent - marker.length;
	return markerIndent + marker.length + trailingWhitespace;
}

function updateListContainers(line: string, containerColumns: number[]): void {
	while ((containerColumns.at(-1) ?? 0) > leadingSpaceCount(line)) containerColumns.pop();
	const column = listItemContentColumn(line);
	if (column !== undefined) containerColumns.push(column);
}

function isWithinContainerIndent(indent: number, containerColumns: number[]): boolean {
	return indent <= 3 || containerColumns.some((base) => indent - base >= 0 && indent - base <= 3);
}

function matchFenceOpener(line: string, containerColumns: number[]): FenceSpec | undefined {
	const indent = leadingSpaceCount(line);
	if (!isWithinContainerIndent(indent, containerColumns)) return undefined;
	const opening = FENCE_OPENING_REGEX.exec(line.slice(indent));
	const run = opening?.[1] ?? "";
	const info = opening?.[2] ?? "";
	if (!run || (run.charAt(0) === "`" && info.includes("`"))) return undefined;
	return { character: run.charAt(0), minLength: run.length };
}

function closesFence(line: string, fence: FenceSpec, containerColumns: number[]): boolean {
	const indent = leadingSpaceCount(line);
	if (!isWithinContainerIndent(indent, containerColumns)) return false;
	const remainder = line.slice(indent);
	let runLength = 0;
	while (remainder.charAt(runLength) === fence.character) runLength += 1;
	return runLength >= fence.minLength && /^[\t ]*$/.test(remainder.slice(runLength));
}

function matchHtmlBlockStart(line: string, containerColumns: number[]): HtmlBlockState | undefined {
	const base = containerColumns.at(-1) ?? 0;
	const relative = base > 0 && leadingSpaceCount(line) >= base ? line.slice(base) : line;
	return matchClosedHtmlBlock(relative) ?? matchBlankLineHtmlBlock(relative);
}

function matchClosedHtmlBlock(relative: string): HtmlBlockState | undefined {
	const type1Match = HTML_TYPE1_OPENING_REGEX.exec(relative);
	if (type1Match) {
		const endRegex = new RegExp(`</${type1Match[1]}>`, "i");
		return endRegex.test(relative) ? undefined : { endRegex, endsOnBlankLine: false };
	}
	if (HTML_COMMENT_OPENING_REGEX.test(relative)) {
		return HTML_COMMENT_END_REGEX.test(relative)
			? undefined
			: { endRegex: HTML_COMMENT_END_REGEX, endsOnBlankLine: false };
	}
	if (HTML_PROCESSING_INSTRUCTION_OPENING_REGEX.test(relative)) {
		return relative.includes("?>") ? undefined : { endRegex: /\?>/, endsOnBlankLine: false };
	}
	if (HTML_DECLARATION_OPENING_REGEX.test(relative)) {
		return relative.includes(">") ? undefined : { endRegex: />/, endsOnBlankLine: false };
	}
	if (HTML_CDATA_OPENING_REGEX.test(relative)) {
		return relative.includes("]]>") ? undefined : { endRegex: /\]\]>/, endsOnBlankLine: false };
	}
	return undefined;
}

function matchBlankLineHtmlBlock(relative: string): HtmlBlockState | undefined {
	return HTML_BLOCK_TAG_OPENING_REGEX.test(relative) || HTML_COMPLETE_TAG_LINE_REGEX.test(relative)
		? { endsOnBlankLine: true }
		: undefined;
}
