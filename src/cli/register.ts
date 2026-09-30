#!/usr/bin/env node

import * as clack from "@clack/prompts";
import { Command } from "commander";
import { registerAgentWorkspaceCommands } from "../commands/agent-workspace.ts";
import { registerCleanupCommand } from "../commands/cleanup.ts";
import { registerCompletionCommand } from "../commands/completion.ts";
import { registerConfigCommand } from "../commands/config-command-actions.ts";
import { registerContentCommands } from "../commands/content-commands.ts";
import { registerDoctorCommand } from "../commands/doctor.ts";
import { addHelpSchema } from "../commands/help-schema.ts";
import { registerInitCommand } from "../commands/init.ts";
import { registerInstructionsCommand } from "../commands/instructions.ts";
import { registerMcpCommand } from "../commands/mcp.ts";
import { loadInitializedProject } from "../commands/project-command.ts";
import { registerBoardCommands, registerBrowserOverviewCommands } from "../commands/project-view-commands.ts";
import { registerSearchCommand } from "../commands/search.ts";
import {
	normalizeCliPriority,
	normalizeCliProjects,
	normalizeCliStatusList,
	normalizeCliTaskTypes,
} from "../commands/task-filter-normalizers.ts";
import { findLocalDuplicateTaskIds } from "../core/duplicate-task-repair.ts";
import { isConfigValueError } from "../file-system/operations.ts";
import { type AgentInstructionFile, addAgentInstructions, Core } from "../index.ts";
import { formatDuplicateTaskIdWarning } from "../utils/duplicate-detection.ts";
import type { ReadOutputOptions } from "../utils/read-output-mode.ts";
import { getVersion } from "../utils/version.ts";
import { registerDraftCommands } from "./features/drafts/register.ts";
import { registerMilestoneCommands } from "./features/milestones/register.ts";
import {
	type CliReadOutput,
	isPlainRequested as isRuntimePlainRequested,
	resolveListOutput as resolveRuntimeListOutput,
} from "./features/read-output.ts";
import {
	formatTaskEditError,
	printMissingRequiredArgument,
	resolveCliMilestoneInput,
	TASK_SORT_FIELD_LIST,
	TASK_SORT_FIELDS,
} from "./features/tasks/policies.ts";
import { registerTaskCommands } from "./features/tasks/register.ts";
import { CliRuntime } from "./runtime.ts";

function reportCommandFailure(summary: string, error: unknown): void {
	if (isConfigValueError(error)) console.error(error.message);
	else console.error(summary, error);
	process.exitCode = 1;
}

const runtime = new CliRuntime();
const hasInteractiveTTY = runtime.hasInteractiveTTY;
const shouldAutoPlain = !hasInteractiveTTY;
const readOutput: CliReadOutput = { hasInteractiveTTY, plainFlagInArgv: process.argv.includes("--plain") };
const originalBunOptions = process.env.BUN_OPTIONS;
if (originalBunOptions) delete process.env.BUN_OPTIONS;
const version = await getVersion();

async function requireRuntimeCwd(): Promise<string> {
	return runtime.cwd();
}

async function requireProjectRoot(): Promise<string> {
	return runtime.projectRoot();
}

function isPlainRequested(options?: { plain?: boolean }): boolean {
	return isRuntimePlainRequested(options, readOutput);
}

function resolveListOutput(options: ReadOutputOptions, command: Command) {
	return resolveRuntimeListOutput(options, command, readOutput);
}

if (process.platform === "win32") {
	const term = process.env.TERM;
	if (!term || /^(xterm|dumb|ansi|vt100)$/i.test(term)) process.env.TERM = "xterm-256color";
}

try {
	let rawArgs = process.argv.slice(2);
	if (rawArgs.length > 0) {
		const first = rawArgs[0];
		if (
			typeof first === "string" &&
			/node_modules[\\/]+backlog\.md-(darwin|linux|windows)-[^\\/]+[\\/]+backlog(\.exe)?$/.test(first)
		)
			rawArgs = rawArgs.slice(1);
	}
	const wantsHelp = rawArgs.includes("-h") || rawArgs.includes("--help");
	const wantsVersion = rawArgs.includes("-v") || rawArgs.includes("--version");
	if ((rawArgs.length === 0 || (rawArgs.length === 1 && rawArgs[0] === "--plain")) && !wantsHelp && !wantsVersion) {
		let initialized = false;
		try {
			const root = await runtime.findProjectRoot();
			initialized = Boolean(root && (await new Core(root).filesystem.loadConfig()));
		} catch (error) {
			if (isConfigValueError(error)) {
				console.error(error.message);
				process.exit(1);
			}
		}
		const { printRootEntry } = await import("../ui/root-entry.ts");
		await printRootEntry({ version, initialized, ...(rawArgs.includes("--plain") ? { color: false } : {}) });
		process.exit(0);
	}
} catch {
	// Fall through to Commander parsing when root entry inspection fails.
}

function getMcpStartCwdOverrideFromArgv(argv = process.argv): string | undefined {
	const args = argv.slice(2);
	const mcpIndex = args.indexOf("mcp");
	if (mcpIndex < 0 || args[mcpIndex + 1] !== "start") return undefined;
	for (let index = mcpIndex + 2; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--cwd") return args[index + 1]?.trim() || undefined;
		if (arg?.startsWith("--cwd=")) return arg.slice("--cwd=".length).trim() || undefined;
	}
	return undefined;
}

const shouldRunMigration =
	!process.argv.includes("init") &&
	!process.argv.includes("--help") &&
	!process.argv.includes("-h") &&
	!process.argv.includes("--version") &&
	!process.argv.includes("-v") &&
	process.argv.length > 2;
if (shouldRunMigration)
	try {
		const root = await runtime.findProjectRoot(getMcpStartCwdOverrideFromArgv());
		if (root) {
			const core = new Core(root);
			if (await core.filesystem.loadConfig()) await core.ensureConfigMigrated();
		}
	} catch {
		// A command will report initialization and configuration errors through its normal path.
	}

const program = new Command();
program
	.name("backlog")
	.description("Backlog.md - Project management CLI")
	.version(version, "-v, --version", "display version number")
	.showSuggestionAfterError()
	.showHelpAfterError("Run with --help to see accepted fields and examples.");
registerInitCommand(program, { requireRuntimeCwd, hasInteractiveTTY, reportCommandFailure });
registerTaskCommands(program, { runtime, readOutput });
registerSearchCommand(program, {
	requireProjectRoot,
	resolveListOutput,
	printDuplicateIntegrityWarning: async (core) => {
		const groups = await findLocalDuplicateTaskIds(core);
		if (groups.length === 0) return false;
		console.error(formatDuplicateTaskIdWarning(groups));
		process.exitCode = 1;
		return true;
	},
	normalizeStatusList: normalizeCliStatusList,
	normalizePriority: normalizeCliPriority,
	normalizeTaskTypes: normalizeCliTaskTypes,
	normalizeProjects: normalizeCliProjects,
});
const milestoneRuntime = { createCore: async () => new Core(await requireProjectRoot()), resolveListOutput };
registerDraftCommands(program, {
	requireProjectRoot,
	resolveListOutput,
	isPlainRequested,
	shouldAutoPlain,
	edit: {
		createCore: async () => new Core(await requireProjectRoot()),
		hasInteractiveTTY,
		isPlainRequested,
		printMissingRequiredArgument,
		formatError: formatTaskEditError,
		resolveMilestone: resolveCliMilestoneInput,
	},
	taskSortFields: TASK_SORT_FIELDS,
	taskSortFieldList: TASK_SORT_FIELD_LIST,
});
registerMilestoneCommands(program, milestoneRuntime);
registerBoardCommands(program, {
	createCore: async () => new Core(await requireProjectRoot()),
	requireProjectRoot,
	hasInteractiveTTY,
	version,
	reportFailure: reportCommandFailure,
});
registerContentCommands(program, {
	createCore: async () => new Core(await requireProjectRoot()),
	isPlainRequested,
	shouldAutoPlain,
	resolveListOutput,
});

const agentsCmd = addHelpSchema(program.command("agents"), {
	reads: "Project config and existing agent instruction files when updating",
	required: [],
	optional: [
		{
			name: "--update-instructions",
			type: "Boolean",
			description: "Interactively select instruction files and refresh the short Backlog.md CLI nudge",
		},
	],
	writes:
		"Creates or updates the managed Backlog.md CLI nudge in selected instruction files; preserves existing content outside the managed block",
	output: "Interactive file selection followed by created, updated, or unchanged file summary",
	examples: ["backlog agents --update-instructions"],
});
agentsCmd
	.description("manage the short Backlog.md CLI nudge in agent instruction files")
	.option(
		"--update-instructions",
		"update the Backlog.md CLI nudge in agent instruction files while preserving existing content",
	)
	.action(async (options) => {
		if (!options.updateInstructions) return void agentsCmd.help();
		try {
			const cwd = await requireProjectRoot();
			const project = await loadInitializedProject(async () => new Core(cwd));
			if (!project) return;
			const selected = await clack.multiselect({
				message: "Select agent instruction files to update (space toggles selections; enter confirms)",
				required: false,
				options: [
					{ label: "CLAUDE.md (Claude Code)", value: "CLAUDE.md" },
					{ label: "AGENTS.md (Codex, Jules, Amp, Cursor, Zed, Warp, Aider, GitHub, RooCode)", value: "AGENTS.md" },
					{ label: "GEMINI.md (Google CLI)", value: "GEMINI.md" },
					{ label: "Copilot (GitHub Copilot)", value: ".github/copilot-instructions.md" },
				],
			});
			if (clack.isCancel(selected)) return void clack.log.info("Agent instruction update cancelled.");
			const files: AgentInstructionFile[] = Array.isArray(selected) ? (selected as AgentInstructionFile[]) : [];
			if (files.length > 0) {
				await addAgentInstructions(cwd, project.core.git, files, project.config.autoCommit ?? false);
				console.log(`Updated ${files.length} agent instruction file(s): ${files.join(", ")}`);
			} else console.log("No files selected for update.");
		} catch (error) {
			reportCommandFailure("Failed to update agent instructions", error);
		}
	});
registerConfigCommand(program, { requireProjectRoot, reportFailure: reportCommandFailure });
registerDoctorCommand(program, { requireProjectRoot, hasInteractiveTTY });
registerCleanupCommand(program, { requireProjectRoot, reportFailure: reportCommandFailure });
registerBrowserOverviewCommands(program, {
	createCore: async () => new Core(await requireProjectRoot()),
	requireProjectRoot,
	hasInteractiveTTY,
	version,
	reportFailure: reportCommandFailure,
});
registerCompletionCommand(program);
registerInstructionsCommand(program);
registerAgentWorkspaceCommands(program, {
	project: async () => new Core(await requireProjectRoot()),
	root: async () => new Core(await requireRuntimeCwd()),
});
registerMcpCommand(program);
program
	.parseAsync(process.argv)
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	})
	.finally(() => {
		if (originalBunOptions) process.env.BUN_OPTIONS = originalBunOptions;
	});
