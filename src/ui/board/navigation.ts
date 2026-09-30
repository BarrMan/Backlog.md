import type { Task } from "../../types/index.ts";
import type { BoundaryNavigationKey } from "../components/generic-list.ts";
import { resolveListBoundaryNavigation } from "../task-viewer-with-search.ts";
import type { LaneView } from "./lane-view.ts";
import type { BoardMoveOperation } from "./move-policy.ts";
import { getPreviewMovingIds } from "./move-policy.ts";

export type BoardSelectionPolicy = {
	isBlocked: () => boolean;
	getColumn: () => LaneView | undefined;
	getMoveOperation: () => BoardMoveOperation | null;
	isMovePending: () => boolean;
	collapseHighlight: () => boolean;
	renderView: () => void;
	focusSearch: () => void;
	setPendingSearchWrap: (target: "to-first" | "to-last" | null) => void;
	updateFooter: () => void;
	renderScreen: () => void;
	selectColumnRow: (column: LaneView, index: number, active: boolean) => void;
};

export function moveBoardSelection(
	direction: "up" | "down",
	key: BoundaryNavigationKey,
	policy: BoardSelectionPolicy,
): void {
	if (policy.isBlocked()) return;
	const column = policy.getColumn();
	const operation = policy.getMoveOperation();
	if (operation) {
		moveBoardMoveSelection(direction, column, operation, policy);
		return;
	}
	moveBoardListSelection(direction, key, column, policy);
}

function moveBoardMoveSelection(
	direction: "up" | "down",
	column: LaneView | undefined,
	operation: BoardMoveOperation,
	policy: BoardSelectionPolicy,
): void {
	if (policy.isMovePending() || policy.collapseHighlight()) return;
	if (direction === "up") {
		if (operation.targetIndex > 0) {
			operation.targetIndex -= 1;
			policy.renderView();
		}
		return;
	}
	if (column && operation.targetIndex < column.tasks.length - getPreviewMovingIds(operation).length) {
		operation.targetIndex += 1;
		policy.renderView();
	}
}

function moveBoardListSelection(
	direction: "up" | "down",
	key: BoundaryNavigationKey,
	column: LaneView | undefined,
	policy: BoardSelectionPolicy,
): void {
	if (!column) return;
	const selected = column.list.selected ?? 0;
	const total = column.tasks.length;
	const navigation = resolveListBoundaryNavigation(direction, selected, total, key);
	if (navigation === "stay") return;
	if (navigation === "search") {
		policy.setPendingSearchWrap(total === 0 ? null : direction === "up" ? "to-last" : "to-first");
		policy.focusSearch();
		policy.updateFooter();
		policy.renderScreen();
		return;
	}
	policy.selectColumnRow(column, direction === "up" ? selected - 1 : selected + 1, true);
	policy.renderScreen();
}

export function areBoardTaskCollectionsEqual(current: readonly Task[], next: readonly Task[]): boolean {
	if (current.length !== next.length) return false;
	return current.every((task, index) => JSON.stringify(task) === JSON.stringify(next[index]));
}
