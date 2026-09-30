import type { BoundaryNavigationKey } from "../components/generic-list.ts";

export type TaskListBoundaryDirection = "up" | "down";
export type PendingSearchWrap = "to-first" | "to-last" | null;
type PaneFocus = "list" | "detail";

export type ListBoundaryNavigation = "move" | "search" | "stay";

export function resolveListBoundaryNavigation(
	direction: TaskListBoundaryDirection,
	selectedIndex: number,
	totalTasks: number,
	key: BoundaryNavigationKey,
): ListBoundaryNavigation {
	const atBoundary = totalTasks <= 0 || (direction === "up" ? selectedIndex <= 0 : selectedIndex >= totalTasks - 1);
	if (!atBoundary) return "move";
	return key === "arrow" ? "search" : "stay";
}

export function shouldMoveFromDetailBoundaryToSearch(scrollOffset: number, key: BoundaryNavigationKey): boolean {
	return key === "arrow" && scrollOffset <= 0;
}

export function resolveSearchExitTargetIndex(
	direction: "up" | "down" | "escape",
	pendingWrap: PendingSearchWrap,
	totalTasks: number,
	currentIndex: number | undefined,
): number | undefined {
	if (totalTasks <= 0) return undefined;
	if (direction === "up" && pendingWrap === "to-last") return totalTasks - 1;
	if (direction === "down" && pendingWrap === "to-first") return 0;
	return currentIndex;
}

export function resolveFilterExitPane(
	preferredPane: PaneFocus,
	hasTaskList: boolean,
	hasDetailPane: boolean,
): PaneFocus | null {
	if (preferredPane === "detail" && hasDetailPane) return "detail";
	if (hasTaskList) return "list";
	if (hasDetailPane) return "detail";
	return null;
}

export function resolveTaskListSelection<T>(
	items: readonly T[],
	selectedIndex: number | number[] | undefined,
	fallback: T | null = null,
): T | null {
	const index = Array.isArray(selectedIndex) ? selectedIndex[0] : selectedIndex;
	return typeof index === "number" ? (items[index] ?? fallback) : fallback;
}
