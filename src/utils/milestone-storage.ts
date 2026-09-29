import { canonicalMilestoneId, collectMilestoneAliasKeys, milestoneKey } from "../core/milestones.ts";
import type { Milestone } from "../types/index.ts";

type MilestoneRef = Pick<Milestone, "id" | "title">;

function milestoneIdMatchesAlias(milestoneId: string, aliasKeys: Set<string>): boolean {
	for (const key of collectMilestoneAliasKeys(milestoneId)) {
		if (aliasKeys.has(key)) {
			return true;
		}
	}
	return false;
}

function findIdMatch(input: string, milestones: MilestoneRef[], aliasKeys: Set<string>): MilestoneRef | undefined {
	const inputKey = milestoneKey(input);
	const rawExactMatch = milestones.find((item) => milestoneKey(item.id) === inputKey);
	if (rawExactMatch) {
		return rawExactMatch;
	}

	const canonicalInputId = canonicalMilestoneId(input);
	if (canonicalInputId) {
		const canonicalRawMatch = milestones.find((item) => milestoneKey(item.id) === canonicalInputId);
		if (canonicalRawMatch) {
			return canonicalRawMatch;
		}
	}

	return milestones.find((item) => milestoneIdMatchesAlias(item.id, aliasKeys));
}

function findUniqueTitleMatch(input: string, milestones: MilestoneRef[]): MilestoneRef | null {
	const inputKey = milestoneKey(input);
	const titleMatches = milestones.filter((item) => milestoneKey(item.title) === inputKey);
	return titleMatches.length === 1 ? (titleMatches[0] ?? null) : null;
}

export function resolveMilestoneInputForStorage(
	milestone: string,
	activeMilestones: MilestoneRef[],
	archivedMilestones: MilestoneRef[] = [],
): string {
	const normalized = milestone.trim();
	if (!normalized) {
		return normalized;
	}

	const aliasKeys = collectMilestoneAliasKeys(normalized);
	const looksLikeMilestoneId = /^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized);
	const resolveByAlias = (milestones: MilestoneRef[]): string | null => {
		const idMatch = findIdMatch(normalized, milestones, aliasKeys);
		const titleMatch = findUniqueTitleMatch(normalized, milestones);
		if (looksLikeMilestoneId) {
			return idMatch?.id ?? null;
		}
		return titleMatch?.id ?? idMatch?.id ?? null;
	};

	const inputKey = milestoneKey(normalized);
	const activeTitleMatches = activeMilestones.filter((item) => milestoneKey(item.title) === inputKey);
	const hasAmbiguousActiveTitle = activeTitleMatches.length > 1;
	if (looksLikeMilestoneId) {
		const activeIdMatch = findIdMatch(normalized, activeMilestones, aliasKeys);
		if (activeIdMatch) {
			return activeIdMatch.id;
		}
		const archivedIdMatch = findIdMatch(normalized, archivedMilestones, aliasKeys);
		if (archivedIdMatch) {
			return archivedIdMatch.id;
		}
		if (activeTitleMatches.length === 1) {
			return activeTitleMatches[0]?.id ?? normalized;
		}
		if (hasAmbiguousActiveTitle) {
			return normalized;
		}
		const archivedTitleMatch = findUniqueTitleMatch(normalized, archivedMilestones);
		return archivedTitleMatch?.id ?? normalized;
	}

	const activeMatch = resolveByAlias(activeMilestones);
	if (activeMatch) {
		return activeMatch;
	}
	if (hasAmbiguousActiveTitle) {
		return normalized;
	}

	return resolveByAlias(archivedMilestones) ?? normalized;
}

type MilestoneStorageFilesystem = {
	listMilestones(): Promise<MilestoneRef[]>;
	listArchivedMilestones(): Promise<MilestoneRef[]>;
};

export async function resolveMilestoneInputFromFilesystem(
	milestone: string,
	filesystem: MilestoneStorageFilesystem,
): Promise<string> {
	const [activeMilestones, archivedMilestones] = await Promise.all([
		filesystem.listMilestones(),
		filesystem.listArchivedMilestones(),
	]);
	return resolveMilestoneInputForStorage(milestone, activeMilestones, archivedMilestones);
}
