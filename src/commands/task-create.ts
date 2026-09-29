import type { Core } from "../core/backlog.ts";
import { loadTaskDetail } from "../core/task-detail.ts";
import { formatTaskPlainText } from "../formatters/task-plain-text.ts";
import {
	parseClearableStringList,
	parseDelimitedStringList,
	processAcceptanceCriteriaOptions,
	toStringArray,
} from "../utils/task-builders.ts";
import { validateTaskListFlags } from "./task-edit-list-options.ts";

type CreateInput = Parameters<Core["createTaskFromInput"]>[0];
type CreateOptions = Record<string, unknown>;

export function buildTaskCreateInput(
	title: string,
	options: CreateOptions,
	resolveMilestone: (value: string) => Promise<string>,
): Promise<CreateInput | null> {
	let ordinal: number | undefined;
	if (options.ordinal !== undefined) {
		const parsed = Number(options.ordinal);
		if (!Number.isFinite(parsed) || parsed < 0) {
			console.error(`Invalid ordinal: ${options.ordinal}. Must be a non-negative number.`);
			process.exitCode = 1;
			return Promise.resolve(null);
		}
		ordinal = parsed;
	}

	const listFlagError = validateTaskListFlags(options, { supportsClearFlags: false });
	if (listFlagError) {
		console.error(listFlagError);
		process.exitCode = 1;
		return Promise.resolve(null);
	}
	const acceptanceCriteria = processAcceptanceCriteriaOptions(options);

	return Promise.resolve(typeof options.milestone === "string" ? resolveMilestone(options.milestone) : undefined).then(
		(milestone) => ({
			title,
			description: options.description || options.desc ? String(options.description || options.desc) : undefined,
			status: options.draft ? "Draft" : options.status ? String(options.status) : undefined,
			dueDate: typeof options.dueDate === "string" ? options.dueDate : undefined,
			assignee: parseClearableStringList(options.assignee),
			labels: parseDelimitedStringList(options.labels),
			dependencies: parseDelimitedStringList([...toStringArray(options.dependsOn), ...toStringArray(options.dep)]),
			references: parseDelimitedStringList(options.ref),
			documentation: parseDelimitedStringList(options.doc),
			modifiedFiles: parseDelimitedStringList(options.modifiedFile),
			parentTaskId: options.parent ? String(options.parent) : undefined,
			priority: options.priority ? String(options.priority) : undefined,
			type: options.type !== undefined ? String(options.type) : undefined,
			project: options.project !== undefined ? String(options.project) : undefined,
			...(ordinal === undefined ? {} : { ordinal }),
			milestone,
			implementationPlan: options.plan ? String(options.plan) : undefined,
			implementationNotes: options.notes ? String(options.notes) : undefined,
			finalSummary: options.finalSummary ? String(options.finalSummary) : undefined,
			acceptanceCriteria: acceptanceCriteria.map((text) => ({ text, checked: false })),
			definitionOfDoneAdd: toStringArray(options.dod),
			disableDefinitionOfDoneDefaults: options.dodDefaults === false,
		}),
	);
}

export async function createAndReportTask(
	core: Core,
	input: CreateInput,
	options: { kind: "task" | "draft"; plain?: boolean; filePathOptional?: boolean },
): Promise<void> {
	try {
		const { task, filePath } = await core.createTaskFromInput(input);
		if (options.plain) {
			console.log(formatTaskPlainText(await loadTaskDetail(core, task), { filePathOverride: filePath }));
			return;
		}
		console.log(`Created ${options.kind} ${task.id}`);
		if (!options.filePathOptional || filePath) console.log(`File: ${filePath}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
