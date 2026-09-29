import { describe, expect, it } from "bun:test";
import type { Core } from "../core/backlog.ts";
import { parseSearchRequest } from "./search.ts";

const core = {
	filesystem: {
		configFilePath: "/project/backlog/config.yml",
		loadConfig: async () => ({
			statuses: ["To Do", "In Progress", "Done"],
			priorities: ["High", "Medium", "Low"],
			projects: ["Platform", "Mobile"],
		}),
	},
} as unknown as Core;

describe("parseSearchRequest", () => {
	it("normalizes configured and repeated search filters", async () => {
		const parsed = await parseSearchRequest(
			new URL(
				"http://localhost/api/search?query=bug&limit=10&type=TASK&status=To%20Do&excludeStatus=done&priority=high&project=platform&assignees=%40alex,%40sam&labels=bug,urgent&modifiedFiles=src/a.ts,src/b.ts",
			),
			core,
		);

		expect(parsed).toEqual({
			value: {
				query: "bug",
				limit: 10,
				types: ["task"],
				filters: {
					status: "To Do",
					excludeStatus: "Done",
					priority: "high",
					project: "Platform",
					assignee: ["@alex", "@sam"],
					labels: ["bug", "urgent"],
					modifiedFiles: ["src/a.ts", "src/b.ts"],
				},
			},
		});
	});

	it("returns validation errors before the search service is used", async () => {
		expect(await parseSearchRequest(new URL("http://localhost/api/search?limit=0"), core)).toEqual({
			error: "limit must be a positive integer",
		});
		expect(await parseSearchRequest(new URL("http://localhost/api/search?type=milestone"), core)).toEqual({
			error: "type must be task, document, or decision",
		});
	});
});
