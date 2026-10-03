import { describe, expect, it } from "bun:test";
import { withWorkspaceSearch } from "../ui/workspace/state.ts";

describe("workspace footer search", () => {
	it("preserves filters changed outside the footer while applying a live query", () => {
		const latest = {
			search: "old",
			status: ["In Progress"],
			taskTypes: ["Bug"],
			projects: ["CLI"],
			priority: "high",
			labels: ["regression"],
			milestone: "Release",
		};
		expect(withWorkspaceSearch(latest, "native")).toEqual({ ...latest, search: "native" });
	});
});
