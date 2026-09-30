import { type DragEvent, useState } from "react";
import type { Task } from "../../types";

type TaskCardDragOptions = {
	task: Task;
	status?: string;
	laneId?: string;
	isSelected: boolean;
	selectionCount: number;
	onSelect?: (event: { shiftKey: boolean }) => void;
	onDragStart?: () => void;
	onDragEnd?: () => void;
	onSelectionDragChange?: (active: boolean) => void;
};

function buildSelectionDragImage(source: HTMLElement, count: number): HTMLElement {
	const width = source.offsetWidth;
	const height = source.offsetHeight;
	const behind = Math.min(count - 1, 2);
	const ghost = document.createElement("div");
	ghost.style.cssText = `position:fixed;top:-1000px;left:-1000px;width:${width + 6 * behind}px;height:${height + 6 * behind}px;pointer-events:none;`;
	for (let depth = behind; depth >= 1; depth -= 1) {
		const shell = document.createElement("div");
		shell.className = source.className;
		shell.style.cssText = `position:absolute;top:${6 * depth}px;left:${6 * depth}px;width:${width}px;height:${height}px;margin:0;`;
		ghost.appendChild(shell);
	}
	const front = source.cloneNode(true) as HTMLElement;
	front.style.cssText = `position:absolute;top:0;left:0;width:${width}px;height:${height}px;margin:0;`;
	ghost.appendChild(front);
	const badge = document.createElement("div");
	badge.textContent = String(count);
	badge.style.cssText =
		"position:absolute;top:-8px;right:-8px;min-width:24px;height:24px;padding:0 6px;border-radius:9999px;background:#3b82f6;color:#ffffff;font-size:12px;font-weight:600;line-height:24px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.3);";
	ghost.appendChild(badge);
	return ghost;
}

export function useTaskCardDrag({
	task,
	status,
	laneId,
	isSelected,
	selectionCount,
	onSelect,
	onDragStart,
	onDragEnd,
	onSelectionDragChange,
}: TaskCardDragOptions) {
	const [isDragging, setIsDragging] = useState(false);
	const [showBranchTooltip, setShowBranchTooltip] = useState(false);
	const isFromOtherBranch = Boolean(task.branch);
	const handleDragStart = (event: DragEvent) => {
		if (isFromOtherBranch) {
			event.preventDefault();
			setShowBranchTooltip(true);
			setTimeout(() => setShowBranchTooltip(false), 3000);
			return;
		}
		event.dataTransfer.setData("text/plain", task.id);
		if (status) event.dataTransfer.setData("text/status", status);
		if (laneId !== undefined) event.dataTransfer.setData("text/lane", laneId);
		event.dataTransfer.effectAllowed = "move";
		const joinsSelection = !isSelected && selectionCount > 0 && (event.ctrlKey || event.metaKey) && Boolean(onSelect);
		if (joinsSelection) onSelect?.({ shiftKey: false });
		const batchCount = isSelected ? selectionCount : joinsSelection ? selectionCount + 1 : 1;
		if (batchCount > 1) {
			onSelectionDragChange?.(true);
			if (typeof event.dataTransfer.setDragImage === "function") {
				const ghost = buildSelectionDragImage(event.currentTarget as HTMLElement, batchCount);
				document.body.appendChild(ghost);
				event.dataTransfer.setDragImage(ghost, 16, 16);
				setTimeout(() => ghost.remove(), 0);
			}
		}
		setIsDragging(true);
		onDragStart?.();
	};
	const handleDragEnd = () => {
		setIsDragging(false);
		onSelectionDragChange?.(false);
		onDragEnd?.();
	};
	return { handleDragEnd, handleDragStart, isDragging, isFromOtherBranch, showBranchTooltip };
}
