import type React from "react";
import type { Milestone, MilestoneBucket, Task } from "../../types";
import { milestoneKey } from "../utils/milestones";
import MilestoneCard from "./MilestoneCard";

interface MilestoneBucketGroupProps {
	buckets: MilestoneBucket[];
	statuses: string[];
	milestoneEntities: Milestone[];
	dateFormat?: string;
	expandedBuckets: Record<string, boolean>;
	defaultExpandedByBucketKey: Record<string, boolean>;
	draggedTask: Task | null;
	dropTargetKey: string | null;
	onRefreshData?: () => Promise<void>;
	onToggle: (bucket: MilestoneBucket) => void;
	onDragOver: (event: React.DragEvent, bucketKey: string) => void;
	onDragLeave: () => void;
	onDrop: (event: React.DragEvent, milestone: string | undefined) => void;
	onEditTask: (task: Task) => void;
	onDragStart: (event: React.DragEvent, task: Task) => void;
	onDragEnd: (event: React.DragEvent) => void;
}

const MilestoneBucketGroup: React.FC<MilestoneBucketGroupProps> = ({
	buckets,
	statuses,
	milestoneEntities,
	dateFormat,
	expandedBuckets,
	defaultExpandedByBucketKey,
	draggedTask,
	dropTargetKey,
	onRefreshData,
	onToggle,
	onDragOver,
	onDragLeave,
	onDrop,
	onEditTask,
	onDragStart,
	onDragEnd,
}) => (
	<div className="space-y-4">
		{buckets.map((bucket) => (
			<MilestoneCard
				key={bucket.key}
				bucket={bucket}
				statuses={statuses}
				milestone={milestoneEntities.find(
					(milestone) => milestoneKey(milestone.id) === milestoneKey(bucket.milestone ?? ""),
				)}
				dateFormat={dateFormat}
				milestoneEntities={milestoneEntities}
				onRefreshData={onRefreshData}
				isExpanded={
					expandedBuckets[bucket.key] ??
					defaultExpandedByBucketKey[bucket.key] ??
					(bucket.total > 0 && bucket.total <= 8)
				}
				isDragging={draggedTask !== null}
				isDropTarget={dropTargetKey === bucket.key}
				onToggle={() => onToggle(bucket)}
				onDragOver={(event) => onDragOver(event, bucket.key)}
				onDragLeave={onDragLeave}
				onDrop={(event) => onDrop(event, bucket.milestone)}
				onEditTask={onEditTask}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
			/>
		))}
	</div>
);

export default MilestoneBucketGroup;
