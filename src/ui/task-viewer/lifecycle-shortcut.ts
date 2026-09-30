import type { ScreenInterface } from "neo-neo-bblessed";
import type { Core } from "../../core/backlog.ts";
import type { Task } from "../../types/index.ts";
import { confirmTaskLifecycleAction } from "../task-lifecycle.ts";
import { runTaskLifecycleAction } from "./lifecycle.ts";

export async function runTaskViewerLifecycleShortcut(options: {
	core: Core;
	screen: ScreenInterface;
	task: Task;
	action: "complete" | "archive";
	confirm: Parameters<typeof confirmTaskLifecycleAction>[3];
	runModal: <T>(operation: () => Promise<T>) => Promise<T>;
	onCompleted: (task: Task, action: "complete" | "archive") => void;
	showHelp: (message: string) => void;
}): Promise<void> {
	const confirmed = await options.runModal(() =>
		confirmTaskLifecycleAction(options.screen, options.task, options.action, options.confirm),
	);
	if (!confirmed) return;
	const outcome = await runTaskLifecycleAction(options.core, options.task, options.action);
	if (outcome.kind === "completed") options.onCompleted(options.task, options.action);
	options.showHelp(` {${outcome.kind === "completed" ? "green" : "red"}-fg}${outcome.message}{/}`);
}
