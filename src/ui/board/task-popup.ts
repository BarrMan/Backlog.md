import type { ScreenInterface } from "neo-neo-bblessed";
import type { Core } from "../../core/backlog.ts";
import type { Task } from "../../types/index.ts";
import { copyToClipboard } from "../../utils/clipboard.ts";
import { taskContentSignature } from "../../utils/task-watcher.ts";
import { openConfirmPopup } from "../components/confirm-popup.ts";
import { keymapKeys } from "../keymap.ts";
import { createTaskPopup } from "../shared/task-popup.ts";
import {
	completeTaskFromTui,
	confirmTaskLifecycleAction,
	formatTaskArchivedMessage,
	formatTaskCompletionBlockedMessage,
} from "../task-lifecycle.ts";

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

export function createBoardTaskPopup(options: BoardTaskPopupOptions) {
	let openPopup: { taskId: string; signature: string; close: () => void; generation: number } | null = null;
	let generation = 0;
	let syncPending = false;
	const close = () => {
		generation += 1;
		openPopup?.close();
		openPopup = null;
		options.onClosed();
	};
	const edit = async (task: Task) => {
		try {
			const result = await (await options.getCore()).editTaskInTui(task.id, options.screen, task);
			if (result.reason === "read_only")
				return options.showFooter(
					` {red-fg}Cannot edit task${result.task?.branch ? ` from branch "${result.task.branch}"` : ""}.{/}`,
				);
			if (result.reason === "editor_failed")
				return options.showFooter(" {red-fg}Editor exited with an error; task was not modified.{/}");
			if (result.reason === "not_found")
				return options.showFooter(` {red-fg}Task ${task.id} not found on this branch.{/}`);
			if (result.reason === "identity_conflict")
				return options.showFooter(
					" {red-fg}File identity is inconsistent; make the frontmatter id match the filename, then retry.{/}",
				);
			if (result.reason === "unreadable")
				return options.showFooter(" {red-fg}Could not read the saved file; fix its YAML/markdown syntax.{/}");
			if (result.reason === "ambiguous")
				return options.showFooter(
					" {red-fg}Numeric draft id is shared by multiple files; rename or fix their ids, then retry.{/}",
				);
			if (result.task) {
				const edited = result.task;
				options.updateTasks(
					options
						.getTasks()
						.map((existing) =>
							existing.id === task.id || (edited.filePath !== undefined && existing.filePath === edited.filePath)
								? edited
								: existing,
						),
				);
			}
			options.renderView();
			options.showFooter(
				result.changed
					? ` {green-fg}Task ${result.task?.id ?? task.id} marked modified.{/}`
					: ` {gray-fg}No changes detected for ${result.task?.id ?? task.id}.{/}`,
			);
		} catch {
			options.showFooter(" {red-fg}Failed to open editor.{/}");
		}
	};
	const confirm = async (task: Task, action: "complete" | "archive") => {
		if (task.branch) {
			options.showFooter(` {red-fg}Cannot ${action} task from branch "${task.branch}".{/}`);
			return false;
		}
		return options.runWithModalGuard(() => confirmTaskLifecycleAction(options.screen, task, action, openConfirmPopup));
	};
	const complete = async (task: Task, afterSuccess?: () => void) => {
		if (!(await confirm(task, "complete"))) return;
		try {
			const result = await completeTaskFromTui(await options.getCore(), task);
			if (result.success) {
				options.removeTask(task.id);
				options.showFooter(` {green-fg}Moved ${task.id} to completed{/}`);
				afterSuccess?.();
				options.renderView();
			} else
				options.showFooter(
					result.reason === "not-terminal"
						? ` {red-fg}${formatTaskCompletionBlockedMessage(task.id, result.terminalStatus)}{/}`
						: ` {red-fg}Failed to complete ${task.id}{/}`,
				);
		} catch (error) {
			options.showFooter(
				` {red-fg}Error completing task: ${error instanceof Error ? error.message : "Unknown error"}{/}`,
			);
		}
	};
	const archive = async (task: Task, afterSuccess?: () => void) => {
		if (!(await confirm(task, "archive"))) return;
		try {
			const core = await options.getCore();
			const { success, cleanedTaskIds } = await core.archiveTask(
				task.id,
				(await core.fs.loadConfig())?.autoCommit ?? false,
			);
			if (success) {
				options.removeTask(task.id);
				options.showFooter(` {green-fg}${formatTaskArchivedMessage(task.id, cleanedTaskIds)}{/}`);
				afterSuccess?.();
				options.renderView();
			} else options.showFooter(` {red-fg}Failed to archive ${task.id}{/}`);
		} catch (error) {
			options.showFooter(
				` {red-fg}Error archiving task: ${error instanceof Error ? error.message : "Unknown error"}{/}`,
			);
		}
	};
	const open = async (task: Task): Promise<void> => {
		const popupGeneration = ++generation;
		const popup = await createTaskPopup(
			options.screen,
			task,
			options.resolveMilestoneLabel,
			options.dateFormat,
			options.projects,
		);
		if (!popup || popupGeneration !== generation) return;
		const { contentArea, close: closePopup } = popup;
		openPopup = {
			taskId: task.id,
			signature: taskContentSignature(task),
			close: closePopup,
			generation: popupGeneration,
		};
		contentArea.key(keymapKeys("shared", "cancel"), () => {
			close();
			options.restoreColumnFocus(task.id);
		});
		contentArea.key(keymapKeys("board", "edit"), () => edit(task));
		contentArea.key(keymapKeys("board", "copy"), async () =>
			options.showFooter(
				(await copyToClipboard(task.id))
					? ` {green-fg}Copied ${task.id} to clipboard{/}`
					: " {red-fg}Failed to copy to clipboard{/}",
			),
		);
		contentArea.key(keymapKeys("board", "complete"), () => complete(task, close));
		contentArea.key(keymapKeys("board", "archive"), () => archive(task, close));
		options.screen.render();
	};
	const sync = async (): Promise<void> => {
		const current = openPopup;
		if (!current) return;
		if (options.isModalOpen()) {
			syncPending = true;
			return;
		}
		const task = options.getTasks().find((candidate) => candidate.id === current.taskId);
		if (!task) {
			close();
			options.restoreColumnFocus();
			options.showFooter(` {yellow-fg}${current.taskId} is no longer on the board; its details closed.{/}`, 6000);
			return;
		}
		if (taskContentSignature(task) === current.signature) return;
		close();
		await open(task);
		if (generation === current.generation + 2) await sync();
	};
	return {
		get isOpen() {
			return openPopup !== null;
		},
		close,
		edit,
		complete,
		archive,
		open,
		sync,
		onModalClosed: () => {
			if (syncPending) {
				syncPending = false;
				void sync();
			}
		},
	};
}
