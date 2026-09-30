import type { Task } from "../../types";
import { DEFAULT_LANE_KEY, type LaneDefinition } from "../lib/lanes";
import type { BoardTaskColumnProps } from "./board-task-column-props";
import TaskColumn from "./TaskColumn";

type TasksForLane = (laneKey: string, status: string) => Task[];

function LaneHeader({
	lane,
	taskCount,
	progress,
	isCollapsed,
	onToggle,
}: {
	lane: LaneDefinition;
	taskCount: number;
	progress: number;
	isCollapsed: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className={`w-full flex items-center justify-between gap-4 px-4 py-3 bg-gray-100/80 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group ${!isCollapsed ? "border-b border-gray-200 dark:border-gray-700" : ""}`}
		>
			<div className="flex items-center gap-3 min-w-0">
				<svg
					aria-hidden="true"
					className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
				</svg>
				<h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-200 truncate">
					{lane.isNoMilestone || !lane.milestone ? "Unassigned" : lane.label}
				</h3>
				<span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors duration-200">
					{taskCount}
				</span>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				<div className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
					<div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
				</div>
				<span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-8 text-right">{progress}%</span>
			</div>
		</button>
	);
}

export function BoardStatusColumns({
	statuses,
	laneId = DEFAULT_LANE_KEY,
	targetMilestone,
	getTasksForLane,
	terminalStatus,
	columnProps,
}: {
	statuses: string[];
	laneId?: string;
	targetMilestone?: string | null;
	getTasksForLane: TasksForLane;
	terminalStatus?: string | null;
	columnProps: BoardTaskColumnProps;
}) {
	return (
		<div className="overflow-x-auto pb-2">
			<div className="flex flex-row flex-nowrap gap-4 w-full">
				{statuses.map((status) => (
					<div key={status} className="flex-1 min-w-[16rem]">
						<TaskColumn
							{...columnProps}
							title={status}
							tasks={getTasksForLane(laneId, status)}
							laneId={laneId}
							targetMilestone={targetMilestone}
							onCleanup={status === terminalStatus ? columnProps.onCleanup : undefined}
						/>
					</div>
				))}
			</div>
		</div>
	);
}

export function BoardMilestoneLanes({
	lanes,
	statuses,
	shouldShowHeaders,
	getTasksForLane,
	laneTaskCount,
	getLaneProgress,
	isLaneCollapsed,
	getLaneLabel: _getLaneLabel,
	onToggleLaneCollapse,
	terminalStatus,
	columnProps,
}: {
	lanes: LaneDefinition[];
	statuses: string[];
	shouldShowHeaders: boolean;
	getTasksForLane: TasksForLane;
	laneTaskCount: (laneKey: string) => number;
	getLaneProgress: (laneKey: string) => number;
	isLaneCollapsed: (laneKey: string, milestone?: string) => boolean;
	getLaneLabel: (lane: LaneDefinition) => string;
	onToggleLaneCollapse: (laneKey: string) => void;
	terminalStatus?: string | null;
	columnProps: BoardTaskColumnProps;
}) {
	return (
		<div className="space-y-6">
			{lanes.map((lane) => {
				const isCollapsed = isLaneCollapsed(lane.key, lane.milestone);
				return (
					<div
						key={lane.key}
						className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20 overflow-hidden"
					>
						{shouldShowHeaders && (
							<LaneHeader
								lane={{ ...lane, label: _getLaneLabel(lane) }}
								taskCount={laneTaskCount(lane.key)}
								progress={getLaneProgress(lane.key)}
								isCollapsed={isCollapsed}
								onToggle={() => onToggleLaneCollapse(lane.key)}
							/>
						)}
						{!isCollapsed && (
							<div className="p-4">
								<div
									className="grid gap-4"
									style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(0, 1fr))` }}
								>
									{statuses.map((status) => (
										<div key={`${lane.key}-${status}`} className="min-w-0">
											<TaskColumn
												{...columnProps}
												title={status}
												tasks={getTasksForLane(lane.key, status)}
												laneId={lane.key}
												targetMilestone={lane.milestone ?? null}
												onCleanup={status === terminalStatus ? columnProps.onCleanup : undefined}
											/>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
