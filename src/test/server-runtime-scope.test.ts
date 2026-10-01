import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { BrowserServices } from "../server/lifecycle.ts";
import { ProjectScope } from "../server/project-scope.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, retry, safeCleanup, withTimeout } from "./test-utils.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map(safeCleanup));
});

describe("server runtime scope binding", () => {
	it("keeps the original Core canonical symlink target when the link is retargeted", async () => {
		const root = createUniqueTestDir("server-scope-symlink-race");
		directories.push(root);
		const first = join(root, "first");
		const second = join(root, "second");
		const link = join(root, "backlog-link");
		await Promise.all([mkdir(first, { recursive: true }), mkdir(second, { recursive: true })]);
		await symlink(first, link, "dir");
		const initializer = new Core(root);
		await initializeFilesystemTestProject(initializer, "Symlink scope race");
		await Bun.write(
			join(root, "backlog.config.yml"),
			[
				"project_name: Symlink scope race",
				"backlog_directory: backlog-link",
				"statuses: [To Do, Done]",
				"labels: []",
				"milestones: []",
				"date_format: YYYY-MM-DD",
				"remote_operations: false",
				"check_active_branches: false",
			].join("\n"),
		);
		const capturedCore = new Core(root);
		const scope = new ProjectScope(capturedCore);

		await unlink(link);
		await symlink(second, link, "dir");

		expect(scope.requestCore().filesystem.backlogDir).toBe(first);
	});

	it("reconfigures change notifications when an external initializer creates the backlog config", async () => {
		const root = createUniqueTestDir("server-external-init");
		directories.push(root);
		await mkdir(root, { recursive: true });
		const publications: string[] = [];
		let resolveConfigPublished: (() => void) | undefined;
		const configPublished = new Promise<void>((resolve) => {
			resolveConfigPublished = resolve;
		});
		const hub = {
			disconnectAll: () => {},
			publishLoading: () => {},
			publishData: () => publications.push("data"),
			publishConfig: () => {
				publications.push("config");
				resolveConfigPublished?.();
			},
		};
		const services = new BrowserServices(new Core(root), hub as never);
		try {
			await services.initialize();

			const initializer = new Core(root);
			await initializer.filesystem.ensureBacklogStructure();
			await initializer.filesystem.saveConfig({
				projectName: "External initialization",
				statuses: ["To Do", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "YYYY-MM-DD",
				remoteOperations: false,
				checkActiveBranches: false,
			});
			await withTimeout(configPublished, "external initialization config notification", 3_000);
		} finally {
			await services.dispose();
		}
	});

	it("recovers watcher notifications after an external malformed config is repaired", async () => {
		const root = createUniqueTestDir("server-malformed-config-recovery");
		directories.push(root);
		const initializer = new Core(root);
		await initializer.filesystem.ensureBacklogStructure();
		const config = {
			projectName: "Recovery",
			statuses: ["To Do", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
			checkActiveBranches: false,
		};
		await initializer.filesystem.saveConfig(config);
		const publications: string[] = [];
		let resolveReconciliationFailed: (() => void) | undefined;
		const reconciliationFailed = new Promise<void>((resolve) => {
			resolveReconciliationFailed = resolve;
		});
		const hub = {
			disconnectAll: () => {},
			publishLoading: (event: { type: string }) => {
				if (event.type === "error") resolveReconciliationFailed?.();
			},
			publishData: () => publications.push("data"),
			publishConfig: () => publications.push("config"),
		};
		const services = new BrowserServices(new Core(root), hub as never);
		await services.initialize();

		await Bun.write(initializer.filesystem.configFilePath, "statuses: [\n");
		await withTimeout(reconciliationFailed, "malformed config reconciliation", 3_000);
		publications.splice(0);
		await initializer.filesystem.saveConfig(config);
		await retry(async () => {
			if (!publications.includes("config")) throw new Error("repaired config did not restore notifications");
		});
		await services.dispose();
	});
});
