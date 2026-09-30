import { useMemo } from "react";
import type { Milestone, Task } from "../../types";
import type { LaneDefinition, LaneMode } from "../lib/lanes";
import { groupTasksByLaneAndStatus } from "../lib/lanes";

interface BoardLaneViewOptions {
	laneMode: LaneMode;
	lanes: LaneDefinition[];
	statuses: string[];
	tasks: Task[];
	filteredTasks: Task[];
	hasActiveFilters: boolean;
	milestoneFilter?: string | null;
	archivedMilestoneIds: string[];
	milestoneEntities: Milestone[];
	archivedMilestones: Milestone[];
	hideEmptyColumns: boolean;
	hiddenColumnsRevealed: boolean;
}

export function useBoardLaneView({
	laneMode,
	lanes,
	statuses,
	tasks,
	filteredTasks,
	hasActiveFilters,
	milestoneFilter,
	archivedMilestoneIds,
	milestoneEntities,
	archivedMilestones,
	hideEmptyColumns,
	hiddenColumnsRevealed,
}: BoardLaneViewOptions) {
	const groupOptions = useMemo(
		() => ({ archivedMilestoneIds, milestoneEntities, archivedMilestones }),
		[archivedMilestoneIds, milestoneEntities, archivedMilestones],
	);
	const tasksByLane = useMemo(
		() => groupTasksByLaneAndStatus(laneMode, lanes, statuses, tasks, groupOptions),
		[laneMode, lanes, statuses, tasks, groupOptions],
	);
	const filteredTasksByLane = useMemo(
		() => groupTasksByLaneAndStatus(laneMode, lanes, statuses, filteredTasks, groupOptions),
		[laneMode, lanes, statuses, filteredTasks, groupOptions],
	);
	const displayTasksByLane = milestoneFilter || hasActiveFilters ? filteredTasksByLane : tasksByLane;
	const laneMetadataTasksByLane = hasActiveFilters ? filteredTasksByLane : tasksByLane;

	const laneTaskCount = (laneKey: string) => {
		const statusMap = laneMetadataTasksByLane.get(laneKey);
		if (!statusMap) return 0;
		return Array.from(statusMap.values()).reduce((count, taskList) => count + taskList.length, 0);
	};
	const getLaneProgress = (laneKey: string) => {
		const statusMap = laneMetadataTasksByLane.get(laneKey);
		if (!statusMap) return 0;
		let total = 0;
		let done = 0;
		for (const [status, taskList] of statusMap) {
			total += taskList.length;
			if (status.toLowerCase().includes("done") || status.toLowerCase().includes("complete")) done += taskList.length;
		}
		return total === 0 ? 0 : Math.round((done / total) * 100);
	};
	const visibleStatuses = useMemo(() => {
		if (!hideEmptyColumns || hiddenColumnsRevealed) return statuses;
		return statuses.filter((status) =>
			Array.from(displayTasksByLane.values()).some((statusMap) => (statusMap.get(status) ?? []).length > 0),
		);
	}, [hideEmptyColumns, hiddenColumnsRevealed, statuses, displayTasksByLane]);

	return { displayTasksByLane, laneMetadataTasksByLane, laneTaskCount, getLaneProgress, visibleStatuses };
}
