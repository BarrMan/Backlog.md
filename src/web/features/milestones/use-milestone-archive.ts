import { useCallback, useState } from "react";
import type { MilestoneBucket } from "../../../types";
import { apiClient } from "../../lib/api";
import { useMilestoneFeedback } from "./feedback";

export const useMilestoneArchive = (onRefreshData?: () => Promise<void>) => {
	const [archivingKey, setArchivingKey] = useState<string | null>(null);
	const { clear, fail, succeed } = useMilestoneFeedback();
	const archive = useCallback(
		async (bucket: MilestoneBucket) => {
			if (!bucket.milestone || archivingKey) return;
			const label = bucket.label || bucket.milestone;
			if (
				!window.confirm(
					`Archive milestone "${label}"? This moves it to backlog/archive/milestones and hides it from the milestones view.`,
				)
			)
				return;
			setArchivingKey(bucket.key);
			clear();
			try {
				await apiClient.archiveMilestone(bucket.milestone);
				if (onRefreshData) await onRefreshData();
				succeed(`Archived milestone "${label}"`);
			} catch (cause) {
				console.error("Failed to archive milestone:", cause);
				fail(cause instanceof Error ? cause.message : "Failed to archive milestone.");
			} finally {
				setArchivingKey(null);
			}
		},
		[archivingKey, clear, fail, onRefreshData, succeed],
	);
	return { archivingKey, archive };
};
