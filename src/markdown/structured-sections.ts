import type { AcceptanceCriterion, TaskComment } from "../types/index.ts";
import {
	ACCEPTANCE_CRITERIA_DEFINITION,
	type ChecklistSectionDefinition,
	DEFINITION_OF_DONE_DEFINITION,
	formatChecklistSection,
} from "./checklists.ts";
import {
	COMMENTS_BEGIN_MARKER,
	COMMENTS_END_MARKER,
	COMMENTS_SECTION_HEADER,
	COMMENTS_TITLE,
	formatCommentSection,
	parseCommentSection,
} from "./comments.ts";
import { findMatchOutsideRanges, isIndexWithinRanges, mergeRanges, rangesOverlap, type TextRange } from "./ranges.ts";
import { createMarkdownScannerState, scanMarkdownLine, scanMarkdownSentinels } from "./scanner.ts";
import { getStructuredSectionTitles } from "./section-titles.ts";
import {
	findStructuredSectionKey,
	getSectionBeginMarker,
	getSectionConfig,
	getSectionEndMarker,
	SECTION_INSERTION_ORDER,
	type StructuredSectionKey,
} from "./structured-fields.ts";

export type { StructuredSectionKey } from "./structured-fields.ts";

const ACCEPTANCE_CRITERIA_TITLE = ACCEPTANCE_CRITERIA_DEFINITION.title;
const DEFINITION_OF_DONE_TITLE = DEFINITION_OF_DONE_DEFINITION.title;
const KNOWN_SECTION_TITLES = new Set<string>([
	...getStructuredSectionTitles(),
	ACCEPTANCE_CRITERIA_TITLE,
	"Acceptance Criteria (Optional)",
]);

interface ChecklistManager {
	parseAllCriteria(content: string): AcceptanceCriterion[];
	updateContent(content: string, criteria: AcceptanceCriterion[]): string;
}

function normalizeToLF(content: string): { text: string; useCRLF: boolean } {
	const useCRLF = /\r\n/.test(content);
	return { text: content.replace(/\r\n/g, "\n"), useCRLF };
}

function restoreLineEndings(text: string, useCRLF: boolean): string {
	return useCRLF ? text.replace(/\n/g, "\r\n") : text;
}

const SECTION_SENTINEL_LINE_REGEX = /^<!-- SECTION:[A-Z][A-Z0-9_]*:(BEGIN|END) -->$/;

/**
 * Collapses runs of two or more blank lines to a single blank line in prose
 * and leaves every newline inside fences untouched. Fence tracking follows
 * CommonMark: ``` or ~~~ openers indented up to three spaces past the content
 * column of any enclosing list container, backtick openers whose info string
 * contains a backtick are prose, closings repeat the same character with at
 * least the opening length, and raw HTML blocks never open or close fences.
 * Marker-shaped lines inside an open fence stay fence content. Callers that
 * must keep unterminated fences from leaking across sections collapse each
 * section body independently.
 */
function collapseBlankLines(text: string): string {
	const lines: string[] = [];
	let pendingBlankLines = 0;
	const scanner = createMarkdownScannerState();
	for (const line of text.split("\n")) {
		if (scanner.fence) {
			lines.push(line);
			scanMarkdownLine(line, scanner);
			continue;
		}
		if (SECTION_SENTINEL_LINE_REGEX.test(line)) {
			scanner.htmlBlock = undefined;
			scanner.containerColumns.length = 0;
		}
		if (line === "") {
			if (scanner.htmlBlock?.endsOnBlankLine) scanner.htmlBlock = undefined;
			pendingBlankLines += 1;
			continue;
		}
		if (pendingBlankLines > 0) {
			lines.push("");
			pendingBlankLines = 0;
		}
		lines.push(line);
		scanMarkdownLine(line, scanner);
	}
	if (pendingBlankLines > 0) lines.push("");
	return lines.join("\n");
}

function escapeForRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const getConfig = getSectionConfig;

function getBeginMarker(key: StructuredSectionKey): string {
	return getSectionBeginMarker(key);
}

function getEndMarker(key: StructuredSectionKey): string {
	return getSectionEndMarker(key);
}

function buildSectionBlock(key: StructuredSectionKey, body: string): string {
	const { title } = getConfig(key);
	const begin = getBeginMarker(key);
	const end = getEndMarker(key);
	const normalized = collapseBlankLines(body.replace(/\r\n/g, "\n").replace(/\s+$/g, ""));
	const content = normalized ? `${normalized}\n` : "";
	return `## ${title}\n\n${begin}\n${content}${end}`;
}

function structuredSectionLookahead(currentTitle: string): string {
	const otherTitles = Array.from(KNOWN_SECTION_TITLES).filter(
		(title) => title.toLowerCase() !== currentTitle.toLowerCase(),
	);
	if (otherTitles.length === 0) return "(?=\\n*$)";
	const pattern = otherTitles.map((title) => escapeForRegex(title)).join("|");
	return `(?=\\n+## (?:${pattern})(?:\\s|$)|\\n*$)`;
}

function sectionHeaderRegex(key: StructuredSectionKey): RegExp {
	const { title } = getConfig(key);
	return new RegExp(`## ${escapeForRegex(title)}\\s*\\n([\\s\\S]*?)${structuredSectionLookahead(title)}`, "i");
}

function commentsSentinelRegex(flags = "i"): RegExp {
	const header = escapeForRegex(COMMENTS_SECTION_HEADER);
	const begin = escapeForRegex(COMMENTS_BEGIN_MARKER);
	const end = escapeForRegex(COMMENTS_END_MARKER);
	return new RegExp(`(\\n|^)${header}\\s*\\n${begin}\\s*\\n([\\s\\S]*?)${end}`, flags);
}

function commentsLegacyRegex(flags: string): RegExp {
	return new RegExp(
		`(\\n|^)${escapeForRegex(COMMENTS_SECTION_HEADER)}\\s*\\n(?!${escapeForRegex(COMMENTS_BEGIN_MARKER)})([\\s\\S]*?)(?=\\n+##\\s+|\\n*$)`,
		flags,
	);
}

function legacySectionRegex(title: string, flags: string): RegExp {
	return new RegExp(`(\\n|^)## ${escapeForRegex(title)}\\s*\\n([\\s\\S]*?)${structuredSectionLookahead(title)}`, flags);
}

type SentinelToken = ReturnType<typeof scanMarkdownSentinels>[number];

interface ChecklistSentinelPair extends TextRange {
	begin: SentinelToken;
	endToken: SentinelToken;
}

interface ChecklistSentinelResolution {
	foreignRanges: TextRange[];
	targetPairs: ChecklistSentinelPair[];
	targetState: "none" | "balanced" | "ambiguous";
	targetIssue?: "unexpected-end" | "repeated-begin" | "unclosed-begin";
}

function tokenizeKnownSentinels(content: string): SentinelToken[] {
	return scanMarkdownSentinels(content);
}

function pairForeignFamily(tokens: SentinelToken[]): TextRange[] {
	const pending: SentinelToken[] = [];
	const ranges: TextRange[] = [];
	for (const token of tokens) {
		if (token.kind === "BEGIN") {
			pending.push(token);
			continue;
		}
		const begin = pending.pop();
		if (begin) ranges.push({ start: begin.start, end: token.end });
	}
	return ranges;
}

function resolveKnownSentinelRanges(tokens: SentinelToken[]): TextRange[] {
	const families = new Set(tokens.map((token) => token.family));
	const ranges: TextRange[] = [];
	for (const family of families) {
		ranges.push(...pairForeignFamily(tokens.filter((token) => token.family === family)));
	}
	return mergeRanges(ranges);
}

function resolveChecklistSentinels(
	content: string,
	definition: ChecklistSectionDefinition,
): ChecklistSentinelResolution {
	const tokens = tokenizeKnownSentinels(content);
	const foreignRanges = resolveKnownSentinelRanges(tokens.filter((token) => token.family !== definition.markerId));
	const targetTokens = tokens.filter(
		(token) => token.family === definition.markerId && !isIndexWithinRanges(token.start, foreignRanges),
	);
	if (targetTokens.length === 0) {
		return { foreignRanges, targetPairs: [], targetState: "none" };
	}

	const targetPairs: ChecklistSentinelPair[] = [];
	let begin: SentinelToken | undefined;
	for (const token of targetTokens) {
		if (token.kind === "BEGIN") {
			if (begin) {
				return { foreignRanges, targetPairs: [], targetState: "ambiguous", targetIssue: "repeated-begin" };
			}
			begin = token;
			continue;
		}
		if (!begin) {
			return { foreignRanges, targetPairs: [], targetState: "ambiguous", targetIssue: "unexpected-end" };
		}
		targetPairs.push({ start: begin.start, end: token.end, begin, endToken: token });
		begin = undefined;
	}

	return begin
		? { foreignRanges, targetPairs: [], targetState: "ambiguous", targetIssue: "unclosed-begin" }
		: { foreignRanges, targetPairs, targetState: "balanced" };
}

function assertUnambiguousChecklistSentinels(
	resolution: ChecklistSentinelResolution,
	definition: ChecklistSectionDefinition,
): void {
	if (resolution.targetState !== "ambiguous") return;

	const detail =
		resolution.targetIssue === "unexpected-end"
			? `found ${definition.endMarker} without a preceding ${definition.beginMarker}`
			: resolution.targetIssue === "repeated-begin"
				? `found a second ${definition.beginMarker} before the matching ${definition.endMarker}`
				: `found ${definition.beginMarker} without a following ${definition.endMarker}`;
	throw new Error(`Malformed ${definition.title} markers: ${detail}.`);
}

function findSectionEndIndex(content: string, title: string): number | undefined {
	const normalizedTitle = title.trim();
	if (normalizedTitle.toLowerCase() === ACCEPTANCE_CRITERIA_TITLE.toLowerCase()) {
		return findChecklistSectionRanges(content, ACCEPTANCE_CRITERIA_DEFINITION)[0]?.end;
	}
	if (normalizedTitle.toLowerCase() === DEFINITION_OF_DONE_TITLE.toLowerCase()) {
		return findChecklistSectionRanges(content, DEFINITION_OF_DONE_DEFINITION)[0]?.end;
	}
	const sentinelRanges = resolveKnownSentinelRanges(tokenizeKnownSentinels(content));
	if (normalizedTitle.toLowerCase() === COMMENTS_TITLE.toLowerCase()) {
		const sentinelMatch = findCommentsSentinel(content, sentinelRanges);
		if (sentinelMatch) {
			return sentinelMatch.index + sentinelMatch[0].length;
		}
	} else {
		const block = findSentinelBlockForTitle(content, normalizedTitle, sentinelRanges);
		if (block) {
			return block.end;
		}
	}

	const legacyRegex =
		normalizedTitle.toLowerCase() === COMMENTS_TITLE.toLowerCase()
			? commentsLegacyRegex("i")
			: legacySectionRegex(normalizedTitle, "i");
	const legacyMatch = findMatchOutsideRanges(legacyRegex, content, sentinelRanges);
	if (legacyMatch) {
		return legacyMatch.index + legacyMatch[0].length;
	}
	return undefined;
}

function findSentinelBlockForTitle(
	content: string,
	normalizedTitle: string,
	maskedRanges: TextRange[],
): SentinelBlock | undefined {
	const key = findStructuredSectionKey(normalizedTitle);
	if (!key) return undefined;
	return findSentinelBlocks(content, key).find((candidate) => !isIndexWithinRanges(candidate.start, maskedRanges));
}

function findSectionStartIndex(content: string, title: string): number | undefined {
	const normalizedTitle = title.trim();
	if (normalizedTitle.toLowerCase() === ACCEPTANCE_CRITERIA_TITLE.toLowerCase()) {
		return findChecklistSectionRanges(content, ACCEPTANCE_CRITERIA_DEFINITION)[0]?.start;
	}
	if (normalizedTitle.toLowerCase() === DEFINITION_OF_DONE_TITLE.toLowerCase()) {
		return findChecklistSectionRanges(content, DEFINITION_OF_DONE_DEFINITION)[0]?.start;
	}
	const sentinelRanges = resolveKnownSentinelRanges(tokenizeKnownSentinels(content));
	if (normalizedTitle.toLowerCase() === COMMENTS_TITLE.toLowerCase()) {
		const sentinelMatch = findCommentsSentinel(content, sentinelRanges);
		if (sentinelMatch) {
			return sentinelMatch.index;
		}
	} else {
		const block = findSentinelBlockForTitle(content, normalizedTitle, sentinelRanges);
		if (block) {
			return block.start;
		}
	}

	const legacyRegex =
		normalizedTitle.toLowerCase() === COMMENTS_TITLE.toLowerCase()
			? commentsLegacyRegex("i")
			: legacySectionRegex(normalizedTitle, "i");
	const legacyMatch = findMatchOutsideRanges(legacyRegex, content, sentinelRanges);
	return legacyMatch?.index;
}

function findCommentsSentinel(content: string, maskedRanges: TextRange[]) {
	return findMatchOutsideRanges(commentsSentinelRegex(), content, maskedRanges);
}

interface SentinelBlock {
	start: number;
	bodyStart: number;
	bodyEnd: number;
	end: number;
}

/**
 * Locates `## Title` + BEGIN...END sentinel blocks for a structured section.
 * Markers count only as whole lines (trailing whitespace tolerated), so a body
 * that merely mentions a marker inline can never terminate the block early.
 * Same-family BEGIN lines inside the block are depth-counted, so a file whose
 * markers were nested by pre-fix writes still resolves to one block containing
 * its full interior instead of hiding everything after the first END line.
 */
function findSentinelBlocks(content: string, key: StructuredSectionKey): SentinelBlock[] {
	const heading = `## ${getConfig(key).title}`.toLowerCase();
	const begin = getBeginMarker(key);
	const end = getEndMarker(key);
	const lines = content.split("\n");
	let offset = 0;
	const offsets = lines.map((line) => {
		const start = offset;
		offset += line.length + 1;
		return start;
	});
	const blocks: SentinelBlock[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const markerRange = findSentinelMarkerRange(lines, index, heading, begin, end);
		if (!markerRange) continue;
		const { beginIndex, endIndex } = markerRange;
		blocks.push({
			start: offsets[index] ?? 0,
			bodyStart: Math.min((offsets[beginIndex] ?? 0) + (lines[beginIndex] ?? "").length + 1, content.length),
			bodyEnd: offsets[endIndex] ?? content.length,
			end: (offsets[endIndex] ?? 0) + (lines[endIndex] ?? "").length,
		});
		index = endIndex;
	}
	return blocks;
}

function findSentinelMarkerRange(lines: string[], index: number, heading: string, begin: string, end: string) {
	if ((lines[index] ?? "").trimEnd().toLowerCase() !== heading) return undefined;
	const beginIndex = lines.findIndex((line, lineIndex) => lineIndex > index && line.trim() !== "");
	if ((lines[beginIndex] ?? "").trimEnd() !== begin) return undefined;
	const endIndex = findMatchingSentinelEnd(lines, beginIndex + 1, begin, end);
	return endIndex === undefined ? undefined : { beginIndex, endIndex };
}

function findMatchingSentinelEnd(lines: string[], start: number, begin: string, end: string): number | undefined {
	let depth = 1;
	for (let lineIndex = start; lineIndex < lines.length; lineIndex += 1) {
		const candidate = (lines[lineIndex] ?? "").trimEnd();
		if (candidate === begin) depth += 1;
		if (candidate !== end) continue;
		depth -= 1;
		if (depth === 0) return lineIndex;
	}
	return undefined;
}

/**
 * Rejects section input that contains the target section's own sentinel marker
 * as a whole line: wrapping such a payload would nest markers and hide content
 * from every reader. Inline mentions and other sections' markers stay legal.
 */
export function assertSectionInputHasNoMarkerLines(value: string | undefined, key: StructuredSectionKey): void {
	if (typeof value !== "string" || value.length === 0) return;
	const begin = getBeginMarker(key);
	const end = getEndMarker(key);
	for (const line of value.replace(/\r\n/g, "\n").split("\n")) {
		const trimmed = line.trimEnd();
		if (trimmed !== begin && trimmed !== end) continue;
		throw new Error(
			`${getConfig(key).title} content cannot contain the reserved marker line "${trimmed}". Indent it with a space to include it as literal text.`,
		);
	}
}

interface SectionRange {
	key: StructuredSectionKey;
	start: number;
	end: number;
	kind: "sentinel" | "legacy";
}

interface ChecklistSectionRange {
	start: number;
	end: number;
	body: string;
	maskedRanges: TextRange[];
	marked: boolean;
	hasChecklistItems: boolean;
}

function getStructuredSectionRanges(content: string): SectionRange[] {
	const ranges: SectionRange[] = [];
	for (const key of SECTION_INSERTION_ORDER) {
		for (const block of findSentinelBlocks(content, key)) {
			ranges.push({ key, start: block.start, end: block.end, kind: "sentinel" });
		}

		const legacyRegex = legacySectionRegex(getConfig(key).title, "gi");
		for (const match of content.matchAll(legacyRegex)) {
			const index = match.index ?? 0;
			const end = index + match[0].length;
			if (ranges.some((range) => rangesOverlap(range.start, range.end, index, end))) continue;
			ranges.push({ key, start: index, end, kind: "legacy" });
		}
	}
	return ranges;
}

function parseChecklistBody(body: string, marked: boolean, maskedRanges: TextRange[]): AcceptanceCriterion[] {
	const lineRegex = marked ? /^- \[([ x])\] (?:#\d+ )?(.+)$/gm : /^- \[([ x])\] (.+)$/gm;
	const items: AcceptanceCriterion[] = [];
	for (const match of body.matchAll(lineRegex)) {
		const start = match.index ?? 0;
		if (isIndexWithinRanges(start, maskedRanges)) continue;
		items.push({ checked: match[1] === "x", text: String(match[2] ?? ""), index: items.length + 1 });
	}
	return items;
}

function findChecklistHeaderStart(
	content: string,
	markerStart: number,
	definition: ChecklistSectionDefinition,
): number | undefined {
	const prefix = content.slice(0, markerStart);
	const headerRegex = new RegExp(
		`(?:^|\\n)(${escapeForRegex(definition.sectionHeader)})[\\t ]*\\n(?:[\\t ]*\\n)*[\\t ]*$`,
		"i",
	);
	const match = headerRegex.exec(prefix);
	if (!match?.[1] || match.index === undefined) return undefined;
	return match.index + match[0].indexOf(match[1]);
}

function findTopLevelHeadings(content: string, sentinelRanges: TextRange[]) {
	const headings: Array<{ start: number; bodyStart: number; title: string }> = [];
	for (const match of content.matchAll(/^##[\t ]+(.+?)[\t ]*$/gm)) {
		const start = match.index ?? 0;
		if (isIndexWithinRanges(start, sentinelRanges)) continue;
		const lineEnd = start + match[0].length;
		headings.push({
			start,
			bodyStart: content[lineEnd] === "\n" ? lineEnd + 1 : lineEnd,
			title: String(match[1] ?? "").trim(),
		});
	}
	return headings;
}

function rangesRelativeToBody(ranges: TextRange[], bodyStart: number, bodyEnd: number): TextRange[] {
	return ranges
		.filter((range) => rangesOverlap(range.start, range.end, bodyStart, bodyEnd))
		.map((range) => ({
			start: Math.max(range.start, bodyStart) - bodyStart,
			end: Math.min(range.end, bodyEnd) - bodyStart,
		}));
}

function findChecklistSectionRanges(
	content: string,
	definition: ChecklistSectionDefinition,
	resolution = resolveChecklistSentinels(content, definition),
	includeLegacyWithMarked = false,
): ChecklistSectionRange[] {
	if (resolution.targetState === "ambiguous") return [];
	const ranges: ChecklistSectionRange[] = [];

	for (const pair of resolution.targetPairs) {
		const start = findChecklistHeaderStart(content, pair.begin.start, definition);
		if (start === undefined || isIndexWithinRanges(start, resolution.foreignRanges)) continue;
		const rawBody = content.slice(pair.begin.end, pair.endToken.start);
		const leadingWhitespace = rawBody.match(/^[\t ]*\n/)?.[0].length ?? 0;
		const bodyStart = pair.begin.end + leadingWhitespace;
		const bodyEnd = pair.endToken.start;
		const body = content.slice(bodyStart, bodyEnd);
		const maskedRanges = rangesRelativeToBody(resolution.foreignRanges, bodyStart, bodyEnd);
		ranges.push({
			start,
			end: pair.end,
			body,
			maskedRanges,
			marked: true,
			hasChecklistItems: parseChecklistBody(body, true, maskedRanges).length > 0,
		});
	}

	// Balanced markers with no attached section header (e.g. a stray pair in prose)
	// must not hide legacy sections, or reads would miss criteria that writes still strip.
	if (ranges.length > 0 && !includeLegacyWithMarked) {
		return ranges.sort((left, right) => left.start - right.start);
	}

	const headings = findTopLevelHeadings(content, resolution.foreignRanges);
	for (let index = 0; index < headings.length; index += 1) {
		const heading = headings[index];
		if (!heading || heading.title.toLowerCase() !== definition.title.toLowerCase()) continue;
		const end = headings[index + 1]?.start ?? content.length;
		if (ranges.some((range) => rangesOverlap(range.start, range.end, heading.start, end))) continue;
		const body = content.slice(heading.bodyStart, end);
		const maskedRanges = rangesRelativeToBody(resolution.foreignRanges, heading.bodyStart, end);
		const hasChecklistItems = parseChecklistBody(body, false, maskedRanges).length > 0;
		ranges.push({ start: heading.start, end, body, maskedRanges, marked: false, hasChecklistItems });
	}

	return ranges.sort((left, right) => left.start - right.start);
}

function stripSectionInstances(content: string, key: StructuredSectionKey): string {
	let stripped = content;
	for (const block of findSentinelBlocks(content, key).sort((left, right) => right.start - left.start)) {
		stripped = `${stripped.slice(0, block.start)}${stripped.slice(block.end)}`;
	}

	const legacyRegex = legacySectionRegex(getConfig(key).title, "gi");
	stripped = stripped.replace(legacyRegex, "\n");

	return collapseBlankLines(stripped).trimEnd();
}

function insertAfterSection(content: string, title: string, block: string): { inserted: boolean; content: string } {
	if (!block.trim()) return { inserted: false, content };
	const insertPos = findSectionEndIndex(content, title);
	if (insertPos === undefined) return { inserted: false, content };
	const before = content.slice(0, insertPos).trimEnd();
	const after = content.slice(insertPos).replace(/^\s+/, "");
	const newContent = `${before}${before ? "\n\n" : ""}${block}${after ? `\n\n${after}` : ""}`;
	return { inserted: true, content: newContent };
}

function insertBeforeSection(content: string, title: string, block: string): { inserted: boolean; content: string } {
	if (!block.trim()) return { inserted: false, content };
	const insertPos = findSectionStartIndex(content, title);
	if (insertPos === undefined) return { inserted: false, content };
	const before = content.slice(0, insertPos).trimEnd();
	const after = content.slice(insertPos).replace(/^\s+/, "");
	const newContent = `${before}${before ? "\n\n" : ""}${block}${after ? `\n\n${after}` : ""}`;
	return { inserted: true, content: newContent };
}

function insertAtStart(content: string, block: string): string {
	const trimmedBlock = block.trim();
	if (!trimmedBlock) return content;
	const trimmedContent = content.trim();
	if (!trimmedContent) return trimmedBlock;
	return `${trimmedBlock}\n\n${trimmedContent}`;
}

function appendBlock(content: string, block: string): string {
	const trimmedBlock = block.trim();
	if (!trimmedBlock) return content;
	const trimmedContent = content.trim();
	if (!trimmedContent) return trimmedBlock;
	return `${trimmedContent}\n\n${trimmedBlock}`;
}

export function extractStructuredSection(content: string, key: StructuredSectionKey): string | undefined {
	const src = content.replace(/\r\n/g, "\n");
	const otherRanges = getStructuredSectionRanges(src).filter((range) => range.key !== key);
	const block = findSentinelBlocks(src, key).find((candidate) => !isIndexWithinRanges(candidate.start, otherRanges));
	if (block) {
		return src.slice(block.bodyStart, block.bodyEnd).trim() || undefined;
	}
	const legacyMatch = findMatchOutsideRanges(sectionHeaderRegex(key), src, otherRanges);
	return legacyMatch?.[1]?.trim() || undefined;
}

export interface StructuredSectionValues {
	description?: string;
	implementationPlan?: string;
	implementationNotes?: string;
	finalSummary?: string;
}

interface SectionValues extends StructuredSectionValues {}

export function updateStructuredSections(content: string, sections: SectionValues): string {
	const { text: src, useCRLF } = normalizeToLF(content);

	let working = src;
	for (const key of SECTION_INSERTION_ORDER) {
		working = stripSectionInstances(working, key);
	}
	working = working.trim();

	const description = sections.description?.trim() || "";
	const plan = sections.implementationPlan?.trim() || "";
	const notes = sections.implementationNotes?.trim() || "";
	const finalSummary = sections.finalSummary?.trim() || "";

	let tail = insertStructuredSection(
		working,
		"implementationPlan",
		plan,
		[DEFINITION_OF_DONE_TITLE, ACCEPTANCE_CRITERIA_TITLE, getConfig("description").title],
		[],
		insertAtStart,
	);
	tail = insertStructuredSection(
		tail,
		"implementationNotes",
		notes,
		[getConfig("implementationPlan").title, DEFINITION_OF_DONE_TITLE, ACCEPTANCE_CRITERIA_TITLE],
		[COMMENTS_TITLE, getConfig("finalSummary").title],
		appendBlock,
	);
	tail = insertStructuredSection(
		tail,
		"finalSummary",
		finalSummary,
		[
			COMMENTS_TITLE,
			getConfig("implementationNotes").title,
			getConfig("implementationPlan").title,
			DEFINITION_OF_DONE_TITLE,
			ACCEPTANCE_CRITERIA_TITLE,
		],
		[],
		appendBlock,
	);

	let output = tail;
	if (description) {
		const descriptionBlock = buildSectionBlock("description", description);
		output = insertAtStart(tail, descriptionBlock);
	}

	const finalOutput = collapseBlankLines(output).trim();
	return restoreLineEndings(finalOutput, useCRLF);
}

function insertStructuredSection(
	content: string,
	key: StructuredSectionKey,
	value: string,
	after: string[],
	before: string[],
	fallback: (content: string, block: string) => string,
): string {
	if (!value) return content;
	const block = buildSectionBlock(key, value);
	for (const title of after) {
		const result = insertAfterSection(content, title, block);
		if (result.inserted) return result.content;
	}
	for (const title of before) {
		const result = insertBeforeSection(content, title, block);
		if (result.inserted) return result.content;
	}
	return fallback(content, block);
}

export function getStructuredSections(content: string): StructuredSectionValues {
	return {
		description: extractStructuredSection(content, "description") || undefined,
		implementationPlan: extractStructuredSection(content, "implementationPlan") || undefined,
		implementationNotes: extractStructuredSection(content, "implementationNotes") || undefined,
		finalSummary: extractStructuredSection(content, "finalSummary") || undefined,
	};
}

function updateChecklistContent(
	content: string,
	criteria: AcceptanceCriterion[],
	definition: ChecklistSectionDefinition,
): string {
	const { text: src, useCRLF } = normalizeToLF(content);
	const resolution = resolveChecklistSentinels(src, definition);
	assertUnambiguousChecklistSentinels(resolution, definition);
	const existingRanges = findChecklistSectionRanges(src, definition, resolution, true);
	const mutableRanges = existingRanges.filter((range) => range.marked || range.hasChecklistItems);
	if (criteria.length === 0 && mutableRanges.length === 0) {
		return content;
	}
	const existingRange = mutableRanges[0];
	const newSection = formatChecklistSection(criteria, definition, existingRange?.body, existingRange?.maskedRanges);
	let stripped = src;
	for (const range of mutableRanges.sort((left, right) => right.start - left.start)) {
		const before = stripped.slice(0, range.start).trimEnd();
		const after = stripped.slice(range.end).replace(/^\s+/, "");
		stripped = before && after ? `${before}\n\n${after}` : `${before}${after}`;
	}
	stripped = stripped.trim();

	if (!newSection) {
		return restoreLineEndings(stripped, useCRLF);
	}

	const precedingTitles =
		definition === ACCEPTANCE_CRITERIA_DEFINITION
			? [getConfig("description").title]
			: [ACCEPTANCE_CRITERIA_TITLE, getConfig("description").title];
	for (const title of precedingTitles) {
		const result = insertAfterSection(stripped, title, newSection);
		if (result.inserted) {
			return restoreLineEndings(result.content.trim(), useCRLF);
		}
	}

	const followingTitles =
		definition === ACCEPTANCE_CRITERIA_DEFINITION
			? [
					DEFINITION_OF_DONE_TITLE,
					getConfig("implementationPlan").title,
					getConfig("implementationNotes").title,
					COMMENTS_TITLE,
					getConfig("finalSummary").title,
				]
			: [
					getConfig("implementationPlan").title,
					getConfig("implementationNotes").title,
					COMMENTS_TITLE,
					getConfig("finalSummary").title,
				];
	for (const title of followingTitles) {
		const result = insertBeforeSection(stripped, title, newSection);
		if (result.inserted) {
			return restoreLineEndings(result.content.trim(), useCRLF);
		}
	}

	return restoreLineEndings(appendBlock(stripped, newSection).trim(), useCRLF);
}

function parseAllChecklistItems(content: string, definition: ChecklistSectionDefinition): AcceptanceCriterion[] {
	const marked: AcceptanceCriterion[] = [];
	const legacy: AcceptanceCriterion[] = [];
	const src = content.replace(/\r\n/g, "\n");
	const resolution = resolveChecklistSentinels(src, definition);
	if (resolution.targetState === "ambiguous") return [];
	for (const range of findChecklistSectionRanges(src, definition, resolution)) {
		const target = range.marked ? marked : legacy;
		for (const item of parseChecklistBody(range.body, range.marked, range.maskedRanges)) {
			target.push({ ...item, index: target.length + 1 });
		}
	}
	return marked.length > 0 ? marked : legacy;
}

function parseAndReindexChecklistItems(content: string, definition: ChecklistSectionDefinition): AcceptanceCriterion[] {
	return parseAllChecklistItems(content, definition).map((criterion, index) => ({ ...criterion, index: index + 1 }));
}

export function assertValidChecklistMarks(content: string, family: "AC" | "DOD"): void {
	const definition = family === "AC" ? ACCEPTANCE_CRITERIA_DEFINITION : DEFINITION_OF_DONE_DEFINITION;
	const src = content.replace(/\r\n/g, "\n");
	const resolution = resolveChecklistSentinels(src, definition);
	const ranges = findChecklistSectionRanges(src, definition, resolution);
	if (ranges.length === 0) return;
	const scanner = createMarkdownScannerState();
	let offset = 0;

	for (const line of src.split("\n")) {
		const start = offset;
		offset += line.length + 1;
		if (isIndexWithinRanges(start, resolution.foreignRanges)) continue;
		if (!scanMarkdownLine(line, scanner) || !isIndexWithinRanges(start, ranges)) continue;

		const match = /^- \[([^\]\r\n])\] (.+)$/.exec(line);
		if (match && match[1] !== " " && match[1] !== "x") {
			throw new Error(`Invalid ${definition.title} checkbox mark in row "${line}". Use [ ] or [x].`);
		}
	}
}

function migrateChecklistToStableFormat(content: string, definition: ChecklistSectionDefinition): string {
	const { text: src } = normalizeToLF(content);
	const resolution = resolveChecklistSentinels(src, definition);
	if (resolution.targetState !== "none") return content;
	const criteria = parseAllChecklistItems(src, definition);
	return criteria.length > 0 ? updateChecklistContent(content, criteria, definition) : content;
}

function addChecklistCriteria(content: string, newCriteria: string[], manager: ChecklistManager): string {
	const criteria = manager.parseAllCriteria(content);
	let nextIndex = criteria.length > 0 ? Math.max(...criteria.map((criterion) => criterion.index)) + 1 : 1;
	for (const text of newCriteria) {
		criteria.push({ checked: false, text: text.trim(), index: nextIndex++ });
	}
	return manager.updateContent(content, criteria);
}

function removeChecklistCriterion(
	content: string,
	index: number,
	family: "AC" | "DOD",
	itemLabel: string,
	manager: ChecklistManager,
): string {
	assertValidChecklistMarks(content, family);
	const criteria = manager.parseAllCriteria(content);
	const filtered = criteria.filter((criterion) => criterion.index !== index);
	if (filtered.length === criteria.length) throw new Error(`${itemLabel} #${index} not found`);
	return manager.updateContent(
		content,
		filtered.map((criterion, itemIndex) => ({ ...criterion, index: itemIndex + 1 })),
	);
}

function checkChecklistCriterion(
	content: string,
	index: number,
	checked: boolean,
	family: "AC" | "DOD",
	itemLabel: string,
	manager: ChecklistManager,
): string {
	assertValidChecklistMarks(content, family);
	const criteria = manager.parseAllCriteria(content);
	const criterion = criteria.find((item) => item.index === index);
	if (!criterion) throw new Error(`${itemLabel} #${index} not found`);
	criterion.checked = checked;
	return manager.updateContent(content, criteria);
}

function parseComments(content: string): TaskComment[] {
	const src = content.replace(/\r\n/g, "\n");
	const sentinelMatch = findMatchOutsideRanges(commentsSentinelRegex("i"), src, getStructuredSectionRanges(src));
	const sectionBody = sentinelMatch?.[2];
	if (sectionBody === undefined) {
		return [];
	}

	return parseCommentSection(sectionBody);
}

function findCommentSectionRanges(content: string): Array<{ start: number; end: number }> {
	const protectedRanges = getStructuredSectionRanges(content);
	const ranges: Array<{ start: number; end: number }> = [];
	const collectRanges = (regex: RegExp) => {
		for (const match of content.matchAll(regex)) {
			const start = match.index ?? 0;
			const end = start + match[0].length;
			if (isIndexWithinRanges(start, protectedRanges)) continue;
			if (ranges.some((range) => rangesOverlap(range.start, range.end, start, end))) continue;
			ranges.push({ start, end });
		}
	};

	collectRanges(commentsSentinelRegex("gi"));
	return ranges.sort((a, b) => b.start - a.start);
}

function stripCommentsSection(content: string): string {
	let stripped = content;
	for (const range of findCommentSectionRanges(content)) {
		stripped = `${stripped.slice(0, range.start)}\n${stripped.slice(range.end)}`;
	}
	return collapseBlankLines(stripped).trimEnd();
}

function updateCommentsContent(content: string, comments: TaskComment[]): string {
	const { text: src, useCRLF } = normalizeToLF(content);
	const stripped = stripCommentsSection(src).trim();
	const newSection = formatCommentSection(comments);
	if (!newSection) {
		return restoreLineEndings(stripped, useCRLF);
	}

	let res = insertAfterSection(stripped, getConfig("implementationNotes").title, newSection);
	if (!res.inserted) {
		res = insertAfterSection(stripped, getConfig("implementationPlan").title, newSection);
	}
	if (!res.inserted) {
		res = insertBeforeSection(stripped, getConfig("finalSummary").title, newSection);
	}
	if (!res.inserted) {
		res = insertAfterSection(stripped, DEFINITION_OF_DONE_TITLE, newSection);
	}
	if (!res.inserted) {
		res = insertAfterSection(stripped, ACCEPTANCE_CRITERIA_TITLE, newSection);
	}
	if (!res.inserted) {
		res = insertAfterSection(stripped, getConfig("description").title, newSection);
	}
	const output = res.inserted ? res.content : appendBlock(stripped, newSection);
	return restoreLineEndings(collapseBlankLines(output).trim(), useCRLF);
}

/* biome-ignore lint/complexity/noStaticOnlyClass: Utility methods grouped for clarity */
export class CommentsManager {
	static parseAllComments(content: string): TaskComment[] {
		return parseComments(content);
	}

	static updateContent(content: string, comments: TaskComment[]): string {
		return updateCommentsContent(content, comments);
	}
}

/* biome-ignore lint/complexity/noStaticOnlyClass: Utility methods grouped for clarity */
export class AcceptanceCriteriaManager {
	static formatAcceptanceCriteria(criteria: AcceptanceCriterion[], existingBody?: string): string {
		return formatChecklistSection(
			criteria,
			ACCEPTANCE_CRITERIA_DEFINITION,
			existingBody,
			existingBody ? resolveChecklistSentinels(existingBody, ACCEPTANCE_CRITERIA_DEFINITION).foreignRanges : [],
		);
	}

	static updateContent(content: string, criteria: AcceptanceCriterion[]): string {
		return updateChecklistContent(content, criteria, ACCEPTANCE_CRITERIA_DEFINITION);
	}

	static parseAllCriteria(content: string): AcceptanceCriterion[] {
		return parseAndReindexChecklistItems(content, ACCEPTANCE_CRITERIA_DEFINITION);
	}

	static addCriteria(content: string, newCriteria: string[]): string {
		return addChecklistCriteria(content, newCriteria, AcceptanceCriteriaManager);
	}

	static removeCriterionByIndex(content: string, index: number): string {
		return removeChecklistCriterion(content, index, "AC", "Acceptance criterion", AcceptanceCriteriaManager);
	}

	static checkCriterionByIndex(content: string, index: number, checked: boolean): string {
		return checkChecklistCriterion(content, index, checked, "AC", "Acceptance criterion", AcceptanceCriteriaManager);
	}

	// fallow-ignore-next-line unused-class-member -- exercised through parameterized manager cases in acceptance-criteria-manager.test.ts
	static migrateToStableFormat(content: string): string {
		return migrateChecklistToStableFormat(content, ACCEPTANCE_CRITERIA_DEFINITION);
	}
}

/* biome-ignore lint/complexity/noStaticOnlyClass: Utility methods grouped for clarity */
export class DefinitionOfDoneManager {
	static updateContent(content: string, criteria: AcceptanceCriterion[]): string {
		return updateChecklistContent(content, criteria, DEFINITION_OF_DONE_DEFINITION);
	}

	static parseAllCriteria(content: string): AcceptanceCriterion[] {
		return parseAndReindexChecklistItems(content, DEFINITION_OF_DONE_DEFINITION);
	}

	static addCriteria(content: string, newCriteria: string[]): string {
		return addChecklistCriteria(content, newCriteria, DefinitionOfDoneManager);
	}

	static removeCriterionByIndex(content: string, index: number): string {
		return removeChecklistCriterion(content, index, "DOD", "Definition of Done item", DefinitionOfDoneManager);
	}

	static checkCriterionByIndex(content: string, index: number, checked: boolean): string {
		return checkChecklistCriterion(content, index, checked, "DOD", "Definition of Done item", DefinitionOfDoneManager);
	}

	static migrateToStableFormat(content: string): string {
		return migrateChecklistToStableFormat(content, DEFINITION_OF_DONE_DEFINITION);
	}
}
