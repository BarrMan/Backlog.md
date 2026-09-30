import { useCallback } from "react";
import { apiClient } from "../../lib/api";
import { useMilestoneFeedback } from "./feedback";
import { useMilestoneForm } from "./use-milestone-form";

export const useMilestoneCreate = (onRefreshData?: () => Promise<void>) => {
	const form = useMilestoneForm();
	const { succeed } = useMilestoneFeedback();
	const open = useCallback(() => {
		form.open();
	}, [form]);
	const submit = useCallback(
		async (event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const value = form.name.trim();
			if (!value) return form.setError("Milestone name cannot be empty.");
			if (!form.begin()) return;
			try {
				await apiClient.createMilestone(value, undefined, form.dueDate || undefined);
				if (onRefreshData) await onRefreshData();
				succeed(`Added milestone "${value}"`);
				form.complete();
			} catch (cause) {
				console.error("Failed to add milestone:", cause);
				form.fail(cause, "Failed to add milestone.");
			}
		},
		[form, onRefreshData, succeed],
	);
	return { ...form, open, submit };
};
