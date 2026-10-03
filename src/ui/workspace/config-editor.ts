import { list, textarea } from "neo-neo-bblessed";
import { getEditableAgentConfiguration, updateAgentConfiguration } from "../../agent-workspace/config.ts";
import type { AgentConfigScope, AgentConfiguration, AgentPreset } from "../../agent-workspace/types.ts";
import type { Core } from "../../core/backlog.ts";
import type { Task } from "../../types/index.ts";
import { parsePresetEnvironment, updatePresetConfiguration } from "../agent-workspace-config-editor.ts";
import { keymapKeys } from "../keymap.ts";
import type { WorkspaceScreen } from "./native-regions.ts";

type EditableWidget = ReturnType<typeof textarea> & {
	readInput?(): void;
};

const SCOPES: AgentConfigScope[] = ["root", "project", "card"];

export type AgentConfigEditorOptions = {
	screen: WorkspaceScreen;
	core: Core;
	task: Task;
	/** Runs a fallible action and surfaces its error through the workspace notifier. */
	run: (action: () => Promise<void>) => void;
	/** Restores the workspace to navigation mode. */
	onClose: () => void;
	/** Reports a completed save to the user. */
	onSaved: (scope: AgentConfigScope) => void;
};

/**
 * Agent configuration editor overlay: scope/preset pickers plus command, environment, prepare,
 * worktree, and bootstrap fields. Returns a disposer so the workspace can tear it down on exit.
 */
export function openAgentConfigEditor(options: AgentConfigEditorOptions): () => void {
	const { screen, core, task, run, onClose, onSaved } = options;
	let scope: AgentConfigScope = "card";
	let selectedPreset = "";
	let editable: AgentConfiguration | undefined;
	let worktree = false;
	let bootstrap: AgentPreset["bootstrap"] = "prompt";

	const scopeList = list({
		parent: screen,
		top: "8%",
		left: 0,
		width: "35%",
		height: 6,
		border: "line",
		label: " Scope ",
		keys: true,
		items: SCOPES,
	});
	const presetList = list({
		parent: screen,
		top: "8%",
		left: "35%",
		width: "65%",
		height: 6,
		border: "line",
		label: " Preset ",
		keys: true,
	});
	const command = textarea({
		parent: screen,
		top: "25%",
		left: 0,
		width: "100%",
		height: 4,
		border: "line",
		label: " Command ",
		keys: true,
		inputOnFocus: false,
	});
	const environment = textarea({
		parent: screen,
		top: "40%",
		left: 0,
		width: "100%",
		height: 6,
		border: "line",
		label: " Environment (KEY=value) ",
		keys: true,
		inputOnFocus: false,
	});
	const prepare = textarea({
		parent: screen,
		top: "62%",
		left: 0,
		width: "100%",
		height: 5,
		border: "line",
		label: " Prepare ",
		keys: true,
		inputOnFocus: false,
	});
	const widgets = [scopeList, presetList, command, environment, prepare];
	let focus = 0;

	const focusWidget = (index: number) => {
		focus = (index + widgets.length) % widgets.length;
		const widget = widgets[focus];
		widget?.focus();
		if ([command, environment, prepare].includes(widget as typeof command)) (widget as EditableWidget).readInput?.();
	};
	const close = () => {
		screen.unkey(keymapKeys("shared", "tab"), tab);
		screen.unkey(keymapKeys("workspace", "save"), save);
		for (const widget of widgets) widget.destroy();
		onClose();
	};
	const load = async () => {
		editable = await getEditableAgentConfiguration(core, scope, scope === "card" ? task.id : undefined);
		selectedPreset = editable.selectedPreset;
		const preset = editable.presets[selectedPreset];
		if (!preset) return;
		scopeList.select(SCOPES.indexOf(scope));
		presetList.setItems(Object.keys(editable.presets));
		presetList.select(Object.keys(editable.presets).indexOf(selectedPreset));
		command.setValue(preset.command);
		environment.setValue(
			Object.entries(preset.env)
				.map(([key, value]) => `${key}=${value}`)
				.join("\n"),
		);
		prepare.setValue(preset.prepare);
		worktree = preset.worktree;
		bootstrap = preset.bootstrap;
		screen.render();
	};
	const save = () => {
		if (!editable) return false;
		run(async () => {
			const env = parsePresetEnvironment(environment.getValue());
			await updateAgentConfiguration(
				core,
				scope,
				(value) =>
					updatePresetConfiguration(value, selectedPreset, {
						command: command.getValue(),
						environment: env,
						prepare: prepare.getValue(),
						worktree,
						bootstrap,
					}),
				scope === "card" ? task.id : undefined,
			);
			close();
			onSaved(scope);
		});
		return false;
	};
	const tab = () => {
		focusWidget(focus + 1);
		return false;
	};

	run(load);
	focusWidget(0);
	screen.key(keymapKeys("shared", "tab"), tab);
	screen.key(keymapKeys("workspace", "save"), save);
	scopeList.key(keymapKeys("workspace", "open"), () => {
		scope = SCOPES[(scopeList as unknown as { selected: number }).selected] ?? scope;
		run(load);
		return false;
	});
	presetList.key(keymapKeys("workspace", "open"), () => {
		if (editable) {
			selectedPreset =
				Object.keys(editable.presets)[(presetList as unknown as { selected: number }).selected] ?? selectedPreset;
			run(load);
		}
		return false;
	});
	for (const widget of widgets) {
		widget.key(keymapKeys("workspace", "close"), () => {
			close();
			return false;
		});
	}
	return close;
}
