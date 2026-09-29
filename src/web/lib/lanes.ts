import type { Milestone, Task } from "../../types";
import { compareOrdinals } from "../../utils/task-sorting";
import { buildMilestoneAliasMap, canonicalizeMilestone } from "../utils/milestone-aliases";
import { getMilestoneLabel, milestoneKey } from "../utils/milestones";

export type LaneMode = "none" | "milestone";

export interface LaneDefinition {
	key: string;
	label: string;
	milestone?: string;
	isNoMilestone?: boolean;
}

export const DEFAULT_LANE_KEY = "lane:none";
const NO_MILESTONE_LABEL = "No milestone";

export const laneKeyFromMilestone = (milestone?: string | null): string => {
	const key = milestoneKey(milestone);
	return key.length > 0 ? `lane:milestone:${key}` : "lane:milestone:__none";
};

export function buildLanes(
	mode: LaneMode,
	tasks: Task[],
	configMilestones: string[],
	milestoneEntities: Milestone[] = [],
	options?: { archivedMilestoneIds?: string[]; archivedMilestones?: Milestone[] },
): LaneDefinition[] {
	if (mode !== "milestone") {
		return [
			{
				key: DEFAULT_LANE_KEY,
				label: "All tasks",
				isNoMilestone: true,
			},
		];
	}

	const archivedKeys = new Set((options?.archivedMilestoneIds ?? []).map((id) => milestoneKey(id)));
	const aliasMap = buildMilestoneAliasMap(milestoneEntities, options?.archivedMilestones ?? []);
	const milestonesByKey = new Map<string, string>();
	const addMilestone = (value: string) => {
		const normalized = canonicalizeMilestone(value, aliasMap);
		if (!normalized) return;
		const key = milestoneKey(normalized);
		if (!key) return;
		if (archivedKeys.has(key)) return;
		if (milestonesByKey.has(key)) return;
		milestonesByKey.set(key, normalized);
	};

	configMilestones.forEach(addMilestone);
	tasks.forEach((task) => {
		addMilestone(task.milestone ?? "");
	});

	const laneMilestones = Array.from(milestonesByKey.values());

	return [
		{
			key: laneKeyFromMilestone(undefined),
			label: NO_MILESTONE_LABEL,
			milestone: undefined,
			isNoMilestone: true,
		},
		...laneMilestones.map((milestone) => ({
			key: laneKeyFromMilestone(milestone),
			label: getMilestoneLabel(milestone, milestoneEntities),
			milestone,
			isNoMilestone: false,
		})),
	];
}

export function sortTasksForStatus(tasks: Task[], status: string): Task[] {
	const isDoneStatus = status.toLowerCase().includes("done") || status.toLowerCase().includes("complete");

	return tasks.slice().sort((a, b) => {
		const ordinalComparison = compareOrdinals(a, b);
		if (ordinalComparison !== 0) return ordinalComparison;

		if (isDoneStatus) {
			const aDate = a.updatedDate || a.createdDate;
			const bDate = b.updatedDate || b.createdDate;
			return bDate.localeCompare(aDate);
		}

		return a.createdDate.localeCompare(b.createdDate);
	});
}

export function groupTasksByLaneAndStatus(
	mode: LaneMode,
	lanes: LaneDefinition[],
	statuses: string[],
	tasks: Task[],
	options?: { archivedMilestoneIds?: string[]; milestoneEntities?: Milestone[]; archivedMilestones?: Milestone[] },
): Map<string, Map<string, Task[]>> {
	const result = new Map<string, Map<string, Task[]>>();
	const archivedKeys = new Set((options?.archivedMilestoneIds ?? []).map((id) => milestoneKey(id)));
	const aliasMap = buildMilestoneAliasMap(options?.milestoneEntities ?? [], options?.archivedMilestones ?? []);
	const normalizedTasks = tasks.map((task) => {
		const canonicalMilestone = canonicalizeMilestone(task.milestone, aliasMap);
		const key = milestoneKey(canonicalMilestone);
		if (!key || (archivedKeys.size > 0 && archivedKeys.has(key))) {
			if (task.milestone === undefined) {
				return task;
			}
			return { ...task, milestone: undefined };
		}
		if (task.milestone === canonicalMilestone) {
			return task;
		}
		return { ...task, milestone: canonicalMilestone };
	});

	const ensureStatusMap = (laneKey: string): Map<string, Task[]> => {
		const existing = result.get(laneKey);
		if (existing) return existing;
		const statusMap = new Map<string, Task[]>();
		for (const status of statuses) {
			statusMap.set(status, []);
		}
		result.set(laneKey, statusMap);
		return statusMap;
	};

	for (const lane of lanes) {
		ensureStatusMap(lane.key);
	}

	for (const task of normalizedTasks) {
		const statusKey = task.status ?? "";
		const laneKey = mode === "milestone" ? laneKeyFromMilestone(task.milestone) : DEFAULT_LANE_KEY;
		const statusMap = ensureStatusMap(laneKey);

		let bucket = statusMap.get(statusKey);
		if (!bucket) {
			bucket = [];
			statusMap.set(statusKey, bucket);
		}
		bucket.push(task);
	}

	for (const [, statusMap] of result) {
		for (const [status, list] of statusMap) {
			statusMap.set(status, sortTasksForStatus(list, status));
		}
	}

	return result;
}
