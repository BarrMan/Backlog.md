import { basename, dirname } from "node:path";
import { DraftIdentityError, DraftParseError, type FileSystem, newTaskLockError } from "../file-system/operations.ts";
import { parseTask } from "../markdown/parser.ts";
import type { Task } from "../types/index.ts";
import { isLocalEditableTask } from "../types/index.ts";
import { formatStoredDate } from "../utils/date.ts";
import { openInEditor } from "../utils/editor.ts";
import { isAmbiguousIdError } from "../utils/entity-id.ts";
import {
	extractDraftIdFromFilename,
	findDuplicateDraftFilenameGroups,
	normalizeTaskIdentity,
	taskIdsEqual,
} from "../utils/task-path.ts";
import { upsertTaskUpdatedDate } from "../utils/task-updated-date.ts";
import type { ContentStore } from "./content-store.ts";

export interface TuiTaskEditResult {
	changed: boolean;
	task?: Task;
	reason?: "not_found" | "read_only" | "editor_failed" | "identity_conflict" | "unreadable" | "ambiguous";
}

type TuiTaskEditSession = { task: Task; taskFilePath: string | null; filePath: string };

export interface BlessedScreen {
	program: {
		disableMouse?: () => void;
		enableMouse?: () => void;
		hideCursor?: () => void;
		showCursor?: () => void;
		input?: NodeJS.EventEmitter;
		pause?: () => (() => void) | undefined;
		flush?: () => void;
		put?: { keypad_local?: () => void; keypad_xmit?: () => void };
	};
	leave(): void;
	enter(): void;
	render(): void;
	clearRegion?: (x1: number, x2: number, y1: number, y2: number) => void;
	width?: number;
	height?: number;
	emit?: (event: string) => void;
}

type SessionDependencies = {
	fs: FileSystem;
	getTask: (taskId: string) => Promise<Task | null>;
	getTaskPath: (taskId: string) => Promise<string | null>;
};

function isReadOnly(task: Task): boolean {
	return !isLocalEditableTask(task) || Boolean(task.branch);
}

function failed(
	task: Task | undefined,
	reason: Exclude<NonNullable<TuiTaskEditResult["reason"]>, "editor_failed">,
): TuiTaskEditResult {
	return { changed: false, ...(task && { task }), reason };
}

async function resolveDraftFile(
	fs: FileSystem,
	filePath: string,
	task: Task,
): Promise<TuiTaskEditSession | TuiTaskEditResult> {
	try {
		const reference = await fs.draftReferenceFromPath(filePath);
		const duplicates = findDuplicateDraftFilenameGroups(await fs.listDraftFilenames()).find((group) =>
			group.includes(basename(filePath)),
		);
		return duplicates
			? failed(task, "ambiguous")
			: { task: reference.task, taskFilePath: null, filePath: reference.filePath };
	} catch (error) {
		return failed(task, error instanceof DraftParseError ? "unreadable" : "identity_conflict");
	}
}

async function prepareTuiTaskEditSession(
	taskId: string,
	selectedTask: Task | undefined,
	dependencies: SessionDependencies,
): Promise<TuiTaskEditSession | TuiTaskEditResult> {
	const contextualTask = selectedTask && taskIdsEqual(selectedTask.id, taskId) ? selectedTask : undefined;
	if (contextualTask && isReadOnly(contextualTask)) return failed(contextualTask, "read_only");
	let task = contextualTask ?? (await dependencies.getTask(taskId));
	if (!task) {
		try {
			task = await dependencies.fs.loadDraft(taskId);
		} catch (error) {
			if (isAmbiguousIdError(error)) return failed(undefined, "ambiguous");
			throw error;
		}
	}
	if (!task) return failed(undefined, "not_found");
	if (isReadOnly(task)) return failed(task, "read_only");

	const draftsDir = await dependencies.fs.getDraftsDir();
	if (task.filePath && dirname(task.filePath) === draftsDir) {
		return await resolveDraftFile(dependencies.fs, task.filePath, task);
	}
	const localTask = (await dependencies.fs.loadTask(task.id)) ?? task;
	const taskFilePath = await dependencies.getTaskPath(localTask.id);
	if (taskFilePath) return { task: localTask, taskFilePath, filePath: taskFilePath };
	if (localTask.filePath && dirname(localTask.filePath) === draftsDir) {
		return await resolveDraftFile(dependencies.fs, localTask.filePath, localTask);
	}
	const reference = await dependencies.fs.resolveDraftReference(localTask.id);
	return reference
		? { task: reference.task, taskFilePath: null, filePath: reference.filePath }
		: failed(localTask, "not_found");
}

type EditorTransactionDependencies = SessionDependencies & {
	getContentStore: () => ContentStore | undefined;
};

async function openTuiEditor(filePath: string, screen: BlessedScreen | undefined, fs: FileSystem): Promise<boolean> {
	const config = await fs.loadConfig();
	if (!screen) return await openInEditor(filePath, config);
	const program = screen.program;
	screen.leave();
	if (typeof program.put?.keypad_local === "function") {
		program.put.keypad_local();
		program.flush?.();
	}
	const nodeFs = await import("node:fs");
	nodeFs.writeSync(1, "\u001b[0m\u001b[?25h\u001b[?1l\u001b>");
	const resume = program.pause?.();
	try {
		return await openInEditor(filePath, config);
	} finally {
		resume?.();
		screen.enter();
		if (typeof program.put?.keypad_xmit === "function") {
			program.put.keypad_xmit();
			program.flush?.();
		}
		screen.render();
	}
}

async function reloadEditedTask(path: string): Promise<{ task: Task } | { failure: "unreadable" }> {
	try {
		return { task: { ...normalizeTaskIdentity(parseTask(await Bun.file(path).text())), filePath: path } };
	} catch {
		return { failure: "unreadable" };
	}
}

/** Owns the TUI editor's prepare/open/validate/publish transaction. */
export async function editTaskInTuiSession(
	taskId: string,
	screen: BlessedScreen,
	selectedTask: Task | undefined,
	dependencies: EditorTransactionDependencies,
): Promise<TuiTaskEditResult> {
	const session = await prepareTuiTaskEditSession(taskId, selectedTask, dependencies);
	if ("changed" in session) return session;
	const { task: editableTask, taskFilePath, filePath } = session;
	let beforeContent: string;
	try {
		beforeContent = await Bun.file(filePath).text();
	} catch {
		return { changed: false, task: editableTask, reason: "not_found" };
	}
	if (!(await openTuiEditor(filePath, screen, dependencies.fs))) {
		return { changed: false, task: editableTask, reason: "editor_failed" };
	}
	let afterContent: string;
	try {
		afterContent = await Bun.file(filePath).text();
	} catch {
		return { changed: false, task: editableTask, reason: "not_found" };
	}
	if (afterContent === beforeContent) {
		if (!taskFilePath) {
			try {
				return { changed: false, task: (await dependencies.fs.draftReferenceFromPath(filePath)).task };
			} catch (error) {
				return {
					changed: false,
					task: editableTask,
					reason: error instanceof DraftParseError ? "unreadable" : "identity_conflict",
				};
			}
		}
		const outcome = await reloadEditedTask(taskFilePath);
		return "failure" in outcome
			? { changed: false, task: editableTask, reason: outcome.failure }
			: { changed: false, task: outcome.task };
	}
	const now = formatStoredDate();
	if (!taskFilePath) {
		const canonicalId = extractDraftIdFromFilename(basename(filePath)) ?? "";
		try {
			return await dependencies.fs.withDraftLock({ filePath, canonicalId }, async () => {
				if ((await Bun.file(filePath).text()) !== afterContent) throw newTaskLockError(canonicalId);
				await Bun.write(filePath, upsertTaskUpdatedDate(afterContent, now));
				return { changed: true, task: (await dependencies.fs.draftReferenceFromPath(filePath)).task };
			});
		} catch (error) {
			if (error instanceof DraftParseError) return { changed: false, task: editableTask, reason: "unreadable" };
			if (error instanceof DraftIdentityError)
				return { changed: false, task: editableTask, reason: "identity_conflict" };
			throw error;
		}
	}
	await Bun.write(filePath, upsertTaskUpdatedDate(afterContent, now));
	const outcome = await reloadEditedTask(taskFilePath);
	if ("failure" in outcome) return { changed: false, task: editableTask, reason: outcome.failure };
	dependencies.getContentStore()?.upsertTask(outcome.task);
	return { changed: true, task: outcome.task };
}
