import { createMarkdownScannerState, scanMarkdownLine, scanMarkdownSentinels } from "./scanner.ts";

export interface TextRange {
	start: number;
	end: number;
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart < bEnd && bStart < aEnd;
}

export function isIndexWithinRanges(index: number, ranges: readonly TextRange[]): boolean {
	return ranges.some((range) => index >= range.start && index < range.end);
}

export function mergeRanges(ranges: readonly TextRange[]): TextRange[] {
	const merged: TextRange[] = [];
	for (const range of [...ranges].sort((left, right) => left.start - right.start || left.end - right.end)) {
		const previous = merged.at(-1);
		if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
		else merged.push({ ...range });
	}
	return merged;
}

export function findMatchOutsideRanges(
	regex: RegExp,
	content: string,
	ranges: readonly TextRange[],
): RegExpExecArray | undefined {
	const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
	const globalRegex = new RegExp(regex.source, flags);
	for (const match of content.matchAll(globalRegex)) {
		if (!isIndexWithinRanges(match.index ?? 0, ranges)) return match;
	}
	return undefined;
}

export function resolveKnownSentinelRanges(content: string): TextRange[] {
	const tokens = scanMarkdownSentinels(content);
	const ranges: TextRange[] = [];
	for (const family of new Set(tokens.map((token) => token.family))) {
		const pending: ReturnType<typeof scanMarkdownSentinels> = [];
		for (const token of tokens.filter((candidate) => candidate.family === family)) {
			if (token.kind === "BEGIN") pending.push(token);
			else {
				const begin = pending.pop();
				if (begin) ranges.push({ start: begin.start, end: token.end });
			}
		}
	}
	return mergeRanges(ranges);
}

/** Returns a level-two prose section, never a heading embedded in a fence, HTML block, or sentinel block. */
export function extractTopLevelSection(content: string, title: string): string | undefined {
	const src = content.replace(/\r\n/g, "\n");
	const protectedRanges = resolveKnownSentinelRanges(src);
	const headings: Array<{ start: number; bodyStart: number; title: string }> = [];
	const scanner = createMarkdownScannerState();
	let offset = 0;
	for (const line of src.split("\n")) {
		const start = offset;
		offset += line.length + 1;
		const prose = scanMarkdownLine(line, scanner);
		if (!prose || isIndexWithinRanges(start, protectedRanges)) continue;
		const match = /^##[\t ]+(.+?)[\t ]*$/.exec(line);
		if (match) headings.push({ start, bodyStart: offset, title: String(match[1] ?? "").trim() });
	}
	const index = headings.findIndex((heading) => heading.title.toLowerCase() === title.trim().toLowerCase());
	if (index === -1) return undefined;
	const heading = headings[index];
	if (!heading) return undefined;
	const end = headings[index + 1]?.start ?? src.length;
	return src.slice(heading.bodyStart, end).trim() || undefined;
}
