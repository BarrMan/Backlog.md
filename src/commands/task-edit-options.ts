import type { Core } from "../index.ts";
import type { TaskUpdateInput } from "../types/index.ts";
import type { TaskEditArgs } from "../types/task-edit-args.ts";
import { formatValidPriorityValues, resolvePriorityValue } from "../utils/priority-config.ts";
import { formatValidStatuses, getCanonicalStatus } from "../utils/status.ts";
import {
	parseClearableStringList,
	parseDelimitedStringList,
	parsePositiveIndexList,
	processAcceptanceCriteriaOptions,
	toStringArray,
} from "../utils/task-builders.ts";
import { buildTaskUpdateInput } from "../utils/task-edit-builder.ts";
import { validateTaskListFlags } from "./task-edit-list-options.ts";

type ParseResult = { input: TaskUpdateInput } | { error: string; formatForTask?: boolean };

export type TaskEditOptionContext = {
	core: Core;
	statuses: () => Promise<string[]>;
	resolveMilestone: (value: string) => Promise<string>;
};

async function parseScalarOptions(
	options: Record<string, unknown>,
	context: TaskEditOptionContext,
): Promise<ParseResult | TaskEditArgs> {
	const args: TaskEditArgs = {};
	if (options.status) {
		const validStatuses = await context.statuses();
		const status = await getCanonicalStatus(String(options.status), context.core, validStatuses);
		if (!status)
			return { error: `Invalid status: ${options.status}. Valid statuses are: ${formatValidStatuses(validStatuses)}` };
		args.status = status;
	}
	if (options.priority) {
		const config = await context.core.filesystem.loadConfig();
		const priority = resolvePriorityValue(String(options.priority), config);
		if (!priority)
			return { error: `Invalid priority: ${options.priority}. Valid values are: ${formatValidPriorityValues(config)}` };
		args.priority = priority;
	}
	if (options.ordinal !== undefined) {
		const ordinal = Number(options.ordinal);
		if (Number.isNaN(ordinal) || ordinal < 0)
			return { error: `Invalid ordinal: ${options.ordinal}. Must be a non-negative number.` };
		args.ordinal = ordinal;
	}
	if (options.milestone !== undefined && options.clearMilestone)
		return { error: "Cannot use --milestone and --clear-milestone together." };
	if (options.dueDate !== undefined && options.clearDueDate)
		return { error: "Cannot use --due-date and --clear-due-date together." };
	if (typeof options.milestone === "string") args.milestone = await context.resolveMilestone(options.milestone);
	else if (options.clearMilestone) args.milestone = null;
	if (typeof options.dueDate === "string") args.dueDate = options.dueDate;
	else if (options.clearDueDate) args.dueDate = null;
	if (options.type !== undefined) args.type = String(options.type);
	if (options.project !== undefined) args.project = String(options.project);
	return args;
}

function parseChecklistOptions(options: Record<string, unknown>): ParseResult | TaskEditArgs {
	const args: TaskEditArgs = {};
	try {
		const fields: Array<[keyof TaskEditArgs, unknown]> = [
			["acceptanceCriteriaRemove", options.removeAc],
			["acceptanceCriteriaCheck", options.checkAc],
			["acceptanceCriteriaUncheck", options.uncheckAc],
			["definitionOfDoneRemove", options.removeDod],
			["definitionOfDoneCheck", options.checkDod],
			["definitionOfDoneUncheck", options.uncheckDod],
		];
		for (const [field, value] of fields) {
			const indexes = parsePositiveIndexList(value);
			if (indexes.length > 0) Object.assign(args, { [field]: indexes });
		}
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error), formatForTask: true };
	}
	if (options.clearAc) args.acceptanceCriteriaSet = [];
	else if (options.acceptanceCriteria !== undefined)
		args.acceptanceCriteriaSet = processAcceptanceCriteriaOptions({
			acceptanceCriteria: options.acceptanceCriteria as string | string[] | undefined,
		});
	const additions = processAcceptanceCriteriaOptions({ ac: options.ac as string | string[] | undefined });
	if (additions.length > 0) args.acceptanceCriteriaAdd = additions;
	const dod = toStringArray(options.dod)
		.map((value) => String(value).trim())
		.filter((value) => value.length > 0);
	if (dod.length > 0) args.definitionOfDoneAdd = dod;
	return args;
}

function validateLabelOptions(options: Record<string, unknown>): ParseResult | undefined {
	if (
		options.clearLabels &&
		(options.label !== undefined || options.addLabel !== undefined || options.removeLabel !== undefined)
	)
		return {
			error:
				"Cannot combine --clear-labels with --label, --add-label, or --remove-label. Use --clear-labels by itself, or --label a,b for the final full label set.",
		};
	if (options.label !== undefined && (options.addLabel !== undefined || options.removeLabel !== undefined))
		return {
			error:
				"Cannot combine --label with --add-label or --remove-label. Use --label a,b for the final full label set, or use add/remove flags without --label.",
		};
	return undefined;
}

function validateChecklistOptions(options: Record<string, unknown>): ParseResult | undefined {
	const hasIncrementalAc =
		options.ac !== undefined ||
		options.removeAc !== undefined ||
		options.checkAc !== undefined ||
		options.uncheckAc !== undefined;
	if (options.clearAc && (options.acceptanceCriteria !== undefined || hasIncrementalAc))
		return {
			error:
				"Cannot combine --clear-ac with --acceptance-criteria, --ac, --remove-ac, --check-ac, or --uncheck-ac. Use --clear-ac by itself.",
		};
	if (options.acceptanceCriteria !== undefined && hasIncrementalAc)
		return {
			error:
				"Cannot combine --acceptance-criteria with --ac, --remove-ac, --check-ac, or --uncheck-ac. Use replacement by itself, or use only incremental operations.",
		};
	return undefined;
}

function parseListOptions(options: Record<string, unknown>): ParseResult | TaskEditArgs {
	const listError = validateTaskListFlags(options, { supportsClearFlags: true });
	if (listError) return { error: listError };
	if (options.ref !== undefined && (options.addRef !== undefined || options.removeRef !== undefined))
		return {
			error:
				"Cannot combine --ref with --add-ref or --remove-ref. Use --ref a,b for the final full reference set, or use add/remove flags without --ref.",
		};
	const args: TaskEditArgs = {};
	const labels = parseDelimitedStringList(options.label) ?? [];
	if (labels.length > 0) args.labels = labels;
	else if (options.clearLabels) args.labels = [];
	const addLabels = parseDelimitedStringList(options.addLabel) ?? [];
	if (addLabels.length > 0) args.addLabels = addLabels;
	const removeLabels = parseDelimitedStringList(options.removeLabel) ?? [];
	if (removeLabels.length > 0) args.removeLabels = removeLabels;
	const assignee = parseClearableStringList(options.assignee);
	if (assignee) args.assignee = assignee;
	const dependencies = parseClearableStringList([...toStringArray(options.dependsOn), ...toStringArray(options.dep)]);
	if (dependencies) args.dependencies = dependencies;
	else if (options.clearDeps) args.dependencies = [];
	const references = parseClearableStringList(options.ref);
	if (references) args.references = references;
	else if (options.clearRefs) args.references = [];
	const addReferences = parseDelimitedStringList(options.addRef) ?? [];
	if (addReferences.length > 0) args.addReferences = addReferences;
	const removeReferences = parseDelimitedStringList(options.removeRef) ?? [];
	if (removeReferences.length > 0) args.removeReferences = removeReferences;
	const documentation = parseClearableStringList(options.doc);
	if (documentation) args.documentation = documentation;
	else if (options.clearDocs) args.documentation = [];
	const modifiedFiles = parseDelimitedStringList(options.modifiedFile);
	if (modifiedFiles?.length) args.modifiedFiles = modifiedFiles;
	return args;
}

function parseContentOptions(options: Record<string, unknown>): TaskEditArgs {
	const args: TaskEditArgs = {};
	if (options.title) args.title = String(options.title);
	const description = options.description ?? options.desc;
	if (description !== undefined) args.description = String(description);
	if (typeof options.plan === "string") args.planSet = options.plan;
	if (typeof options.notes === "string") args.notesSet = options.notes;
	if (typeof options.finalSummary === "string") args.finalSummary = options.finalSummary;
	for (const [field, value] of [
		["planAppend", options.appendPlan],
		["notesAppend", options.appendNotes],
		["commentsAppend", options.comment],
		["finalSummaryAppend", options.appendFinalSummary],
	] as const) {
		const values = toStringArray(value);
		if (values.length > 0) Object.assign(args, { [field]: values });
	}
	if (typeof options.commentAuthor === "string") args.commentAuthor = options.commentAuthor;
	if (options.clearFinalSummary) args.finalSummaryClear = true;
	return args;
}

export async function parseTaskEditOptions(
	options: Record<string, unknown>,
	context: TaskEditOptionContext,
): Promise<ParseResult> {
	const scalar = await parseScalarOptions(options, context);
	if ("error" in scalar) return scalar;
	const checklist = parseChecklistOptions(options);
	if ("error" in checklist) return checklist;
	const labelError = validateLabelOptions(options);
	if (labelError) return labelError;
	const checklistError = validateChecklistOptions(options);
	if (checklistError) return checklistError;
	const lists = parseListOptions(options);
	if ("error" in lists) return lists;
	return { input: buildTaskUpdateInput({ ...scalar, ...checklist, ...lists, ...parseContentOptions(options) }) };
}
