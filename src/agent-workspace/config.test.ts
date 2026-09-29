import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Core } from "../core/backlog.ts";
import { parseTask } from "../markdown/parser.ts";
import { serializeTask } from "../markdown/serializer.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "../test/test-utils.ts";
import {
	getEditableAgentConfiguration,
	initializeAgentConfiguration,
	loadAgentConfiguration,
	resolveAgentConfiguration,
	updateAgentConfiguration,
	upsertAgentConfiguration,
} from "./config.ts";
import type { AgentConfiguration } from "./types.ts";

let testDir: string;
let originalXdgConfigHome: string | undefined;
let core: Core;

function configuration(selectedPreset = "custom"): AgentConfiguration {
	return {
		selectedPreset,
		presets: {
			custom: {
				command: "custom-agent --run",
				env: { TOKEN: "secret" },
				prepare: "bun install",
				worktree: false,
				bootstrap: "prompt",
			},
		},
	};
}

beforeEach(async () => {
	testDir = createUniqueTestDir("agent-workspace-config");
	originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
	process.env.XDG_CONFIG_HOME = join(testDir, "user-config");
	core = new Core(testDir);
	await core.filesystem.ensureBacklogStructure();
	await initializeTestProject(core, "Agent workspace config");
});

afterEach(async () => {
	if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
	else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
	await safeCleanup(testDir);
});

describe("agent workspace configuration", () => {
	it("uses the complete built-in preset set when no override exists", async () => {
		const resolved = await resolveAgentConfiguration(core);
		expect(resolved.scope).toBe("root");
		expect(resolved.config.selectedPreset).toBe("opencode");
		expect(Object.keys(resolved.config.presets)).toEqual(["opencode", "claude", "codex", "gemini", "agy"]);
		expect(resolved.config.presets.agy).toEqual({
			command: "agy",
			env: {},
			prepare: "",
			worktree: false,
			bootstrap: "antigravity",
		});
	});

	it("previews an editable parent configuration without writing an override", async () => {
		const preview = await getEditableAgentConfiguration(core, "project");
		expect(preview.selectedPreset).toBe("opencode");
		expect(await loadAgentConfiguration(core, "project")).toBeNull();
	});

	it("serializes concurrent functional updates without losing presets", async () => {
		const addPreset = async (name: string) =>
			await updateAgentConfiguration(core, "root", (config) => {
				const source = config.presets.opencode;
				if (!source) throw new Error("OpenCode preset missing");
				return {
					...config,
					presets: {
						...config.presets,
						[name]: { ...source, command: name },
					},
				};
			});

		await Promise.all([addPreset("first"), addPreset("second")]);
		const saved = await loadAgentConfiguration(core, "root");
		expect(saved?.presets.first?.command).toBe("first");
		expect(saved?.presets.second?.command).toBe("second");
	});

	it("falls back by complete scope without merging fields", async () => {
		await upsertAgentConfiguration(core, "root", configuration());
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "project",
			presets: {
				project: {
					command: "project-agent",
					env: {},
					prepare: "",
					worktree: true,
					bootstrap: "prompt",
				},
			},
		});

		const resolved = await resolveAgentConfiguration(core);
		expect(resolved.scope).toBe("project");
		expect(resolved.config).toEqual({
			selectedPreset: "project",
			presets: {
				project: { command: "project-agent", env: {}, prepare: "", worktree: true, bootstrap: "prompt" },
			},
		});
	});

	it("copies the effective parent once and keeps overrides isolated", async () => {
		await upsertAgentConfiguration(core, "root", configuration());
		const project = await initializeAgentConfiguration(core, "project");
		const projectPreset = project.presets.custom;
		if (!projectPreset) throw new Error("Custom preset missing");
		projectPreset.command = "changed-project-agent";
		await upsertAgentConfiguration(core, "project", project);

		const root = await loadAgentConfiguration(core, "root");
		expect(root?.presets.custom?.command).toBe("custom-agent --run");

		const { task } = await core.createTaskFromInput(
			{ title: "Preserve card body", description: "Original content" },
			false,
		);
		const card = await initializeAgentConfiguration(core, "card", task.id);
		const cardPreset = card.presets.custom;
		if (!cardPreset) throw new Error("Custom preset missing");
		expect(cardPreset.command).toBe("changed-project-agent");
		cardPreset.env.TOKEN = "card-only";
		await upsertAgentConfiguration(core, "card", card, task.id);

		const reread = await initializeAgentConfiguration(core, "card", task.id);
		expect(reread.presets.custom?.env.TOKEN).toBe("card-only");
		expect((await loadAgentConfiguration(core, "project"))?.presets.custom?.env.TOKEN).toBe("secret");
	});

	it("round-trips card configuration without changing task content", async () => {
		const { task } = await core.createTaskFromInput(
			{ title: "Card metadata", description: "Keep this paragraph intact." },
			false,
		);
		await upsertAgentConfiguration(core, "card", configuration(), task.id);

		const content = await readFile(task.filePath as string, "utf8");
		expect(content).toContain("Keep this paragraph intact.");
		expect(parseTask(content).agentConfiguration).toEqual(configuration());
		expect((await resolveAgentConfiguration(core, task.id)).scope).toBe("card");
		expect(await loadAgentConfiguration(core, "card", task.id.toLowerCase())).toEqual(configuration());
	});

	it("reloads a saved card preset with an empty environment", async () => {
		const { task } = await core.createTaskFromInput({ title: "Card preset" }, false);
		await updateAgentConfiguration(
			core,
			"card",
			(config) => {
				const opencode = config.presets.opencode;
				if (!opencode) throw new Error("OpenCode preset missing");
				return {
					...config,
					selectedPreset: "opencode",
					presets: {
						...config.presets,
						opencode: { ...opencode, command: "opencode {prompt}", env: {} },
					},
				};
			},
			task.id,
		);

		expect((await loadAgentConfiguration(core, "card", task.id))?.presets.opencode?.env).toEqual({});
	});

	it("rejects unsafe names, invalid environment, and malformed stored configuration", async () => {
		await expect(
			upsertAgentConfiguration(core, "root", {
				selectedPreset: "missing",
				presets: {},
			} as AgentConfiguration),
		).rejects.toThrow("selectedPreset must name a configured preset");
		await expect(
			upsertAgentConfiguration(core, "root", {
				...configuration(),
				presets: {
					custom: { ...configuration().presets.custom, worktree: "yes" },
				},
			} as unknown as AgentConfiguration),
		).rejects.toThrow("worktree must be a boolean");
		await expect(
			upsertAgentConfiguration(core, "root", {
				selectedPreset: "toString",
				presets: {},
			} as AgentConfiguration),
		).rejects.toThrow("selectedPreset must name a configured preset");
		await expect(
			upsertAgentConfiguration(core, "root", {
				...configuration(),
				presets: {
					custom: { ...configuration().presets.custom, env: { "NOT-VALID": "value" } },
				},
			} as unknown as AgentConfiguration),
		).rejects.toThrow("env must be an object of strings");

		const rootPath = join(process.env.XDG_CONFIG_HOME as string, "backlog", "agents.json");
		await mkdir(dirname(rootPath), { recursive: true });
		await writeFile(rootPath, "{ invalid json", "utf8");
		await expect(loadAgentConfiguration(core, "root")).rejects.toThrow("Invalid agent configuration");
	});

	it("fails closed for malformed and ambiguous card identities", async () => {
		const { task } = await core.createTaskFromInput({ title: "Card configuration" }, false);
		const content = await readFile(task.filePath as string, "utf8");
		await writeFile(task.filePath as string, content.replace("---\n", "---\nagentConfiguration: false\n"), "utf8");
		await expect(loadAgentConfiguration(core, "card", task.id)).rejects.toThrow("must be an object");
		await writeFile(task.filePath as string, content.replace("---\n", "---\nagentConfiguration: null\n"), "utf8");
		await expect(loadAgentConfiguration(core, "card", task.id)).rejects.toThrow("must be an object");

		await writeFile(
			join(core.filesystem.tasksDir, "task-01 - Duplicate.md"),
			serializeTask({ ...task, id: "TASK-01", title: "Duplicate" }),
			"utf8",
		);
		await expect(loadAgentConfiguration(core, "card", task.id)).rejects.toThrow("ambiguous");
	});

	it("preserves card configuration through ordinary task updates", async () => {
		const { task } = await core.createTaskFromInput({ title: "Metadata persistence" }, false);
		await upsertAgentConfiguration(core, "card", configuration(), task.id);
		await core.updateTaskFromInput(task.id, { description: "Updated description", status: "In Progress" }, false);
		expect((await loadAgentConfiguration(core, "card", task.id))?.selectedPreset).toBe("custom");
	});
});
