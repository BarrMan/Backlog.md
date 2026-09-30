import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { TaskSummary } from "../../types";
import { resolvePriorityValue } from "../../utils/priority-config";
import { resolveProjectValue } from "../../utils/project-config";
import { resolveTaskTypeValue } from "../../utils/task-type-config";
import type { BoardProps } from "../components/Board";
import type { BoardPageProps } from "../components/BoardPage";
import type { LaneMode } from "../lib/lanes";

const BOARD_LANE_STORAGE_KEY = "backlog.board.lane";

function parseLaneMode(value: string | null): LaneMode | null {
	if (value === "milestone" || value === "none") return value;
	return null;
}

export function useBoardRouteState() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [laneMode, setLaneMode] = useState<LaneMode>("none");
	const [milestoneFilter, setMilestoneFilter] = useState<string | null>(null);

	useEffect(() => {
		const storedLane = typeof window === "undefined" ? null : window.localStorage.getItem(BOARD_LANE_STORAGE_KEY);
		const nextLane = parseLaneMode(searchParams.get("lane")) ?? parseLaneMode(storedLane) ?? "none";
		setLaneMode((current) => (current === nextLane ? current : nextLane));
		setMilestoneFilter(searchParams.get("milestone"));
		if (typeof window !== "undefined") window.localStorage.setItem(BOARD_LANE_STORAGE_KEY, nextLane);
	}, [searchParams]);

	const handleLaneChange = (mode: LaneMode) => {
		setLaneMode(mode);
		setMilestoneFilter(null);
		if (typeof window !== "undefined") window.localStorage.setItem(BOARD_LANE_STORAGE_KEY, mode);
		setSearchParams(
			(params) => {
				if (mode === "none") params.delete("lane");
				else params.set("lane", mode);
				params.delete("milestone");
				return params;
			},
			{ replace: true },
		);
	};

	return { handleLaneChange, laneMode, milestoneFilter, searchParams, setSearchParams };
}

export function useBoardHighlight(
	searchParams: URLSearchParams,
	setSearchParams: ReturnType<typeof useSearchParams>[1],
	onEditTask: (task: TaskSummary | import("../../types").Task) => void,
) {
	const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
	useEffect(() => {
		const highlight = searchParams.get("highlight");
		if (!highlight) return;
		setHighlightTaskId(highlight);
		setSearchParams(
			(params) => {
				params.delete("highlight");
				return params;
			},
			{ replace: true },
		);
	}, [searchParams, setSearchParams]);

	return {
		highlightTaskId,
		handleEditTask: (task: TaskSummary | import("../../types").Task) => {
			setHighlightTaskId(null);
			onEditTask(task);
		},
	};
}

type BoardFilters = { assignee: string; labels: string[]; priority: string; taskType: string; project: string };

function readFilterLabels(searchParams: URLSearchParams): string[] {
	return [...searchParams.getAll("label"), ...searchParams.getAll("labels").flatMap((value) => value.split(","))]
		.map((label) => label.trim())
		.filter(Boolean);
}

export function useBoardFilters(
	searchParams: URLSearchParams,
	setSearchParams: ReturnType<typeof useSearchParams>[1],
	isLoading: boolean,
	availablePriorities?: string[],
	availableTypes?: string[],
	availableProjects?: string[],
) {
	const rawFilterPriority = searchParams.get("priority") ?? "";
	const rawFilterType = searchParams.get("type") ?? "";
	const rawFilterProject = searchParams.get("project") ?? "";
	const filterPriority = resolvePriorityValue(rawFilterPriority, availablePriorities) ?? "";
	const filterType = resolveTaskTypeValue(rawFilterType, availableTypes) ?? "";
	const filterProject = resolveProjectValue(rawFilterProject, availableProjects) ?? "";

	useEffect(() => {
		if (
			isLoading ||
			(rawFilterPriority === filterPriority && rawFilterType === filterType && rawFilterProject === filterProject)
		)
			return;
		setSearchParams(
			(params) => {
				for (const [key, value] of [
					["priority", filterPriority],
					["type", filterType],
					["project", filterProject],
				] as const) {
					if (value) params.set(key, value);
					else params.delete(key);
				}
				return params;
			},
			{ replace: true },
		);
	}, [
		filterPriority,
		filterType,
		filterProject,
		isLoading,
		rawFilterPriority,
		rawFilterType,
		rawFilterProject,
		setSearchParams,
	]);

	const handleFiltersChange = (filters: BoardFilters) => {
		setSearchParams(
			(params) => {
				for (const [key, value] of [
					["assignee", filters.assignee],
					["priority", filters.priority],
					["type", filters.taskType],
					["project", filters.project],
				] as const) {
					if (value) params.set(key, value);
					else params.delete(key);
				}
				params.delete("label");
				params.delete("labels");
				for (const label of filters.labels.map((label) => label.trim()).filter(Boolean)) params.append("label", label);
				return params;
			},
			{ replace: true },
		);
	};

	return {
		filterAssignee: searchParams.get("assignee") ?? "",
		filterLabels: readFilterLabels(searchParams),
		filterPriority,
		filterProject,
		filterType,
		handleFiltersChange,
	};
}

export function useBoardPageProps(
	props: BoardPageProps,
	route: Pick<ReturnType<typeof useBoardRouteState>, "handleLaneChange" | "laneMode" | "milestoneFilter">,
	highlight: ReturnType<typeof useBoardHighlight>,
	filters: ReturnType<typeof useBoardFilters>,
): BoardProps {
	return {
		...props,
		...filters,
		highlightTaskId: highlight.highlightTaskId,
		laneMode: route.laneMode,
		milestoneFilter: route.milestoneFilter,
		onEditTask: highlight.handleEditTask,
		onFiltersChange: filters.handleFiltersChange,
		onLaneChange: route.handleLaneChange,
	};
}
