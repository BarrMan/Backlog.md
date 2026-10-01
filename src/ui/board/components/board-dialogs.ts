import type { ScreenInterface } from "neo-neo-bblessed";
import type { Task } from "../../../types/index.ts";
import { openHelpPopup } from "../../components/help-popup.ts";
import type { TaskComposerOptions } from "../../components/task-composer.ts";
import type { Board } from "../models/board.ts";
import { getCreatedTaskBoardOutcome } from "../policies/creation-outcome.ts";
import type { Footer } from "./footer.ts";

type BoardDialogsOptions = {
	screen: ScreenInterface;
	board: Board;
	footer: Footer;
	composer: (options: TaskComposerOptions) => Promise<Task | null>;
	composerOptions: Omit<TaskComposerOptions, "screen" | "persist"> & { persist: TaskComposerOptions["persist"] };
	hasProjects: boolean;
	onRender: () => void;
	onRestoreFocus: (taskId?: string) => void;
};

/** Owns board help and task-creation modal lifetimes. */
export class BoardDialogs {
	private readonly pending = new Set<Promise<unknown>>();
	private readonly closed = new Set<() => void>();
	private creationOpen = false;
	private pendingUpdate = false;

	constructor(private readonly options: BoardDialogsOptions) {}

	get isOpen(): boolean {
		return this.pending.size > 0;
	}

	get defersUpdates(): boolean {
		return this.creationOpen;
	}

	onClosed(listener: () => void): () => void {
		this.closed.add(listener);
		return () => this.closed.delete(listener);
	}

	noteUpdate(): void {
		if (this.creationOpen) this.pendingUpdate = true;
	}

	async run<T>(operation: () => Promise<T>): Promise<T> {
		const work = operation();
		this.pending.add(work);
		try {
			return await work;
		} finally {
			this.pending.delete(work);
			for (const listener of this.closed) listener();
		}
	}

	async openHelp(): Promise<void> {
		await this.run(() => openHelpPopup(this.options.screen, "board", { hasProjects: this.options.hasProjects }));
	}

	async openComposer(): Promise<void> {
		this.creationOpen = true;
		let task: Task | null = null;
		try {
			task = await this.run(() =>
				this.options.composer({ screen: this.options.screen, ...this.options.composerOptions }),
			);
		} catch (error) {
			this.options.footer.showTransient(
				` {red-fg}Error opening task composer: ${error instanceof Error ? error.message : "Unknown error"}{/}`,
				3000,
				false,
			);
		} finally {
			this.creationOpen = false;
		}
		const pendingUpdate = this.pendingUpdate;
		this.pendingUpdate = false;
		if (!task) {
			if (pendingUpdate) this.options.onRender();
			else this.options.onRestoreFocus();
			return;
		}
		const visible =
			task.status.trim().toLowerCase() !== "draft" &&
			this.options.board.filter.apply(this.options.board.tasksSnapshot).some((candidate) => candidate.id === task.id);
		const outcome = getCreatedTaskBoardOutcome(task, visible);
		this.options.footer.showTransient(` {${outcome.tone}-fg}${outcome.message}{/}`, 6000, false);
		this.options.onRender();
		this.options.onRestoreFocus(outcome.focusTaskId);
	}

	async settle(): Promise<void> {
		while (this.pending.size > 0) await Promise.all([...this.pending]);
	}
}
