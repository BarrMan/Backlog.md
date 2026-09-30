import type { MilestoneBucket, Task } from "../../../types";
import { isDoneStatus } from "../../utils/milestones";

const rebuildFilteredBucket = (bucket: MilestoneBucket, filteredTasks: Task[], statuses: string[]): MilestoneBucket => {
	const statusCounts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<string, number>;
	for (const task of filteredTasks) {
		const status = task.status ?? "";
		statusCounts[status] = (statusCounts[status] ?? 0) + 1;
	}
	const doneCount = filteredTasks.filter((task) => isDoneStatus(task.status)).length;
	return {
		...bucket,
		tasks: filteredTasks,
		statusCounts,
		total: filteredTasks.length,
		doneCount,
		progress: filteredTasks.length > 0 ? Math.round((doneCount / filteredTasks.length) * 100) : 0,
	};
};

export const filterMilestoneBuckets = (buckets: MilestoneBucket[], taskIds: Set<string>, statuses: string[]) =>
	buckets.map((bucket) =>
		rebuildFilteredBucket(
			bucket,
			bucket.tasks.filter((task) => taskIds.has(task.id)),
			statuses,
		),
	);

const sortByMilestoneId = (left: MilestoneBucket, right: MilestoneBucket) => {
	const leftId = Number.parseInt(left.milestone?.match(/^m-(\d+)/)?.[1] ?? "", 10);
	const rightId = Number.parseInt(right.milestone?.match(/^m-(\d+)/)?.[1] ?? "", 10);
	return (
		(Number.isNaN(leftId) ? Number.MAX_SAFE_INTEGER : leftId) -
		(Number.isNaN(rightId) ? Number.MAX_SAFE_INTEGER : rightId)
	);
};

export const groupMilestoneBuckets = (buckets: MilestoneBucket[]) => ({
	unassignedBucket: buckets.find((bucket) => bucket.isNoMilestone),
	activeMilestones: buckets
		.filter((bucket) => !bucket.isNoMilestone && !bucket.isCompleted)
		.sort((left, right) => Number(right.total === 0) - Number(left.total === 0) || sortByMilestoneId(left, right)),
	completedMilestones: buckets.filter((bucket) => !bucket.isNoMilestone && bucket.isCompleted).sort(sortByMilestoneId),
});
