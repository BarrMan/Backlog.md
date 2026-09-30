import { useCallback, useMemo, useState } from "react";
import type { Milestone, MilestoneBucket } from "../../../types";
import { apiClient } from "../../lib/api";
import { milestoneKey } from "../../utils/milestones";
import { useMilestoneFeedback } from "./feedback";

export const useMilestoneRemove = (milestoneEntities: Milestone[], onRefreshData?: () => Promise<void>) => {
	const [bucket, setBucket] = useState<MilestoneBucket | null>(null);
	const [taskHandling, setTaskHandling] = useState<"clear" | "reassign">("clear");
	const [reassignTo, setReassignTo] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isRemoving, setIsRemoving] = useState(false);
	const { clear, succeed } = useMilestoneFeedback();
	const options = useMemo(
		() => milestoneEntities.filter((milestone) => milestoneKey(milestone.id) !== milestoneKey(bucket?.milestone ?? "")),
		[bucket?.milestone, milestoneEntities],
	);
	const close = useCallback(() => {
		if (isRemoving) return;
		setBucket(null);
		setTaskHandling("clear");
		setReassignTo("");
		setError(null);
	}, [isRemoving]);
	const open = useCallback(
		(candidate: MilestoneBucket) => {
			if (!candidate.milestone) return;
			setBucket(candidate);
			setTaskHandling("clear");
			setReassignTo(
				milestoneEntities.find((milestone) => milestoneKey(milestone.id) !== milestoneKey(candidate.milestone))?.id ??
					"",
			);
			setError(null);
			clear();
		},
		[clear, milestoneEntities],
	);
	const submit = useCallback(async () => {
		if (!bucket?.milestone || isRemoving) return;
		const target = reassignTo.trim();
		if (taskHandling === "reassign" && !target) return setError("Choose a milestone to reassign tasks to.");
		setIsRemoving(true);
		setError(null);
		clear();
		try {
			await apiClient.removeMilestone(bucket.milestone, {
				taskHandling,
				reassignTo: taskHandling === "reassign" ? target : undefined,
			});
			if (onRefreshData) await onRefreshData();
			succeed(
				taskHandling === "reassign"
					? `Removed milestone "${bucket.label}" and reassigned its tasks`
					: `Removed milestone "${bucket.label}" and left its tasks unassigned`,
			);
			setBucket(null);
			setTaskHandling("clear");
			setReassignTo("");
		} catch (cause) {
			console.error("Failed to remove milestone:", cause);
			setError(cause instanceof Error ? cause.message : "Failed to remove milestone.");
		} finally {
			setIsRemoving(false);
		}
	}, [bucket, clear, isRemoving, onRefreshData, reassignTo, succeed, taskHandling]);
	return {
		bucket,
		taskHandling,
		reassignTo,
		options,
		error,
		isRemoving,
		open,
		close,
		setTaskHandling,
		setReassignTo,
		submit,
	};
};
