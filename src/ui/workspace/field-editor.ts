import { textarea } from "neo-neo-bblessed";
import type { Core } from "../../core/backlog.ts";
import type { Task, TaskUpdateInput } from "../../types/index.ts";
import { formatKeymap, keymapKeys } from "../keymap.ts";
import {
	changedTaskFields,
	createWorkspaceDraft,
	type DraftField,
	parseAcceptanceCriteria,
	type WorkspaceDraft,
} from "./model.ts";

type Screen = ReturnType<typeof import("../tui.ts").createScreen>;

type EditableWidget = ReturnType<typeof textarea> & {
	cancel?(): void;
	readInput?(): void;
	cpos?: { x: number; y: number };
};

export type FieldEditorContext = {
	screen: Screen;
	core: Core;
	drafts: Map<string, WorkspaceDraft>;
	/** The task whose fields are being edited, or undefined when nothing is selected. */
	selectedTask(): Task | undefined;
	/** Puts the pane into field-editing mode. */
	enterFieldMode(): void;
	/** Returns the pane to the details view after the editor closes. */
	exitFieldMode(): void;
	/** Top edge and height of the details pane, so the editor overlays it exactly. */
	editorBounds(): { top: number; height: number };
	fieldLabel(field: DraftField): string;
	run(action: () => Promise<void>): void;
	notify(message: string): void;
	reload(selectCurrent?: boolean): Promise<void>;
	render(): void;
};

/**
 * Owns the in-place text editor for a single draft field: commits the edited value back into the
 * task draft on close, and persists it to the task on save. The controller no longer has to hold
 * the editor widget or its bookkeeping.
 */
export type WorkspaceFieldEditor = {
	openField(field: DraftField): void;
	closeField(): void;
	isOpen(): boolean;
};

export function createWorkspaceFieldEditor(context: FieldEditorContext): WorkspaceFieldEditor {
	let open: { field: DraftField; widget: EditableWidget } | undefined;

	const closeField = () => {
		if (!open) return;
		const task = context.selectedTask();
		if (!task) return;
		const draft = context.drafts.get(task.id) ?? createWorkspaceDraft(task);
		draft.values[open.field] = open.widget.getValue();
		draft.cursor[open.field] = {
			x: open.widget.cpos?.x ?? 0,
			y: open.widget.cpos?.y ?? 0,
		};
		context.drafts.set(task.id, draft);
		open.widget.cancel?.();
		open.widget.destroy();
		open = undefined;
		context.exitFieldMode();
	};

	const openField = (field: DraftField) => {
		const task = context.selectedTask();
		if (!task) return;
		const draft = context.drafts.get(task.id) ?? createWorkspaceDraft(task);
		context.drafts.set(task.id, draft);
		context.enterFieldMode();
		const { top, height } = context.editorBounds();
		const widget = textarea({
			parent: context.screen,
			left: 0,
			width: "100%",
			top,
			height,
			border: "line",
			label: ` ${context.fieldLabel(field)} · ${formatKeymap("workspace", "save")} save `,
			keys: true,
			mouse: true,
			inputOnFocus: false,
			scrollable: true,
			value: draft.values[field],
		}) as EditableWidget;
		open = { field, widget };
		const cursor = draft.cursor[field];
		if (cursor) widget.cpos = cursor;
		widget.focus();
		widget.readInput?.();

		widget.key(keymapKeys("workspace", "save"), () => {
			closeField();
			context.run(async () => {
				const current = await context.core.getTask(task.id);
				if (!current) throw new Error("Task no longer exists.");
				const changes = changedTaskFields(draft, current);
				const { acceptanceCriteria, ...text } = changes;
				const input: TaskUpdateInput = text;
				if (acceptanceCriteria !== undefined) input.acceptanceCriteria = parseAcceptanceCriteria(acceptanceCriteria);
				if (Object.keys(input).length) await context.core.updateTaskFromInput(task.id, input);
				context.drafts.set(task.id, createWorkspaceDraft((await context.core.getTask(task.id)) ?? current));
				await context.reload(false);
				context.notify("Saved changed fields.");
			});
			return false;
		});
		widget.key(keymapKeys("workspace", "close"), () => {
			closeField();
			return false;
		});
		context.render();
	};

	return { openField, closeField, isOpen: () => open !== undefined };
}
