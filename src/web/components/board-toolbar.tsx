import type { LaneMode } from "../lib/lanes";
import {
	BoardFilters as BoardFilterControls,
	BoardSelectionControls,
	BoardTitle,
	BoardViewControls,
} from "./board-toolbar-content";

export type BoardFilters = { assignee: string; labels: string[]; priority: string; taskType: string; project: string };

export interface BoardToolbarProps {
	onNewTask: () => void;
	laneMode: LaneMode;
	onLaneChange: (mode: LaneMode) => void;
	hasTasksWithMilestones: boolean;
	selectedTaskIds: string[];
	batchMoveStatus: string;
	setBatchMoveStatus: (status: string) => void;
	onBatchMove: (status: string) => void;
	onClearSelection: () => void;
	statuses: string[];
	onFiltersChange?: (filters: BoardFilters) => void;
	filterAssignee: string;
	filterPriority: string;
	filterType: string;
	filterProject: string;
	normalizedFilterLabels: string[];
	uniqueAssignees: string[];
	uniqueLabels: string[];
	priorityOptions: { label: string; value: string }[];
	typeOptions: string[];
	projectOptions: string[];
	hasActiveFilters: boolean;
}

export function BoardToolbar(props: BoardToolbarProps) {
	return (
		<div className="mb-6 space-y-3">
			<BoardTitle onNewTask={props.onNewTask} />
			<BoardSelectionControls {...props} />
			<div className="flex flex-wrap items-center gap-3" role="toolbar" aria-label="Board view controls">
				<BoardViewControls {...props} />
				<BoardFilterControls {...props} />
			</div>
		</div>
	);
}
