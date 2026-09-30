import type { AcceptanceCriterion } from "../types/index.ts";
import { isIndexWithinRanges, type TextRange } from "./ranges.ts";

export type ChecklistFamily = "AC" | "DOD";

export interface ChecklistSectionDefinition {
	sectionHeader: string;
	title: string;
	markerId: ChecklistFamily;
	beginMarker: string;
	endMarker: string;
}

export const ACCEPTANCE_CRITERIA_DEFINITION: ChecklistSectionDefinition = {
	sectionHeader: "## Acceptance Criteria",
	title: "Acceptance Criteria",
	markerId: "AC",
	beginMarker: "<!-- AC:BEGIN -->",
	endMarker: "<!-- AC:END -->",
};

export const DEFINITION_OF_DONE_DEFINITION: ChecklistSectionDefinition = {
	sectionHeader: "## Definition of Done",
	title: "Definition of Done",
	markerId: "DOD",
	beginMarker: "<!-- DOD:BEGIN -->",
	endMarker: "<!-- DOD:END -->",
};

interface ChecklistCompositionState {
	queue: AcceptanceCriterion[];
	lines: string[];
	nextNumber: number;
}

function appendCriterion(state: ChecklistCompositionState): void {
	const criterion = state.queue.shift();
	if (!criterion) return;
	state.lines.push(`- [${criterion.checked ? "x" : " "}] #${state.nextNumber++} ${criterion.text}`);
}

function composeBody(criteria: AcceptanceCriterion[], existingBody?: string, maskedRanges: TextRange[] = []): string {
	const state: ChecklistCompositionState = {
		queue: [...criteria].sort((a, b) => a.index - b.index),
		lines: [],
		nextNumber: 1,
	};
	const sourceLines = existingBody ? existingBody.replace(/\r\n/g, "\n").split("\n") : [];
	let sourceOffset = 0;
	for (const line of sourceLines) {
		const lineStart = sourceOffset;
		sourceOffset += line.length + 1;
		const isItem = !isIndexWithinRanges(lineStart, maskedRanges) && /^- \[([ x])\] (?:#\d+ )?(.*)$/.test(line.trim());
		if (isItem) appendCriterion(state);
		else state.lines.push(line);
	}
	while (state.lines[0]?.trim() === "") state.lines.shift();
	while (state.lines.at(-1)?.trim() === "") state.lines.pop();
	while (state.queue.length > 0) {
		const lastLine = state.lines.at(-1);
		if (lastLine && lastLine.trim() !== "" && !lastLine.trim().startsWith("- [")) state.lines.push("");
		appendCriterion(state);
	}
	return state.lines.join("\n");
}

/** Formats stable checklist markup while callers retain responsibility for section placement. */
export function formatChecklistSection(
	criteria: AcceptanceCriterion[],
	definition: ChecklistSectionDefinition,
	existingBody?: string,
	maskedRanges?: TextRange[],
): string {
	const body = composeBody(criteria, existingBody, maskedRanges);
	if (body.trim() === "") return "";
	return [definition.sectionHeader, definition.beginMarker, ...body.split("\n"), definition.endMarker].join("\n");
}
