import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { ProjectScope } from "../server/project-scope.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map(safeCleanup));
});

describe("project selection binding", () => {
	it("uses the exact frozen Core binding after a configured symlink is retargeted", async () => {
		const root = createUniqueTestDir("project-selection-binding");
		directories.push(root);
		const first = join(root, "first");
		const second = join(root, "second");
		const link = join(root, "backlog-link");
		await Promise.all([mkdir(first, { recursive: true }), mkdir(second, { recursive: true })]);
		await symlink(first, link, "dir");
		await Bun.write(join(root, "backlog.config.yml"), "projectName: Binding\nbacklogDirectory: backlog-link\n");

		const core = new Core(root);
		const scope = new ProjectScope(core);
		await unlink(link);
		await symlink(second, link, "dir");

		expect(scope.backlog).toBe(first);
		expect(scope.requestCore()).toBe(core);
		expect(scope.requestCore().filesystem.backlogDir).toBe(scope.backlog);
	});

	it("rejects a token bound to a previous config target", async () => {
		const root = createUniqueTestDir("project-selection-config-binding");
		directories.push(root);
		const backlog = join(root, "backlog");
		const first = join(root, "first.yml");
		const second = join(root, "second.yml");
		const config = join(root, "backlog.config.yml");
		await mkdir(backlog, { recursive: true });
		await Promise.all([
			Bun.write(first, "projectName: First\nbacklogDirectory: backlog\n"),
			Bun.write(second, "projectName: Second\nbacklogDirectory: backlog\n"),
		]);
		await symlink(first, config);

		const original = new ProjectScope(new Core(root));
		await unlink(config);
		await symlink(second, config);
		const current = new ProjectScope(new Core(root));

		expect(current.root).toBe(original.root);
		expect(current.backlog).toBe(original.backlog);
		expect(current.config).not.toBe(original.config);
		const set: { status?: number | string } = {};
		expect(current.validate(original.token, set)?.code).toBe("PROJECT_SCOPE_MISMATCH");
		expect(set.status).toBe(409);
	});
});
