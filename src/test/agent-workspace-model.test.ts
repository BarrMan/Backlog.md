import { describe, expect, it } from "bun:test";
import type { Task } from "../types/index.ts";
import {
	buildWorkspaceEntries,
	changedTaskFields,
	createWorkspaceDraft,
	parseAcceptanceCriteria,
	taskWithWorkspaceDraft,
	terminalInput,
} from "../ui/agent-workspace-model.ts";

const task = (id: string, status: string): Task => ({
	id,
	title: id,
	status,
	assignee: [],
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
});

describe("agent workspace model", () => {
	it("keeps task editing state independent and parses checkbox criteria", () => {
		const first = createWorkspaceDraft({ ...task("BACK-1", "To Do"), description: "one" });
		const second = createWorkspaceDraft({ ...task("BACK-2", "To Do"), description: "two" });
		first.values.description = "draft one";
		expect(second.values.description).toBe("two");
		expect(parseAcceptanceCriteria("[x] shipped\n[ ] tested\nplain")).toEqual([
			{ text: "shipped", checked: true },
			{ text: "tested", checked: false },
			{ text: "plain", checked: false },
		]);
	});

	it("renders configured empty statuses, collapses groups, and routes terminal keys", () => {
		expect(
			buildWorkspaceEntries([task("BACK-1", "To Do")], ["To Do", "In Progress", "Done"], "All", new Set()).map(
				(entry) => entry.label,
			),
		).toEqual(["- To Do (1)", "  BACK-1  BACK-1", "- In Progress (0)", "- Done (0)"]);
		expect(
			buildWorkspaceEntries([task("BACK-1", "To Do")], ["To Do"], "All", new Set(["To Do"])).map(
				(entry) => entry.label,
			),
		).toEqual(["+ To Do (1)"]);
		expect(terminalInput("", { name: "up" })).toBe("\u001b[A");
		expect(terminalInput("", { name: "escape", sequence: "\u001b" })).toBe("\u001b");
	});

	it("only saves fields changed against their original task revision", () => {
		const original = { ...task("BACK-1", "To Do"), description: "old" };
		const draft = createWorkspaceDraft(original);
		draft.values.description = "mine";
		expect(changedTaskFields(draft, original)).toEqual({ description: "mine" });
		expect(() => changedTaskFields(draft, { ...original, description: "theirs" })).toThrow("description changed");
	});

	it("renders workspace drafts without mutating the selected task", () => {
		const original = { ...task("BACK-1", "To Do"), title: "Saved", description: "saved" };
		const draft = createWorkspaceDraft(original);
		draft.values.title = "Draft";
		draft.values.description = "draft";
		draft.values.acceptanceCriteria = "[x] visible";
		const rendered = taskWithWorkspaceDraft(original, draft);
		expect(rendered).toMatchObject({ title: "Draft", description: "draft" });
		expect(rendered.acceptanceCriteriaItems).toEqual([{ text: "visible", checked: true, index: 1 }]);
		expect(original.title).toBe("Saved");
	});
});
