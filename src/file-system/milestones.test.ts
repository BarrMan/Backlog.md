import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig } from "./config.ts";
import { MilestoneStore } from "./milestones.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("MilestoneStore", () => {
	it("does not guess between duplicate title matches while preserving exact ID lookup", async () => {
		const root = await mkdtemp(join(tmpdir(), "backlog-milestones-"));
		directories.push(root);
		const active = join(root, "milestones");
		const archived = join(root, "archive");
		await mkdir(active, { recursive: true });
		await Bun.write(join(active, "m-1 - first.md"), '---\nid: m-1\ntitle: "Release"\n---\n');
		await Bun.write(join(active, "m-2 - second.md"), '---\nid: m-2\ntitle: "Release"\n---\n');
		const store = new MilestoneStore({
			activeDirectory: async () => active,
			archiveDirectory: async () => archived,
			ensureDirectory: async () => {},
			withCreateLock: async (operation) => operation(),
		});

		expect(await store.load("Release")).toBeNull();
		expect((await store.load("m-2"))?.title).toBe("Release");
	});
});

describe("filesystem config parsing", () => {
	it("accepts the legacy scalar default assignee without weakening list parsing", () => {
		const config = parseConfig('statuses: ["To Do"]\ndefault_assignee: "@alex"\n', "/tmp/backlog/config.yml");
		expect(config.defaultAssignee).toEqual(["@alex"]);
	});
});
