import { useMemo } from "react";
import { buildMilestoneAliasMap, canonicalizeMilestone, resolveMilestoneAliasToId } from "../../core/milestones.ts";
import type { Milestone } from "../../types";

export { buildMilestoneAliasMap, canonicalizeMilestone };

export function useMilestoneAliasMap(milestones: Milestone[], archivedMilestones: Milestone[]): Map<string, string> {
	return useMemo(() => buildMilestoneAliasMap(milestones, archivedMilestones), [milestones, archivedMilestones]);
}

export function resolveMilestoneSelection(
	value: string | null | undefined,
	active: Milestone[],
	archived: Milestone[],
): string {
	const normalized = (value ?? "").trim();
	if (!normalized) return "";
	const key = normalized.toLowerCase();
	const activeIdMatch = resolveMilestoneAliasToId(normalized, active);
	if (activeIdMatch) return activeIdMatch.id;
	if (/^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized)) {
		const archivedIdMatch = resolveMilestoneAliasToId(normalized, archived);
		if (archivedIdMatch) return archivedIdMatch.id;
	}
	const activeTitleMatches = active.filter((milestone) => milestone.title.trim().toLowerCase() === key);
	if (activeTitleMatches.length === 1) return activeTitleMatches[0]?.id ?? normalized;
	if (activeTitleMatches.length > 1) return normalized;
	return resolveMilestoneAliasToId(normalized, archived)?.id ?? normalized;
}

export function resolveMilestoneLabel(
	value: string | null | undefined,
	active: Milestone[],
	archived: Milestone[],
): string {
	const normalized = (value ?? "").trim();
	if (!normalized) return "";
	const all = [...active, ...archived];
	const idMatch = resolveMilestoneAliasToId(normalized, all);
	if (idMatch) return idMatch.title;
	const titleMatches = all.filter((milestone) => milestone.title.trim().toLowerCase() === normalized.toLowerCase());
	return titleMatches.length === 1 ? (titleMatches[0]?.title ?? normalized) : normalized;
}
