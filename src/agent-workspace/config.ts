import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";
import type { Core } from "../core/backlog.ts";
import type { AgentConfigScope, AgentConfiguration, AgentPreset, ResolvedAgentConfiguration } from "./types.ts";

const BOOTSTRAP_TYPES = new Set<AgentPreset["bootstrap"]>([
	"opencode",
	"claude",
	"codex",
	"gemini",
	"antigravity",
	"prompt",
]);
const SAFE_PRESET_NAME = /^(?!__proto__$|prototype$|constructor$)[A-Za-z_][A-Za-z0-9_-]*$/;
const POSIX_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const BUILT_IN_CONFIGURATION: AgentConfiguration = {
	selectedPreset: "opencode",
	presets: {
		opencode: { command: "opencode", env: {}, prepare: "", worktree: false, bootstrap: "opencode" },
		claude: { command: "claude", env: {}, prepare: "", worktree: false, bootstrap: "claude" },
		codex: { command: "codex", env: {}, prepare: "", worktree: false, bootstrap: "codex" },
		gemini: { command: "gemini", env: {}, prepare: "", worktree: false, bootstrap: "gemini" },
		agy: { command: "agy", env: {}, prepare: "", worktree: false, bootstrap: "antigravity" },
	},
};

function clone<T>(value: T): T {
	return structuredClone(value);
}

function rootConfigurationPath(): string {
	const configHome = process.env.XDG_CONFIG_HOME || join(process.env.HOME || homedir(), ".config");
	return join(configHome, "backlog", "agents.json");
}

function projectConfigurationPath(core: Core): string {
	return join(core.filesystem.backlogDir, "agents.json");
}

function requireTaskId(scope: AgentConfigScope, taskId: string | undefined): string {
	if (scope === "card" && !taskId) throw new Error("A task ID is required for card agent configuration.");
	return taskId ?? "";
}

function hasNul(value: string): boolean {
	return value.includes("\0");
}

function assertAgentConfiguration(value: unknown, label = "Agent configuration"): asserts value is AgentConfiguration {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
	const config = value as Partial<AgentConfiguration>;
	if (typeof config.selectedPreset !== "string" || !SAFE_PRESET_NAME.test(config.selectedPreset)) {
		throw new Error(`${label}.selectedPreset must be a non-empty string.`);
	}
	if (!config.presets || typeof config.presets !== "object" || Array.isArray(config.presets)) {
		throw new Error(`${label}.presets must be an object.`);
	}
	if (!Object.hasOwn(config.presets, config.selectedPreset)) {
		throw new Error(`${label}.selectedPreset must name a configured preset.`);
	}

	for (const [name, preset] of Object.entries(config.presets)) {
		if (!SAFE_PRESET_NAME.test(name) || !preset || typeof preset !== "object" || Array.isArray(preset)) {
			throw new Error(`${label}.presets entries must be named objects.`);
		}
		const candidate = preset as Partial<AgentPreset>;
		if (typeof candidate.command !== "string" || !candidate.command.trim() || hasNul(candidate.command)) {
			throw new Error(`${label}.presets.${name}.command must be a non-empty string.`);
		}
		if (typeof candidate.prepare !== "string" || hasNul(candidate.prepare)) {
			throw new Error(`${label}.presets.${name}.prepare must be a string.`);
		}
		if (typeof candidate.worktree !== "boolean") {
			throw new Error(`${label}.presets.${name}.worktree must be a boolean.`);
		}
		if (!BOOTSTRAP_TYPES.has(candidate.bootstrap as AgentPreset["bootstrap"])) {
			throw new Error(`${label}.presets.${name}.bootstrap is invalid.`);
		}
		if (!candidate.env || typeof candidate.env !== "object" || Array.isArray(candidate.env)) {
			throw new Error(`${label}.presets.${name}.env must be an object of strings.`);
		}
		for (const [key, envValue] of Object.entries(candidate.env)) {
			if (!POSIX_ENV_NAME.test(key) || typeof envValue !== "string" || hasNul(envValue)) {
				throw new Error(`${label}.presets.${name}.env must be an object of strings.`);
			}
		}
	}
}

async function readConfiguration(path: string): Promise<AgentConfiguration | null> {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch (error) {
		throw new Error(`Invalid agent configuration at ${path}: ${(error as Error).message}`);
	}
	assertAgentConfiguration(parsed, `Invalid agent configuration at ${path}`);
	return clone(parsed);
}

async function withConfigurationLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
	await mkdir(dirname(path), { recursive: true });
	const release = await lockfile.lock(path, {
		realpath: false,
		retries: { retries: 4, minTimeout: 25, maxTimeout: 200 },
	});
	try {
		return await operation();
	} finally {
		await release();
	}
}

async function writeConfiguration(path: string, config: AgentConfiguration): Promise<void> {
	let temporaryPath: string | undefined;
	try {
		temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
		await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
		await rename(temporaryPath, path);
	} finally {
		if (temporaryPath) await unlink(temporaryPath).catch(() => undefined);
	}
}

async function rootOrBuiltIn(core: Core): Promise<ResolvedAgentConfiguration> {
	const config = await loadAgentConfiguration(core, "root");
	return { scope: "root", config: config ?? clone(BUILT_IN_CONFIGURATION) };
}

async function projectOrParent(core: Core): Promise<ResolvedAgentConfiguration> {
	const config = await loadAgentConfiguration(core, "project");
	return config ? { scope: "project", config } : await rootOrBuiltIn(core);
}

export async function loadAgentConfiguration(
	core: Core,
	scope: AgentConfigScope,
	taskId?: string,
): Promise<AgentConfiguration | null> {
	if (scope === "root") return await readConfiguration(rootConfigurationPath());
	if (scope === "project") return await readConfiguration(projectConfigurationPath(core));

	const task = await core.filesystem.loadTask(requireTaskId(scope, taskId));
	if (!task) throw new Error(`Task not found: ${taskId}`);
	if (task.agentConfiguration === undefined) return null;
	assertAgentConfiguration(task.agentConfiguration, `Invalid agent configuration on task ${task.id}`);
	return clone(task.agentConfiguration);
}

export async function resolveAgentConfiguration(core: Core, taskId?: string): Promise<ResolvedAgentConfiguration> {
	if (taskId) {
		const card = await loadAgentConfiguration(core, "card", taskId);
		if (card) return { scope: "card", config: card };
	}
	return await projectOrParent(core);
}

export async function initializeAgentConfiguration(
	core: Core,
	scope: AgentConfigScope,
	taskId?: string,
): Promise<AgentConfiguration> {
	return await updateAgentConfigurationInternal(core, scope, (config) => config, taskId, true);
}

/** Returns the exact scoped configuration, or a parent copy without persisting it. */
export async function getEditableAgentConfiguration(
	core: Core,
	scope: AgentConfigScope,
	taskId?: string,
): Promise<AgentConfiguration> {
	const existing = await loadAgentConfiguration(core, scope, taskId);
	if (existing) return existing;
	const parent =
		scope === "root"
			? { scope: "root" as const, config: clone(BUILT_IN_CONFIGURATION) }
			: scope === "project"
				? await rootOrBuiltIn(core)
				: await projectOrParent(core);
	return clone(parent.config);
}

async function updateAgentConfigurationInternal(
	core: Core,
	scope: AgentConfigScope,
	updater: (config: AgentConfiguration) => AgentConfiguration,
	taskId: string | undefined,
	onlyIfAbsent: boolean,
): Promise<AgentConfiguration> {
	if (scope !== "card") {
		const path = scope === "root" ? rootConfigurationPath() : projectConfigurationPath(core);
		return await withConfigurationLock(path, async () => {
			const existing = await readConfiguration(path);
			if (existing && onlyIfAbsent) return existing;
			const base = existing ?? (await getEditableAgentConfiguration(core, scope, taskId));
			const next = clone(updater(clone(base)));
			assertAgentConfiguration(next);
			await writeConfiguration(path, next);
			return next;
		});
	}

	const id = requireTaskId(scope, taskId);
	const task = await core.filesystem.loadTask(id);
	if (!task) throw new Error(`Task not found: ${id}`);
	return await core.filesystem.withTaskLock(task, async () => {
		const current = await core.filesystem.loadTask(id);
		if (!current) throw new Error(`Task not found: ${id}`);
		const existing = current.agentConfiguration;
		if (existing !== undefined) assertAgentConfiguration(existing, `Invalid agent configuration on task ${current.id}`);
		if (existing && onlyIfAbsent) return clone(existing);
		const base = existing ?? (await getEditableAgentConfiguration(core, scope, id));
		const next = clone(updater(clone(base)));
		assertAgentConfiguration(next);
		current.agentConfiguration = next;
		await core.updateTask(current);
		return next;
	});
}

export async function updateAgentConfiguration(
	core: Core,
	scope: AgentConfigScope,
	updater: (config: AgentConfiguration) => AgentConfiguration,
	taskId?: string,
): Promise<AgentConfiguration> {
	return await updateAgentConfigurationInternal(core, scope, updater, taskId, false);
}

export async function upsertAgentConfiguration(
	core: Core,
	scope: AgentConfigScope,
	config: AgentConfiguration,
	taskId?: string,
): Promise<void> {
	assertAgentConfiguration(config);
	await updateAgentConfiguration(core, scope, () => clone(config), taskId);
}
