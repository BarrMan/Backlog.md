import { useCallback, useState } from "react";
import type { Milestone, MilestoneBucket } from "../../../types";
import { apiClient } from "../../lib/api";
import { milestoneKey } from "../../utils/milestones";
import { useMilestoneFeedback } from "./feedback";
import { useMilestoneForm } from "./use-milestone-form";

export const useMilestoneEdit = (milestoneEntities: Milestone[], onRefreshData?: () => Promise<void>) => {
	const [bucket, setBucket] = useState<MilestoneBucket | null>(null);
	const form = useMilestoneForm();
	const { succeed } = useMilestoneFeedback();
	const close = useCallback(() => {
		if (form.isSaving) return;
		setBucket(null);
		form.close();
	}, [form]);
	const open = useCallback(
		(candidate: MilestoneBucket) => {
			if (!candidate.milestone) return;
			setBucket(candidate);
			form.open(
				candidate.label || candidate.milestone,
				milestoneEntities.find((milestone) => milestoneKey(milestone.id) === milestoneKey(candidate.milestone))
					?.dueDate ?? "",
			);
		},
		[form, milestoneEntities],
	);
	const submit = useCallback(
		async (event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (!bucket?.milestone) return;
			const value = form.name.trim();
			if (!value) return form.setError("Milestone name cannot be empty.");
			const duplicate = milestoneEntities.find(
				(milestone) =>
					milestoneKey(milestone.id) !== milestoneKey(bucket.milestone) &&
					(milestoneKey(milestone.title) === milestoneKey(value) || milestoneKey(milestone.id) === milestoneKey(value)),
			);
			if (duplicate) return form.setError(`Milestone "${duplicate.title}" already exists.`);
			if (!form.begin()) return;
			try {
				await apiClient.updateMilestone(bucket.milestone, value, form.dueDate || null);
				if (onRefreshData) await onRefreshData();
				succeed(
					bucket.label === value ? `Updated milestone "${value}"` : `Renamed milestone "${bucket.label}" to "${value}"`,
				);
				setBucket(null);
				form.complete();
			} catch (cause) {
				console.error("Failed to update milestone:", cause);
				form.fail(cause, "Failed to update milestone.");
			}
		},
		[bucket, form, milestoneEntities, onRefreshData, succeed],
	);
	return { bucket, ...form, open, close, submit };
};
