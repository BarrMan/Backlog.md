import type { AcceptanceCriterion, AcceptanceCriterionInput, Task, TaskUpdateInput } from "../../types/index.ts";

export function applyChecklistTaskUpdates(task: Task, input: TaskUpdateInput): boolean {
	const acceptanceCriteria = applyChecklist(
		task.acceptanceCriteriaItems,
		input.acceptanceCriteria,
		input.addAcceptanceCriteria,
		input.removeAcceptanceCriteria,
		input.checkAcceptanceCriteria,
		input.uncheckAcceptanceCriteria,
		"Acceptance criterion",
		"No acceptance criteria are defined.",
	);
	task.acceptanceCriteriaItems = acceptanceCriteria.items;
	const definitionOfDone = applyChecklist(
		task.definitionOfDoneItems,
		undefined,
		input.addDefinitionOfDone,
		input.removeDefinitionOfDone,
		input.checkDefinitionOfDone,
		input.uncheckDefinitionOfDone,
		"Definition of Done item",
		"No Definition of Done items are defined.",
		true,
	);
	task.definitionOfDoneItems = definitionOfDone.items;
	return acceptanceCriteria.mutated || definitionOfDone.mutated;
}

function applyChecklist(
	existing: AcceptanceCriterion[] | undefined,
	replacement: AcceptanceCriterionInput[] | undefined,
	additions: Array<AcceptanceCriterionInput | string> | undefined,
	removals: number[] | undefined,
	checks: number[] | undefined,
	unchecks: number[] | undefined,
	name: string,
	emptyMessage: string,
	toggleBeforeRemoval = false,
): { items: AcceptanceCriterion[]; mutated: boolean } {
	let items = Array.isArray(existing) ? existing.map((item) => ({ ...item })) : [];
	let mutated = false;
	if (replacement !== undefined) {
		items = replacement
			.map((item) => ({ text: String(item.text ?? "").trim(), checked: Boolean(item.checked) }))
			.filter((item) => item.text.length > 0)
			.map((item, index) => ({ ...item, index: index + 1 }));
		mutated = true;
	}
	const added = (additions ?? [])
		.map((item) => (typeof item === "string" ? item.trim() : String(item.text ?? "").trim()))
		.filter(Boolean);
	let nextIndex = items.length > 0 ? Math.max(...items.map((item) => item.index)) + 1 : 1;
	for (const text of added) {
		items.push({ index: nextIndex++, text, checked: false });
		mutated = true;
	}
	const toggles = [
		() => toggle(items, checks, true, name, emptyMessage),
		() => toggle(items, unchecks, false, name, emptyMessage),
	];
	const transitions = toggleBeforeRemoval ? [...toggles, () => removeItems()] : [() => removeItems(), ...toggles];
	for (const transition of transitions) {
		mutated = transition() || mutated;
	}
	return { items, mutated };

	function removeItems(): boolean {
		if (!removals?.length) return false;
		const removalSet = new Set(removals);
		const next = items.filter((item) => !removalSet.has(item.index));
		if (next.length === items.length) throw missingItemError(name, removalSet, items, emptyMessage);
		items = reindex(next);
		return true;
	}
}

function toggle(
	items: AcceptanceCriterion[],
	indexes: number[] | undefined,
	checked: boolean,
	name: string,
	emptyMessage: string,
): boolean {
	if (!indexes?.length) return false;
	const missing: number[] = [];
	let mutated = false;
	for (const index of indexes) {
		const item = items.find((candidate) => candidate.index === index);
		if (!item) missing.push(index);
		else if (item.checked !== checked) {
			item.checked = checked;
			mutated = true;
		}
	}
	if (missing.length > 0) throw missingItemError(name, new Set(missing), items, emptyMessage);
	return mutated;
}

function reindex(items: AcceptanceCriterion[]): AcceptanceCriterion[] {
	return items.map((item, index) => ({ ...item, index: index + 1 }));
}

function missingItemError(
	name: string,
	missing: Set<number>,
	items: AcceptanceCriterion[],
	emptyMessage: string,
): Error {
	return new Error(
		`${name} ${Array.from(missing)
			.map((index) => `#${index}`)
			.join(", ")} not found. ${formatAvailableIndexHint(items, emptyMessage)}`,
	);
}

function formatAvailableIndexHint(items: AcceptanceCriterion[], emptyMessage: string): string {
	if (items.length === 0) return emptyMessage;
	const indexes = items.map((item) => item.index).sort((a, b) => a - b);
	const first = indexes[0] ?? 1;
	const last = indexes[indexes.length - 1] ?? first;
	return `Available indexes: ${first === last ? `#${first}` : `#${first}-#${last}`}.`;
}
