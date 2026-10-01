import { describe, expect, it } from "bun:test";
import { BranchTaskLoader } from "../core/task-loader.ts";
import type { GitBranchTip, GitOperations } from "../git/operations.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { BacklogConfig } from "../types/index.ts";

const config: BacklogConfig = {
	projectName: "Loader test",
	statuses: ["To Do", "In Progress", "Done"],
	labels: [],
	milestones: [],
	dateFormat: "YYYY-MM-DD",
	checkActiveBranches: true,
	activeBranchDays: 30,
	remoteOperations: true,
	prefixes: { task: "task" },
};

function taskMarkdown(id: string, title: string): string {
	return serializeTask({
		id,
		title,
		status: "To Do",
		assignee: [],
		createdDate: "2026-08-10",
		labels: [],
		dependencies: [],
		rawContent: "Cached branch task",
	});
}

describe("branch task loading", () => {
	it("deduplicates same-SHA refs and keeps cached results immutable", async () => {
		const commit = "1".repeat(40);
		const path = "backlog/tasks/task-1 - Shared.md";
		const calls = { tree: 0, history: 0, file: 0 };
		const git = {
			listFilesInTree: async () => {
				calls.tree += 1;
				return [path];
			},
			getBranchLastModifiedMap: async () => {
				calls.history += 1;
				return new Map([[path, new Date("2026-08-10T00:00:00Z")]]);
			},
			showFile: async () => {
				calls.file += 1;
				return taskMarkdown("TASK-1", "Shared task");
			},
		} as unknown as GitOperations;
		const loader = new BranchTaskLoader(git);
		const tips: GitBranchTip[] = [
			{ name: "main", commit: "0".repeat(40), current: true },
			{ name: "feature/shared", commit, current: false },
			{ name: "origin/feature/shared", commit, current: false },
		];

		const { entries } = await loader.load(tips, config, [], false);
		const task = entries[0]?.task;
		if (!task) throw new Error("Expected a branch task");
		task.title = "Mutated result";

		expect((await loader.load(tips, config, [], false)).entries.map((entry) => entry.task?.title)).toEqual([
			"Shared task",
			"Shared task",
		]);
		expect(calls).toEqual({ tree: 1, history: 1, file: 1 });
	});

	it("uses the unborn branch name when no ref is marked current", async () => {
		const path = "backlog/tasks/task-1 - Feature.md";
		const loader = new BranchTaskLoader({
			getCurrentBranch: async () => "blank",
			listFilesInTree: async () => [path],
			getBranchLastModifiedMap: async () => new Map([[path, new Date("2026-08-10T00:00:00Z")]]),
			showFile: async () => taskMarkdown("TASK-1", "Feature task"),
		} as unknown as GitOperations);

		const { entries } = await loader.load(
			[{ name: "feature/task", commit: "7".repeat(40), current: false }],
			{ ...config, remoteOperations: false },
			[],
			false,
		);

		expect(entries.map((entry) => entry.branch)).toEqual(["feature/task"]);
		expect(entries.map((entry) => entry.task?.title)).toEqual(["Feature task"]);
	});

	it("does not treat local refs as other branches while HEAD is detached", async () => {
		const loader = new BranchTaskLoader({ getCurrentBranch: async () => "" } as unknown as GitOperations);

		expect(
			(
				await loader.load(
					[{ name: "feature/task", commit: "8".repeat(40), current: false }],
					{ ...config, remoteOperations: false },
					[],
					false,
				)
			).entries,
		).toEqual([]);
	});
});
