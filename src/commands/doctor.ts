import * as clack from "@clack/prompts";
import type { Command } from "commander";
import type { DuplicateRepairPlan } from "../core/duplicate-task-repair.ts";
import { Core } from "../index.ts";
import type { ContentIdentityReport, DraftIdentityFindings } from "../utils/duplicate-detection.ts";
import {
	formatDuplicateTaskIdWarning,
	hasContentIdentityIssues,
	hasDraftIdentityFindings,
} from "../utils/duplicate-detection.ts";
import { isReservedTaskPrefix } from "../utils/prefix-config.ts";
import type { DependencyDefects } from "../utils/task-builders.ts";
import { findDependencyDefects } from "../utils/task-builders.ts";
import { addHelpSchema } from "./help-schema.ts";

type DoctorOptions = { fix?: boolean; yes?: boolean };

export type DoctorCommandDependencies = {
	requireProjectRoot: () => Promise<string>;
	hasInteractiveTTY: boolean;
};

export function registerDoctorCommand(program: Command, dependencies: DoctorCommandDependencies): void {
	addHelpSchema(program.command("doctor"), doctorHelp)
		.description(
			"diagnose duplicate task, document, and decision IDs, report self-referential and cyclic dependencies, and safely repair duplicate task IDs",
		)
		.option("--fix", "apply the displayed duplicate task ID repair")
		.option("--yes", "confirm --fix without prompting")
		.action((options: DoctorOptions) => runDoctor(options, dependencies));
}

async function runDoctor(options: DoctorOptions, dependencies: DoctorCommandDependencies): Promise<void> {
	if (!validateOptions(options)) return;
	const core = new Core(await dependencies.requireProjectRoot());
	try {
		const diagnosis = await diagnose(core);
		if (!diagnosis) return;
		renderDiagnosis(diagnosis);
		if (!options.fix) return reportOnlyResult(diagnosis);
		if (!canRepair(diagnosis)) return;
		if (!(await confirmRepair(diagnosis.plan, options, dependencies.hasInteractiveTTY))) return;
		await repair(core, diagnosis);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

function validateOptions(options: DoctorOptions): boolean {
	if (!options.yes || options.fix) return true;
	console.error("--yes can only be used together with --fix.");
	process.exitCode = 1;
	return false;
}

type Diagnosis = {
	plan: DuplicateRepairPlan;
	contentIdentity: ContentIdentityReport;
	draftIdentity: DraftIdentityFindings;
	dependencyDefects: DependencyDefects;
	reservedTaskPrefix: string | null;
};

async function diagnose(core: Core): Promise<Diagnosis | null> {
	const config = await core.filesystem.loadConfig();
	const taskPrefix = config?.prefixes?.task;
	const reservedTaskPrefix = taskPrefix && isReservedTaskPrefix(taskPrefix) ? taskPrefix : null;
	if (reservedTaskPrefix) printReservedPrefixWarning(reservedTaskPrefix);
	const diagnosis = {
		plan: await core.previewDuplicateTaskIdRepair({ includeBranches: true }),
		contentIdentity: await core.diagnoseContentIdentity(),
		draftIdentity: await core.filesystem.diagnoseDraftIdentity(),
		dependencyDefects: await findDependencyDefects(core),
		reservedTaskPrefix,
	};
	if (!hasFindings(diagnosis)) {
		console.log("No duplicate IDs, self-referential dependencies, or dependency cycles found.");
		return null;
	}
	return diagnosis;
}

function hasFindings(diagnosis: Diagnosis): boolean {
	return Boolean(
		diagnosis.reservedTaskPrefix ||
			diagnosis.plan.groups.length ||
			diagnosis.plan.crossBranchFindings.length ||
			hasContentIdentityIssues(diagnosis.contentIdentity) ||
			hasDraftIdentityFindings(diagnosis.draftIdentity) ||
			diagnosis.dependencyDefects.selfDependencies.length ||
			diagnosis.dependencyDefects.cycles.length,
	);
}

function reportOnlyResult(diagnosis: Diagnosis): void {
	if (diagnosis.plan.groups.length > 0 && diagnosis.plan.repairable) {
		console.log("\nRun 'backlog doctor --fix' to apply this repair after reviewing the preview.");
	} else if (diagnosis.plan.groups.length > 0) {
		console.log("\nResolve the blocked reasons above, then run 'backlog doctor' again.");
	}
	process.exitCode = 1;
}

function canRepair(diagnosis: Diagnosis): boolean {
	if (diagnosis.reservedTaskPrefix) {
		console.error("Resolve the reserved task prefix before running --fix.");
		process.exitCode = 1;
		return false;
	}
	if (diagnosis.plan.groups.length === 0) {
		console.error("The reported findings cannot be repaired automatically; resolve them by hand.");
		process.exitCode = 1;
		return false;
	}
	if (!diagnosis.plan.repairable) {
		process.exitCode = 1;
		return false;
	}
	return true;
}

async function confirmRepair(
	plan: DuplicateRepairPlan,
	options: DoctorOptions,
	interactive: boolean,
): Promise<boolean> {
	if (options.yes) return true;
	if (!interactive) {
		console.error("Interactive confirmation is unavailable. Review the preview, then use --fix --yes.");
		process.exitCode = 1;
		return false;
	}
	const confirmation = await clack.confirm({
		message: `Rename ${plan.changes.length} duplicate task ${plan.changes.length === 1 ? "file" : "files"}?`,
		initialValue: false,
	});
	if (!clack.isCancel(confirmation) && confirmation === true) return true;
	console.log("Repair cancelled. No files changed.");
	return false;
}

async function repair(core: Core, diagnosis: Diagnosis): Promise<void> {
	const result = await core.repairDuplicateTaskIds(diagnosis.plan.fingerprint);
	console.log(`\nRepaired ${result.repairedFiles} duplicate task ${result.repairedFiles === 1 ? "file" : "files"}.`);
	for (const change of result.changes)
		console.log(`  ${change.sourcePath} -> ${change.targetPath} (${change.oldId} -> ${change.newId})`);
	if (result.references.length > 0) {
		console.log(
			`Review the ${result.references.length} reported reference ${result.references.length === 1 ? "line" : "lines"}; they were intentionally not changed.`,
		);
	}
	console.log("Verification passed: no duplicate active/completed task IDs remain.");
	if (diagnosis.plan.crossBranchFindings.length > 0) {
		console.log("Cross-branch findings remain diagnostic-only and still require branch-by-branch review.");
		process.exitCode = 1;
	}
	if (hasContentIdentityIssues(diagnosis.contentIdentity)) {
		console.log("Document and decision findings remain diagnostic-only and still require manual review.");
		process.exitCode = 1;
	}
	if (hasDraftIdentityFindings(diagnosis.draftIdentity)) {
		console.log("Draft identity findings remain diagnostic-only and still require manual review.");
		process.exitCode = 1;
	}
	const remaining = await findDependencyDefects(core);
	if (remaining.selfDependencies.length || remaining.cycles.length) {
		printDependencyDefectsReport(remaining);
		console.log("Dependency findings remain diagnostic-only and still require manual repair.");
		process.exitCode = 1;
	}
}

function printReservedPrefixWarning(prefix: string): void {
	console.error(
		`Task prefix "${prefix}" collides with a reserved prefix (draft, doc, decision); tasks are misrouted as that entity type.`,
	);
	console.error(
		"There is no automated migration. Rename the affected task files and IDs to a non-reserved prefix, then set task_prefix in the project config file to match.",
	);
	process.exitCode = 1;
}

function renderDiagnosis(diagnosis: Diagnosis): void {
	printDuplicateRepairPlan(diagnosis.plan);
	printContentIdentityReport(diagnosis.contentIdentity);
	printDraftIdentityReport(diagnosis.draftIdentity);
	printDependencyDefectsReport(diagnosis.dependencyDefects);
}

function printDuplicateRepairPlan(plan: DuplicateRepairPlan): void {
	if (plan.groups.length > 0) {
		console.log(formatDuplicateTaskIdWarning(plan.groups));
		console.log("\nRepair preview (no files changed):");
		for (const change of plan.changes)
			console.log(`  ${change.sourcePath}\n    ${change.oldId} -> ${change.newId}\n    new path: ${change.targetPath}`);
	}
	if (plan.crossBranchFindings.length > 0) {
		console.log("\nPossible cross-branch ID collisions (diagnostic only):");
		for (const finding of plan.crossBranchFindings) {
			console.log(`  ${finding.id}:`);
			for (const location of finding.locations)
				console.log(`    - ${location.branch}:${location.path} (${location.state})`);
		}
		console.log("Switch to the affected branches and reconcile these paths; Backlog.md will not edit another branch.");
	}
	if (plan.groups.length > 0 && plan.references.length > 0) {
		console.log("\nReferences requiring human review after repair:");
		for (const reference of plan.references)
			console.log(
				`  ${reference.path}:${reference.line} [${reference.ids.join(", ")}]${reference.text ? `\n    ${reference.text}` : ""}`,
			);
		console.log("These references are not changed automatically because the original ID is ambiguous.");
	}
	if (plan.groups.length > 0 && !plan.referenceScanComplete)
		console.log("\nReference scan incomplete; repair is blocked. See the failures below.");
	else if (plan.groups.length > 0 && plan.references.length === 0)
		console.log("\nNo textual references to the duplicate IDs were found in backlog Markdown files.");
	if (plan.blockedReasons.length > 0)
		console.log(`\nRepair is blocked:\n${plan.blockedReasons.map((reason) => `  - ${reason}`).join("\n")}`);
}

function printContentIdentityReport(report: ContentIdentityReport): void {
	for (const [label, issues] of [
		["document", report.documents],
		["decision", report.decisions],
	] as const) {
		if (issues.duplicates.length)
			console.log(
				`\nDuplicate ${label} IDs (diagnostic only):\n${issues.duplicates.map((group) => `  ${group.id}:\n${group.paths.map((path) => `    - ${path}`).join("\n")}`).join("\n")}\nGive each file a unique id; ${label} lookups for these IDs stay blocked until then.`,
			);
		if (issues.missingIds.length)
			console.log(
				`\nMalformed ${label} files without an id in frontmatter:\n${issues.missingIds.map((path) => `  - ${path}`).join("\n")}\nAdd an id to each file; these ${label}s cannot be addressed until then.`,
			);
		if (issues.unreadable.length)
			console.log(
				`\nUnreadable ${label} files or directories:\n${issues.unreadable.map((path) => `  - ${path}`).join("\n")}\nRepair the frontmatter or file permissions; identity could not be checked for these ${label}s.`,
			);
	}
}

function printDraftIdentityReport(findings: DraftIdentityFindings): void {
	if (findings.duplicates.length)
		console.log(
			`\nDuplicate draft IDs (diagnostic only):\n${findings.duplicates.map((group) => `  ${group.id}:\n${group.paths.map((path) => `    - ${path}`).join("\n")}`).join("\n")}\nRename one file to a distinct numeric id, then make its frontmatter agree.`,
		);
	if (findings.drifted.length)
		console.log(
			`\nDrifted draft files (frontmatter id does not match filename):\n${findings.drifted.map((drift) => `  - ${drift.path}: frontmatter declares ${drift.frontmatterId}, filename declares ${drift.filenameId}`).join("\n")}\nFix the frontmatter id or rename each file so they agree.`,
		);
	if (findings.unreadable.length)
		console.log(
			`\nUnreadable draft files or directories:\n${findings.unreadable.map((path) => `  - ${path}`).join("\n")}\nRepair the YAML/frontmatter or file permissions; identity could not be checked for these drafts.`,
		);
}

function printDependencyDefectsReport(defects: DependencyDefects): void {
	if (defects.selfDependencies.length)
		console.log(
			`\nSelf-referential dependencies (diagnostic only):\n${defects.selfDependencies.map((finding) => `  - ${finding.taskId} depends on itself${finding.dependency === finding.taskId ? "" : ` (recorded as "${finding.dependency}")`}`).join("\n")}\nRewrite the task's dependencies without its own ID: 'backlog task edit <id> --dep <ids>' (or --clear-deps); edit the file directly for records under backlog/completed.`,
		);
	if (defects.cycles.length)
		console.log(
			`\nDependency cycles (diagnostic only):\n${defects.cycles.map((cycle) => `  - ${cycle.join(" -> ")}`).join("\n")}\nBreak each cycle by rewriting one task's dependencies: 'backlog task edit <id> --dep <ids>' (or --clear-deps); edit the file directly for records under backlog/completed.`,
		);
}

const doctorHelp = {
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
};
