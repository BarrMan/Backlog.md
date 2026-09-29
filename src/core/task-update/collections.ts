import type { Task, TaskUpdateInput } from "../../types/index.ts";
import { normalizeStringList, parseDelimitedStringList, stringArraysEqual } from "../../utils/task-builders.ts";

export interface CollectionUpdateContext {
	validateDependencies(dependencies: string[], task: Task): Promise<{ valid: string[]; invalid: string[] }>;
	taskIdsEqual(first: string, second: string): boolean;
	formatMissingDependenciesError(invalid: string[]): Error;
}

export async function applyCollectionTaskUpdates(
	task: Task,
	input: TaskUpdateInput,
	context: CollectionUpdateContext,
): Promise<boolean> {
	let mutated = false;
	if (input.assignee !== undefined) {
		const assignee = normalizeStringList(input.assignee) ?? [];
		if (!stringArraysEqual(assignee, task.assignee ?? [])) {
			task.assignee = assignee;
			mutated = true;
		}
	}

	mutated =
		applyList(task, "labels", input.labels, input.addLabels, input.removeLabels, (value) => value.toLowerCase()) ||
		mutated;
	mutated = (await applyDependencies(task, input, context)) || mutated;
	mutated = applyList(task, "references", input.references, input.addReferences, input.removeReferences) || mutated;
	mutated =
		applyList(task, "documentation", input.documentation, input.addDocumentation, input.removeDocumentation) || mutated;

	if (input.modifiedFiles !== undefined) {
		const modifiedFiles = normalizeStringList(input.modifiedFiles) ?? [];
		if (!stringArraysEqual(modifiedFiles, task.modifiedFiles ?? [])) {
			task.modifiedFiles = modifiedFiles;
			mutated = true;
		}
	}
	return mutated;
}

function applyList(
	task: Task,
	field: "labels" | "references" | "documentation",
	replacement: string[] | undefined,
	additions: string[] | undefined,
	removals: string[] | undefined,
	key = (value: string) => value,
): boolean {
	let current = [...(task[field] ?? [])];
	let mutated = false;
	if (replacement !== undefined) {
		const next = normalizeStringList(replacement) ?? [];
		if (!stringArraysEqual(next, current)) {
			task[field] = next;
			mutated = true;
		}
		current = next;
	}
	const additionsList = normalizeStringList(additions) ?? [];
	if (additionsList.length > 0) {
		const seen = new Set(current.map(key));
		for (const value of additionsList) {
			if (!seen.has(key(value))) {
				current.push(value);
				seen.add(key(value));
				mutated = true;
			}
		}
		task[field] = current;
	}
	const removalsList = normalizeStringList(removals) ?? [];
	if (removalsList.length > 0) {
		const removed = new Set(removalsList.map(key));
		const next = current.filter((value) => !removed.has(key(value)));
		if (!stringArraysEqual(next, current)) {
			task[field] = next;
			mutated = true;
		}
	}
	return mutated;
}

async function applyDependencies(
	task: Task,
	input: TaskUpdateInput,
	context: CollectionUpdateContext,
): Promise<boolean> {
	let current = [...(task.dependencies ?? [])];
	let mutated = false;
	if (input.dependencies !== undefined) {
		const { valid, invalid } = await context.validateDependencies(
			parseDelimitedStringList(input.dependencies) ?? [],
			task,
		);
		if (invalid.length > 0) throw context.formatMissingDependenciesError(invalid);
		if (!stringArraysEqual(valid, current)) {
			current = valid;
			mutated = true;
		}
	}
	if (input.addDependencies && input.addDependencies.length > 0) {
		const { valid, invalid } = await context.validateDependencies(
			parseDelimitedStringList(input.addDependencies) ?? [],
			task,
		);
		if (invalid.length > 0) throw context.formatMissingDependenciesError(invalid);
		const seen = new Set(current);
		for (const dependency of valid) {
			if (!seen.has(dependency)) {
				current.push(dependency);
				seen.add(dependency);
				mutated = true;
			}
		}
	}
	if (input.removeDependencies && input.removeDependencies.length > 0) {
		const removals = parseDelimitedStringList(input.removeDependencies) ?? [];
		const next = current.filter((dependency) => !removals.some((removal) => context.taskIdsEqual(removal, dependency)));
		if (!stringArraysEqual(next, current)) {
			current = next;
			mutated = true;
		}
	}
	task.dependencies = current;
	return mutated;
}
