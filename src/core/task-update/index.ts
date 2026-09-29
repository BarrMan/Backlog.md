import { assertSectionInputHasNoMarkerLines, assertValidChecklistMarks } from "../../markdown/structured-sections.ts";
import type { Task, TaskUpdateInput } from "../../types/index.ts";
import { applyChecklistTaskUpdates } from "./checklists.ts";
import { applyCollectionTaskUpdates, type CollectionUpdateContext } from "./collections.ts";
import { applyContentTaskUpdates } from "./content.ts";
import { applyScalarTaskUpdates, type ScalarUpdateContext } from "./scalars.ts";

export interface TaskUpdateContext extends ScalarUpdateContext, CollectionUpdateContext {}

export async function applyTaskUpdate(
	task: Task,
	input: TaskUpdateInput,
	context: TaskUpdateContext,
): Promise<boolean> {
	assertSectionInputsSafe(input);
	if (
		input.acceptanceCriteria !== undefined ||
		input.removeAcceptanceCriteria?.length ||
		input.checkAcceptanceCriteria?.length ||
		input.uncheckAcceptanceCriteria?.length
	) {
		assertValidChecklistMarks(task.rawContent ?? "", "AC");
	}
	if (
		input.removeDefinitionOfDone?.length ||
		input.checkDefinitionOfDone?.length ||
		input.uncheckDefinitionOfDone?.length
	) {
		assertValidChecklistMarks(task.rawContent ?? "", "DOD");
	}
	let mutated = await applyScalarTaskUpdates(task, input, context);
	mutated = (await applyCollectionTaskUpdates(task, input, context)) || mutated;
	mutated = applyContentTaskUpdates(task, input) || mutated;
	mutated = applyChecklistTaskUpdates(task, input) || mutated;
	return mutated;
}

export function assertSectionInputsSafe(input: {
	description?: string;
	implementationPlan?: string;
	implementationNotes?: string;
	finalSummary?: string;
	appendImplementationPlan?: string[];
	appendImplementationNotes?: string[];
	appendFinalSummary?: string[];
}): void {
	assertSectionInputHasNoMarkerLines(input.description, "description");
	assertSectionInputHasNoMarkerLines(input.implementationPlan, "implementationPlan");
	assertSectionInputHasNoMarkerLines(input.implementationNotes, "implementationNotes");
	assertSectionInputHasNoMarkerLines(input.finalSummary, "finalSummary");
	for (const value of input.appendImplementationPlan ?? [])
		assertSectionInputHasNoMarkerLines(value, "implementationPlan");
	for (const value of input.appendImplementationNotes ?? [])
		assertSectionInputHasNoMarkerLines(value, "implementationNotes");
	for (const value of input.appendFinalSummary ?? []) assertSectionInputHasNoMarkerLines(value, "finalSummary");
}
