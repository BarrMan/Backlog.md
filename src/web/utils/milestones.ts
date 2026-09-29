/**
 * Re-export milestone utilities from core for backward compatibility
 * All business logic lives in src/core/milestones.ts
 */
export {
	buildMilestoneBuckets,
	collectArchivedMilestoneKeys,
	collectMilestoneIds,
	getMilestoneLabel,
	isDoneStatus,
	milestoneKey,
	validateMilestoneName,
} from "../../core/milestones.ts";
