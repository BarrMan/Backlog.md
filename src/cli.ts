#!/usr/bin/env node

import { basename, dirname, isAbsolute, join } from "node:path";
import { stdin as input } from "node:process";
import { createInterface } from "node:readline/promises";
import * as clack from "@clack/prompts";
import { Command, type OptionValues } from "commander";
import { registerAgentWorkspaceCommands } from "./commands/agent-workspace.ts";
import { type CompletionInstallResult, installCompletion, registerCompletionCommand } from "./commands/completion.ts";
import { printConfigValue, setConfigValue } from "./commands/config-values.ts";
import { configureAdvancedSettings } from "./commands/configure-advanced-settings.ts";
import { registerDoctorCommand } from "./commands/doctor.ts";
import { runDraftTransition } from "./commands/draft-actions.ts";
import {
	addHelpSchema,
	choiceType,
	getCliTaskTypeValues,
	priorityType,
	projectType,
	statusType,
	taskType,
} from "./commands/help-schema.ts";
import { registerInitCommand } from "./commands/init.ts";
import { registerInstructionsCommand } from "./commands/instructions.ts";
import { registerMcpCommand } from "./commands/mcp.ts";
import { loadInitializedProject } from "./commands/project-command.ts";
import { registerSearchCommand } from "./commands/search.ts";
import { buildTaskCreateInput, createAndReportTask } from "./commands/task-create.ts";
import { parseTaskEditOptions } from "./commands/task-edit-options.ts";
import { parseTaskListRequest } from "./commands/task-list-parse.ts";
import { runTaskListProjectView } from "./commands/task-list-project.ts";
import { queryTaskList } from "./commands/task-list-query.ts";
import { formatTaskListRow, groupTaskListByStatus, printTaskListGroupedByStatus } from "./commands/task-list-render.ts";
import { pickTaskForEditWizard, runTaskCreateWizard, runTaskEditWizard } from "./commands/task-wizard.ts";
import { watchJson } from "./commands/watch-json.ts";
import { DEFAULT_DONE_STATUS, DEFAULT_STATUSES } from "./constants/index.ts";
import { findLocalDuplicateTaskIds } from "./core/duplicate-task-repair.ts";
import { buildMilestoneBuckets, collectArchivedMilestoneKeys, milestoneKey } from "./core/milestones.ts";
import { loadTaskDetail } from "./core/task-detail.ts";
import { isConfigValueError } from "./file-system/operations.ts";
import { decisionListJson, formatJson, printJson, taskListJson, taskViewJson } from "./formatters/json-output.ts";
import { formatTaskPlainText } from "./formatters/task-plain-text.ts";
import {
	type AgentInstructionFile,
	addAgentInstructions,
	Core,
	exportKanbanBoardToFile,
	installClaudeAgent,
	updateReadmeWithBoard,
} from "./index.ts";
import { MilestoneHandlers, type MilestoneRemoveArgs } from "./mcp/tools/milestones/handlers.ts";
import type { CallToolResult } from "./mcp/types.ts";
import {
	type Decision,
	DOCUMENT_TYPE_VALUES,
	type Document as DocType,
	type DocumentSearchResult,
	isLocalEditableTask,
	type SearchResult,
	type Task,
	type TaskUpdateInput,
} from "./types/index.ts";
import { genericSelectList } from "./ui/components/generic-list.ts";
import { createLoadingScreen } from "./ui/loading.ts";
import { viewTaskEnhanced } from "./ui/task-viewer-with-search.ts";
import { scrollableViewer } from "./ui/tui.ts";
import { formatDependencyCleanupMessage } from "./utils/dependency-graph.ts";
import { formatDuplicateTaskIdWarning } from "./utils/duplicate-detection.ts";
import { AmbiguousIdError, isAmbiguousIdError } from "./utils/entity-id.ts";
import { findBacklogRoot } from "./utils/find-backlog-root.ts";
import { generateNextDecisionId } from "./utils/id-generators.ts";
import {
	addListWindowOptions,
	LIST_WINDOW_HELP_FIELDS,
	LIST_WINDOW_OUTPUT_HELP,
	type ListWindow,
	type ListWindowOptions,
	milestoneSectionsInWindow,
	parseListWindow,
	printListWindow,
	selectListWindow,
} from "./utils/list-window.ts";
import { resolveMilestoneInputForStorage } from "./utils/milestone-storage.ts";
import { DRAFT_PREFIX, normalizeId } from "./utils/prefix-config.ts";
import { formatValidPriorityValues, getPriorityOptions, resolvePriorityValue } from "./utils/priority-config.ts";
import {
	formatValidProjectValues,
	getProjectValues,
	noProjectsConfiguredMessage,
	resolveProjectValues,
} from "./utils/project-config.ts";
import { type ReadOutputMode, type ReadOutputOptions, resolveReadOutputMode } from "./utils/read-output-mode.ts";
import { resolveRuntimeCwd } from "./utils/runtime-cwd.ts";
import { formatValidStatuses, getCanonicalStatuses, getValidStatuses } from "./utils/status.ts";
import { parseClearableStringList, parseDelimitedStringList } from "./utils/task-builders.ts";
import { canonicalTaskId, LOCAL_TASK_LOOKUP_HINT, taskIdsEqual } from "./utils/task-path.ts";
import { sortTasks } from "./utils/task-sorting.ts";
import { formatValidTaskTypeValues, getTaskTypeValues, resolveTaskTypeValues } from "./utils/task-type-config.ts";
import { getTerminalStatus, isTerminalStatus } from "./utils/terminal-status.ts";
import { formatUtcDateForDisplay } from "./utils/utc-date-display.ts";
import { getVersion } from "./utils/version.ts";

const CONFIG_GET_KEYS = [
	"defaultEditor",
	"projectName",
	"defaultAssignee",
	"defaultStatus",
	"statuses",
	"labels",
	"priorities",
	"types",
	"projects",
	"milestones",
	"definitionOfDone",
	"dateFormat",
	"maxColumnWidth",
	"defaultPort",
	"autoOpenBrowser",
	"remoteOperations",
	"autoCommit",
	"filesystemOnly",
	"bypassGitHooks",
	"zeroPaddedIds",
	"checkActiveBranches",
	"activeBranchDays",
] as const;

const CONFIG_SET_KEYS = [
	"defaultEditor",
	"projectName",
	"defaultAssignee",
	"defaultStatus",
	"dateFormat",
	"maxColumnWidth",
	"autoOpenBrowser",
	"defaultPort",
	"remoteOperations",
	"autoCommit",
	"filesystemOnly",
	"bypassGitHooks",
	"zeroPaddedIds",
	"checkActiveBranches",
	"activeBranchDays",
] as const;

const DOCUMENT_SEARCH_QUERY_MAX_LENGTH = 200;
const DOCUMENT_SEARCH_LIMIT_MAX = 100;
const TASK_SORT_FIELDS = ["priority", "id", "ordinal"];
const TASK_SORT_FIELD_LIST = TASK_SORT_FIELDS.join(", ");
const TASK_TYPE_EXAMPLE = JSON.stringify(getCliTaskTypeValues()[0] ?? "<configured-type>");

// Helper function for accumulating multiple CLI option values
function createMultiValueAccumulator() {
	return (value: string, previous: string | string[]) => {
		const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
		return [...soFar, value];
	};
}

function printMissingRequiredArgument(argumentName: string): void {
	console.error(`error: missing required argument '${argumentName}'`);
	process.exitCode = 1;
}

/**
 * Reports a command that could not finish. A config value Backlog refuses to read already states
 * the file, the key, and the fix, so it is printed as written instead of behind a stack trace.
 */
function reportCommandFailure(summary: string, error: unknown): void {
	if (isConfigValueError(error)) {
		console.error(error.message);
	} else {
		console.error(summary, error);
	}
	process.exitCode = 1;
}

function formatTaskEditError(error: unknown, taskId: string, commandKind = "task"): string {
	const message = error instanceof Error ? error.message : String(error);
	if (
		message.startsWith("Malformed Acceptance Criteria markers:") ||
		message.startsWith("Malformed Definition of Done markers:")
	) {
		return `${message}\nThe edit was not applied. Run 'backlog ${commandKind} view ${taskId} --plain' to locate the ${commandKind} file, repair or remove the malformed marker block in that Markdown file, then rerun the edit.`;
	}
	if (message.startsWith("Invalid index:")) {
		return `${message} Try 'backlog ${commandKind} edit ${taskId} --help' for index options.`;
	}
	if (
		message.includes(" not found") &&
		(message.startsWith("Acceptance criterion ") || message.startsWith("Definition of Done item "))
	) {
		return `${message}\nRun 'backlog ${commandKind} view ${taskId} --plain' to inspect indexes, or 'backlog ${commandKind} edit ${taskId} --help' for edit options.`;
	}
	return message;
}

async function normalizeCliStatusList(core: Core, values: string[], optionName: string): Promise<string[] | null> {
	const { values: canonicalStatuses, invalid, validStatuses } = await getCanonicalStatuses(values, core);
	if (invalid.length > 0) {
		console.error(
			`Invalid ${optionName}: ${invalid.join(", ")}. Valid statuses are: ${formatValidStatuses(validStatuses)}`,
		);
		process.exitCode = 1;
		return null;
	}
	return canonicalStatuses;
}

async function normalizeCliPriority(core: Core, value: string): Promise<string | null> {
	const config = await core.filesystem.loadConfig();
	const normalized = resolvePriorityValue(value, config);
	if (!normalized) {
		console.error(`Invalid priority: ${value}. Valid values are: ${formatValidPriorityValues(config)}`);
		process.exitCode = 1;
		return null;
	}
	return normalized;
}

async function normalizeCliTaskTypes(core: Core, values: string[], optionName: string): Promise<string[] | null> {
	const config = await core.filesystem.loadConfig();
	const { values: canonicalTypes, invalid } = resolveTaskTypeValues(values, config);
	if (invalid.length > 0) {
		console.error(
			`Invalid ${optionName}: ${invalid.join(", ")}. Valid types are: ${formatValidTaskTypeValues(config)}`,
		);
		process.exitCode = 1;
		return null;
	}
	return canonicalTypes;
}

async function normalizeCliProjects(core: Core, values: string[], optionName: string): Promise<string[] | null> {
	const config = await core.filesystem.loadConfig();
	if (getProjectValues(config).length === 0) {
		console.error(noProjectsConfiguredMessage(core.filesystem.configFilePath));
		process.exitCode = 1;
		return null;
	}
	const { values: canonicalProjects, invalid } = resolveProjectValues(values, config);
	if (invalid.length > 0) {
		console.error(
			`Invalid ${optionName}: ${invalid.join(", ")}. Valid projects are: ${formatValidProjectValues(config)}`,
		);
		process.exitCode = 1;
		return null;
	}
	return canonicalProjects;
}

function formatToolResultText(result: CallToolResult): string {
	return result.content
		.map((item) => (item.type === "text" ? item.text : ""))
		.filter(Boolean)
		.join("\n");
}

function printToolResult(result: CallToolResult): void {
	const text = formatToolResultText(result);
	if (text) {
		console.log(text);
	}
	if (result.isError) {
		process.exitCode = 1;
	}
}

async function printDuplicateIntegrityWarning(core: Core): Promise<boolean> {
	const groups = await findLocalDuplicateTaskIds(core);
	if (groups.length === 0) return false;
	console.error(formatDuplicateTaskIdWarning(groups));
	process.exitCode = 1;
	return true;
}

/* Doctor rendering lives with the doctor command.
function printDuplicateRepairPlan(plan: DuplicateRepairPlan): void {
	if (plan.groups.length > 0) {
		console.log(formatDuplicateTaskIdWarning(plan.groups));
		console.log("\nRepair preview (no files changed):");
		for (const change of plan.changes) {
			console.log(`  ${change.sourcePath}`);
			console.log(`    ${change.oldId} -> ${change.newId}`);
			console.log(`    new path: ${change.targetPath}`);
		}
	}
	if (plan.crossBranchFindings.length > 0) {
		console.log("\nPossible cross-branch ID collisions (diagnostic only):");
		for (const finding of plan.crossBranchFindings) {
			console.log(`  ${finding.id}:`);
			for (const location of finding.locations) {
				console.log(`    - ${location.branch}:${location.path} (${location.state})`);
			}
		}
		console.log("Switch to the affected branches and reconcile these paths; Backlog.md will not edit another branch.");
	}
	if (plan.groups.length > 0) {
		if (plan.references.length > 0) {
			console.log("\nReferences requiring human review after repair:");
			for (const reference of plan.references) {
				console.log(`  ${reference.path}:${reference.line} [${reference.ids.join(", ")}]`);
				if (reference.text) console.log(`    ${reference.text}`);
			}
			console.log("These references are not changed automatically because the original ID is ambiguous.");
		}
		if (!plan.referenceScanComplete) {
			console.log("\nReference scan incomplete; repair is blocked. See the failures below.");
		} else if (plan.references.length === 0) {
			console.log("\nNo textual references to the duplicate IDs were found in backlog Markdown files.");
		}
	}
	if (plan.blockedReasons.length > 0) {
		console.log("\nRepair is blocked:");
		for (const reason of plan.blockedReasons) console.log(`  - ${reason}`);
	}
}

function printContentIdentityReport(report: ContentIdentityReport): void {
	const sections = [
		["document", report.documents],
		["decision", report.decisions],
	] as const;
	for (const [label, issues] of sections) {
		if (issues.duplicates.length > 0) {
			console.log(`\nDuplicate ${label} IDs (diagnostic only):`);
			for (const group of issues.duplicates) {
				console.log(`  ${group.id}:`);
				for (const path of group.paths) console.log(`    - ${path}`);
			}
			console.log(`Give each file a unique id; ${label} lookups for these IDs stay blocked until then.`);
		}
		if (issues.missingIds.length > 0) {
			console.log(`\nMalformed ${label} files without an id in frontmatter:`);
			for (const path of issues.missingIds) console.log(`  - ${path}`);
			console.log(`Add an id to each file; these ${label}s cannot be addressed until then.`);
		}
		if (issues.unreadable.length > 0) {
			console.log(`\nUnreadable ${label} files or directories:`);
			for (const path of issues.unreadable) console.log(`  - ${path}`);
			console.log(`Repair the frontmatter or file permissions; identity could not be checked for these ${label}s.`);
		}
	}
}

function printDraftIdentityReport(findings: DraftIdentityFindings): void {
	if (findings.duplicates.length > 0) {
		console.log("\nDuplicate draft IDs (diagnostic only):");
		for (const group of findings.duplicates) {
			console.log(`  ${group.id}:`);
			for (const path of group.paths) console.log(`    - ${path}`);
		}
		console.log("Rename one file to a distinct numeric id, then make its frontmatter agree.");
	}
	if (findings.drifted.length > 0) {
		console.log("\nDrifted draft files (frontmatter id does not match filename):");
		for (const drift of findings.drifted) {
			console.log(
				`  - ${drift.path}: frontmatter declares ${drift.frontmatterId}, filename declares ${drift.filenameId}`,
			);
		}
		console.log("Fix the frontmatter id or rename each file so they agree.");
	}
	if (findings.unreadable.length > 0) {
		console.log("\nUnreadable draft files or directories:");
		for (const path of findings.unreadable) console.log(`  - ${path}`);
		console.log("Repair the YAML/frontmatter or file permissions; identity could not be checked for these drafts.");
	}
}

function printDependencyDefectsReport(defects: DependencyDefects): void {
	if (defects.selfDependencies.length > 0) {
		console.log("\nSelf-referential dependencies (diagnostic only):");
		for (const finding of defects.selfDependencies) {
			const spelling = finding.dependency === finding.taskId ? "" : ` (recorded as "${finding.dependency}")`;
			console.log(`  - ${finding.taskId} depends on itself${spelling}`);
		}
		console.log(
			"Rewrite the task's dependencies without its own ID: 'backlog task edit <id> --dep <ids>' (or --clear-deps); edit the file directly for records under backlog/completed.",
		);
	}
	if (defects.cycles.length > 0) {
		console.log("\nDependency cycles (diagnostic only):");
		for (const cycle of defects.cycles) console.log(`  - ${cycle.join(" -> ")}`);
		console.log(
			"Break each cycle by rewriting one task's dependencies: 'backlog task edit <id> --dep <ids>' (or --clear-deps); edit the file directly for records under backlog/completed.",
		);
	}
}
*/

async function runMilestoneMutation(action: (handlers: MilestoneHandlers) => Promise<CallToolResult>): Promise<void> {
	const cwd = await requireProjectRoot();
	const core = new Core(cwd);
	const handlers = new MilestoneHandlers(core);

	try {
		printToolResult(await action(handlers));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

function parseMilestoneTaskHandling(value: string | undefined): MilestoneRemoveArgs["taskHandling"] | null {
	if (value === undefined) {
		return "clear";
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === "clear" || normalized === "keep" || normalized === "reassign") {
		return normalized;
	}
	return null;
}

const CREATE_FIELD_OPTIONS = [
	"description",
	"desc",
	"assignee",
	"status",
	"labels",
	"priority",
	"type",
	"project",
	"ordinal",
	"milestone",
	"dueDate",
	"ac",
	"acceptanceCriteria",
	"dod",
	"plan",
	"notes",
	"finalSummary",
	"parent",
	"dependsOn",
	"dep",
	"ref",
	"doc",
	"modifiedFile",
] as const;
const CREATE_TRUE_OPTIONS = ["plain", "draft"] as const;
const EDIT_FIELD_OPTIONS = [
	"title",
	"description",
	"desc",
	"assignee",
	"status",
	"label",
	"priority",
	"type",
	"project",
	"ordinal",
	"milestone",
	"dueDate",
	"addLabel",
	"removeLabel",
	"ac",
	"dod",
	"removeAc",
	"removeDod",
	"checkAc",
	"checkDod",
	"uncheckAc",
	"uncheckDod",
	"acceptanceCriteria",
	"plan",
	"notes",
	"comment",
	"commentAuthor",
	"finalSummary",
	"appendPlan",
	"appendNotes",
	"appendFinalSummary",
	"dependsOn",
	"dep",
	"ref",
	"addRef",
	"removeRef",
	"doc",
	"modifiedFile",
] as const;
const EDIT_TRUE_OPTIONS = [
	"clearMilestone",
	"clearDueDate",
	"clearLabels",
	"plain",
	"clearAc",
	"clearFinalSummary",
	"clearDeps",
	"clearRefs",
	"clearDocs",
] as const;

function hasConfiguredOptions(
	options: Record<string, unknown>,
	fieldOptions: readonly string[],
	trueOptions: readonly string[],
): boolean {
	return (
		fieldOptions.some((option) => options[option] !== undefined) ||
		trueOptions.some((option) => options[option] === true)
	);
}

function hasCreateFieldFlags(options: Record<string, unknown>): boolean {
	return hasConfiguredOptions(options, CREATE_FIELD_OPTIONS, CREATE_TRUE_OPTIONS) || options.dodDefaults === false;
}

function hasEditFieldFlags(options: Record<string, unknown>): boolean {
	return hasConfiguredOptions(options, EDIT_FIELD_OPTIONS, EDIT_TRUE_OPTIONS);
}

/**
 * Flags whose value cannot mean the same thing across a batch. A title, a body section, or a
 * 1-based checklist index belongs to one task, so `task edit` rejects them once the user passes
 * more than one task ID rather than writing the same value over every task.
 */
const PER_TASK_ONLY_EDIT_FLAGS: ReadonlyArray<{ option: string; flag: string }> = [
	{ option: "title", flag: "--title" },
	{ option: "description", flag: "--description" },
	{ option: "desc", flag: "--desc" },
	{ option: "plan", flag: "--plan" },
	{ option: "appendPlan", flag: "--append-plan" },
	{ option: "notes", flag: "--notes" },
	{ option: "appendNotes", flag: "--append-notes" },
	{ option: "finalSummary", flag: "--final-summary" },
	{ option: "appendFinalSummary", flag: "--append-final-summary" },
	{ option: "clearFinalSummary", flag: "--clear-final-summary" },
	{ option: "comment", flag: "--comment" },
	{ option: "commentAuthor", flag: "--comment-author" },
	{ option: "ordinal", flag: "--ordinal" },
	{ option: "modifiedFile", flag: "--modified-file" },
	{ option: "removeAc", flag: "--remove-ac" },
	{ option: "checkAc", flag: "--check-ac" },
	{ option: "uncheckAc", flag: "--uncheck-ac" },
	{ option: "removeDod", flag: "--remove-dod" },
	{ option: "checkDod", flag: "--check-dod" },
	{ option: "uncheckDod", flag: "--uncheck-dod" },
	// Acceptance criteria and Definition of Done are task-specific body sections like the plan and
	// notes above: replacing, clearing, or adding to them across a batch erases or duplicates
	// content that differs per task.
	{ option: "acceptanceCriteria", flag: "--acceptance-criteria" },
	{ option: "clearAc", flag: "--clear-ac" },
	{ option: "ac", flag: "--ac" },
	{ option: "dod", flag: "--dod" },
];

function findPerTaskOnlyFlag(options: Record<string, unknown>): string | null {
	for (const { option, flag } of PER_TASK_ONLY_EDIT_FLAGS) {
		if (options[option] !== undefined) {
			return `Cannot use ${flag} with more than one task ID. ${flag} applies to one task only. Run backlog task edit once per task.`;
		}
	}
	return null;
}

async function resolveCliMilestoneInput(core: Core, milestone: string): Promise<string> {
	const [activeMilestones, archivedMilestones] = await Promise.all([
		core.filesystem.listMilestones(),
		core.filesystem.listArchivedMilestones(),
	]);
	return resolveMilestoneInputForStorage(milestone, activeMilestones, archivedMilestones);
}

async function loadLocalTaskView(core: Core, taskId: string) {
	const localTasks = await core.fs.listTasks();
	const task = await core.getTaskWithSubtasks(taskId, localTasks, { includeCrossBranch: false });
	if (!task) {
		console.error(`Task ${taskId} not found. ${LOCAL_TASK_LOOKUP_HINT}`);
		process.exitCode = 1;
		return null;
	}

	return {
		task,
		tasks: localTasks.some((candidate) => taskIdsEqual(task.id, candidate.id)) ? localTasks : [...localTasks, task],
		detail: await loadTaskDetail(core, task),
	};
}

async function loadLocalEditableTask(core: Core, taskId: string, action: "archive" | "complete"): Promise<Task | null> {
	const task = await core.loadTaskById(taskId, { includeCrossBranch: false });
	if (!task) {
		console.error(`Task ${taskId} not found. ${LOCAL_TASK_LOOKUP_HINT}`);
		process.exitCode = 1;
		return null;
	}
	if (!isLocalEditableTask(task)) {
		console.error(`Cannot ${action} task from another branch: ${task.id}`);
		process.exitCode = 1;
		return null;
	}
	return task;
}

function printTaskViewOutput(
	detail: Awaited<ReturnType<typeof loadTaskDetail>>,
	cwd: string,
	outputMode: ReadOutputMode,
): boolean {
	if (outputMode === "json") {
		printJson(taskViewJson(detail, cwd));
		return true;
	}
	if (outputMode === "plain") {
		console.log(formatTaskPlainText(detail));
		return true;
	}
	return false;
}

/**
 * Resolves the working directory commands operate on, honouring --cwd and BACKLOG_CWD.
 * Exits with the resolution error message when the override points at an invalid directory.
 */
async function requireRuntimeCwd(): Promise<string> {
	try {
		const runtimeCwd = await resolveRuntimeCwd();
		return runtimeCwd.cwd;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		process.exit(1);
	}
}

/**
 * Resolves the Backlog.md project root from the current working directory.
 * Walks up the directory tree to find backlog/ or backlog.json, with git root fallback.
 * Exits with error message if no Backlog.md project is found.
 */
async function requireProjectRoot(): Promise<string> {
	const root = await findBacklogRoot(await requireRuntimeCwd());
	if (!root) {
		console.error("No Backlog.md project found. Run `backlog init` to initialize.");
		process.exit(1);
	}
	return root;
}

// Windows color fix
if (process.platform === "win32") {
	const term = process.env.TERM;
	if (!term || /^(xterm|dumb|ansi|vt100)$/i.test(term)) {
		process.env.TERM = "xterm-256color";
	}
}

// Auto-plain fallback for commands that otherwise launch interactive UIs.
// Require both stdin and stdout to be TTY before attempting an interactive experience.
const hasInteractiveTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY);
const shouldAutoPlain = !hasInteractiveTTY;
const plainFlagInArgv = process.argv.includes("--plain");

function isPlainRequested(options?: { plain?: boolean }): boolean {
	return Boolean(options?.plain || plainFlagInArgv);
}

function getReadOutputMode(options: { json?: boolean; plain?: boolean }): ReadOutputMode | null {
	try {
		return resolveReadOutputMode(options, hasInteractiveTTY);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
		return null;
	}
}

/**
 * Resolves how a listing command prints and which window of its list it prints. Every command that
 * lists tasks, drafts, milestones, documents, decisions, or search results starts here. Window and
 * count options print text, so they never open an interactive view. Returns null after reporting
 * invalid options.
 */
function resolveListOutput(
	options: ListWindowOptions & ReadOutputOptions,
	command: Command,
): { outputMode: ReadOutputMode; listWindow: ListWindow } | null {
	const readOutputMode = getReadOutputMode(options);
	if (!readOutputMode) return null;
	const listWindow = parseListWindow(options, command, process.argv.slice(2));
	if (!listWindow) return null;
	const outputMode = readOutputMode === "interactive" && listWindow.forcesText ? "plain" : readOutputMode;
	return { outputMode, listWindow };
}

// Temporarily isolate BUN_OPTIONS during CLI parsing to prevent conflicts
// Save the original value so it's available for subsequent commands
const originalBunOptions = process.env.BUN_OPTIONS;
if (process.env.BUN_OPTIONS) {
	delete process.env.BUN_OPTIONS;
}

// Get version from package.json
const version = await getVersion();

// Bare-run entry handling (before Commander parses commands)
// Show a plain local help entry when invoked without subcommands, unless help/version requested.
try {
	let rawArgs = process.argv.slice(2);
	// Some package managers (e.g., Bun global shims) may inject the resolved
	// CLI executable path as the first non-node argument. Strip it if detected.
	if (rawArgs.length > 0) {
		const first = rawArgs[0];
		if (
			typeof first === "string" &&
			/node_modules[\\/]+backlog\.md-(darwin|linux|windows)-[^\\/]+[\\/]+backlog(\.exe)?$/.test(first)
		) {
			rawArgs = rawArgs.slice(1);
		}
	}
	const wantsHelp = rawArgs.includes("-h") || rawArgs.includes("--help");
	const wantsVersion = rawArgs.includes("-v") || rawArgs.includes("--version");
	const isBareRoot = rawArgs.length === 0 || (rawArgs.length === 1 && rawArgs[0] === "--plain");
	if (isBareRoot && !wantsHelp && !wantsVersion) {
		let initialized = false;
		try {
			const runtimeCwd = await resolveRuntimeCwd();
			const projectRoot = await findBacklogRoot(runtimeCwd.cwd);
			if (projectRoot) {
				const core = new Core(projectRoot);
				const cfg = await core.filesystem.loadConfig();
				initialized = !!cfg;
			}
		} catch (error) {
			// An initialized project whose config Backlog refuses to read must not be presented as an
			// uninitialized directory: report the value and stop, as every other entry point does.
			if (isConfigValueError(error)) {
				console.error(error.message);
				process.exit(1);
			}
			initialized = false;
		}

		const { printRootEntry } = await import("./ui/root-entry.ts");
		await printRootEntry({
			version,
			initialized,
			...(rawArgs.includes("--plain") ? { color: false } : {}),
		});
		// Ensure we don't enter Commander command parsing
		process.exit(0);
	}
} catch {
	// Fall through to normal CLI parsing on any root entry error.
}

function getMcpStartCwdOverrideFromArgv(argv = process.argv): string | undefined {
	const args = argv.slice(2);
	const mcpIndex = args.indexOf("mcp");
	if (mcpIndex < 0 || args[mcpIndex + 1] !== "start") {
		return undefined;
	}

	for (let i = mcpIndex + 2; i < args.length; i++) {
		const arg = args[i];
		if (!arg) {
			continue;
		}
		if (arg === "--cwd") {
			const next = args[i + 1]?.trim();
			return next || undefined;
		}
		if (arg?.startsWith("--cwd=")) {
			const value = arg.slice("--cwd=".length).trim();
			return value || undefined;
		}
	}

	return undefined;
}

// Global config migration - run before any command processing
// Only run if we're in a backlog project (skip for init, help, version)
const shouldRunMigration =
	!process.argv.includes("init") &&
	!process.argv.includes("--help") &&
	!process.argv.includes("-h") &&
	!process.argv.includes("--version") &&
	!process.argv.includes("-v") &&
	process.argv.length > 2; // Ensure we have actual commands

if (shouldRunMigration) {
	try {
		const runtimeCwd = await resolveRuntimeCwd({ cwd: getMcpStartCwdOverrideFromArgv() });
		const projectRoot = await findBacklogRoot(runtimeCwd.cwd);
		if (projectRoot) {
			const core = new Core(projectRoot);

			// Only migrate if config already exists (project is already initialized)
			const config = await core.filesystem.loadConfig();
			if (config) {
				await core.ensureConfigMigrated();
			}
		}
	} catch (_error) {
		// Silently ignore migration errors - project might not be initialized yet
	}
}

const program = new Command();
program
	.name("backlog")
	.description("Backlog.md - Project management CLI")
	.version(version, "-v, --version", "display version number")
	.showSuggestionAfterError()
	.showHelpAfterError("Run with --help to see accepted fields and examples.");

registerInitCommand(program, { requireRuntimeCwd, hasInteractiveTTY, reportCommandFailure });

const taskCmd = program.command("task").aliases(["tasks"]);

/** `--json` and `--plain` may be given to the parent `task` command as well as to its subcommand. */
function taskReadOptions(options: ReadOutputOptions): ReadOutputOptions {
	const taskOptions = taskCmd.opts<ReadOutputOptions>();
	return {
		json: Boolean(options.json || taskOptions.json),
		plain: Boolean(options.plain || taskOptions.plain),
	};
}

function getTaskReadOutputMode(options: ReadOutputOptions): ReadOutputMode | null {
	return getReadOutputMode(taskReadOptions(options));
}

taskCmd.hook("preSubcommand", (command, subcommand) => {
	if (command.opts().json && !["list", "view"].includes(subcommand.name())) {
		command.error("error: unknown option '--json'", { code: "commander.unknownOption", exitCode: 1 });
	}
});

addHelpSchema(taskCmd.command("create [title]"), {
	required: [{ name: "title", type: "String", description: "Task title; prompted when omitted in interactive mode" }],
	optional: [
		{ name: "description", type: "Markdown", description: "Task outcome and context" },
		{
			name: "status",
			type: () => statusType({ includeDraft: true }),
			description: "Project task status; case-insensitive",
		},
		{
			name: "assignee",
			type: "Comma-separated strings",
			description:
				'Assign one or more @names; repeat -a or use @name1,@name2; omitting it applies the configured defaultAssignee, while -a "" leaves the task unassigned',
		},
		{
			name: "labels",
			type: "Comma-separated strings",
			description: "Task labels; repeat -l or use label1,label2",
		},
		{ name: "priority", type: priorityType, description: "Task priority" },
		{ name: "type", type: taskType, description: "Task type; case-insensitive" },
		{ name: "project", type: projectType, description: "Task project; case-insensitive" },
		{ name: "due-date", type: "date", description: "Optional due date (YYYY-MM-DD)" },
		{ name: "acceptanceCriteria", type: "Markdown list item text", description: "Repeat --ac for multiple criteria" },
		{ name: "ordinal", type: "Integer", description: "Non-negative manual ordering value" },
		{ name: "parent", type: "Task ID", description: "Existing parent task for subtasks; not a milestone ID" },
		{
			name: "plan",
			type: "Markdown",
			description:
				"Only for already-started work created directly in a configured active status (for example, In Progress)",
		},
		{ name: "notes", type: "Markdown", description: "Same restriction as plan" },
		{
			name: "final-summary",
			type: "Markdown",
			description: "Only for finished, verified work created directly in a configured terminal status",
		},
	],
	writes: "Creates a task or draft markdown file through Backlog.md",
	output: "Created task details; use --plain for text output",
	examples: [
		'backlog task create "Add OAuth" --ac "Login succeeds"',
		`backlog task create "Fix session expiry" --type ${TASK_TYPE_EXAMPLE}`,
		'backlog task create -p {{TASK_ID:1}} "Add tests"',
	],
})
	.option("-d, --description <text>", "task description")
	.option("--desc <text>", "alias for --description")
	.option(
		"-a, --assignee <assignees>",
		'assign task to one or more @names (comma-separated or repeatable); pass "" to leave it unassigned',
		createMultiValueAccumulator(),
	)
	.option("-s, --status <status>")
	.option("-l, --labels <labels>", "add task labels (comma-separated or repeatable)", createMultiValueAccumulator())
	.option("--priority <priority>", "set task priority (configured priorities)")
	.option("--type <type>", "set task type (configured task types)")
	.option("--project <project>", "set task project (configured projects)")
	.option("--due-date <date>", "set due date (YYYY-MM-DD)")
	.option("--plain", "use plain text output after creating")
	.option("--ac <criteria>", "add acceptance criteria (can be used multiple times)", createMultiValueAccumulator())
	.option(
		"--acceptance-criteria <criteria>",
		"add acceptance criteria (can be used multiple times)",
		createMultiValueAccumulator(),
	)
	.option("--dod <item>", "add Definition of Done item (can be used multiple times)", createMultiValueAccumulator())
	.option("--no-dod-defaults", "disable Definition of Done defaults")
	.option(
		"--plan <text>",
		"add a plan only for already-started work created directly in an active status (for example, In Progress)",
	)
	.option("--notes <text>", "add implementation notes")
	.option("--final-summary <text>", "add final summary")
	.option("--ordinal <number>", "set task ordinal for custom ordering")
	.option("-m, --milestone <milestone>", "assign task to milestone by ID or title")
	.option("--draft")
	.option("-p, --parent <taskId>", "specify existing parent task ID, not a milestone ID")
	.option(
		"--depends-on <taskIds>",
		"specify task dependencies (comma-separated or use multiple times)",
		(value, previous) => {
			const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
			return [...soFar, value];
		},
	)
	.option("--dep <taskIds>", "specify task dependencies (shortcut for --depends-on)", (value, previous) => {
		const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
		return [...soFar, value];
	})
	.option("--ref <reference>", "add reference URL or file path (can be used multiple times)", (value, previous) => {
		const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
		return [...soFar, value];
	})
	.option(
		"--modified-file <path>",
		"add modified file path from project root (can be used multiple times)",
		(value, previous) => {
			const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
			return [...soFar, value];
		},
	)
	.option(
		"--doc <documentation>",
		"add documentation URL or file path (can be used multiple times)",
		(value, previous) => {
			const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
			return [...soFar, value];
		},
	)
	.action(async (title: string | undefined, options) => {
		const shouldUseWizard = hasInteractiveTTY && title === undefined && !hasCreateFieldFlags(options);
		if (!shouldUseWizard && (title === undefined || title.trim().length === 0)) {
			printMissingRequiredArgument("title");
			return;
		}

		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		await core.ensureConfigLoaded();

		if (shouldUseWizard) {
			const statuses = await getValidStatuses(core);
			const config = await core.filesystem.loadConfig();
			const wizardInput = await runTaskCreateWizard({
				statuses,
				priorities: config?.priorities,
				types: config?.types,
				projects: config?.projects,
			});
			if (!wizardInput) {
				clack.cancel("Task create cancelled.");
				return;
			}
			try {
				const { task, filePath } = await core.createTaskFromInput(wizardInput);
				console.log(`Created task ${task.id}`);
				if (filePath) {
					console.log(`File: ${filePath}`);
				}
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exitCode = 1;
			}
			return;
		}

		const input = await buildTaskCreateInput(title ?? "", options, (milestone) =>
			resolveCliMilestoneInput(core, milestone),
		);
		if (!input) return;
		await createAndReportTask(core, input, {
			kind: options.draft ? "draft" : "task",
			plain: isPlainRequested(options),
		});
	});

registerSearchCommand(program, {
	requireProjectRoot,
	resolveListOutput,
	printDuplicateIntegrityWarning,
	normalizeStatusList: normalizeCliStatusList,
	normalizePriority: normalizeCliPriority,
	normalizeTaskTypes: normalizeCliTaskTypes,
	normalizeProjects: normalizeCliProjects,
});

/* Search command implementation moved to commands/search.ts.
const searchCommand = addHelpSchema(program.command("search [query]"), {
	reads: "Tasks, documents, and decisions from the configured backlog directory",
	required: [],
	optional: [
		{ name: "query", type: "String", description: "Fuzzy search text" },
		{
			name: "type",
			type: choiceType(["task", "document", "decision"], { multiple: true }),
			description: "Result types",
		},
		{
			name: "task-type",
			type: () => taskType({ multiple: true }),
			description: "Filter task results by one or more configured task types; repeat or comma-separate values",
		},
		{
			name: "status",
			type: () => statusType({ multiple: true }),
			description: "Filter task results by one or more statuses; repeat or comma-separate values; case-insensitive",
		},
		{
			name: "exclude-status",
			type: statusType,
			description: "Exclude task results with one or more statuses; repeat or comma-separate values",
		},
		{ name: "priority", type: priorityType, description: "Filter task results by priority" },
		{
			name: "project",
			type: () => projectType({ multiple: true }),
			description: "Filter task results by one or more configured projects; repeat or comma-separate values",
		},
		{
			name: "modified-file",
			type: "Project-root-relative path",
			description: "Filter by modified file path substring",
		},
		{ name: "limit", type: "Integer", description: "Maximum number of results" },
		...LIST_WINDOW_HELP_FIELDS,
		{ name: "plain", type: "Boolean", description: "Use text output instead of interactive UI" },
		{ name: "json", type: "Boolean", description: "Use versioned machine-readable JSON output" },
	],
	output: `Interactive search UI, plain text with --plain, or versioned JSON with --json. ${LIST_WINDOW_OUTPUT_HELP}; JSON adds total and nextSkip`,
	examples: [
		'backlog search "auth" --plain',
		'backlog search "auth" --json',
		'backlog search "api" --type task --status "<active status>"',
		`backlog search "crash" --task-type ${TASK_TYPE_EXAMPLE} --plain`,
		'backlog search "auth" --max-count 20 --skip 20 --plain',
	],
})
	.description("search tasks, documents, and decisions using the shared index")
	.option("--type <type>", "limit results to type (task, document, decision)", createMultiValueAccumulator())
	.option(
		"--task-type <type>",
		"filter task results by configured task type (repeatable or comma-separated)",
		createMultiValueAccumulator(),
	)
	.option(
		"--status <status>",
		"filter task results by status (repeatable or comma-separated)",
		createMultiValueAccumulator(),
	)
	.option(
		"--exclude-status <status>",
		"exclude task results by status (repeatable or comma-separated)",
		createMultiValueAccumulator(),
	)
	.option("--priority <priority>", "filter task results by priority (configured priorities)")
	.option(
		"--project <project>",
		"filter task results by configured project (repeatable or comma-separated)",
		createMultiValueAccumulator(),
	)
	.option(
		"--modified-file <path>",
		"filter task results by modified file path substring",
		createMultiValueAccumulator(),
	)
	.option("--limit <number>", "limit total results returned");
addListWindowOptions(searchCommand)
	.option("--plain", "print plain text output instead of interactive UI")
	.option("--json", "print versioned machine-readable JSON output")
	.action(async (query: string | undefined, options) => {
		const listOutput = resolveListOutput(options, searchCommand);
		if (!listOutput) return;
		const { outputMode, listWindow } = listOutput;
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		const hasDuplicateIds = await printDuplicateIntegrityWarning(core);
		const searchService = await core.getSearchService();
		const contentStore = await core.getContentStore();
		const cleanup = () => {
			searchService.dispose();
			contentStore.dispose();
		};
		if (hasDuplicateIds && outputMode === "json") {
			cleanup();
			return;
		}

		const modifiedFileFilters = parseDelimitedStringList(options.modifiedFile);
		const rawTaskTypes = parseDelimitedStringList(options.taskType) ?? [];
		const rawSearchProjects = parseDelimitedStringList(options.project) ?? [];
		const rawTypes = options.type ? (Array.isArray(options.type) ? options.type : [options.type]) : undefined;
		const allowedTypes: SearchResultType[] = ["task", "document", "decision"];
		const types = rawTypes
			? rawTypes
					.map((value: string) => value.toLowerCase())
					.filter((value: string): value is SearchResultType => {
						if (!allowedTypes.includes(value as SearchResultType)) {
							console.warn(`Ignoring unsupported type '${value}'. Supported: task, document, decision`);
							return false;
						}
						return true;
					})
			: modifiedFileFilters?.length || rawTaskTypes.length > 0 || rawSearchProjects.length > 0
				? ["task"]
				: allowedTypes;
		if (rawTaskTypes.length > 0 && rawTypes && !types.includes("task")) {
			console.error("--task-type filters task results. Include --type task or omit --type.");
			cleanup();
			process.exitCode = 1;
			return;
		}
		if (rawSearchProjects.length > 0 && rawTypes && !types.includes("task")) {
			console.error("--project filters task results. Include --type task or omit --type.");
			cleanup();
			process.exitCode = 1;
			return;
		}

		const filters: {
			status?: string | string[];
			excludeStatus?: string[];
			type?: string[];
			project?: string[];
			priority?: SearchPriorityFilter;
			modifiedFiles?: string[];
		} = {};
		if (options.status) {
			filters.status = parseDelimitedStringList(options.status) ?? options.status;
		}
		const excludeStatuses = parseDelimitedStringList(options.excludeStatus) ?? [];
		if (excludeStatuses.length > 0) {
			const canonicalExcludeStatuses = await normalizeCliStatusList(core, excludeStatuses, "exclude-status");
			if (!canonicalExcludeStatuses) {
				cleanup();
				return;
			}
			filters.excludeStatus = canonicalExcludeStatuses;
		}
		if (rawTaskTypes.length > 0) {
			const canonicalTaskTypes = await normalizeCliTaskTypes(core, rawTaskTypes, "task-type");
			if (!canonicalTaskTypes) {
				cleanup();
				return;
			}
			filters.type = canonicalTaskTypes;
		}
		if (rawSearchProjects.length > 0) {
			const canonicalProjects = await normalizeCliProjects(core, rawSearchProjects, "project");
			if (!canonicalProjects) {
				cleanup();
				return;
			}
			filters.project = canonicalProjects;
		}
		if (options.priority) {
			const priority = await normalizeCliPriority(core, String(options.priority));
			if (!priority) {
				cleanup();
				return;
			}
			filters.priority = priority;
		}
		if (modifiedFileFilters?.length) {
			filters.modifiedFiles = modifiedFileFilters;
		}

		let limit: number | undefined;
		if (options.limit !== undefined) {
			const parsed = parsePositiveIntegerOption(options.limit, "--limit", "backlog search --help");
			if (parsed === null) {
				cleanup();
				return;
			}
			limit = parsed;
		}

		const searchResults = searchService.search({
			query: query ?? "",
			limit,
			types,
			filters,
		});

		if (outputMode !== "interactive") {
			const printed = searchResultsInPrintedOrder(searchResults, outputMode);
			if (outputMode === "plain") {
				printListWindow(printed, listWindow, printSearchResults);
				cleanup();
				return;
			}
			const page = selectListWindow(printed, listWindow);
			printJson(searchJson(await projectSearchTaskRows(core, page.items), cwd, core.filesystem.docsDir, page));
			cleanup();
			return;
		}

		const taskResults = searchResults.filter(isTaskSearchResult);
		const searchResultTasks = taskResults.map((result) => result.task);

		const allTasks = (await core.queryTasks()).filter(
			(task) => task.id && task.id.trim() !== "" && hasAnyPrefix(task.id),
		);

		// If no tasks exist at all, show plain text results
		if (allTasks.length === 0) {
			printSearchResults(searchResultsInPrintedOrder(searchResults, "plain"));
			cleanup();
			return;
		}

		// Only filters the interactive view cannot edit may narrow the set it loads. Modified-file
		// filters have no in-view control, so the view would never be able to widen past them.
		// Project does have one, and it is applied below as a view filter, so prefiltering here
		// would leave clearing it in the picker unable to reveal anything it had excluded.
		const requiresPrefilteredTaskSet = Boolean(modifiedFileFilters?.length);
		const interactiveTasks = requiresPrefilteredTaskSet ? searchResultTasks : allTasks;
		if (interactiveTasks.length === 0) {
			printSearchResults(searchResultsInPrintedOrder(searchResults, "plain"));
			cleanup();
			return;
		}

		// Use the first search result as the selected task, or first available task if no results
		const firstTask = searchResultTasks[0] || interactiveTasks[0];
		const priorityFilter = filters.priority ? filters.priority : undefined;
		const statusFilter = filters.status;
		const { runUnifiedView } = await import("./ui/unified-view.ts");

		await runUnifiedView({
			core,
			initialView: "task-list",
			selectedTask: firstTask,
			tasks: interactiveTasks,
			filter: {
				title: query ? `Search: ${query}` : "Search",
				filterDescription: buildSearchFilterDescription({
					status: statusFilter,
					excludeStatus: filters.excludeStatus,
					type: filters.type,
					project: filters.project,
					priority: priorityFilter,
					query: query ?? "",
					modifiedFiles: modifiedFileFilters ?? [],
				}),
				status: statusFilter,
				excludeStatus: filters.excludeStatus,
				type: filters.type,
				project: filters.project,
				priority: priorityFilter,
				searchQuery: query ?? "", // Pre-populate search with the query
			},
		});
		cleanup();
	});
*/

/**
 * Gives task results the same readiness verdict `task list --json` publishes, derived in one pass
 * over the corpus for the results being printed. The projected rows are consumed in result order
 * rather than looked up by ID, so two files claiming one ID keep the verdict derived for their own
 * record instead of inheriting the other claimant's. Results that hold no task read no corpus:
 * there is nothing for a verdict to describe. Callers pass local results only.
 * /
async function projectSearchTaskRows(core: Core, results: SearchResult[]): Promise<SearchResultInput[]> {
	const searchedTasks = results.flatMap((result) => (isTaskSearchResult(result) ? [result.task] : []));
	const projectedTaskRows = (searchedTasks.length > 0 ? await loadTaskListItems(core, searchedTasks) : [])[
		Symbol.iterator
	]();
	const projectedResults: SearchResultInput[] = [];
	for (const result of results) {
		if (!isTaskSearchResult(result)) {
			projectedResults.push(result);
			continue;
		}
		const projected = projectedTaskRows.next();
		// One row per task result, in order, so this never runs out.
		if (projected.done) break;
		projectedResults.push({ ...result, task: projected.value });
	}
	return projectedResults;
}

function buildSearchFilterDescription(filters: {
	status?: string | string[];
	excludeStatus?: string[];
	type?: string[];
	project?: string[];
	priority?: SearchPriorityFilter;
	query?: string;
	modifiedFiles?: string[];
}): string {
	const parts: string[] = [];
	if (filters.query) {
		parts.push(`Query: ${filters.query}`);
	}
	if (filters.status) {
		const statusText = Array.isArray(filters.status) ? filters.status.join(", ") : filters.status;
		parts.push(`Status: ${statusText}`);
	}
	if (filters.excludeStatus?.length) {
		parts.push(`Exclude status: ${filters.excludeStatus.join(", ")}`);
	}
	if (filters.type?.length) {
		parts.push(`Type: ${filters.type.join(", ")}`);
	}
	if (filters.project?.length) {
		parts.push(`Project: ${filters.project.join(", ")}`);
	}
	if (filters.priority) {
		parts.push(`Priority: ${filters.priority}`);
	}
	if (filters.modifiedFiles?.length) {
		parts.push(`Modified files: ${filters.modifiedFiles.join(", ")}`);
	}
	return parts.join(" • ");
}

/** Plain search output groups results by type, in this order and under these headings. * /
const SEARCH_RESULT_TYPES = ["task", "document", "decision"] as const;
const SEARCH_RESULT_HEADINGS: Record<SearchResultType, string> = {
	task: "Tasks:",
	document: "Documents:",
	decision: "Decisions:",
};

/**
 * Search results as the output lists them: tasks from other branches are left out, plain text groups
 * the results by type, and JSON keeps relevance order.
 * /
function searchResultsInPrintedOrder(results: SearchResult[], outputMode: "plain" | "json"): SearchResult[] {
	const printable = results.filter((result) => !isTaskSearchResult(result) || isLocalEditableTask(result.task));
	if (outputMode === "json") return printable;
	return SEARCH_RESULT_TYPES.flatMap((type) => printable.filter((result) => result.type === type));
}

function formatSearchResultRow(result: SearchResult): string {
	const scoreText = formatScore(result.score);
	if (result.type === "task") {
		const { task } = result;
		const statusText = task.status ? ` (${task.status})` : "";
		const priorityText = task.priority ? ` [${task.priority.toUpperCase()}]` : "";
		return `  ${task.id} - ${task.title}${statusText}${priorityText}${scoreText}`;
	}
	const { id, title } = result.type === "document" ? result.document : result.decision;
	return `  ${id} - ${title}${scoreText}`;
}

/** Prints search results given in plain printed order, under one heading per result type. * /
function printSearchResults(results: SearchResult[]): void {
	const sections = SEARCH_RESULT_TYPES.flatMap((type) => {
		const group = results.filter((result) => result.type === type);
		return group.length > 0 ? [[SEARCH_RESULT_HEADINGS[type], ...group.map(formatSearchResultRow)].join("\n")] : [];
	});
	console.log(sections.length > 0 ? sections.join("\n\n") : "No results found.");
}
*/

function formatScore(score: number | null): string {
	if (score === null || score === undefined) {
		return "";
	}
	// Invert score so higher is better (Fuse.js uses 0=perfect match, 1=no match)
	const invertedScore = 1 - score;
	return ` [score ${invertedScore.toFixed(3)}]`;
}

function parseDocumentSearchLimit(value: unknown): number | undefined | null {
	if (value === undefined) {
		return undefined;
	}
	const rawValue = String(value).trim();
	const parsed = Number(rawValue);
	if (rawValue.length === 0 || !Number.isInteger(parsed) || parsed < 1 || parsed > DOCUMENT_SEARCH_LIMIT_MAX) {
		console.error(
			`Invalid limit: ${rawValue || "(empty)"}. Limit must be an integer between 1 and ${DOCUMENT_SEARCH_LIMIT_MAX}.`,
		);
		process.exitCode = 1;
		return null;
	}
	return parsed;
}

function formatDocumentSearchTags(document: DocType): string {
	return document.tags && document.tags.length > 0 ? document.tags.join(", ") : "(none)";
}

function printDocumentSearchResults(results: DocumentSearchResult[], query: string): void {
	if (results.length === 0) {
		console.log(`No documents found for "${query}".`);
		return;
	}

	console.log("Documents:");
	for (const result of results) {
		const { document } = result;
		const scoreText = formatScore(result.score);
		const pathText = document.path ?? "(unknown)";
		const tagsText = formatDocumentSearchTags(document);
		console.log(
			`  ${document.id} - ${document.title} (path: ${pathText}, type: ${document.type}, tags: ${tagsText})${scoreText}`,
		);
		console.log(`    View: backlog doc view ${document.id}`);
	}
}

function isDocumentSearchResult(result: SearchResult): result is DocumentSearchResult {
	return result.type === "document";
}

async function runTaskList(
	options: OptionValues,
	emitJson: (value: ReturnType<typeof taskListJson>) => void = printJson,
) {
	const listOutput = resolveListOutput({ ...options, ...taskReadOptions(options) }, taskListCommand);
	if (!listOutput) return;
	const { outputMode, listWindow } = listOutput;
	const cwd = await requireProjectRoot();
	const core = new Core(cwd);
	const cleanup = () => {
		core.disposeSearchService();
		core.disposeContentStore();
	};
	try {
		const hasDuplicateIds = await printDuplicateIntegrityWarning(core);
		if (hasDuplicateIds && outputMode === "json") return;
		const request = await parseTaskListRequest(core, options, TASK_SORT_FIELDS, {
			statusList: normalizeCliStatusList,
			priority: normalizeCliPriority,
			types: normalizeCliTaskTypes,
			projects: normalizeCliProjects,
		});
		if (!request) return;
		if (outputMode === "interactive") return await runTaskListProjectView(core, request, options);
		const { config, parentId, rows, jsonRows } = await queryTaskList(
			core,
			request,
			outputMode === "json" || request.ready,
		);
		if (outputMode === "json") {
			const page = selectListWindow(jsonRows, listWindow);
			return emitJson(taskListJson(page.items, page));
		}
		const statuses = config?.statuses || [];
		const priority = options.sort?.toLowerCase() === "priority";
		const printed = priority ? rows : groupTaskListByStatus(rows, statuses).flatMap((group) => group.tasks);
		printListWindow(printed, listWindow, (windowTasks) => {
			if (windowTasks.length === 0)
				return process.stdout.write(
					parentId ? `No child tasks found for parent task ${request.parentDisplayId}.\n` : "No tasks found.\n",
				);
			if (priority) {
				process.stdout.write("Tasks (sorted by priority):\n");
				for (const task of windowTasks) process.stdout.write(`${formatTaskListRow(task, true)}\n`);
				return;
			}
			printTaskListGroupedByStatus(windowTasks, statuses);
		});
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	} finally {
		cleanup();
	}
}

const taskListCommand = addHelpSchema(taskCmd.command("list"), {
	reads: "Local editable tasks from the configured backlog directory",
	required: [],
	optional: [
		{
			name: "status",
			type: () => statusType({ multiple: true }),
			description: "Filter tasks by one or more statuses; repeat or comma-separate values; case-insensitive",
		},
		{
			name: "exclude-status",
			type: statusType,
			description: "Exclude tasks with one or more statuses; repeat or comma-separate values",
		},
		{ name: "assignee", type: "Assignee", description: "Filter by @name" },
		{
			name: "unassigned",
			type: "Boolean",
			description: "Only tasks without an assignee; cannot be combined with --assignee",
		},
		{ name: "milestone", type: "Milestone ID or title", description: "Closest case-insensitive match" },
		{ name: "parent", type: "Task ID", description: "Show subtasks of a parent task" },
		{ name: "priority", type: priorityType, description: "Filter by task priority" },
		{
			name: "type",
			type: () => taskType({ multiple: true }),
			description: "Filter by one or more configured task types; repeat or comma-separate values",
		},
		{
			name: "project",
			type: () => projectType({ multiple: true }),
			description: "Filter by one or more configured projects; repeat or comma-separate values",
		},
		{
			name: "labels",
			type: "Comma-separated strings",
			description: "Require every listed label; repeat --labels or use label1,label2",
		},
		{ name: "search", type: "String", description: "Search task title, description, notes, comments, and metadata" },
		{ name: "ready", type: "Boolean", description: "Only show unblocked tasks with all dependencies completed" },
		{ name: "limit", type: "Positive integer", description: "Maximum tasks to display after sorting" },
		{ name: "sort", type: choiceType(TASK_SORT_FIELDS), description: "Task ordering before applying limit" },
		...LIST_WINDOW_HELP_FIELDS,
		{ name: "plain", type: "Boolean", description: "Use text output instead of interactive UI" },
		{ name: "json", type: "Boolean", description: "Use versioned machine-readable JSON output" },
		{
			name: "watch",
			type: "Boolean",
			description:
				"Requires --json; emit an initial full list and changed replacements until stopped or the process that started it ends",
		},
	],
	output: `Interactive task list, plain text with --plain, or versioned JSON with --json. ${LIST_WINDOW_OUTPUT_HELP}; JSON adds total and nextSkip. With --json --watch, successive complete JSON values use the same formatting; replace the previous list with each value. Restart for a fresh snapshot; intermediate edits may be coalesced.`,
	examples: [
		'backlog task list --status "<todo status>" --plain',
		"backlog task list --ready --plain",
		"backlog task list --json --watch",
		'backlog task list --status "<todo status>" --json',
		"backlog task list --parent {{TASK_ID:1}}",
		`backlog task list --type ${TASK_TYPE_EXAMPLE} --plain`,
		'backlog task list --labels frontend,bug --search "login" --limit 10 --plain',
		'backlog task list --status "<todo status>" --max-count 20 --skip 20 --plain',
		'backlog task list --status "<todo status>" --count',
	],
})
	.description("list tasks grouped by status")
	.option(
		"-s, --status <status>",
		"filter tasks by status (case-insensitive, repeatable or comma-separated)",
		createMultiValueAccumulator(),
	)
	.option(
		"--exclude-status <status>",
		"exclude tasks by status (repeatable or comma-separated)",
		createMultiValueAccumulator(),
	)
	.option("-a, --assignee <assignee>", "filter tasks by assignee")
	.option("--unassigned", "filter tasks without an assignee (cannot be combined with --assignee)")
	.option("-m, --milestone <milestone>", "filter tasks by milestone (closest match, case-insensitive)")
	.option("-p, --parent <taskId>", "filter tasks by parent task ID")
	.option("--priority <priority>", "filter tasks by priority (configured priorities)")
	.option(
		"--type <type>",
		"filter tasks by configured task type (repeatable or comma-separated)",
		createMultiValueAccumulator(),
	)
	.option(
		"--project <project>",
		"filter tasks by configured project (repeatable or comma-separated)",
		createMultiValueAccumulator(),
	)
	.option(
		"-l, --labels <labels>",
		"filter tasks by labels; require every comma-separated label (repeatable)",
		createMultiValueAccumulator(),
	)
	.option("--search <query>", "search task title, description, notes, comments, and metadata")
	.option("--ready", "only show unblocked tasks with all dependencies completed")
	.option("--limit <number>", "limit tasks displayed after sorting")
	.option("--sort <field>", `sort tasks by field (${TASK_SORT_FIELD_LIST})`);
addListWindowOptions(taskListCommand)
	.option("--plain", "use plain text output instead of interactive UI")
	.option("--json", "print versioned machine-readable JSON output")
	.option("--watch", "keep emitting changed full JSON lists (requires --json)")
	.action(async (options) => {
		if (!options.watch) {
			await runTaskList(options);
			return;
		}
		if (getTaskReadOutputMode(options) !== "json") {
			console.error("--watch requires --json and cannot be combined with --plain.");
			process.exitCode = 1;
			return;
		}
		const cwd = await requireProjectRoot();
		const filesystem = new Core(cwd).filesystem;
		// Notifications cover the whole backlog, including directories created later. The periodic stat
		// pass covers only what the list reads: tasks, completed tasks for readiness, milestones for
		// --milestone, and the config.
		const inputs = [
			filesystem.tasksDir,
			filesystem.completedDir,
			filesystem.milestonesDir,
			filesystem.archiveMilestonesDir,
			filesystem.configFilePath,
		];
		await watchJson([filesystem.backlogDir, dirname(filesystem.configFilePath)], inputs, async () => {
			let result: string | undefined;
			await runTaskList(options, (value) => {
				result = formatJson(value);
			});
			return result;
		});
		// Bun can retain a native stdout write after stream destruction when the reader
		// stops draining a pipe. Watch cleanup has finished; do not wait for that reader
		// after an explicit termination request.
		if (process.exitCode === 130 || process.exitCode === 143) process.exit(process.exitCode);
	});

type EditCommandTarget = {
	label: string;
	pluralLabel: string;
	statuses: (core: Core) => Promise<string[]>;
	resolve: (core: Core, idOrSelectedPath: string) => Promise<Task | null>;
	listCandidates: (core: Core) => Promise<Task[]>;
	selectionValue: (candidate: Task) => string;
	update: (core: Core, existing: Task, input: TaskUpdateInput) => Promise<Task>;
	notFoundMessage: (id: string) => string;
};

const taskEditTarget: EditCommandTarget = {
	label: "Task",
	pluralLabel: "tasks",
	statuses: (core) => getValidStatuses(core),
	resolve: (core, id) => core.loadTaskById(id, { includeCrossBranch: false }),
	listCandidates: (core) => core.queryTasks({ includeCrossBranch: false }),
	selectionValue: (candidate) => candidate.id,
	update: (core, existing, input) => core.editTask(existing.id, input, undefined, { includeCrossBranch: false }),
	notFoundMessage: (id) => `Task ${id} not found. ${LOCAL_TASK_LOOKUP_HINT}`,
};

const draftEditTarget: EditCommandTarget = {
	label: "Draft",
	pluralLabel: "drafts",
	statuses: async () => ["Draft"],
	async resolve(core, idOrSelectedPath) {
		// The single resolution authority for every draft entry point: direct ids go through the
		// id resolver; wizard selections arrive as the selected row's file path and are validated
		// against that exact file. Path-form handles re-resolve through the id authority so a
		// duplicate numeric identity can never bypass ambiguity detection.
		if (isAbsolute(idOrSelectedPath)) {
			const draftsDir = await core.filesystem.getDraftsDir();
			if (dirname(idOrSelectedPath) !== draftsDir) {
				throw new Error(
					`Invalid draft id: ${idOrSelectedPath}. Use a draft id (for example DRAFT-1), or pick the draft through 'backlog draft edit'.`,
				);
			}
			const direct = await core.filesystem.draftReferenceFromPath(idOrSelectedPath);
			const resolved = await core.filesystem.resolveDraftReference(direct.canonicalId);
			if (!resolved || resolved.filePath !== idOrSelectedPath) {
				throw new AmbiguousIdError(
					"Draft",
					normalizeId(direct.canonicalId, DRAFT_PREFIX),
					[idOrSelectedPath],
					"Rename one file to a distinct numeric id, then make its frontmatter agree.",
				);
			}
			return { ...resolved.task, id: resolved.canonicalId, filePath: resolved.filePath };
		}
		const reference = await core.filesystem.resolveDraftReference(idOrSelectedPath);
		return reference ? { ...reference.task, id: reference.canonicalId, filePath: reference.filePath } : null;
	},
	listCandidates: (core) => core.filesystem.listHealthyDrafts(),
	selectionValue: (candidate) => candidate.filePath ?? candidate.id,
	update: (core, existing, input) => {
		if (!existing.filePath) {
			throw new Error(`Cannot update draft ${existing.id} without its file path.`);
		}
		return core.updateDraftFromInput({ filePath: existing.filePath, canonicalId: existing.id }, input);
	},
	notFoundMessage: (id) => `Draft ${id} not found.`,
};

function normalizeEditRequestIds(requestedIds: string[] | undefined): string[] {
	const taskIds: string[] = [];
	for (const value of requestedIds ?? []) {
		const trimmed = String(value).trim();
		if (!trimmed || taskIds.some((seen) => canonicalTaskId(seen) === canonicalTaskId(trimmed))) continue;
		taskIds.push(trimmed);
	}
	return taskIds;
}

async function runEditWizard(target: EditCommandTarget, core: Core, requestedId: string | undefined): Promise<void> {
	let selectedTaskId = requestedId?.trim() || undefined;
	if (!selectedTaskId) {
		const candidates = await target.listCandidates(core);
		const taskOptions = candidates.map((candidate) => ({
			id: candidate.id,
			title: candidate.title,
			value: target.selectionValue(candidate),
		}));
		if (taskOptions.length === 0) {
			console.log(`No ${target.pluralLabel} found.`);
			return;
		}
		selectedTaskId = await pickTaskForEditWizard({ tasks: taskOptions });
		if (!selectedTaskId) {
			clack.cancel(`${target.label} edit cancelled.`);
			return;
		}
	}

	const existingTask = await target.resolve(core, selectedTaskId);
	if (!existingTask) {
		console.error(target.notFoundMessage(selectedTaskId));
		process.exitCode = 1;
		return;
	}
	const statuses = await target.statuses(core);
	const config = await core.filesystem.loadConfig();
	const wizardInput = await runTaskEditWizard({
		task: existingTask,
		statuses,
		priorities: config?.priorities,
		types: config?.types,
		projects: config?.projects,
	});
	if (!wizardInput) {
		clack.cancel(`${target.label} edit cancelled.`);
		return;
	}
	try {
		const updatedTask = await target.update(core, existingTask, wizardInput);
		console.log(`Updated ${target.label.toLowerCase()} ${updatedTask.id}`);
	} catch (error) {
		console.error(formatTaskEditError(error, existingTask.id, target.label.toLowerCase()));
		process.exitCode = 1;
	}
}

async function resolveEditTasks(target: EditCommandTarget, core: Core, taskIds: string[]) {
	const resolvedTasks: Task[] = [];
	const editFailures: Array<{ taskId: string; message: string }> = [];
	for (const requestedId of taskIds) {
		try {
			const loaded = await target.resolve(core, requestedId);
			if (loaded && resolvedTasks.some((seen) => seen.id === loaded.id)) continue;
			if (loaded) resolvedTasks.push(loaded);
			else editFailures.push({ taskId: requestedId, message: target.notFoundMessage(requestedId) });
		} catch (error) {
			editFailures.push({
				taskId: requestedId,
				message: formatTaskEditError(error, requestedId, target.label.toLowerCase()),
			});
		}
	}
	return { resolvedTasks, editFailures };
}

async function runEditCommand(target: EditCommandTarget, requestedIds: string[] | undefined, options: OptionValues) {
	// Listing the same task twice is a slip, not a request to edit it twice, so identities that
	// compare equal collapse to the first spelling the user typed. Canonical identity keeps a bare
	// number on the default prefix, so "7" cannot swallow an explicit "JIRA-7".
	const taskIds = normalizeEditRequestIds(requestedIds);
	const taskId = taskIds[0];
	const shouldUseWizard = hasInteractiveTTY && !hasEditFieldFlags(options);
	if (!shouldUseWizard && !taskId) {
		printMissingRequiredArgument("taskId");
		return;
	}

	if (taskIds.length > 1) {
		// These two guards run whether or not a terminal is attached: a batch means the same value is
		// written to every listed task, so a batch the CLI cannot apply must fail the same way in a
		// script and in a terminal rather than quietly becoming a wizard over the first ID.
		// --plain only chooses an output shape, so it never counts as a change to apply.
		if (!hasEditFieldFlags({ ...options, plain: undefined })) {
			console.error(
				`Cannot edit ${taskIds.length} ${target.pluralLabel} without any field flag. Pass the change to apply to every ${target.label.toLowerCase()}, for example --status "In Progress", or edit one ${target.label.toLowerCase()} at a time to use the interactive editor.`,
			);
			process.exitCode = 1;
			return;
		}
		const perTaskFlagError = findPerTaskOnlyFlag(options);
		if (perTaskFlagError) {
			console.error(perTaskFlagError);
			process.exitCode = 1;
			return;
		}
	}

	const cwd = await requireProjectRoot();
	const core = new Core(cwd);

	if (shouldUseWizard) {
		await runEditWizard(target, core, taskId);
		return;
	}

	// Resolve every listed ID first so an unresolvable or ambiguous ID is reported as its own failure
	// instead of aborting the tasks that did resolve. A single ID keeps the original one-error output.
	const { resolvedTasks, editFailures } = await resolveEditTasks(target, core, taskIds);

	const existingTask = resolvedTasks[0];
	if (!existingTask) {
		for (const failure of editFailures) {
			console.error(failure.message);
		}
		process.exitCode = 1;
		return;
	}

	const parsed = await parseTaskEditOptions(options, {
		core,
		statuses: () => target.statuses(core),
		resolveMilestone: (value) => resolveCliMilestoneInput(core, value),
	});
	if ("error" in parsed) {
		console.error(
			parsed.formatForTask
				? formatTaskEditError(parsed.error, existingTask.id, target.label.toLowerCase())
				: parsed.error,
		);
		process.exitCode = 1;
		return;
	}
	const updateInput = parsed.input;

	if (taskIds.length === 1) {
		let updatedTask: Task;
		try {
			updatedTask = await target.update(core, existingTask, updateInput);
		} catch (error) {
			console.error(formatTaskEditError(error, existingTask.id, target.label.toLowerCase()));
			process.exitCode = 1;
			return;
		}

		if (isPlainRequested(options)) {
			console.log(formatTaskPlainText(await loadTaskDetail(core, updatedTask)));
			return;
		}

		console.log(`Updated ${target.label.toLowerCase()} ${updatedTask.id}`);
		return;
	}

	// A batch writes the same change to independent files, so one failure must not stop the rest.
	// The outcome of each task is the useful output here, so a batch reports one line per task
	// rather than repeating a full task body for every ID.
	for (const task of resolvedTasks) {
		try {
			const updated = await target.update(core, task, updateInput);
			console.log(`Updated ${target.label.toLowerCase()} ${updated.id}`);
		} catch (error) {
			editFailures.push({ taskId: task.id, message: formatTaskEditError(error, task.id, target.label.toLowerCase()) });
		}
	}

	for (const failure of editFailures) {
		console.error(`Failed to update ${failure.taskId}: ${failure.message}`);
	}
	if (editFailures.length > 0) {
		process.exitCode = 1;
	}
}

function addEditFieldOptions(cmd: Command) {
	return cmd
		.option("-t, --title <title>")
		.option("-d, --description <text>", "task description")
		.option("--desc <text>", "alias for --description")
		.option(
			"-a, --assignee <assignees>",
			'replace all task assignees with one or more @names (comma-separated or repeatable); pass "" to clear them',
			createMultiValueAccumulator(),
		)
		.option("-s, --status <status>")
		.option(
			"-l, --label <labels>",
			"replace all task labels (comma-separated or repeatable; cannot combine with --add-label/--remove-label)",
			createMultiValueAccumulator(),
		)
		.option("--priority <priority>", "set task priority (configured priorities)")
		.option("--type <type>", "set task type (configured task types; pass an empty value to clear)")
		.option("--project <project>", "set task project (configured projects; pass an empty value to clear)")
		.option("--due-date <date>", "set due date (YYYY-MM-DD)")
		.option("--clear-due-date", "clear task due date")
		.option("--ordinal <number>", "set task ordinal for custom ordering")
		.option("-m, --milestone <milestone>", "assign task to milestone by ID or title")
		.option("--clear-milestone", "clear task milestone assignment")
		.option("--plain", "use plain text output after editing")
		.option(
			"--add-label <labels>",
			"add task labels without replacing existing labels (comma-separated or repeatable)",
			createMultiValueAccumulator(),
		)
		.option(
			"--remove-label <labels>",
			"remove task labels without replacing others (comma-separated or repeatable)",
			createMultiValueAccumulator(),
		)
		.option("--clear-labels", "remove all task labels (cannot combine with --label/--add-label/--remove-label)")
		.option("--ac <criteria>", "add acceptance criteria (can be used multiple times)", createMultiValueAccumulator())
		.option("--dod <item>", "add Definition of Done item (can be used multiple times)", createMultiValueAccumulator())
		.option(
			"--remove-ac <index>",
			"remove acceptance criterion by index (1-based, can be used multiple times)",
			createMultiValueAccumulator(),
		)
		.option(
			"--remove-dod <index>",
			"remove Definition of Done item by index (1-based, can be used multiple times)",
			createMultiValueAccumulator(),
		)
		.option(
			"--check-ac <index>",
			"check acceptance criterion by index (1-based, can be used multiple times)",
			createMultiValueAccumulator(),
		)
		.option(
			"--check-dod <index>",
			"check Definition of Done item by index (1-based, can be used multiple times)",
			createMultiValueAccumulator(),
		)
		.option(
			"--uncheck-ac <index>",
			"uncheck acceptance criterion by index (1-based, can be used multiple times)",
			createMultiValueAccumulator(),
		)
		.option(
			"--uncheck-dod <index>",
			"uncheck Definition of Done item by index (1-based, can be used multiple times)",
			createMultiValueAccumulator(),
		)
		.option(
			"--acceptance-criteria <criteria>",
			"replace all acceptance criteria (can be used multiple times; commas are preserved)",
			createMultiValueAccumulator(),
		)
		.option("--clear-ac", "remove all acceptance criteria (cannot combine with acceptance criteria mutation options)")
		.option("--plan <text>", "set implementation plan")
		.option("--notes <text>", "set implementation notes (replaces existing)")
		.option(
			"--comment <text>",
			"append a task comment; standalone '---' lines are reserved (can be used multiple times)",
			createMultiValueAccumulator(),
		)
		.option("--comment-author <author>", "author to record for appended comments")
		.option("--final-summary <text>", "set final summary (replaces existing)")
		.option(
			"--append-plan <text>",
			"append after --plan replacement (can be used multiple times)",
			createMultiValueAccumulator(),
		)
		.option(
			"--append-notes <text>",
			"append to implementation notes (can be used multiple times)",
			createMultiValueAccumulator(),
		)
		.option(
			"--append-final-summary <text>",
			"append to final summary (can be used multiple times)",
			createMultiValueAccumulator(),
		)
		.option("--clear-final-summary", "remove final summary")
		.option("--clear-deps", "remove all task dependencies (cannot combine with --depends-on or --dep)")
		.option(
			"--depends-on <taskIds>",
			'set task dependencies (comma-separated or use multiple times); pass "" to clear them',
			(value, previous) => {
				const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
				return [...soFar, value];
			},
		)
		.option("--dep <taskIds>", "set task dependencies (shortcut for --depends-on)", (value, previous) => {
			const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
			return [...soFar, value];
		})
		.option(
			"--ref <reference>",
			'replace all references (comma-separated or repeatable; cannot combine with --add-ref/--remove-ref); pass "" to clear them',
			createMultiValueAccumulator(),
		)
		.option(
			"--add-ref <reference>",
			"add references without replacing existing references (comma-separated or repeatable)",
			createMultiValueAccumulator(),
		)
		.option(
			"--remove-ref <reference>",
			"remove references without replacing others (comma-separated or repeatable)",
			createMultiValueAccumulator(),
		)
		.option("--clear-refs", "remove all references (cannot combine with --ref/--add-ref/--remove-ref)")
		.option(
			"--modified-file <path>",
			"set modified file paths from project root (can be used multiple times)",
			(value, previous) => {
				const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
				return [...soFar, value];
			},
		)
		.option(
			"--doc <documentation>",
			'set documentation (can be used multiple times); pass "" to clear it',
			(value, previous) => {
				const soFar = Array.isArray(previous) ? previous : previous ? [previous] : [];
				return [...soFar, value];
			},
		)
		.option("--clear-docs", "remove all documentation (cannot combine with --doc)");
}

const taskEditCommand = addHelpSchema(taskCmd.command("edit [taskIds...]"), {
	required: [
		{
			name: "taskIds",
			type: "Task IDs",
			description:
				"Tasks to update; prompted when omitted in interactive mode. Several IDs apply the same shared-field change to every task",
		},
	],
	optional: [
		{ name: "title", type: "String", description: "Replacement task title" },
		{ name: "description", type: "Markdown", description: "Replacement description" },
		{ name: "status", type: statusType, description: "Project task status; case-insensitive" },
		{ name: "type", type: taskType, description: "Replacement task type; case-insensitive" },
		{
			name: "project",
			type: projectType,
			description: "Replacement task project; case-insensitive; pass an empty value to clear",
		},
		{ name: "due-date", type: "date", description: "Set the task due date (YYYY-MM-DD)" },
		{ name: "clear-due-date", type: "Boolean", description: "Clear the task due date" },
		{
			name: "assignee",
			type: "Comma-separated strings",
			description: 'Replace all assignees; repeat -a or use @name1,@name2; -a "" clears them',
		},
		{
			name: "label",
			type: "Comma-separated strings",
			description: "Replace all labels; repeat --label or use label1,label2",
		},
		{
			name: "add-label",
			type: "Comma-separated strings",
			description: "Add labels; repeat --add-label or use label1,label2",
		},
		{
			name: "remove-label",
			type: "Comma-separated strings",
			description: "Remove labels; repeat --remove-label or use label1,label2",
		},
		{
			name: "clear-labels",
			type: "Boolean",
			description: "Remove all labels; cannot combine with other label flags",
		},
		{
			name: "clear-deps",
			type: "Boolean",
			description: "Remove all task dependencies; cannot combine with dependency flags",
		},
		{
			name: "add-ref",
			type: "Comma-separated strings",
			description: "Add references; repeat --add-ref or use ref1,ref2",
		},
		{
			name: "remove-ref",
			type: "Comma-separated strings",
			description: "Remove references; repeat --remove-ref or use ref1,ref2",
		},
		{
			name: "clear-refs",
			type: "Boolean",
			description: "Remove all references; cannot combine with --ref, --add-ref, or --remove-ref",
		},
		{
			name: "clear-docs",
			type: "Boolean",
			description: "Remove all documentation; cannot combine with --doc",
		},
		{ name: "plan", type: "Markdown", description: "Replacement implementation plan" },
		{
			name: "append-plan",
			type: "Markdown",
			description: "Append after --plan replacement; repeatable",
		},
		{ name: "notes", type: "Markdown", description: "Replacement implementation notes" },
		{ name: "append-notes", type: "Markdown", description: "Append to implementation notes; repeatable" },
		{ name: "comment", type: "Markdown", description: "Append a discussion comment" },
		{ name: "final-summary", type: "Markdown", description: "Completion summary" },
		{ name: "append-final-summary", type: "Markdown", description: "Append to final summary; repeatable" },
		{ name: "check-ac", type: "Integer", description: "1-based acceptance criterion index" },
	],
	writes: "Updates task metadata and structured task sections through Backlog.md",
	output: "Updated task details; use --plain for text output",
	examples: [
		'backlog task edit {{TASK_ID:1}} --status "<active status>" -a @sara',
		`backlog task edit {{TASK_ID:1}} --type ${TASK_TYPE_EXAMPLE}`,
		"backlog task edit {{TASK_ID:1}} --check-ac 1",
		'backlog task edit {{TASK_ID:1}} {{TASK_ID:2}} --status "<active status>"',
	],
}).description("edit an existing task");
addEditFieldOptions(taskEditCommand).action(async (taskIds: string[] | undefined, options) => {
	await runEditCommand(taskEditTarget, taskIds, options);
});

// Note: Implementation notes appending is handled via `task edit --append-notes` only.

addHelpSchema(taskCmd.command("view <taskId>"), {
	reads: "Task metadata, description, plan, notes, comments, final summary, AC, and DoD",
	required: [{ name: "taskId", type: "Task ID", description: "Task to display" }],
	optional: [
		{ name: "plain", type: "Boolean", description: "Use text output instead of interactive UI" },
		{ name: "json", type: "Boolean", description: "Use versioned machine-readable JSON output" },
	],
	output: "Interactive task detail view, plain text with --plain, or versioned JSON with --json",
	examples: ["backlog task view {{TASK_ID:1}} --plain", "backlog task view {{TASK_ID:1}} --json"],
})
	.description("display task details")
	.option("--plain", "use plain text output instead of interactive UI")
	.option("--json", "print versioned machine-readable JSON output")
	.action(async (taskId: string, options) => {
		const outputMode = getTaskReadOutputMode(options);
		if (!outputMode) return;
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		const taskView = await loadLocalTaskView(core, taskId);
		if (!taskView) return;
		if (printTaskViewOutput(taskView.detail, cwd, outputMode)) return;

		// Use enhanced task viewer with detail focus
		await viewTaskEnhanced(taskView.task, { startWithDetailFocus: true, core, tasks: taskView.tasks });
	});

addHelpSchema(taskCmd.command("archive <taskId>"), {
	required: [{ name: "taskId", type: "Task ID", description: "Task to archive" }],
	optional: [],
	writes: "Archives canceled, duplicate, or invalid work and removes incoming dependencies and task references",
	output: "Archive confirmation text",
	examples: ["backlog task archive {{TASK_ID:1}}"],
})
	.description("archive canceled, duplicate, or invalid work")
	.action(async (taskId: string) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		const task = await loadLocalEditableTask(core, taskId, "archive");
		if (!task) return;

		const { success, cleanedTaskIds } = await core.archiveTask(task.id, undefined, { includeCrossBranch: false });
		if (success) {
			console.log(`Archived task ${task.id}`);
			const cleanupMessage = formatDependencyCleanupMessage(task.id, cleanedTaskIds);
			if (cleanupMessage) {
				console.log(cleanupMessage);
			}
		} else {
			console.error(`Failed to archive task: ${task.id}`);
			process.exitCode = 1;
		}
	});

addHelpSchema(taskCmd.command("complete <taskId>"), {
	required: [
		{
			name: "taskId",
			type: "Task ID",
			description: "Task in the configured terminal status to move to completed",
		},
	],
	optional: [],
	writes:
		"During periodic cleanup, moves a finished task in the configured final status off the board to completed storage, preserving its record and dependency links.",
	output: "Completion cleanup confirmation and completed file path",
	examples: ["backlog task complete {{TASK_ID:1}}"],
})
	.description("move a finished task to completed storage during cleanup")
	.action(async (taskId: string) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		const task = await loadLocalEditableTask(core, taskId, "complete");
		if (!task) return;

		const config = await core.filesystem.loadConfig();
		const statuses = config?.statuses ?? [...DEFAULT_STATUSES];
		const terminalStatus = getTerminalStatus(statuses) ?? DEFAULT_DONE_STATUS;
		if (!isTerminalStatus(task.status, statuses)) {
			console.error(
				`Task ${task.id} is not ${terminalStatus}. Set status to "${terminalStatus}" with: backlog task edit ${task.id} -s "${terminalStatus}" before cleanup.`,
			);
			process.exitCode = 1;
			return;
		}

		const completedFilePath = task.filePath ? join(core.filesystem.completedDir, basename(task.filePath)) : undefined;
		const success = await core.completeTask(task.id, undefined, { includeCrossBranch: false });
		if (!success) {
			console.error(`Failed to complete task: ${task.id}`);
			process.exitCode = 1;
			return;
		}

		console.log(`Completed task ${task.id}.`);
		if (completedFilePath) {
			console.log(`File: ${completedFilePath}`);
		}
	});

taskCmd
	.command("demote <taskId>")
	.description("move task back to drafts")
	.action(async (taskId: string) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		try {
			const task = await core.loadTaskById(taskId, { includeCrossBranch: false });
			const demotion = task ? await core.demoteTask(task.id, undefined, { includeCrossBranch: false }) : null;
			if (task && demotion?.success) {
				console.log(`Demoted task ${task.id}`);
				const cleanupMessage = formatDependencyCleanupMessage(task.id, demotion.cleanedTaskIds);
				if (cleanupMessage) {
					console.log(cleanupMessage);
				}
			} else {
				console.error(`Task ${taskId} not found. ${LOCAL_TASK_LOOKUP_HINT}`);
				process.exitCode = 1;
			}
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		}
	});

taskCmd
	.argument("[taskId]")
	.option("--plain", "use plain text output")
	.option("--json", "print versioned machine-readable JSON output")
	.action(async (taskId: string | undefined, options: { json?: boolean; plain?: boolean }) => {
		const outputMode = getReadOutputMode(options);
		if (!outputMode) return;
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);

		// Don't handle commands that should be handled by specific command handlers
		const reservedCommands = ["create", "list", "edit", "view", "archive", "complete", "demote"];
		if (taskId && reservedCommands.includes(taskId)) {
			console.error(`Unknown command: ${taskId}`);
			taskCmd.help();
			return;
		}

		// Handle single task view only
		if (!taskId) {
			taskCmd.help();
			return;
		}

		const taskView = await loadLocalTaskView(core, taskId);
		if (!taskView) return;
		if (printTaskViewOutput(taskView.detail, cwd, outputMode)) return;

		// Use unified view with detail focus and Tab switching support
		const { runUnifiedView } = await import("./ui/unified-view.ts");
		await runUnifiedView({
			core,
			initialView: "task-detail",
			selectedTask: taskView.task,
			tasks: taskView.tasks,
		});
	});

async function viewDraftById(core: Core, taskId: string, options?: { plain?: boolean }): Promise<void> {
	try {
		const draft = await core.filesystem.loadDraft(taskId);
		if (!draft) {
			console.error(`Draft ${taskId} not found.`);
			return;
		}
		const usePlainOutput = isPlainRequested(options) || shouldAutoPlain;
		if (usePlainOutput) {
			console.log(formatTaskPlainText(await loadTaskDetail(core, draft)));
			return;
		}
		await viewTaskEnhanced(draft, { startWithDetailFocus: true, core });
	} catch (error) {
		if (isAmbiguousIdError(error)) {
			console.error(error.message);
			process.exitCode = 1;
			return;
		}
		throw error;
	}
}

const draftCmd = program.command("draft");

const draftListCommand = draftCmd
	.command("list")
	.description("list all drafts")
	.option("--sort <field>", `sort drafts by field (${TASK_SORT_FIELD_LIST})`);
addListWindowOptions(draftListCommand)
	.option("--plain", "use plain text output")
	.action(async (options: ListWindowOptions & { plain?: boolean; sort?: string }) => {
		const listOutput = resolveListOutput({ ...options, plain: isPlainRequested(options) }, draftListCommand);
		if (!listOutput) return;
		const { outputMode, listWindow } = listOutput;
		// Default to priority sorting to match web UI behavior
		const sortField = options.sort ? options.sort.toLowerCase() : "priority";
		if (!TASK_SORT_FIELDS.includes(sortField)) {
			console.error(`Invalid sort field: ${options.sort}. Valid values are: ${TASK_SORT_FIELD_LIST}`);
			process.exitCode = 1;
			return;
		}
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		await core.ensureConfigLoaded();
		const drafts = await core.filesystem.listDrafts();
		const config = await core.filesystem.loadConfig();
		const sortedDrafts = sortTasks(drafts, sortField, config?.priorities);

		if (outputMode !== "interactive" || sortedDrafts.length === 0) {
			// Plain text output for non-interactive environments
			printListWindow(sortedDrafts, listWindow, (windowDrafts) => {
				if (windowDrafts.length === 0) {
					console.log("No drafts found.");
					return;
				}
				console.log("Drafts:");
				for (const draft of windowDrafts) {
					const priorityIndicator = draft.priority ? `[${draft.priority.toUpperCase()}] ` : "";
					console.log(`  ${priorityIndicator}${draft.id} - ${draft.title}`);
				}
			});
			return;
		}

		// Interactive UI - use unified view with draft support
		const { runUnifiedView } = await import("./ui/unified-view.ts");
		await runUnifiedView({
			core,
			initialView: "task-list",
			selectedTask: sortedDrafts[0],
			tasks: sortedDrafts,
			filter: {
				filterDescription: "All Drafts",
			},
			title: "Drafts",
		});
	});

draftCmd
	.command("create <title>")
	.option("-d, --description <text>", "task description (multi-line: include real newlines inside the quoted string)")
	.option("--desc <text>", "alias for --description")
	.option(
		"-a, --assignee <assignees>",
		'assign draft to one or more @names (comma-separated or repeatable); pass "" to leave it unassigned',
		createMultiValueAccumulator(),
	)
	.option("-s, --status <status>")
	.option("-l, --labels <labels>", "add draft labels (comma-separated or repeatable)", createMultiValueAccumulator())
	.action(async (title: string, options) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		await core.ensureConfigLoaded();
		await createAndReportTask(
			core,
			{
				title,
				description: options.description || options.desc ? String(options.description || options.desc) : undefined,
				status: "Draft",
				assignee: parseClearableStringList(options.assignee),
				labels: parseDelimitedStringList(options.labels),
			},
			{ kind: "draft" },
		);
	});

const draftEditCommand = addHelpSchema(draftCmd.command("edit [taskId]"), {
	required: [
		{ name: "taskId", type: "Draft ID", description: "Draft to update; prompted when omitted in interactive mode" },
	],
	optional: [
		{ name: "title", type: "String", description: "Replacement draft title" },
		{ name: "description", type: "Markdown", description: "Replacement description" },
		{ name: "status", type: "String", description: 'Only "Draft" is valid; drafts cannot change status' },
		{ name: "type", type: taskType, description: "Replacement task type; case-insensitive" },
		{
			name: "project",
			type: projectType,
			description: "Replacement task project; case-insensitive; pass an empty value to clear",
		},
		{ name: "due-date", type: "date", description: "Set the due date (YYYY-MM-DD)" },
		{ name: "clear-due-date", type: "Boolean", description: "Clear the due date" },
		{
			name: "assignee",
			type: "Comma-separated strings",
			description: 'Replace all assignees; repeat -a or use @name1,@name2; -a "" clears them',
		},
		{ name: "label", type: "Comma-separated strings", description: "Replace all labels; repeatable" },
		{ name: "add-label", type: "Comma-separated strings", description: "Add labels; repeatable" },
		{ name: "remove-label", type: "Comma-separated strings", description: "Remove labels; repeatable" },
		{ name: "clear-labels", type: "Boolean", description: "Remove all labels" },
		{ name: "priority", type: "String", description: "Set priority (configured priorities)" },
		{ name: "ordinal", type: "Number", description: "Set ordinal for custom ordering" },
		{ name: "milestone", type: "String", description: "Assign to milestone by ID or title" },
		{ name: "clear-milestone", type: "Boolean", description: "Clear the milestone assignment" },
		{ name: "ac", type: "Comma-separated strings", description: "Add acceptance criteria; repeatable" },
		{ name: "acceptance-criteria", type: "Comma-separated strings", description: "Replace all acceptance criteria" },
		{ name: "clear-ac", type: "Boolean", description: "Remove all acceptance criteria" },
		{ name: "remove-ac", type: "Integer", description: "Remove acceptance criterion by 1-based index; repeatable" },
		{ name: "check-ac", type: "Integer", description: "Check acceptance criterion by 1-based index; repeatable" },
		{ name: "uncheck-ac", type: "Integer", description: "Uncheck acceptance criterion by 1-based index; repeatable" },
		{ name: "dod", type: "Comma-separated strings", description: "Add Definition of Done items; repeatable" },
		{ name: "remove-dod", type: "Integer", description: "Remove Definition of Done item by index; repeatable" },
		{ name: "check-dod", type: "Integer", description: "Check Definition of Done item by index; repeatable" },
		{ name: "uncheck-dod", type: "Integer", description: "Uncheck Definition of Done item by index; repeatable" },
		{ name: "plan", type: "Markdown", description: "Replacement implementation plan" },
		{ name: "append-plan", type: "Markdown", description: "Append after --plan replacement; repeatable" },
		{ name: "notes", type: "Markdown", description: "Replacement implementation notes" },
		{ name: "append-notes", type: "Markdown", description: "Append to implementation notes; repeatable" },
		{ name: "comment", type: "Markdown", description: "Append a discussion comment; repeatable" },
		{ name: "comment-author", type: "String", description: "Author to record for appended comments" },
		{ name: "final-summary", type: "Markdown", description: "Completion summary" },
		{ name: "append-final-summary", type: "Markdown", description: "Append to final summary; repeatable" },
		{ name: "clear-final-summary", type: "Boolean", description: "Remove final summary" },
		{ name: "depends-on", type: "Comma-separated strings", description: 'Set dependencies; pass "" to clear' },
		{ name: "dep", type: "Comma-separated strings", description: "Set dependencies (shortcut for --depends-on)" },
		{ name: "clear-deps", type: "Boolean", description: "Remove all dependencies" },
		{ name: "ref", type: "Comma-separated strings", description: 'Replace all references; pass "" to clear' },
		{ name: "add-ref", type: "Comma-separated strings", description: "Add references; repeatable" },
		{ name: "remove-ref", type: "Comma-separated strings", description: "Remove references; repeatable" },
		{ name: "clear-refs", type: "Boolean", description: "Remove all references" },
		{ name: "doc", type: "Comma-separated strings", description: 'Set documentation; pass "" to clear' },
		{ name: "modified-file", type: "Comma-separated strings", description: "Set modified file paths; repeatable" },
		{ name: "clear-docs", type: "Boolean", description: "Remove all documentation" },
		{ name: "plain", type: "Boolean", description: "Use plain text output after editing" },
	],
	writes: "Updates draft metadata and structured sections through Backlog.md",
	output: "Updated draft details; use --plain for text output",
	examples: ['backlog draft edit DRAFT-1 -t "Renamed draft"', "backlog draft edit DRAFT-1 --check-ac 1"],
}).description("edit an existing draft");
addEditFieldOptions(draftEditCommand).action(async (taskId: string | undefined, options) => {
	await runEditCommand(draftEditTarget, taskId ? [taskId] : [], options);
});

draftCmd
	.command("archive <taskId>")
	.description("archive a draft")
	.action(async (taskId: string) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		await runDraftTransition(taskId, "Archived", (id) => core.archiveDraft(id));
	});

draftCmd
	.command("promote <taskId>")
	.description("promote draft to task")
	.action(async (taskId: string) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		await runDraftTransition(taskId, "Promoted", (id) => core.promoteDraft(id));
	});

draftCmd
	.command("view <taskId>")
	.description("display draft details")
	.option("--plain", "use plain text output instead of interactive UI")
	.action(async (taskId: string, options) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		await viewDraftById(core, taskId, options);
	});

draftCmd
	.argument("[taskId]")
	.option("--plain", "use plain text output")
	.action(async (taskId: string | undefined, options: { plain?: boolean }) => {
		if (!taskId) {
			draftCmd.help();
			return;
		}

		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		await viewDraftById(core, taskId, options);
	});

const milestoneCmd = program.command("milestone").aliases(["milestones"]);

const milestoneListCommand = addHelpSchema(milestoneCmd.command("list"), {
	reads: "Milestone files and local task milestone values",
	required: [],
	optional: [
		{ name: "show-completed", type: "Boolean", description: "Include completed milestones" },
		...LIST_WINDOW_HELP_FIELDS,
		{ name: "plain", type: "Boolean", description: "Use text output instead of interactive UI" },
	],
	output: `Milestone list with completion status; active milestones come first, then completed ones with --show-completed. ${LIST_WINDOW_OUTPUT_HELP}`,
	examples: ["backlog milestone list --plain", "backlog milestone list --show-completed --max-count 10 --plain"],
})
	.description("list milestones with completion status")
	.option("--show-completed", "show completed milestones");
addListWindowOptions(milestoneListCommand)
	.option("--plain", "use plain text output")
	.action(async (options: ListWindowOptions & { showCompleted?: boolean; plain?: boolean }) => {
		const listOutput = resolveListOutput(options, milestoneListCommand);
		if (!listOutput) return;
		// Milestones have no interactive view, so every output mode prints text.
		const { listWindow } = listOutput;
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		await core.ensureConfigLoaded();

		const [tasks, milestones, archivedMilestones, config] = await Promise.all([
			core.queryTasks({ includeCrossBranch: false }),
			core.filesystem.listMilestones(),
			core.filesystem.listArchivedMilestones(),
			core.filesystem.loadConfig(),
		]);

		const statuses = config?.statuses ?? [...DEFAULT_STATUSES];
		const archivedMilestoneIds = collectArchivedMilestoneKeys(archivedMilestones, milestones);
		const buckets = buildMilestoneBuckets(tasks, milestones, statuses, { archivedMilestoneIds, archivedMilestones });
		const active = buckets.filter((bucket) => !bucket.isNoMilestone && !bucket.isCompleted);
		const completed = buckets.filter((bucket) => !bucket.isNoMilestone && bucket.isCompleted);

		const formatBucket = (bucket: (typeof buckets)[number]) => {
			const id = bucket.milestone ?? bucket.label;
			const label = bucket.label;
			const milestone = [...milestones, ...archivedMilestones].find(
				(candidate) => milestoneKey(candidate.id) === milestoneKey(id),
			);
			const dueDate = milestone?.dueDate ? `, due ${formatUtcDateForDisplay(milestone.dueDate)}` : "";
			return `  ${id}: ${label} (${bucket.doneCount}/${bucket.total} done${dueDate})`;
		};

		const showCompleted = Boolean(options.showCompleted || process.argv.includes("--show-completed"));
		const listedMilestones = showCompleted ? [...active, ...completed] : active;
		// Section headings keep their full counts.
		printListWindow(listedMilestones, listWindow, (listed, page) => {
			const prints = milestoneSectionsInWindow(page, active.length, showCompleted && completed.length > 0);
			const sections: string[] = [];
			if (prints.active) {
				const activeRows =
					active.length === 0 ? ["  (none)"] : listed.filter((bucket) => !bucket.isCompleted).map(formatBucket);
				sections.push([`Active milestones (${active.length}):`, ...activeRows].join("\n"));
			}
			if (prints.completed) {
				const completedRows =
					completed.length === 0
						? ["  (none)"]
						: showCompleted
							? listed.filter((bucket) => bucket.isCompleted).map(formatBucket)
							: ["  (collapsed, use --show-completed to list)"];
				sections.push([`Completed milestones (${completed.length}):`, ...completedRows].join("\n"));
			}
			console.log(sections.join("\n\n"));
		});
	});

addHelpSchema(milestoneCmd.command("add <name>"), {
	reads: "Active milestone files for duplicate and alias validation",
	required: [{ name: "name", type: "String", description: "Milestone name/title, trimmed before storage" }],
	optional: [
		{ name: "description", type: "Markdown", description: "Optional milestone description" },
		{ name: "due-date", type: "date", description: "Optional milestone due date (YYYY-MM-DD)" },
	],
	writes: "Creates a milestone markdown file in the active milestones directory",
	output: "Created milestone title and ID",
	examples: ['backlog milestone add "Release 1.0"', 'backlog milestone add "Beta" --description "Beta scope"'],
})
	.description("add a milestone file")
	.option("-d, --description <text>", "milestone description")
	.option("--due-date <date>", "set due date (YYYY-MM-DD)")
	.action(async (name: string, options: { description?: string; dueDate?: string }) => {
		await runMilestoneMutation((handlers) =>
			handlers.addMilestone({ name, description: options.description, dueDate: options.dueDate }),
		);
	});

addHelpSchema(milestoneCmd.command("rename <from> <to>"), {
	reads: "Active and archived milestone files, plus local tasks when task updates are enabled",
	required: [
		{ name: "from", type: "Milestone ID or title", description: "Existing active milestone to rename" },
		{ name: "to", type: "String", description: "New milestone title; checked for alias conflicts" },
	],
	optional: [
		{
			name: "update-tasks",
			type: "Boolean",
			description: "Update local task milestone references; default true, disable with --no-update-tasks",
		},
		{ name: "due-date", type: "date", description: "Set the milestone due date (YYYY-MM-DD)" },
		{ name: "clear-due-date", type: "Boolean", description: "Clear the milestone due date" },
	],
	writes: "Renames the milestone file and, by default, updates matching local task milestone values",
	output: "Rename summary, task update count, and file move path when changed",
	examples: [
		'backlog milestone rename "Release 1.0" "Release 2.0"',
		'backlog milestone rename m-1 "Release 2.0" --no-update-tasks',
	],
})
	.description("rename a milestone file and update local tasks by default")
	.option("--no-update-tasks", "do not update local tasks that reference the milestone")
	.option("--due-date <date>", "set due date (YYYY-MM-DD)")
	.option("--clear-due-date", "clear milestone due date")
	.action(
		async (from: string, to: string, options: { updateTasks?: boolean; dueDate?: string; clearDueDate?: boolean }) => {
			if (options.dueDate !== undefined && options.clearDueDate) {
				console.error("Cannot use --due-date and --clear-due-date together.");
				process.exitCode = 1;
				return;
			}
			await runMilestoneMutation((handlers) =>
				handlers.renameMilestone({
					from,
					to,
					updateTasks: options.updateTasks !== false,
					dueDate: options.clearDueDate ? null : options.dueDate,
				}),
			);
		},
	);

addHelpSchema(milestoneCmd.command("remove <name>"), {
	reads: "Active and archived milestone files, plus local tasks unless task handling is keep",
	required: [{ name: "name", type: "Milestone ID or title", description: "Active milestone to remove" }],
	optional: [
		{
			name: "task-handling",
			type: choiceType(["clear", "keep", "reassign"]),
			description: "How to handle matching local task milestone values; default clear",
		},
		{
			name: "reassign-to",
			type: "Milestone ID or title",
			description: "Required when task-handling is reassign; target must be an active milestone",
		},
	],
	writes: "Moves the milestone file to the archived milestones directory and may clear or reassign local tasks",
	output: "Removal summary and task handling count",
	examples: [
		'backlog milestone remove "Release 1.0"',
		'backlog milestone remove "Release 1.0" --task-handling keep',
		'backlog milestone remove "Release 1.0" --task-handling reassign --reassign-to "Release 2.0"',
	],
})
	.description("remove a milestone file and clear, keep, or reassign matching tasks")
	.option("--task-handling <mode>", "how to handle matching tasks (clear|keep|reassign)", "clear")
	.option("--reassign-to <milestone>", "target milestone when --task-handling reassign")
	.action(async (name: string, options: { taskHandling?: string; reassignTo?: string }) => {
		const taskHandling = parseMilestoneTaskHandling(options.taskHandling);
		if (!taskHandling) {
			console.error(`Invalid task handling: ${options.taskHandling}. Valid values are: clear, keep, reassign`);
			process.exitCode = 1;
			return;
		}

		await runMilestoneMutation((handlers) =>
			handlers.removeMilestone({
				name,
				taskHandling,
				reassignTo: options.reassignTo,
			}),
		);
	});

addHelpSchema(milestoneCmd.command("archive <name>"), {
	reads: "Active milestone files",
	required: [{ name: "name", type: "Milestone ID or title", description: "Milestone to archive" }],
	optional: [],
	writes: "Moves a milestone file into the archived milestones directory",
	output: "Archive confirmation text",
	examples: ["backlog milestone archive m-1"],
})
	.description("archive a milestone by id or title")
	.action(async (name: string) => {
		await runMilestoneMutation((handlers) => handlers.archiveMilestone({ name }));
	});

const boardCmd = program.command("board");

function addBoardOptions(cmd: Command) {
	return cmd
		.option("-l, --layout <layout>", "board layout (horizontal|vertical)", "horizontal")
		.option("--vertical", "use vertical layout (shortcut for --layout vertical)")
		.option("-m, --milestones", "group tasks by milestone");
}

async function handleBoardView(options: { layout?: string; vertical?: boolean; milestones?: boolean }) {
	const cwd = await requireProjectRoot();
	const core = new Core(cwd);
	const config = await core.filesystem.loadConfig();

	const statuses = config?.statuses || [];

	// Use unified view for Tab switching support
	const { runUnifiedView } = await import("./ui/unified-view.ts");
	await runUnifiedView({
		core,
		initialView: "kanban",
		milestoneMode: options.milestones,
		tasksLoader: async (updateProgress) => {
			const [tasks, milestoneEntities, archivedMilestones] = await Promise.all([
				core.loadTasks((msg) => {
					updateProgress(msg);
				}),
				core.filesystem.listMilestones(),
				core.filesystem.listArchivedMilestones(),
			]);
			const archivedKeys = new Set(collectArchivedMilestoneKeys(archivedMilestones, milestoneEntities));
			const normalizedTasks =
				archivedKeys.size > 0
					? tasks.map((task) => {
							const key = milestoneKey(
								resolveMilestoneInputForStorage(task.milestone ?? "", milestoneEntities, archivedMilestones),
							);
							if (!key || !archivedKeys.has(key)) {
								return task;
							}
							return { ...task, milestone: undefined };
						})
					: tasks;
			return {
				tasks: normalizedTasks.map((t) => ({ ...t, status: t.status || "" })),
				statuses,
			};
		},
	});
}

addBoardOptions(boardCmd).description("display tasks in a Kanban board").action(handleBoardView);

addBoardOptions(boardCmd.command("view").description("display tasks in a Kanban board")).action(handleBoardView);

boardCmd
	.command("export [filename]")
	.description("export kanban board to markdown file")
	.option("--force", "overwrite existing file without confirmation")
	.option("--readme", "export to README.md with markers")
	.option("--export-version <version>", "version to include in the export")
	.action(async (filename, options) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		const config = await core.filesystem.loadConfig();
		const statuses = config?.statuses || [];
		if (await printDuplicateIntegrityWarning(core)) return;

		// Load tasks with progress tracking
		const loadingScreen = await createLoadingScreen("Loading tasks for export");

		let finalTasks: Task[];
		try {
			// Use the shared Core method for loading board tasks
			finalTasks = await core.loadTasks((msg) => {
				loadingScreen?.update(msg);
			});

			loadingScreen?.update(`Total tasks: ${finalTasks.length}`);

			// Close loading screen before export
			loadingScreen?.close();

			// Get project name from config or use directory name
			const { basename } = await import("node:path");
			const projectName = config?.projectName || basename(cwd);

			if (options.readme) {
				// Use version from option if provided, otherwise use the CLI version
				const exportVersion = options.exportVersion || version;
				await updateReadmeWithBoard(finalTasks, statuses, projectName, exportVersion);
				console.log("Updated README.md with Kanban board.");
			} else {
				// Use filename argument or default to Backlog.md
				const outputFile = filename || "Backlog.md";
				const outputPath = join(cwd, outputFile as string);

				// Check if file exists and handle overwrite confirmation
				const fileExists = await Bun.file(outputPath).exists();
				if (fileExists && !options.force) {
					const rl = createInterface({ input });
					try {
						const answer = await rl.question(`File "${outputPath}" already exists. Overwrite? (y/N): `);
						if (!answer.toLowerCase().startsWith("y")) {
							console.log("Export cancelled.");
							return;
						}
					} finally {
						rl.close();
					}
				}

				await exportKanbanBoardToFile(finalTasks, statuses, outputPath, projectName, options.force || !fileExists);
				console.log(`Exported board to ${outputPath}`);
			}
		} catch (error) {
			loadingScreen?.close();
			throw error;
		}
	});

const docCmd = program.command("doc");

addHelpSchema(docCmd.command("create <title>"), {
	required: [{ name: "title", type: "String", description: "Document title" }],
	optional: [
		{
			name: "path",
			type: "Docs-relative path",
			description: "Subdirectory under backlog/docs; absolute paths and .. are rejected",
		},
		{ name: "type", type: choiceType(DOCUMENT_TYPE_VALUES), description: "Document type" },
		{ name: "plain", type: "Boolean", description: "Use plain text output" },
	],
	writes: "Creates a document markdown file under the configured docs directory",
	output: "Created document ID and path",
	examples: ['backlog doc create "API Guidelines" -p guides/api'],
})
	.option("-p, --path <path>")
	.option("-t, --type <type>", `document type (${DOCUMENT_TYPE_VALUES.join(", ")})`)
	// Accepted so agent guidance that always passes --plain works; create output is already plain text.
	.option("--plain", "use plain text output")
	.action(async (title: string, options) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		const document = await core.createDocumentFromInput({
			title: title as string,
			type: (options.type || "other") as DocType["type"],
			path: options.path,
			content: "",
		});
		console.log(`Created document ${document.id}`);
		if (document.path) {
			console.log(`Path: ${core.filesystem.backlogDirName}/docs/${document.path}`);
		}
	});

addHelpSchema(docCmd.command("update <docId>"), {
	required: [{ name: "docId", type: "Document ID", description: "Document to update" }],
	optional: [
		{ name: "title", type: "String", description: "Replacement title" },
		{ name: "content", type: "Markdown", description: "Replacement document body" },
		{ name: "path", type: "Docs-relative path", description: "Move document under backlog/docs" },
		{ name: "type", type: choiceType(DOCUMENT_TYPE_VALUES), description: "Document type" },
		{ name: "tags", type: "Comma-separated strings", description: "Replacement tags" },
	],
	writes: "Updates document content, metadata, or docs-relative path",
	output: "Updated document ID and path",
	examples: ['backlog doc update doc-1 --content "Updated markdown"', "backlog doc update doc-1 -p guides"],
})
	.description("update a document")
	.option("--title <title>", "update document title")
	.option("--content <content>", "replace document markdown content")
	.option("-p, --path <path>", "move document under a docs-relative path (absolute paths and .. are rejected)")
	.option("-t, --type <type>", `document type (${DOCUMENT_TYPE_VALUES.join(", ")})`)
	.option("--tags <tags>", "set tags (comma-separated or use multiple times)", createMultiValueAccumulator())
	.action(async (docId: string, options) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		const existingDocument = await core.getDocument(docId);
		if (!existingDocument) {
			throw new Error(`Document not found: ${docId}`);
		}

		const document = await core.updateDocumentFromInput({
			id: docId,
			title: options.title,
			content: options.content ?? existingDocument.rawContent,
			type: options.type,
			path: options.path,
			...(options.tags !== undefined && { tags: parseDelimitedStringList(options.tags) ?? [] }),
		});

		console.log(`Updated document ${document.id}`);
		if (document.path) {
			console.log(`Path: ${core.filesystem.backlogDirName}/docs/${document.path}`);
		}
	});

const docListCommand = addHelpSchema(docCmd.command("list"), {
	reads: "Documents under the configured docs directory",
	required: [],
	optional: [
		...LIST_WINDOW_HELP_FIELDS,
		{ name: "plain", type: "Boolean", description: "Use text output instead of interactive UI" },
	],
	output: `Document list with IDs, titles, types, paths, and tags, ordered by title. ${LIST_WINDOW_OUTPUT_HELP}`,
	examples: ["backlog doc list --plain", "backlog doc list --max-count 20 --plain"],
});
addListWindowOptions(docListCommand)
	.option("--plain", "use plain text output instead of interactive UI")
	.action(async (options) => {
		const listOutput = resolveListOutput({ ...options, plain: isPlainRequested(options) }, docListCommand);
		if (!listOutput) return;
		const { outputMode, listWindow } = listOutput;
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		const docs = await core.filesystem.listDocuments();

		// Plain text output for non-interactive environments
		if (outputMode !== "interactive" || docs.length === 0) {
			printListWindow(docs, listWindow, (windowDocs) => {
				if (windowDocs.length === 0) console.log("No docs found.");
				for (const d of windowDocs) {
					console.log(`${d.id} - ${d.title}`);
				}
			});
			return;
		}

		// Interactive UI
		const selected = await genericSelectList("Select a document", docs);
		if (selected) {
			// Resolve through the same reader as `doc view`. Matching filenames against the id
			// only found `<id> - <title>.md` at the top level, so documents written under the
			// older title-only filenames, or in a subdirectory, opened as nothing.
			const content = await core.getDocumentContent(selected.id);
			if (content !== null) {
				await scrollableViewer(content);
			}
		}
	});

const docSearchCommand = addHelpSchema(docCmd.command("search <query>"), {
	reads: "Documents under the configured docs directory using the shared fuzzy search index",
	writes: "None; this is a read-only command",
	required: [{ name: "query", type: "String", description: "Search text, 1-200 characters" }],
	optional: [
		{
			name: "limit",
			type: "Integer",
			description: `Maximum matching documents to return, 1-${DOCUMENT_SEARCH_LIMIT_MAX}`,
		},
		...LIST_WINDOW_HELP_FIELDS,
	],
	output: `Plain text Documents list with id, title, path, type, tags, score, and a follow-up doc view command. ${LIST_WINDOW_OUTPUT_HELP}`,
	examples: [
		'backlog doc search "architecture"',
		'backlog doc search "runbook" --limit 5',
		'backlog doc search "runbook" --max-count 5 --skip 5',
	],
}).option("-l, --limit <number>", `limit results returned (1-${DOCUMENT_SEARCH_LIMIT_MAX})`);
addListWindowOptions(docSearchCommand)
	.description("search documents using the shared fuzzy index")
	.action(async (query: string, options) => {
		const normalizedQuery = query.trim();
		if (normalizedQuery.length === 0) {
			console.error('Query is required. Provide non-empty text, for example: backlog doc search "architecture"');
			process.exitCode = 1;
			return;
		}
		if (normalizedQuery.length > DOCUMENT_SEARCH_QUERY_MAX_LENGTH) {
			console.error(`Query must be ${DOCUMENT_SEARCH_QUERY_MAX_LENGTH} characters or fewer.`);
			process.exitCode = 1;
			return;
		}

		const limit = parseDocumentSearchLimit(options.limit);
		if (limit === null) {
			return;
		}
		const listOutput = resolveListOutput(options, docSearchCommand);
		if (!listOutput) return;
		// Document search always prints text.
		const { listWindow } = listOutput;

		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		const searchService = await core.getSearchService();
		const contentStore = await core.getContentStore();
		const cleanup = () => {
			searchService.dispose();
			contentStore.dispose();
		};

		const results = searchService
			.search({
				query: normalizedQuery,
				limit,
				types: ["document"],
			})
			.filter(isDocumentSearchResult);

		printListWindow(results, listWindow, (windowResults) => printDocumentSearchResults(windowResults, normalizedQuery));
		cleanup();
	});

// Document view command
addHelpSchema(docCmd.command("view <docId>"), {
	reads: "Document metadata and markdown body",
	required: [{ name: "docId", type: "Document ID", description: "Document to display" }],
	optional: [{ name: "plain", type: "Boolean", description: "Use text output instead of interactive UI" }],
	output: "Document metadata and markdown content",
	examples: ["backlog doc view doc-1", "backlog doc view doc-1 --plain"],
})
	.description("view a document")
	.option("--plain", "use plain text output instead of interactive UI")
	.action(async (docId: string, options) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		try {
			const content = await core.getDocumentContent(docId);
			if (content === null) {
				console.error(`Document ${docId} not found.`);
				return;
			}
			const usePlainOutput = isPlainRequested(options) || shouldAutoPlain;
			if (usePlainOutput) {
				console.log(content);
				return;
			}
			await scrollableViewer(content);
		} catch (error) {
			if (isAmbiguousIdError(error)) {
				console.error(error.message);
				process.exitCode = 1;
				return;
			}
			console.error(`Document ${docId} not found.`);
		}
	});

const decisionCmd = program.command("decision");

addHelpSchema(decisionCmd.command("create <title>"), {
	required: [{ name: "title", type: "String", description: "Decision title" }],
	optional: [
		{ name: "status", type: "String", description: "Decision status; free-form, defaults to proposed" },
		{ name: "plain", type: "Boolean", description: "Use plain text output" },
	],
	writes: "Creates a decision markdown file under the configured decisions directory",
	output: "Created decision ID",
	examples: ['backlog decision create "Adopt Bun test runner" -s accepted --plain'],
})
	.description("create a decision")
	.option("-s, --status <status>", "set decision status (free-form, defaults to proposed)")
	// Accepted so agent guidance that always passes --plain works; create output is already plain text.
	.option("--plain", "use plain text output")
	.action(async (title: string, options) => {
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		const id = await generateNextDecisionId(core);
		const decision: Decision = {
			id,
			title: title as string,
			date: new Date().toISOString().slice(0, 16).replace("T", " "),
			status: (options.status || "proposed") as Decision["status"],
			context: "",
			decision: "",
			consequences: "",
			rawContent: "",
		};
		await core.createDecision(decision);
		console.log(`Created decision ${id}`);
	});

const decisionListCommand = addHelpSchema(decisionCmd.command("list"), {
	reads: "Decisions under the configured decisions directory",
	writes: "None; this is a read-only command",
	required: [],
	optional: [
		...LIST_WINDOW_HELP_FIELDS,
		{ name: "plain", type: "Boolean", description: "Use plain text output, which is the default for this command" },
		{ name: "json", type: "Boolean", description: "Use versioned machine-readable JSON output" },
	],
	output: `Decision list with IDs, titles, and statuses, ordered by ID; versioned JSON with --json. ${LIST_WINDOW_OUTPUT_HELP}; JSON adds total and nextSkip`,
	examples: ["backlog decision list --plain", "backlog decision list --json", "backlog decision list --max-count 20"],
}).description("list decisions");
addListWindowOptions(decisionListCommand)
	.option("--plain", "use plain text output")
	.option("--json", "print versioned machine-readable JSON output")
	.action(async (options) => {
		const listOutput = resolveListOutput(options, decisionListCommand);
		if (!listOutput) return;
		const { outputMode, listWindow } = listOutput;
		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		const decisions = await core.filesystem.listDecisions();

		if (outputMode === "json") {
			const page = selectListWindow(decisions, listWindow);
			printJson(decisionListJson(page.items, page));
			return;
		}

		// Decisions have no interactive detail view, so text output covers plain and TTY runs.
		printListWindow(decisions, listWindow, (windowDecisions) => {
			if (windowDecisions.length === 0) console.log("No decisions found.");
			for (const decision of windowDecisions) {
				const status = decision.status ? ` (${decision.status})` : "";
				console.log(`${decision.id} - ${decision.title}${status}`);
			}
		});
	});

// Agents command group
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
		if (!options.updateInstructions) {
			agentsCmd.help();
			return;
		}
		try {
			const cwd = await requireProjectRoot();
			const project = await loadInitializedProject(async () => new Core(cwd));
			if (!project) return;
			const { core } = project;

			const selected = await clack.multiselect({
				message: "Select agent instruction files to update (space toggles selections; enter confirms)",
				required: false,
				options: [
					{ label: "CLAUDE.md (Claude Code)", value: "CLAUDE.md" },
					{
						label: "AGENTS.md (Codex, Jules, Amp, Cursor, Zed, Warp, Aider, GitHub, RooCode)",
						value: "AGENTS.md",
					},
					{ label: "GEMINI.md (Google CLI)", value: "GEMINI.md" },
					{ label: "Copilot (GitHub Copilot)", value: ".github/copilot-instructions.md" },
				],
			});
			if (clack.isCancel(selected)) {
				clack.log.info("Agent instruction update cancelled.");
				return;
			}

			const files: AgentInstructionFile[] = Array.isArray(selected) ? (selected as AgentInstructionFile[]) : [];
			if (files.length > 0) {
				const shouldAutoCommit = project.config.autoCommit ?? false;
				await addAgentInstructions(cwd, core.gitOps, files, shouldAutoCommit);
				console.log(`Updated ${files.length} agent instruction file(s): ${files.join(", ")}`);
			} else {
				console.log("No files selected for update.");
			}
		} catch (err) {
			reportCommandFailure("Failed to update agent instructions", err);
		}
	});

const configCmd = addHelpSchema(program.command("config"), {
	reads: "Project Backlog.md configuration",
	required: [],
	optional: [],
	writes: "Interactive configuration updates when run without a subcommand",
	output: "Interactive wizard results or subcommand output",
	examples: ["backlog config", "backlog config list", "backlog config get defaultEditor"],
})
	.description("manage backlog configuration")
	.action(async () => {
		try {
			const cwd = await requireProjectRoot();
			const core = new Core(cwd);
			const existingConfig = await core.filesystem.loadConfig();

			if (!existingConfig) {
				console.error("No backlog project found. Initialize one first with: backlog init");
				process.exit(1);
			}

			const {
				mergedConfig,
				installClaudeAgent: shouldInstallClaude,
				installShellCompletions: shouldInstallCompletions,
			} = await configureAdvancedSettings(core);

			let completionResult: CompletionInstallResult | null = null;
			let completionError: string | null = null;
			if (shouldInstallCompletions) {
				try {
					completionResult = await installCompletion();
				} catch (error) {
					completionError = error instanceof Error ? error.message : String(error);
				}
			}

			console.log("\nAdvanced configuration updated.");
			console.log(`  Check active branches: ${mergedConfig.checkActiveBranches ?? true}`);
			console.log(`  Remote operations: ${mergedConfig.remoteOperations ?? true}`);
			console.log(
				`  Zero-padded IDs: ${
					typeof mergedConfig.zeroPaddedIds === "number" ? `${mergedConfig.zeroPaddedIds} digits` : "disabled"
				}`,
			);
			console.log(`  Web UI port: ${mergedConfig.defaultPort ?? 6420}`);
			console.log(`  Auto open browser: ${mergedConfig.autoOpenBrowser ?? true}`);
			console.log(`  Bypass git hooks: ${mergedConfig.bypassGitHooks ?? false}`);
			console.log(`  Auto commit: ${mergedConfig.autoCommit ?? false}`);
			console.log(`  Definition of Done defaults: ${(mergedConfig.definitionOfDone ?? []).join(" | ") || "(none)"}`);
			if (completionResult) {
				console.log(`  Shell completions: installed to ${completionResult.installPath}`);
			} else if (completionError) {
				console.log("  Shell completions: installation failed (see warning below)");
			} else {
				console.log("  Shell completions: skipped");
			}
			if (mergedConfig.defaultEditor) {
				console.log(`  Default editor: ${mergedConfig.defaultEditor}`);
			}
			if (shouldInstallClaude) {
				await installClaudeAgent(cwd);
				console.log("✓ Claude Code Backlog.md agent installed to .claude/agents/");
			}
			if (completionResult) {
				const instructions = completionResult.instructions.trim();
				console.log(
					[
						"",
						`Shell completion script installed for ${completionResult.shell}.`,
						`  Path: ${completionResult.installPath}`,
						instructions,
						"",
					].join("\n"),
				);
			} else if (completionError) {
				const indentedError = completionError
					.split("\n")
					.map((line) => `  ${line}`)
					.join("\n");
				console.warn(
					`⚠️  Shell completion installation failed:\n${indentedError}\n  Run \`backlog completion install\` later to retry.\n`,
				);
			}
			console.log("\nUse `backlog config list` to review all configuration values.");
		} catch (err) {
			reportCommandFailure("Failed to update configuration", err);
		}
	});

addHelpSchema(configCmd.command("get <key>"), {
	reads: "Project Backlog.md configuration",
	required: [{ name: "key", type: choiceType(CONFIG_GET_KEYS), description: "Configuration value to print" }],
	optional: [],
	output: "The selected configuration value",
	examples: ["backlog config get defaultEditor", "backlog config get types"],
})
	.description("get a configuration value")
	.action(async (key: string) => {
		try {
			const project = await loadInitializedProject(async () => new Core(await requireProjectRoot()));
			if (!project) return;
			const { core, config } = project;
			if (!(await printConfigValue(core, config, key))) process.exitCode = 1;
			return;

			/*
			// Handle specific config keys
			switch (key) {
				case "defaultEditor":
					if (config.defaultEditor) {
						console.log(config.defaultEditor);
					} else {
						console.log("defaultEditor is not set");
						process.exit(1);
					}
					break;
				case "projectName":
					console.log(config.projectName);
					break;
				case "defaultAssignee":
					console.log(config.defaultAssignee?.join(", ") || "");
					break;
				case "defaultStatus":
					console.log(config.defaultStatus || "");
					break;
				case "statuses":
					console.log(config.statuses.join(", "));
					break;
				case "labels":
					console.log(config.labels.join(", "));
					break;
				case "priorities":
					console.log(
						getPriorityOptions(config)
							.map((priority) => priority.label)
							.join(", "),
					);
					break;
				case "types":
					console.log(getTaskTypeValues(config).join(", "));
					break;
				case "projects":
					console.log(getProjectValues(config).join(", "));
					break;
				case "milestones": {
					const milestones = await core.filesystem.listMilestones();
					console.log(milestones.map((milestone) => milestone.id).join(", "));
					break;
				}
				case "definitionOfDone":
					console.log(config.definitionOfDone?.join(", ") || "");
					break;
				case "dateFormat":
					console.log(config.dateFormat);
					break;
				case "maxColumnWidth":
					console.log(config.maxColumnWidth?.toString() || "");
					break;
				case "defaultPort":
					console.log(config.defaultPort?.toString() || "");
					break;
				case "autoOpenBrowser":
					console.log(config.autoOpenBrowser?.toString() || "");
					break;
				case "hideEmptyColumns":
					console.log(config.hideEmptyColumns?.toString() || "false");
					break;
				case "remoteOperations":
					console.log(config.remoteOperations?.toString() || "");
					break;
				case "autoCommit":
					console.log(config.autoCommit?.toString() || "");
					break;
				case "filesystemOnly":
					console.log(config.filesystemOnly?.toString() || "false");
					break;
				case "bypassGitHooks":
					console.log(config.bypassGitHooks?.toString() || "");
					break;
				case "zeroPaddedIds":
					console.log(config.zeroPaddedIds?.toString() || "(disabled)");
					break;
				case "checkActiveBranches":
					console.log(config.checkActiveBranches?.toString() || "true");
					break;
				case "activeBranchDays":
					console.log(config.activeBranchDays?.toString() || "30");
					break;
				default:
					console.error(`Unknown config key: ${key}`);
					console.error(CONFIG_AVAILABLE_KEYS);
					process.exit(1);
			}
			*/
		} catch (err) {
			reportCommandFailure("Failed to get config value", err);
		}
	});

addHelpSchema(configCmd.command("set <key> <value>"), {
	required: [
		{ name: "key", type: choiceType(CONFIG_SET_KEYS), description: "Configuration value to update" },
		{ name: "value", type: "String", description: "New value; parsed based on key type" },
	],
	optional: [],
	writes: "Updates the project Backlog.md configuration file",
	output: "Confirmation of the updated config value",
	examples: [
		'backlog config set defaultEditor "code --wait"',
		"backlog config set autoCommit true",
		'backlog config set defaultAssignee "@alice,@bob"',
	],
})
	.description("set a configuration value")
	.action(async (key: string, value: string) => {
		try {
			const project = await loadInitializedProject(async () => new Core(await requireProjectRoot()));
			if (!project) return;
			const { core, config } = project;
			if (!(await setConfigValue(config, key, value))) {
				process.exitCode = 1;
				return;
			}
			await core.filesystem.saveConfig(config);
			console.log(`Set ${key} = ${value}`);
			return;

			/*
			// Handle specific config keys
			switch (key) {
				case "defaultEditor": {
					// An explicitly empty value means "no editor" and skips executable validation
					if (value) {
						// Validate that the editor command exists
						const { isEditorAvailable } = await import("./utils/editor.ts");
						const isAvailable = await isEditorAvailable(value);
						if (!isAvailable) {
							console.error(`Editor command not found: ${value}`);
							console.error("Please ensure the editor is installed and available in your PATH");
							process.exit(1);
						}
					}
					config.defaultEditor = value;
					break;
				}
				case "projectName":
					config.projectName = value;
					break;
				case "defaultAssignee":
					// An empty value clears the default; comma-separated values set several assignees.
					config.defaultAssignee = parseDelimitedStringList(value);
					break;
				case "defaultStatus":
					config.defaultStatus = value;
					break;
				case "dateFormat":
					config.dateFormat = value;
					break;
				case "maxColumnWidth": {
					const width = Number.parseInt(value, 10);
					if (Number.isNaN(width) || width <= 0) {
						console.error("maxColumnWidth must be a positive number");
						process.exit(1);
					}
					config.maxColumnWidth = width;
					break;
				}
				case "autoOpenBrowser":
				case "hideEmptyColumns":
					applyBooleanConfigValue(config, key, value);
					break;
				case "defaultPort": {
					const port = Number.parseInt(value, 10);
					if (Number.isNaN(port) || port < 1 || port > 65535) {
						console.error("defaultPort must be a valid port number (1-65535)");
						process.exit(1);
					}
					config.defaultPort = port;
					break;
				}
				case "remoteOperations":
				case "autoCommit":
					applyBooleanConfigValue(config, key, value);
					break;
				case "filesystemOnly": {
					const boolValue = value.toLowerCase();
					if (boolValue === "true" || boolValue === "1" || boolValue === "yes") {
						config.filesystemOnly = true;
						config.checkActiveBranches = false;
						config.remoteOperations = false;
						config.autoCommit = false;
						config.bypassGitHooks = false;
					} else if (boolValue === "false" || boolValue === "0" || boolValue === "no") {
						config.filesystemOnly = false;
					} else {
						console.error("filesystemOnly must be true or false");
						process.exit(1);
					}
					break;
				}
				case "bypassGitHooks":
					applyBooleanConfigValue(config, key, value);
					break;
				case "zeroPaddedIds": {
					const padding = Number.parseInt(value, 10);
					if (Number.isNaN(padding) || padding < 0) {
						console.error("zeroPaddedIds must be a non-negative number.");
						process.exit(1);
					}
					// Set to undefined if 0 to remove it from config
					config.zeroPaddedIds = padding > 0 ? padding : undefined;
					break;
				}
				case "checkActiveBranches":
					applyBooleanConfigValue(config, key, value);
					break;
				case "activeBranchDays": {
					const days = Number.parseInt(value, 10);
					if (Number.isNaN(days) || days < 0) {
						console.error("activeBranchDays must be a non-negative number.");
						process.exit(1);
					}
					config.activeBranchDays = days;
					break;
				}
				case "statuses":
				case "labels":
				case "types":
				case "priorities":
				case "projects":
				case "milestones":
				case "definitionOfDone":
					if (key === "milestones") {
						console.error("milestones cannot be set directly.");
						console.error(
							"Use milestone files via milestone commands (e.g. `backlog milestone list`, `backlog milestone add`).",
						);
					} else if (key === "definitionOfDone") {
						console.error("definitionOfDone cannot be set directly.");
						console.error(
							"Use `backlog config` for interactive editing, update the project config file (`backlog/config.yml`, `.backlog/config.yml`, or `backlog.config.yml`), or use Web UI Settings.",
						);
					} else {
						console.error(`${key} cannot be set directly. View current values with 'backlog config get ${key}'.`);
						console.error(
							"Edit the list in the project config file (`backlog/config.yml`, `.backlog/config.yml`, or `backlog.config.yml`) directly.",
						);
					}
					process.exit(1);
					break;
				case "taskPrefix":
				case "prefixes":
					console.error("Task prefix cannot be changed after initialization.");
					console.error(
						"The prefix is set during 'backlog init' and is permanent to avoid breaking existing task IDs.",
					);
					process.exit(1);
					break;
				default:
					console.error(`Unknown config key: ${key}`);
					console.error(CONFIG_AVAILABLE_KEYS);
					process.exit(1);
			}

			await core.filesystem.saveConfig(config);
			console.log(`Set ${key} = ${value}`);
			*/
		} catch (err) {
			reportCommandFailure("Failed to set config value", err);
		}
	});

addHelpSchema(configCmd.command("list"), {
	reads: "Project Backlog.md configuration",
	required: [],
	optional: [],
	output: "All public configuration values",
	examples: ["backlog config list"],
})
	.description("list all configuration values")
	.action(async () => {
		try {
			const project = await loadInitializedProject(async () => new Core(await requireProjectRoot()));
			if (!project) return;
			const { core, config } = project;

			console.log("Configuration:");
			console.log(`  projectName: ${config.projectName}`);
			console.log(`  defaultEditor: ${config.defaultEditor || "(not set)"}`);
			console.log(`  defaultAssignee: [${(config.defaultAssignee ?? []).join(", ")}]`);
			console.log(`  defaultStatus: ${config.defaultStatus || "(not set)"}`);
			console.log(`  statuses: [${config.statuses.join(", ")}]`);
			console.log(`  labels: [${config.labels.join(", ")}]`);
			console.log(
				`  priorities: [${getPriorityOptions(config)
					.map((priority) => priority.label)
					.join(", ")}]`,
			);
			console.log(`  types: [${getTaskTypeValues(config).join(", ")}]`);
			console.log(`  projects: [${getProjectValues(config).join(", ")}]`);
			const milestones = await core.filesystem.listMilestones();
			console.log(`  milestones: [${milestones.map((milestone) => milestone.id).join(", ")}]`);
			console.log(`  definitionOfDone: [${(config.definitionOfDone ?? []).join(", ")}]`);
			console.log(`  dateFormat: ${config.dateFormat}`);
			console.log(`  maxColumnWidth: ${config.maxColumnWidth || "(not set)"}`);
			console.log(`  autoOpenBrowser: ${config.autoOpenBrowser ?? "(not set)"}`);
			console.log(`  hideEmptyColumns: ${config.hideEmptyColumns ?? "(not set)"}`);
			console.log(`  defaultPort: ${config.defaultPort ?? "(not set)"}`);
			console.log(`  remoteOperations: ${config.remoteOperations ?? "(not set)"}`);
			console.log(`  autoCommit: ${config.autoCommit ?? "(not set)"}`);
			console.log(`  filesystemOnly: ${config.filesystemOnly ?? "false"}`);
			console.log(`  bypassGitHooks: ${config.bypassGitHooks ?? "(not set)"}`);
			console.log(`  zeroPaddedIds: ${config.zeroPaddedIds ?? "(disabled)"}`);
			console.log(`  taskPrefix: ${config.prefixes?.task || "task"} (read-only)`);
			console.log(`  checkActiveBranches: ${config.checkActiveBranches ?? "true"}`);
			console.log(`  activeBranchDays: ${config.activeBranchDays ?? "30"}`);
		} catch (err) {
			reportCommandFailure("Failed to list config values", err);
		}
	});
/* Legacy doctor implementation retained temporarily during the command extraction.
addHelpSchema(program.command("doctor"), {
	reads: "Active and completed task files, document, decision, and draft files, plus Backlog Markdown references",
	required: [],
	optional: [
		{ name: "fix", type: "Boolean", description: "Apply the displayed duplicate-ID repair" },
		{ name: "yes", type: "Boolean", description: "Confirm --fix without an interactive prompt" },
	],
	writes:
		"With --fix, atomically renames duplicate task files and updates only their frontmatter IDs; ambiguous references are reported for human review",
	output:
		"Duplicate-ID diagnosis for tasks, documents, decisions, and drafts, a deterministic task repair preview, a reference-review report, and a report of self-referential and cyclic task dependencies",
	examples: ["backlog doctor", "backlog doctor --fix", "backlog doctor --fix --yes"],
})
	.description(
		"diagnose duplicate task, document, and decision IDs, report self-referential and cyclic dependencies, and safely repair duplicate task IDs",
	)
	.option("--fix", "apply the displayed duplicate task ID repair")
	.option("--yes", "confirm --fix without prompting")
	.action(async (options: { fix?: boolean; yes?: boolean }) => {
		if (options.yes && !options.fix) {
			console.error("--yes can only be used together with --fix.");
			process.exitCode = 1;
			return;
		}

		const cwd = await requireProjectRoot();
		const core = new Core(cwd);
		try {
			const config = await core.filesystem.loadConfig();
			const taskPrefix = config?.prefixes?.task;
			const reservedTaskPrefix = taskPrefix && isReservedTaskPrefix(taskPrefix) ? taskPrefix : null;
			if (reservedTaskPrefix) {
				console.error(
					`Task prefix "${reservedTaskPrefix}" collides with a reserved prefix (draft, doc, decision); tasks are misrouted as that entity type.`,
				);
				console.error(
					"There is no automated migration. Rename the affected task files and IDs to a non-reserved prefix, then set task_prefix in the project config file to match.",
				);
				process.exitCode = 1;
				if (options.fix) {
					console.error("Resolve the reserved task prefix before running --fix.");
					return;
				}
			}

			const plan = await core.previewDuplicateTaskIdRepair({ includeBranches: true });
			const contentIdentity = await core.diagnoseContentIdentity();
			const contentIdentityBroken = hasContentIdentityIssues(contentIdentity);
			const draftIdentity = await core.filesystem.diagnoseDraftIdentity();
			const draftIdentityBroken = hasDraftIdentityFindings(draftIdentity);
			const dependencyDefects = await findDependencyDefects(core);
			const dependenciesBroken = dependencyDefects.selfDependencies.length > 0 || dependencyDefects.cycles.length > 0;
			if (
				plan.groups.length === 0 &&
				plan.crossBranchFindings.length === 0 &&
				!contentIdentityBroken &&
				!draftIdentityBroken &&
				!dependenciesBroken
			) {
				if (!reservedTaskPrefix) {
					console.log("No duplicate IDs, self-referential dependencies, or dependency cycles found.");
				}
				return;
			}

			printDuplicateRepairPlan(plan);
			printContentIdentityReport(contentIdentity);
			printDraftIdentityReport(draftIdentity);
			printDependencyDefectsReport(dependencyDefects);
			if (!options.fix) {
				if (plan.groups.length > 0 && plan.repairable) {
					console.log("\nRun 'backlog doctor --fix' to apply this repair after reviewing the preview.");
				} else if (plan.groups.length > 0) {
					console.log("\nResolve the blocked reasons above, then run 'backlog doctor' again.");
				}
				process.exitCode = 1;
				return;
			}
			if (plan.groups.length === 0) {
				console.error("The reported findings cannot be repaired automatically; resolve them by hand.");
				process.exitCode = 1;
				return;
			}
			if (!plan.repairable) {
				process.exitCode = 1;
				return;
			}

			let confirmed = Boolean(options.yes);
			if (!confirmed) {
				if (!hasInteractiveTTY) {
					console.error("Interactive confirmation is unavailable. Review the preview, then use --fix --yes.");
					process.exitCode = 1;
					return;
				}
				const confirmation = await clack.confirm({
					message: `Rename ${plan.changes.length} duplicate task ${plan.changes.length === 1 ? "file" : "files"}?`,
					initialValue: false,
				});
				confirmed = !clack.isCancel(confirmation) && confirmation === true;
			}
			if (!confirmed) {
				console.log("Repair cancelled. No files changed.");
				return;
			}

			const result = await core.repairDuplicateTaskIds(plan.fingerprint);
			console.log(
				`\nRepaired ${result.repairedFiles} duplicate task ${result.repairedFiles === 1 ? "file" : "files"}.`,
			);
			for (const change of result.changes) {
				console.log(`  ${change.sourcePath} -> ${change.targetPath} (${change.oldId} -> ${change.newId})`);
			}
			if (result.references.length > 0) {
				console.log(
					`Review the ${result.references.length} reported reference ${result.references.length === 1 ? "line" : "lines"}; they were intentionally not changed.`,
				);
			}
			console.log("Verification passed: no duplicate active/completed task IDs remain.");
			if (plan.crossBranchFindings.length > 0) {
				console.log("Cross-branch findings remain diagnostic-only and still require branch-by-branch review.");
				process.exitCode = 1;
			}
			if (contentIdentityBroken) {
				console.log("Document and decision findings remain diagnostic-only and still require manual review.");
				process.exitCode = 1;
			}
			if (draftIdentityBroken) {
				console.log("Draft identity findings remain diagnostic-only and still require manual review.");
				process.exitCode = 1;
			}
			// Diagnosed again after the repair: renaming a duplicate can resolve a dependency finding
			// or materialize a new one from a dangling reference, so the report and final status must
			// reflect the repaired corpus, not the preview snapshot.
			const remainingDependencyDefects = await findDependencyDefects(core);
			if (remainingDependencyDefects.selfDependencies.length > 0 || remainingDependencyDefects.cycles.length > 0) {
				printDependencyDefectsReport(remainingDependencyDefects);
				console.log("Dependency findings remain diagnostic-only and still require manual repair.");
				process.exitCode = 1;
			}
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		}
	});

*/
registerDoctorCommand(program, { requireProjectRoot, hasInteractiveTTY });

// Cleanup command for managing completed tasks
addHelpSchema(program.command("cleanup"), {
	reads: "Tasks in terminal status from the configured backlog directory",
	required: [],
	optional: [],
	writes: "Moves selected terminal-status tasks to the completed folder",
	output: "Interactive cleanup summary",
	examples: ["backlog cleanup"],
})
	.description("move completed tasks to completed folder based on age")
	.action(async () => {
		try {
			const cwd = await requireProjectRoot();
			const core = new Core(cwd);

			// Check if backlog project is initialized
			const config = await core.filesystem.loadConfig();
			if (!config) {
				console.error("No backlog project found. Initialize one first with: backlog init");
				process.exit(1);
			}
			core.gitOps.setConfig(config);

			const statuses = config.statuses ?? [...DEFAULT_STATUSES];
			const terminalStatus = getTerminalStatus(statuses);
			if (!terminalStatus) {
				console.log("No terminal status configured for cleanup.");
				return;
			}

			const tasks = await core.queryTasks();
			const terminalStatusTasks = tasks.filter((task) => isTerminalStatus(task.status, statuses));

			if (terminalStatusTasks.length === 0) {
				console.log(`No ${terminalStatus} tasks found to clean up.`);
				return;
			}

			console.log(`Found ${terminalStatusTasks.length} tasks marked as ${terminalStatus}.`);

			const ageOptions = [
				{ title: "1 day", value: 1 },
				{ title: "1 week", value: 7 },
				{ title: "2 weeks", value: 14 },
				{ title: "3 weeks", value: 21 },
				{ title: "1 month", value: 30 },
				{ title: "3 months", value: 90 },
				{ title: "1 year", value: 365 },
			];

			const selectedAgePrompt = await clack.select({
				message: "Move tasks to completed folder if they are older than:",
				options: ageOptions.map((option) => ({ label: option.title, value: option.value })),
			});
			const selectedAge = clack.isCancel(selectedAgePrompt) ? undefined : selectedAgePrompt;

			if (selectedAge === undefined) {
				console.log("Cleanup cancelled.");
				return;
			}

			// Get tasks older than selected period
			const tasksToMove = await core.getTerminalStatusTasksByAge(selectedAge);

			if (tasksToMove.length === 0) {
				console.log(`No tasks found that are older than ${ageOptions.find((o) => o.value === selectedAge)?.title}.`);
				return;
			}

			console.log(
				`\nFound ${tasksToMove.length} tasks older than ${ageOptions.find((o) => o.value === selectedAge)?.title}:`,
			);
			for (const task of tasksToMove.slice(0, 5)) {
				const date = formatUtcDateForDisplay(task.updatedDate || task.createdDate, {
					dateFormat: config.dateFormat,
				});
				console.log(`  - ${task.id}: ${task.title} (${date})`);
			}
			if (tasksToMove.length > 5) {
				console.log(`  ... and ${tasksToMove.length - 5} more`);
			}

			const confirmedPrompt = await clack.confirm({
				message: `Move ${tasksToMove.length} tasks to completed folder?`,
				initialValue: false,
			});
			const confirmed = clack.isCancel(confirmedPrompt) ? false : confirmedPrompt;

			if (!confirmed) {
				console.log("Cleanup cancelled.");
				return;
			}

			// Move tasks to completed folder
			let successCount = 0;
			const shouldAutoCommit = config.autoCommit ?? false;

			console.log("Moving tasks...");
			const movedTasks: Array<{ fromPath: string; toPath: string; taskId: string }> = [];

			for (const task of tasksToMove) {
				const fromPath = task.filePath ?? (await core.getTask(task.id))?.filePath ?? null;

				if (!fromPath) {
					console.error(`Failed to locate file for task ${task.id}`);
					continue;
				}

				const taskFilename = basename(fromPath);
				const toPath = join(core.filesystem.completedDir, taskFilename);

				const success = await core.completeTask(task.id);
				if (success) {
					successCount++;
					movedTasks.push({ fromPath, toPath, taskId: task.id });
				} else {
					console.error(`Failed to move task ${task.id}`);
				}
			}

			// If autoCommit is disabled, stage the moves so Git recognizes them
			const hasGitRepository = await core.gitOps.isRepository();
			if (successCount > 0 && !shouldAutoCommit && hasGitRepository) {
				console.log("Staging file moves for Git...");
				for (const { fromPath, toPath } of movedTasks) {
					try {
						await core.gitOps.stageFileMove(fromPath, toPath);
					} catch (error) {
						console.warn(`Warning: Could not stage move for Git: ${error}`);
					}
				}
			}

			console.log(`Successfully moved ${successCount} of ${tasksToMove.length} tasks to completed folder.`);
			if (successCount > 0 && !shouldAutoCommit && hasGitRepository) {
				console.log("Files have been staged. To commit: git commit -m 'cleanup: Move completed tasks'");
			}
		} catch (err) {
			reportCommandFailure("Failed to run cleanup", err);
		}
	});

// Browser command for web UI
program
	.command("browser")
	.description("open browser interface on this machine only at 127.0.0.1 (press Ctrl+C or Cmd+C to stop)")
	.option("-p, --port <port>", "port to run server on")
	.option("--no-open", "don't automatically open browser")
	.option("--non-interactive", "automatically use next free port without asking")
	.action(async (options) => {
		try {
			const cwd = await requireProjectRoot();
			const { BacklogServer, findNextAvailablePort, isPortAvailable } = await import("./server/index.ts");
			const server = new BacklogServer(cwd);

			// Load config to get default port
			const core = new Core(cwd);
			const config = await core.filesystem.loadConfig();
			const defaultPort = config?.defaultPort ?? 6420;

			let port = Number.parseInt(options.port || defaultPort.toString(), 10);
			if (Number.isNaN(port) || port < 1 || port > 65535) {
				console.error("Invalid port number. Must be between 1 and 65535.");
				process.exit(1);
			}

			// Pre-check port availability and offer interactive retry
			if (!(await isPortAvailable(port))) {
				const nextPort = await findNextAvailablePort(port + 1);
				if (nextPort === null) {
					console.error(`No available port found after ${port}. Use --port to specify an available port.`);
					process.exit(1);
				}

				const shouldPromptForPort = !options.nonInteractive && hasInteractiveTTY;
				if (!shouldPromptForPort) {
					console.log(`⚠️  Port ${port} is already in use. Using port ${nextPort} instead.`);
					port = nextPort;
				} else {
					const rl = createInterface({ input, output: process.stdout });
					const answer = (
						await rl.question(
							`\n⚠️  Port ${port} is already in use.\n💡 Port ${nextPort} is available. Start on port ${nextPort}? [Y/n] `,
						)
					)
						.trim()
						.toLowerCase();
					rl.close();
					if (answer === "" || answer === "y") {
						port = nextPort;
					} else {
						console.log("Aborted.");
						process.exit(0);
					}
				}
			}

			await server.start(port, options.open !== false);

			// Graceful shutdown on common termination signals (register once)
			let shuttingDown = false;
			const shutdown = async (signal: string) => {
				if (shuttingDown) return;
				shuttingDown = true;
				console.log(`\nReceived ${signal}. Shutting down server...`);
				try {
					const stopPromise = server.stop();
					const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
					await Promise.race([stopPromise, timeout]);
				} finally {
					process.exit(0);
				}
			};

			process.once("SIGINT", () => void shutdown("SIGINT"));
			process.once("SIGTERM", () => void shutdown("SIGTERM"));
			process.once("SIGQUIT", () => void shutdown("SIGQUIT"));
		} catch (err) {
			reportCommandFailure("Failed to start browser interface", err);
		}
	});

// Overview command for statistics
program
	.command("overview")
	.description("display project statistics and metrics")
	.action(async () => {
		try {
			const project = await loadInitializedProject(async () => new Core(await requireProjectRoot()));
			if (!project) return;
			const { core } = project;

			// Import and run the overview command
			const { runOverviewCommand } = await import("./commands/overview.ts");
			await runOverviewCommand(core);
		} catch (err) {
			reportCommandFailure("Failed to display project overview", err);
		}
	});

// Completion command group
registerCompletionCommand(program);

// Instructions command group
registerInstructionsCommand(program);

// Task-centered agent workspace command groups.
registerAgentWorkspaceCommands(program, {
	project: async () => new Core(await requireProjectRoot()),
	root: async () => new Core(await requireRuntimeCwd()),
});

// MCP command group
registerMcpCommand(program);

program
	.parseAsync(process.argv)
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	})
	.finally(() => {
		// Restore BUN_OPTIONS after CLI parsing completes so it's available for subsequent commands
		if (originalBunOptions) {
			process.env.BUN_OPTIONS = originalBunOptions;
		}
	});
