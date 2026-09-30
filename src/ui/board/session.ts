import type { Task } from "../../types/index.ts";
import type { BoardMoveOperation } from "./move-policy.ts";

/** Owns all non-widget board state and move-mode transitions. */
export class BoardSession {
	move: BoardMoveOperation | null = null;
	pendingSettingWrite: Promise<void> | null = null;
	pendingMoveWrite: Promise<void> | null = null;
	pendingTaskCreation: Promise<void> | null = null;
	private movePending = false;

	async runModal<T>(operation: () => Promise<T>, afterClose?: () => void): Promise<T> {
		try {
			return await operation();
		} finally {
			afterClose?.();
		}
	}

	isMovePending(): boolean {
		return this.movePending;
	}

	enterMove(task: Task, status: string, index: number): "entered" | "branched" | "active" {
		if (this.move) return "active";
		if (task.branch) return "branched";
		this.move = {
			taskId: task.id,
			originalStatus: status,
			originalIndex: index,
			targetStatus: status,
			targetIndex: index,
			selectedIds: [],
			highlightTaskId: null,
		};
		return "entered";
	}

	cancelMove(): boolean {
		if (!this.move || this.movePending) return false;
		this.move = null;
		return true;
	}

	finishMove(): void {
		this.move = null;
	}

	beginMoveWrite(): () => void {
		this.movePending = true;
		let settle = () => {};
		this.pendingMoveWrite = new Promise<void>((resolve) => {
			settle = resolve;
		});
		return () => {
			this.movePending = false;
			settle();
		};
	}

	beginSettingWrite(write: Promise<void>): Promise<void> {
		this.pendingSettingWrite = write.finally(() => {
			this.pendingSettingWrite = null;
		});
		return this.pendingSettingWrite;
	}

	trackTaskCreation(creation: Promise<void>): Promise<void> {
		this.pendingTaskCreation = creation.finally(() => {
			this.pendingTaskCreation = null;
		});
		return this.pendingTaskCreation;
	}

	async settleTaskCreation(): Promise<void> {
		await this.pendingTaskCreation;
	}

	async settleWrites(): Promise<void> {
		await this.pendingSettingWrite;
		await this.pendingMoveWrite;
	}
}
