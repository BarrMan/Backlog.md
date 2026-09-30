import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { resolvePriorityValue } from "../../utils/priority-config";

function getValues(params: URLSearchParams, singular: string, plural: string): string[] {
	const values = [...params.getAll(singular), ...params.getAll(plural)];
	const csv = params.get(plural);
	if (csv) values.push(...csv.split(","));
	return values.map((value) => value.trim()).filter(Boolean);
}

function normalizeStatuses(statuses: string[], availableStatuses: string[]): string[] {
	const canonical = new Map(availableStatuses.map((status) => [status.trim().toLowerCase(), status.trim()]));
	return [
		...new Set(statuses.map((status) => canonical.get(status.trim().toLowerCase()) ?? status.trim()).filter(Boolean)),
	];
}

function equal(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function useTaskListFilters(
	statusOptions: string[],
	availablePriorities: string[] | undefined,
	isLoading: boolean,
) {
	const [searchParams, setSearchParams] = useSearchParams();
	const [statusFilter, setStatusFilter] = useState(() =>
		normalizeStatuses(searchParams.getAll("status"), statusOptions),
	);
	const [excludedStatusFilter, setExcludedStatusFilter] = useState(() =>
		getValues(searchParams, "excludeStatus", "excludeStatuses"),
	);
	const [priorityFilter, setPriorityFilter] = useState(() =>
		isLoading ? "" : (resolvePriorityValue(searchParams.get("priority"), availablePriorities) ?? ""),
	);
	const [milestoneFilter, setMilestoneFilter] = useState(() => searchParams.get("milestone") ?? "");
	const [labelFilter, setLabelFilter] = useState(() => getValues(searchParams, "label", "labels"));

	useEffect(() => {
		const statuses = normalizeStatuses(searchParams.getAll("status"), statusOptions);
		const excludedStatuses = getValues(searchParams, "excludeStatus", "excludeStatuses");
		const rawPriority = searchParams.get("priority") ?? "";
		const priority = resolvePriorityValue(rawPriority, availablePriorities) ?? "";
		const milestone = searchParams.get("milestone") ?? "";
		const labels = getValues(searchParams, "label", "labels");
		setStatusFilter((previous) => (equal(statuses, previous) ? previous : statuses));
		setExcludedStatusFilter((previous) => (equal(excludedStatuses, previous) ? previous : excludedStatuses));
		if (!isLoading && rawPriority !== priority) {
			setSearchParams(
				(params) => {
					if (priority) params.set("priority", priority);
					else params.delete("priority");
					return params;
				},
				{ replace: true },
			);
		}
		if (!isLoading) setPriorityFilter((previous) => (priority === previous ? previous : priority));
		setMilestoneFilter((previous) => (milestone === previous ? previous : milestone));
		setLabelFilter((previous) => (equal(labels, previous) ? previous : labels));
	}, [availablePriorities, isLoading, searchParams, setSearchParams, statusOptions]);

	const sync = (
		statuses: string[],
		excludedStatuses: string[],
		priority: string,
		labels: string[],
		milestone: string,
	) => {
		const params = new URLSearchParams();
		for (const status of statuses) params.append("status", status);
		for (const status of excludedStatuses) params.append("excludeStatus", status);
		if (priority) params.set("priority", priority);
		for (const label of labels) params.append("label", label);
		if (milestone) params.set("milestone", milestone);
		setSearchParams(params, { replace: true });
	};
	return {
		statusFilter,
		excludedStatusFilter,
		priorityFilter,
		milestoneFilter,
		labelFilter,
		handleStatusChange: (next: string[]) => {
			const value = normalizeStatuses(next, statusOptions);
			setStatusFilter(value);
			sync(value, excludedStatusFilter, priorityFilter, labelFilter, milestoneFilter);
		},
		handleExcludeStatusChange: (next: string[]) => {
			const value = next.map((status) => status.trim()).filter(Boolean);
			setExcludedStatusFilter(value);
			sync(statusFilter, value, priorityFilter, labelFilter, milestoneFilter);
		},
		handlePriorityChange: (value: string) => {
			setPriorityFilter(value);
			sync(statusFilter, excludedStatusFilter, value, labelFilter, milestoneFilter);
		},
		handleLabelChange: (next: string[]) => {
			const value = next.map((label) => label.trim()).filter(Boolean);
			setLabelFilter(value);
			sync(statusFilter, excludedStatusFilter, priorityFilter, value, milestoneFilter);
		},
		handleMilestoneChange: (value: string) => {
			setMilestoneFilter(value);
			sync(statusFilter, excludedStatusFilter, priorityFilter, labelFilter, value);
		},
		clear: () => {
			setStatusFilter([]);
			setExcludedStatusFilter([]);
			setPriorityFilter("");
			setLabelFilter([]);
			setMilestoneFilter("");
			sync([], [], "", [], "");
		},
	};
}
