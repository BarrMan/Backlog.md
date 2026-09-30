import { describe, expect, it } from "bun:test";
import { extractTopLevelSection, resolveKnownSentinelRanges } from "../markdown/ranges.ts";

describe("Markdown section scanning", () => {
	it("ignores headings and sentinel lines inside fenced and raw HTML content", () => {
		const content = [
			"## Context",
			"",
			"Visible context.",
			"",
			"```md",
			"## Decision",
			"<!-- SECTION:PLAN:BEGIN -->",
			"<!-- SECTION:PLAN:END -->",
			"```",
			"",
			"<div>",
			"## Decision",
			"<!-- SECTION:NOTES:BEGIN -->",
			"<!-- SECTION:NOTES:END -->",
			"</div>",
			"",
			"## Decision",
			"",
			"Visible decision.",
		].join("\n");

		expect(extractTopLevelSection(content, "Context")).toContain("Visible context.");
		expect(extractTopLevelSection(content, "Decision")).toBe("Visible decision.");
		expect(resolveKnownSentinelRanges(content)).toEqual([]);
	});

	it("protects prose sentinel blocks from top-level extraction", () => {
		const content = [
			"## Context",
			"",
			"<!-- SECTION:DESCRIPTION:BEGIN -->",
			"## Decision",
			"Hidden decision.",
			"<!-- SECTION:DESCRIPTION:END -->",
			"",
			"## Decision",
			"",
			"Visible decision.",
		].join("\n");

		expect(extractTopLevelSection(content, "Decision")).toBe("Visible decision.");
	});
});
