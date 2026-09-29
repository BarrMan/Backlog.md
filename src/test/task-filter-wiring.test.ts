import { describe, expect, it } from "bun:test";
import type { Task } from "../types/index.ts";
import { openTaskFilterPicker, taskFilterHeaderControls, taskFilterOptions } from "../ui/task-filter-wiring.ts";
import { createScreen } from "../ui/tui.ts";
import { NO_MILESTONE_FILTER_VALUE } from "../utils/milestone-filter.ts";
import { applyTaskFilters, createTaskSearchIndex } from "../utils/task-search.ts";

type Widget = {
	content?: string;
	getContent?(): string;
	items?: Widget[];
	emit(event: string, ...args: unknown[]): boolean;
};

function press(widget: Widget, name: string): void {
	const key = { name, full: name };
	widget.emit("keypress", name === "escape" ? "\x1b" : "", key);
	widget.emit(`key ${name}`, "", key);
}

function itemContents(widget: Widget | undefined): string[] {
	return widget?.items?.map((item) => item.getContent?.() ?? item.content ?? "") ?? [];
}

async function pickerItems(
	screen: ReturnType<typeof createScreen>,
	filterId: Exclude<ReturnType<typeof taskFilterHeaderControls>[number], "search">,
): Promise<string[]> {
	const result = openTaskFilterPicker({
		screen,
		filterId,
		filters: { search: "", status: [], taskTypes: [], projects: [], priority: "", labels: [], milestone: "" },
		statuses: ["To Do", "Done"],
		taskTypes: ["Bug", "Feature"],
		projects: ["Web", "API"],
		priorityOptions: [
			{ value: "high", label: "High" },
			{ value: "low", label: "Low" },
		],
		labels: ["zeta", "alpha"],
		milestones: ["Release 1"],
	});
	await new Promise<void>((resolve) => setImmediate(resolve));
	const focused = (screen as unknown as { focused?: Widget }).focused;
	const items = itemContents(focused);
	press(focused as Widget, "escape");
	await result;
	return items;
}

describe("task filter wiring", () => {
	it("exposes configured controls and picker choices, then maps every header filter to canonical filtering", async () => {
		expect(taskFilterHeaderControls([])).not.toContain("project");
		expect(taskFilterHeaderControls(["Web", "API"])).toEqual([
			"search",
			"status",
			"type",
			"project",
			"priority",
			"milestone",
			"labels",
		]);

		const screen = createScreen({ smartCSR: false });
		try {
			expect(await pickerItems(screen, "status")).toEqual(["[ ] To Do", "[ ] Done"]);
			expect(await pickerItems(screen, "type")).toEqual(["[ ] Bug", "[ ] Feature"]);
			expect(await pickerItems(screen, "project")).toEqual(["[ ] Web", "[ ] API"]);
			expect(await pickerItems(screen, "priority")).toEqual(["All", "High", "Low"]);
			expect(await pickerItems(screen, "milestone")).toEqual(["All", "No milestone", "Release 1"]);
			expect(await pickerItems(screen, "labels")).toEqual(["[ ] alpha", "[ ] zeta"]);
		} finally {
			screen.destroy();
		}

		const tasks: Task[] = [
			{
				id: "BACK-1",
				title: "Release matching task",
				status: "To Do",
				type: "Bug",
				project: "Web",
				priority: "high",
				labels: ["backend"],
				milestone: "m-1",
				assignee: [],
				dependencies: [],
				createdDate: "2026-01-01",
			},
			{
				id: "BACK-2",
				title: "Other task",
				status: "Done",
				type: "Feature",
				project: "API",
				priority: "low",
				labels: ["frontend"],
				milestone: "m-2",
				assignee: [],
				dependencies: [],
				createdDate: "2026-01-02",
			},
			{
				id: "BACK-3",
				title: "No milestone task",
				status: "To Do",
				type: "Bug",
				project: "Web",
				priority: "high",
				labels: ["backend"],
				assignee: [],
				dependencies: [],
				createdDate: "2026-01-03",
			},
		];
		const index = createTaskSearchIndex(tasks);
		const resolveMilestoneLabel = (value: string) => (value === "m-1" ? "Release 1" : "Release 2");
		const filter = (filters: Parameters<typeof taskFilterOptions>[0]) =>
			applyTaskFilters(tasks, taskFilterOptions(filters, "any", resolveMilestoneLabel), index).map((task) => task.id);

		expect(
			filter({ search: "release", status: [], taskTypes: [], projects: [], priority: "", labels: [], milestone: "" }),
		).toEqual(["BACK-1"]);
		expect(
			filter({ search: "", status: ["Done"], taskTypes: [], projects: [], priority: "", labels: [], milestone: "" }),
		).toEqual(["BACK-2"]);
		expect(
			filter({ search: "", status: [], taskTypes: ["Feature"], projects: [], priority: "", labels: [], milestone: "" }),
		).toEqual(["BACK-2"]);
		expect(
			filter({ search: "", status: [], taskTypes: [], projects: ["API"], priority: "", labels: [], milestone: "" }),
		).toEqual(["BACK-2"]);
		expect(
			filter({ search: "", status: [], taskTypes: [], projects: [], priority: "low", labels: [], milestone: "" }),
		).toEqual(["BACK-2"]);
		expect(
			filter({
				search: "",
				status: [],
				taskTypes: [],
				projects: [],
				priority: "",
				labels: ["frontend"],
				milestone: "",
			}),
		).toEqual(["BACK-2"]);
		expect(
			filter({ search: "", status: [], taskTypes: [], projects: [], priority: "", labels: [], milestone: "Release 1" }),
		).toEqual(["BACK-1"]);
		expect(
			filter({
				search: "",
				status: [],
				taskTypes: [],
				projects: [],
				priority: "",
				labels: [],
				milestone: NO_MILESTONE_FILTER_VALUE,
			}),
		).toEqual(["BACK-3"]);
	});
});
