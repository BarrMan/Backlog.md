import type { ScreenInterface } from "neo-neo-bblessed";
import type { Core } from "../../core/backlog.ts";
import type { Task } from "../../types/index.ts";
import { taskEditorFailureMessage } from "./interactions.ts";

export async function editTaskViewerTask(options: {
	core: Core;
	screen: ScreenInterface;
	task: Task;
	onSaved: (task: Task) => void;
	refresh: () => void;
	showHelp: (message: string) => void;
}): Promise<void> {
	try {
		const result = await options.core.editTaskInTui(options.task.id, options.screen, options.task);
		const failureMessage = taskEditorFailureMessage(result, options.task.id);
		if (failureMessage) return options.showHelp(failureMessage);
		if (result.task) options.onSaved(result.task);
		options.refresh();
		options.showHelp(
			result.changed
				? ` {green-fg}Task ${result.task?.id ?? options.task.id} marked modified.{/}`
				: ` {gray-fg}No changes detected for ${result.task?.id ?? options.task.id}.{/}`,
		);
	} catch (_error) {
		options.showHelp(" {red-fg}Failed to open editor.{/}");
	}
}
