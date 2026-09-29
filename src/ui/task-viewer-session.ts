import type { Task } from "../types/index.ts";

/** Owns selected-task identity and rejects stale asynchronous selection refreshes. */
export class TaskViewerSession {
	selected: Task;
	private selectionRequestId = 0;

	constructor(initialTask: Task) {
		this.selected = initialTask;
	}

	select(task: Task): boolean {
		if (task.id === this.selected.id) return false;
		this.selected = task;
		return true;
	}

	beginSelectionRefresh(): number {
		this.selectionRequestId += 1;
		return this.selectionRequestId;
	}

	isCurrentSelectionRefresh(requestId: number): boolean {
		return requestId === this.selectionRequestId;
	}
}
