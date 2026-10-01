import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { ContentRepository } from "../file-system/content-repository.ts";
import {
	FrontmatterSchemaError,
	parseDecision,
	parseMilestone,
	parseTask,
	UnsupportedRecordFrontmatterSchemaError,
	UnsupportedTaskFrontmatterSchemaError,
} from "../markdown/parser.ts";
import { serializeDecision, serializeMilestone, serializeTask } from "../markdown/serializer.ts";
import type { Decision, Milestone, Task } from "../types/index.ts";

const task: Task = {
	id: "TASK-1",
	title: "Structured frontmatter",
	status: "In Progress",
	assignee: ["@alex"],
	createdDate: "2026-09-30 12:00",
	labels: ["storage"],
	dependencies: [],
	description: "A readable\nmultiline description.",
	implementationPlan: "1. Store fields in YAML.",
	implementationNotes: "The body is opaque.",
	finalSummary: "Ready for review.",
	acceptanceCriteriaItems: [{ index: 1, text: "Round trips", checked: false }],
	definitionOfDoneItems: [{ index: 1, text: "Tests pass", checked: true }],
	comments: [{ index: 1, body: "Looks good.", createdDate: "2026-09-30 12:30", author: "@sam" }],
	rawContent:
		"## Research\n\n- [ ] This checkbox is free-form body text.\n\n<!-- SECTION:PLAN:BEGIN -->\nLiteral marker.",
};

describe("task frontmatter storage", () => {
	it("round-trips every structured task field without interpreting the body", () => {
		const content = serializeTask(task);
		expect(content).toContain("task_schema_version: 2");
		expect(content).toContain("description: |-");
		expect(parseTask(content)).toMatchObject(task);
	});

	it("preserves checklist indices and rejects malformed structured values", () => {
		const content = serializeTask({
			...task,
			acceptanceCriteriaItems: [{ index: 4, text: "Keep its identity", checked: true }],
		});
		expect(parseTask(content).acceptanceCriteriaItems).toEqual([
			{ index: 4, text: "Keep its identity", checked: true },
		]);
		expect(() => parseTask(content.replace("checked: true", 'checked: "false"'))).toThrow(FrontmatterSchemaError);
		expect(() =>
			parseTask(
				content.replace(
					/acceptance_criteria:[\s\S]*?definition_of_done:/,
					"acceptance_criteria: invalid\ndefinition_of_done:",
				),
			),
		).toThrow(FrontmatterSchemaError);
	});

	it("retains opaque body whitespace and frontmatter-looking body text", () => {
		const rawContent = "\n---\ncustom: body text\n---\n  Free-form body.  \n\n";
		expect(parseTask(serializeTask({ ...task, rawContent })).rawContent).toBe(rawContent);
	});

	it("rejects unsupported schema versions without treating records as legacy", () => {
		expect(() => parseTask(serializeTask(task).replace("task_schema_version: 2", "task_schema_version: 9"))).toThrow(
			UnsupportedTaskFrontmatterSchemaError,
		);
		const decision = serializeDecision({
			id: "decision-1",
			title: "Choose",
			date: "2026-09-30",
			status: "proposed",
			context: "",
			decision: "",
			consequences: "",
			rawContent: "",
		});
		expect(() => parseDecision(decision.replace("decision_schema_version: 1", "decision_schema_version: 9"))).toThrow(
			UnsupportedRecordFrontmatterSchemaError,
		);
	});

	it("round-trips opaque record bodies and readable multiline frontmatter", () => {
		const decision: Decision = {
			id: "decision-1",
			title: "Choose storage",
			date: "2026-09-30 12:00",
			status: "accepted",
			context: "First line\nSecond line",
			decision: "Use YAML.",
			consequences: "No body parsing.",
			rawContent: "## Context\n\nThis heading is opaque.",
		};
		const milestone: Milestone = {
			id: "m-1",
			title: "Release",
			description: "First line\nSecond line",
			rawContent: "## Description\n\nOpaque.",
		};
		expect(parseDecision(serializeDecision(decision))).toMatchObject(decision);
		expect(parseMilestone(serializeMilestone(milestone))).toMatchObject(milestone);
	});

	it("rejects invalid YAML field types rather than repairing them", () => {
		expect(() => parseDecision("---\ndecision_schema_version: 1\nid: decision-1\ncontext: [invalid]\n---\n")).toThrow(
			FrontmatterSchemaError,
		);
		expect(() =>
			parseMilestone("---\nmilestone_schema_version: 1\nid: m-1\ndescription: {invalid: value}\n---\n"),
		).toThrow(FrontmatterSchemaError);
	});

	it("preserves unknown decision metadata on an ordinary save", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-decision-frontmatter-"));
		const decisionsDir = join(root, "decisions");
		const repository = new ContentRepository({
			decisionsDirectory: async () => decisionsDir,
			documentsDirectory: async () => join(root, "documents"),
			ensureDirectory: async (directory) => {
				await mkdir(directory, { recursive: true });
			},
		});
		const decision: Decision = {
			id: "decision-1",
			title: "Choose",
			date: "2026-09-30",
			status: "proposed",
			context: "Context",
			decision: "Decision",
			consequences: "Consequences",
			rawContent: "",
		};
		try {
			await mkdir(decisionsDir);
			const path = join(decisionsDir, "decision-1 - Choose.md");
			await writeFile(path, serializeDecision(decision, { custom_owner: "platform" }));
			await repository.saveDecision({ ...decision, status: "accepted" });
			expect(await readFile(path, "utf8")).toContain("custom_owner: platform");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("replaces decision custom metadata with submitted frontmatter", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-decision-content-"));
		const core = new Core(root);
		const decision: Decision = {
			id: "decision-1",
			title: "Choose",
			date: "2026-09-30",
			status: "proposed",
			context: "Context",
			decision: "Decision",
			consequences: "Consequences",
			rawContent: "",
		};
		try {
			await core.filesystem.ensureBacklogStructure();
			await core.createDecision(decision, false);
			await core.filesystem.saveDecision(decision, { stale_metadata: "discarded" });
			await core.updateDecisionFromContent(
				"decision-1",
				serializeDecision(
					{ ...decision, status: "accepted", rawContent: "## Notes\n\nOpaque body." },
					{ submitted_metadata: "kept" },
				),
				false,
			);
			const saved = await readFile(join(core.filesystem.decisionsDir, "decision-1 - Choose.md"), "utf8");
			expect(saved).toContain("submitted_metadata: kept");
			expect(saved).not.toContain("stale_metadata:");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
