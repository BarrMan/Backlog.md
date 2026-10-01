import type { ScreenInterface } from "neo-neo-bblessed";
import type { Core } from "../../../core/backlog.ts";
import type { Task } from "../../../types/index.ts";
import { copyToClipboard } from "../../../utils/clipboard.ts";
import { taskContentSignature } from "../../../utils/task-watcher.ts";
import { openConfirmPopup } from "../../components/confirm-popup.ts";
import { keymapKeys } from "../../keymap.ts";
import { createTaskPopup } from "../../shared/task-popup.ts";
import {
	completeTaskFromTui,
	confirmTaskLifecycleAction,
	formatTaskArchivedMessage,
	formatTaskCompletionBlockedMessage,
} from "../../task-lifecycle.ts";

type BoardTaskPopupOptions = {
	screen: ScreenInterface;
	getCore: () => Promise<Core>;
	getTasks: () => Task[];
	updateTasks: (tasks: Task[]) => void;
	removeTask: (taskId: string) => void;
	resolveMilestoneLabel: (milestone: string) => string;
	dateFormat?: string;
	projects: string[];
	runWithModalGuard: <T>(operation: () => Promise<T>) => Promise<T>;
	isModalOpen: () => boolean;
	showFooter: (content: string, duration?: number) => void;
	renderView: () => void;
	restoreColumnFocus: (taskId?: string) => void;
	onClosed: () => void;
};

export class BoardTaskPopup {
	private openPopup: { taskId: string; signature: string; close: () => void; generation: number } | null = null;
	private generation = 0;
	private syncPending = false;

	constructor(private readonly options: BoardTaskPopupOptions) {}

	get isOpen() {
		return this.openPopup !== null;
	}

	close(): void {
		this.generation += 1;
		this.openPopup?.close();
		this.openPopup = null;
		this.options.onClosed();
	}

	async edit(task: Task): Promise<void> {
		try {
			const result = await (await this.options.getCore()).editTaskInTui(task.id, this.options.screen, task);
			if (result.reason === "read_only")
				return this.options.showFooter(
					` {red-fg}Cannot edit task${result.task?.branch ? ` from branch "${result.task.branch}"` : ""}.{/}`,
				);
			if (result.reason === "editor_failed")
				return this.options.showFooter(" {red-fg}Editor exited with an error; task was not modified.{/}");
			if (result.reason === "not_found")
				return this.options.showFooter(` {red-fg}Task ${task.id} not found on this branch.{/}`);
			if (result.reason === "identity_conflict")
				return this.options.showFooter(
					" {red-fg}File identity is inconsistent; make the frontmatter id match the filename, then retry.{/}",
				);
			if (result.reason === "unreadable")
				return this.options.showFooter(" {red-fg}Could not read the saved file; fix its YAML/markdown syntax.{/}");
			if (result.reason === "ambiguous")
				return this.options.showFooter(
					" {red-fg}Numeric draft id is shared by multiple files; rename or fix their ids, then retry.{/}",
				);
			if (result.task) {
				const edited = result.task;
				this.options.updateTasks(
					this.options
						.getTasks()
						.map((existing) =>
							existing.id === task.id || (edited.filePath !== undefined && existing.filePath === edited.filePath)
								? edited
								: existing,
						),
				);
			}
			this.options.renderView();
			this.options.showFooter(
				result.changed
					? ` {green-fg}Task ${result.task?.id ?? task.id} marked modified.{/}`
					: ` {gray-fg}No changes detected for ${result.task?.id ?? task.id}.{/}`,
			);
		} catch {
			this.options.showFooter(" {red-fg}Failed to open editor.{/}");
		}
	}

	private async confirm(task: Task, action: "complete" | "archive"): Promise<boolean> {
		if (task.branch) {
			this.options.showFooter(` {red-fg}Cannot ${action} task from branch "${task.branch}".{/}`);
			return false;
		}
		return this.options.runWithModalGuard(() =>
			confirmTaskLifecycleAction(this.options.screen, task, action, openConfirmPopup),
		);
	}

	async complete(task: Task, afterSuccess?: () => void): Promise<void> {
		if (!(await this.confirm(task, "complete"))) return;
		try {
			const result = await completeTaskFromTui(await this.options.getCore(), task);
			if (result.success) {
				this.options.removeTask(task.id);
				this.options.showFooter(` {green-fg}Moved ${task.id} to completed{/}`);
				afterSuccess?.();
				this.options.renderView();
			} else
				this.options.showFooter(
					result.reason === "not-terminal"
						? ` {red-fg}${formatTaskCompletionBlockedMessage(task.id, result.terminalStatus)}{/}`
						: ` {red-fg}Failed to complete ${task.id}{/}`,
				);
		} catch (error) {
			this.options.showFooter(
				` {red-fg}Error completing task: ${error instanceof Error ? error.message : "Unknown error"}{/}`,
			);
		}
	}

	async archive(task: Task, afterSuccess?: () => void): Promise<void> {
		if (!(await this.confirm(task, "archive"))) return;
		try {
			const core = await this.options.getCore();
			const { success, cleanedTaskIds } = await core.archiveTask(
				task.id,
				(await core.filesystem.loadConfig())?.autoCommit ?? false,
			);
			if (success) {
				this.options.removeTask(task.id);
				this.options.showFooter(` {green-fg}${formatTaskArchivedMessage(task.id, cleanedTaskIds)}{/}`);
				afterSuccess?.();
				this.options.renderView();
			} else this.options.showFooter(` {red-fg}Failed to archive ${task.id}{/}`);
		} catch (error) {
			this.options.showFooter(
				` {red-fg}Error archiving task: ${error instanceof Error ? error.message : "Unknown error"}{/}`,
			);
		}
	}

	async open(task: Task): Promise<void> {
		const popupGeneration = ++this.generation;
		const popup = await createTaskPopup(
			this.options.screen,
			task,
			this.options.resolveMilestoneLabel,
			this.options.dateFormat,
			this.options.projects,
		);
		if (!popup || popupGeneration !== this.generation) return;
		const { contentArea, close: closePopup } = popup;
		this.openPopup = {
			taskId: task.id,
			signature: taskContentSignature(task),
			close: closePopup,
			generation: popupGeneration,
		};
		contentArea.key(keymapKeys("shared", "cancel"), () => {
			this.close();
			this.options.restoreColumnFocus(task.id);
		});
		contentArea.key(keymapKeys("board", "edit"), () => this.edit(task));
		contentArea.key(keymapKeys("board", "copy"), async () =>
			this.options.showFooter(
				(await copyToClipboard(task.id))
					? ` {green-fg}Copied ${task.id} to clipboard{/}`
					: " {red-fg}Failed to copy to clipboard{/}",
			),
		);
		contentArea.key(keymapKeys("board", "complete"), () => this.complete(task, () => this.close()));
		contentArea.key(keymapKeys("board", "archive"), () => this.archive(task, () => this.close()));
		this.options.screen.render();
	}

	async sync(): Promise<void> {
		const current = this.openPopup;
		if (!current) return;
		if (this.options.isModalOpen()) {
			this.syncPending = true;
			return;
		}
		const task = this.options.getTasks().find((candidate) => candidate.id === current.taskId);
		if (!task) {
			this.close();
			this.options.restoreColumnFocus();
			this.options.showFooter(` {yellow-fg}${current.taskId} is no longer on the board; its details closed.{/}`, 6000);
			return;
		}
		if (taskContentSignature(task) === current.signature) return;
		this.close();
		await this.open(task);
		if (this.generation === current.generation + 2) await this.sync();
	}

	onModalClosed(): void {
		if (this.syncPending) {
			this.syncPending = false;
			void this.sync();
		}
	}
}
