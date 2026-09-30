import type { Task } from "../../types";
import type { LaneDefinition, LaneMode } from "../lib/lanes";
import { BoardMilestoneLanes, BoardStatusColumns } from "./board-lanes-content";
import type { BoardTaskColumnProps, BoardTaskSelectionProps } from "./board-task-column-props";

interface BoardLanesProps extends BoardTaskColumnProps {
	laneMode: LaneMode;
	lanes: LaneDefinition[];
	visibleStatuses: string[];
	shouldShowLaneHeaders: boolean;
	getTasksForLane: (laneKey: string, status: string) => Task[];
	laneTaskCount: (laneKey: string) => number;
	getLaneProgress: (laneKey: string) => number;
	isLaneCollapsed: (laneKey: string, laneMilestone?: string) => boolean;
	getLaneLabel: (lane: LaneDefinition) => string;
	onToggleLaneCollapse: (laneKey: string) => void;
	terminalStatus?: string | null;
	selection: BoardTaskSelectionProps;
}

export function BoardLanes({
	laneMode,
	lanes,
	visibleStatuses,
	shouldShowLaneHeaders,
	getTasksForLane,
	laneTaskCount,
	getLaneProgress,
	isLaneCollapsed,
	getLaneLabel,
	onToggleLaneCollapse,
	terminalStatus,
	selection,
	...columnProps
}: BoardLanesProps) {
	const sharedColumnProps = { ...columnProps, ...selection };
	if (laneMode !== "milestone")
		return (
			<BoardStatusColumns
				statuses={visibleStatuses}
				getTasksForLane={getTasksForLane}
				terminalStatus={terminalStatus}
				columnProps={sharedColumnProps}
			/>
		);
	return (
		<BoardMilestoneLanes
			lanes={lanes}
			statuses={visibleStatuses}
			shouldShowHeaders={shouldShowLaneHeaders}
			getTasksForLane={getTasksForLane}
			laneTaskCount={laneTaskCount}
			getLaneProgress={getLaneProgress}
			isLaneCollapsed={isLaneCollapsed}
			getLaneLabel={getLaneLabel}
			onToggleLaneCollapse={onToggleLaneCollapse}
			terminalStatus={terminalStatus}
			columnProps={sharedColumnProps}
		/>
	);
}
