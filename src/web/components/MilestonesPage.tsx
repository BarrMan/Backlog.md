import type React from "react";
import { useMemo, useState } from "react";
import type { Milestone, MilestoneBucket, Task } from "../../types";
import { createTaskSearchIndex } from "../../utils/task-search";
import { filterMilestoneBuckets, groupMilestoneBuckets } from "../features/milestones/buckets";
import { MilestoneFeedbackProvider, useMilestoneFeedback } from "../features/milestones/feedback";
import MilestoneCreateWorkflow from "../features/milestones/MilestoneCreateWorkflow";
import { useMilestoneDrag } from "../hooks/use-milestone-drag";
import { buildMilestoneBuckets, collectArchivedMilestoneKeys } from "../utils/milestones";
import MilestoneBucketGroup from "./MilestoneBucketGroup";
import MilestonesPageHeader from "./MilestonesPageHeader";
import { resolveMilestoneBucketExpanded } from "./milestone-bucket-expansion";
import UnassignedMilestoneTasks from "./UnassignedMilestoneTasks";

interface MilestonesPageProps {
	tasks: Task[];
	statuses: string[];
	milestoneEntities: Milestone[];
	archivedMilestones: Milestone[];
	onEditTask: (task: Task) => void;
	onRefreshData?: () => Promise<void>;
	dateFormat?: string;
}

const MilestonesPageContent: React.FC<MilestonesPageProps> = ({
	tasks,
	statuses,
	milestoneEntities,
	archivedMilestones,
	onEditTask,
	onRefreshData,
	dateFormat,
}) => {
	const { error, success } = useMilestoneFeedback();
	const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>({});
	const { draggedTask, dropTargetKey, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop } =
		useMilestoneDrag({ onRefreshData });
	const [showAllUnassigned, setShowAllUnassigned] = useState(false);
	const [showCompleted, setShowCompleted] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const archivedMilestoneIds = useMemo(
		() => collectArchivedMilestoneKeys(archivedMilestones, milestoneEntities),
		[archivedMilestones, milestoneEntities],
	);
	const allMilestoneEntities = useMemo(
		() => [...milestoneEntities, ...archivedMilestones],
		[milestoneEntities, archivedMilestones],
	);
	const buckets = useMemo(
		() => buildMilestoneBuckets(tasks, milestoneEntities, statuses, { archivedMilestoneIds, archivedMilestones }),
		[tasks, milestoneEntities, statuses, archivedMilestoneIds, archivedMilestones],
	);
	const searchQueryTrimmed = searchQuery.trim();
	const isSearchActive = searchQueryTrimmed.length > 0;
	const defaultExpandedByBucketKey = useMemo(() => {
		const map: Record<string, boolean> = {};
		for (const bucket of buckets) {
			map[bucket.key] = bucket.total > 0 && bucket.total <= 8;
		}
		return map;
	}, [buckets]);
	const visibleBuckets = useMemo(() => {
		if (!isSearchActive) {
			return buckets;
		}

		// The shared task index, so a query means here what it means in the CLI, the TUI, and the
		// rest of the web. The buckets are already loaded, so this filters them in place.
		const matchedTaskIds = new Set(
			createTaskSearchIndex(buckets.flatMap((bucket) => bucket.tasks))
				.search({ query: searchQueryTrimmed })
				.map((task) => task.id),
		);

		return filterMilestoneBuckets(buckets, matchedTaskIds, statuses);
	}, [buckets, isSearchActive, searchQueryTrimmed, statuses]);

	const { unassignedBucket, activeMilestones, completedMilestones } = useMemo(
		() => groupMilestoneBuckets(visibleBuckets),
		[visibleBuckets],
	);
	const toggleBucketExpanded = (bucket: MilestoneBucket) => {
		setExpandedBuckets((current) => ({
			...current,
			[bucket.key]: !resolveMilestoneBucketExpanded(bucket, current, defaultExpandedByBucketKey),
		}));
	};
	const hasSearchMatches = visibleBuckets.some((bucket) => bucket.total > 0);
	const showSearchNoMatchHint = isSearchActive && !hasSearchMatches;
	const noMilestones = !isSearchActive && activeMilestones.length === 0 && completedMilestones.length === 0;

	return (
		<div className="page-shell transition-colors duration-200">
			<MilestonesPageHeader
				searchQuery={searchQuery}
				error={error}
				success={success}
				onSearchQueryChange={setSearchQuery}
				action={<MilestoneCreateWorkflow onRefreshData={onRefreshData} />}
			/>

			{/* Search no-match hint */}
			{showSearchNoMatchHint && (
				<div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
					<p className="text-sm text-amber-800 dark:text-amber-200">
						No milestones or tasks match &quot;{searchQueryTrimmed}&quot;.
					</p>
					<button
						type="button"
						onClick={() => setSearchQuery("")}
						className="rounded-md border border-amber-300 dark:border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
					>
						Clear search
					</button>
				</div>
			)}

			{/* Unassigned tasks */}
			<UnassignedMilestoneTasks
				bucket={unassignedBucket}
				isSearchActive={isSearchActive}
				isExpanded={expandedBuckets.__unassigned ?? true}
				showAll={showAllUnassigned}
				onToggleExpanded={() =>
					setExpandedBuckets((current) => ({ ...current, __unassigned: !(current.__unassigned ?? true) }))
				}
				onToggleShowAll={() => setShowAllUnassigned((value) => !value)}
				onEditTask={onEditTask}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			/>

			{/* Active milestones */}
			{activeMilestones.length > 0 && (
				<MilestoneBucketGroup
					buckets={activeMilestones}
					statuses={statuses}
					milestoneEntities={allMilestoneEntities}
					dateFormat={dateFormat}
					expandedBuckets={expandedBuckets}
					defaultExpandedByBucketKey={defaultExpandedByBucketKey}
					draggedTask={draggedTask}
					dropTargetKey={dropTargetKey}
					onRefreshData={onRefreshData}
					onToggle={toggleBucketExpanded}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					onEditTask={onEditTask}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
				/>
			)}

			{/* Completed milestones */}
			{completedMilestones.length > 0 && (
				<div className="mt-8">
					{isSearchActive ? (
						<div className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
							<span>Completed milestones</span>
							<span className="text-xs text-gray-400 dark:text-gray-500">({completedMilestones.length})</span>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setShowCompleted((value) => !value)}
							className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
						>
							<span>Completed milestones</span>
							<span className="text-xs text-gray-400 dark:text-gray-500">({completedMilestones.length})</span>
							<svg
								aria-hidden="true"
								className={`w-4 h-4 transition-transform ${showCompleted ? "rotate-180" : ""}`}
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
							</svg>
						</button>
					)}
					{(isSearchActive || showCompleted) && (
						<div className="mt-4">
							<MilestoneBucketGroup
								buckets={completedMilestones}
								statuses={statuses}
								milestoneEntities={allMilestoneEntities}
								dateFormat={dateFormat}
								expandedBuckets={expandedBuckets}
								defaultExpandedByBucketKey={defaultExpandedByBucketKey}
								draggedTask={draggedTask}
								dropTargetKey={dropTargetKey}
								onRefreshData={onRefreshData}
								onToggle={toggleBucketExpanded}
								onDragOver={handleDragOver}
								onDragLeave={handleDragLeave}
								onDrop={handleDrop}
								onEditTask={onEditTask}
								onDragStart={handleDragStart}
								onDragEnd={handleDragEnd}
							/>
						</div>
					)}
				</div>
			)}

			{/* Empty state */}
			{noMilestones && !unassignedBucket?.total && (
				<div className="flex flex-col items-center justify-center py-16 text-center">
					<svg
						aria-hidden="true"
						className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={1.5}
							d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
						/>
					</svg>
					<p className="text-gray-500 dark:text-gray-400">
						No milestones yet. Create one to start organizing your tasks.
					</p>
				</div>
			)}
		</div>
	);
};

const MilestonesPage: React.FC<MilestonesPageProps> = (props) => (
	<MilestoneFeedbackProvider>
		<MilestonesPageContent {...props} />
	</MilestoneFeedbackProvider>
);

export default MilestonesPage;
