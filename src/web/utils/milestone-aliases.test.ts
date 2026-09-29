import { describe, expect, it } from "bun:test";
import { resolveMilestoneAliasToId } from "../../core/milestones.ts";
import type { Milestone } from "../../types";
import { buildMilestoneAliasMap, canonicalizeMilestone } from "./milestone-aliases";

const milestone = (id: string, title: string): Milestone => ({ id, title, description: "", rawContent: "" });

describe("milestone aliases", () => {
	it("normalizes numeric IDs while preferring IDs over numeric titles", () => {
		const aliases = buildMilestoneAliasMap([milestone("m-1", "Release"), milestone("m-2", "1")]);

		expect(canonicalizeMilestone("M-01", aliases)).toBe("m-1");
		expect(canonicalizeMilestone("1", aliases)).toBe("m-1");
	});

	it("canonicalizes numeric collisions while exact lookup preserves the stored ID", () => {
		const milestones = [milestone("m-1", "Release"), milestone("1", "Legacy")];
		const aliases = buildMilestoneAliasMap(milestones);

		expect(canonicalizeMilestone("1", aliases)).toBe("m-1");
		expect(resolveMilestoneAliasToId("1", milestones)?.id).toBe("1");
	});

	it("uses unique active titles and keeps archived aliases as fallback", () => {
		const aliases = buildMilestoneAliasMap(
			[milestone("m-2", "Current")],
			[milestone("m-1", "Current"), milestone("m-3", "Historical")],
		);

		expect(canonicalizeMilestone("Current", aliases)).toBe("m-2");
		expect(canonicalizeMilestone("Historical", aliases)).toBe("m-3");
		expect(canonicalizeMilestone("m-01", aliases)).toBe("m-1");
	});

	it("does not use duplicate titles or titles that collide with IDs", () => {
		const aliases = buildMilestoneAliasMap([
			milestone("m-1", "Shared"),
			milestone("m-2", "Shared"),
			milestone("m-3", "m-1"),
		]);

		expect(canonicalizeMilestone("Shared", aliases)).toBe("Shared");
		expect(canonicalizeMilestone("m-1", aliases)).toBe("m-1");
	});
});
