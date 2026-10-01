import { box, list, textarea } from "neo-neo-bblessed";
import { getEditableAgentConfiguration, updateAgentConfiguration } from "../agent-workspace/config.ts";
import type { AgentConfigScope, AgentConfiguration, AgentPreset } from "../agent-workspace/types.ts";
import type { Core } from "../core/backlog.ts";
import type { Task } from "../types/index.ts";
import { parsePresetEnvironment, updatePresetConfiguration } from "./agent-workspace-config-editor.ts";
import { keymapKeys } from "./keymap.ts";

type Screen = ReturnType<typeof import("./tui.ts").createScreen>;
type Widget = ReturnType<typeof box>;
type Editable = ReturnType<typeof textarea> & { cancel?(): void; readInput?(): void };

const SCOPES: AgentConfigScope[] = ["root", "project", "card"];
const BOOTSTRAPS: AgentPreset["bootstrap"][] = ["opencode", "claude", "codex", "gemini", "antigravity", "prompt"];

/** Owns the short-lived scoped agent-preset editor and all of its input handlers. */
export class WorkspaceConfigDialog {
	readonly #core: Core;
	readonly #screen: Screen;
	readonly #task: Task;
	readonly #onClose: () => void;
	readonly #onSaved: (scope: AgentConfigScope) => void;
	readonly #onError: (error: unknown) => void;
	#scope: AgentConfigScope = "card";
	#selectedPreset = "";
	#editable: AgentConfiguration | undefined;
	#worktree = false;
	#bootstrap: AgentPreset["bootstrap"] = "prompt";
	#focusedWidget = 0;
	#scopeList!: ReturnType<typeof list>;
	#presetList!: ReturnType<typeof list>;
	#command!: Editable;
	#environment!: Editable;
	#prepare!: Editable;
	#bootstrapList!: ReturnType<typeof list>;
	#worktreeBox!: Widget;
	#widgets: Widget[] = [];

	constructor(options: {
		core: Core;
		screen: Screen;
		task: Task;
		onClose: () => void;
		onSaved: (scope: AgentConfigScope) => void;
		onError: (error: unknown) => void;
	}) {
		this.#core = options.core;
		this.#screen = options.screen;
		this.#task = options.task;
		this.#onClose = options.onClose;
		this.#onSaved = options.onSaved;
		this.#onError = options.onError;
	}

	open(): void {
		this.#createWidgets();
		this.#bindKeys();
		this.#focusWidget(0);
		void this.#load().catch(this.#onError);
	}

	dispose(): void {
		this.#screen.unkey(keymapKeys("shared", "tab"), this.#tab);
		this.#screen.unkey(keymapKeys("workspace", "save"), this.#save);
		for (const widget of this.#widgets) widget.destroy();
		this.#widgets = [];
	}

	#createWidgets(): void {
		this.#scopeList = list({
			parent: this.#screen,
			top: "8%",
			left: "28%",
			width: "20%",
			height: 6,
			border: "line",
			label: " Scope ",
			keys: true,
			mouse: true,
			items: SCOPES,
		});
		this.#presetList = list({
			parent: this.#screen,
			top: "8%",
			left: "48%",
			width: "24%",
			height: 6,
			border: "line",
			label: " Preset ",
			keys: true,
			mouse: true,
		});
		this.#command = textarea({
			parent: this.#screen,
			top: "25%",
			left: "28%",
			width: "44%",
			height: 4,
			border: "line",
			label: " Command ",
			keys: true,
			inputOnFocus: false,
		}) as Editable;
		this.#environment = textarea({
			parent: this.#screen,
			top: "38%",
			left: "28%",
			width: "44%",
			height: 6,
			border: "line",
			label: " Environment (KEY=value) ",
			keys: true,
			inputOnFocus: false,
		}) as Editable;
		this.#prepare = textarea({
			parent: this.#screen,
			top: "57%",
			left: "28%",
			width: "44%",
			height: 6,
			border: "line",
			label: " Prepare ",
			keys: true,
			inputOnFocus: false,
		}) as Editable;
		this.#bootstrapList = list({
			parent: this.#screen,
			top: "77%",
			left: "28%",
			width: "22%",
			height: 4,
			border: "line",
			label: " Bootstrap ",
			keys: true,
			mouse: true,
			items: BOOTSTRAPS,
		});
		this.#worktreeBox = box({
			parent: this.#screen,
			top: "77%",
			left: "50%",
			width: "22%",
			height: 3,
			border: "line",
			label: " Worktree ",
			mouse: true,
		});
		this.#widgets = [
			this.#scopeList,
			this.#presetList,
			this.#command,
			this.#environment,
			this.#prepare,
			this.#bootstrapList,
			this.#worktreeBox,
		];
	}

	#bindKeys(): void {
		this.#screen.key(keymapKeys("shared", "tab"), this.#tab);
		this.#screen.key(keymapKeys("workspace", "save"), this.#save);
		this.#scopeList.key(keymapKeys("workspace", "open"), this.#changeScope);
		this.#presetList.key(keymapKeys("workspace", "open"), this.#choosePreset);
		this.#worktreeBox.key(keymapKeys("workspace", "toggleWorktree"), this.#toggleWorktree);
		this.#bootstrapList.key(keymapKeys("workspace", "open"), this.#chooseBootstrap);
		this.#worktreeBox.on("click", this.#toggleWorktree);
		for (const widget of this.#widgets) {
			widget.key(keymapKeys("workspace", "save"), this.#save);
			widget.key(keymapKeys("workspace", "close"), this.#close);
		}
	}

	#focusWidget(index: number): void {
		this.#focusedWidget = (index + this.#widgets.length) % this.#widgets.length;
		for (const widget of [this.#command, this.#environment, this.#prepare]) widget.cancel?.();
		const widget = this.#widgets[this.#focusedWidget];
		widget?.focus();
		if (widget === this.#command) this.#command.readInput?.();
		if (widget === this.#environment) this.#environment.readInput?.();
		if (widget === this.#prepare) this.#prepare.readInput?.();
	}

	#load = async (): Promise<void> => {
		this.#editable = await getEditableAgentConfiguration(
			this.#core,
			this.#scope,
			this.#scope === "card" ? this.#task.id : undefined,
		);
		this.#selectedPreset = this.#editable.selectedPreset;
		this.#scopeList.select(SCOPES.indexOf(this.#scope));
		this.#presetList.setItems([...Object.keys(this.#editable.presets), "+ New preset"]);
		this.#presetList.select(Object.keys(this.#editable.presets).indexOf(this.#selectedPreset));
		this.#setPreset();
		this.#screen.render();
	};

	#setPreset(): void {
		const preset = this.#editable?.presets[this.#selectedPreset];
		if (!preset) return;
		this.#command.setValue(preset.command);
		this.#environment.setValue(
			Object.entries(preset.env)
				.map(([key, value]) => `${key}=${value}`)
				.join("\n"),
		);
		this.#prepare.setValue(preset.prepare);
		this.#worktree = preset.worktree;
		this.#bootstrap = preset.bootstrap;
		this.#bootstrapList.select(BOOTSTRAPS.indexOf(this.#bootstrap));
		this.#showWorktree();
	}

	#showWorktree(): void {
		this.#worktreeBox.setContent(` ${this.#worktree ? "[x]" : "[ ]"} Use a task worktree `);
	}
	#tab = (): false => {
		this.#focusWidget(this.#focusedWidget + 1);
		return false;
	};
	#changeScope = (): false => {
		const scope = SCOPES[this.#scopeList.selected ?? 0];
		if (scope && scope !== this.#scope) {
			this.#scope = scope;
			void this.#load().catch(this.#onError);
		}
		return false;
	};
	#choosePreset = (): false => {
		const name = [...Object.keys(this.#editable?.presets ?? {}), "+ New preset"][this.#presetList.selected ?? 0];
		if (name && name !== "+ New preset") {
			this.#selectedPreset = name;
			this.#setPreset();
		}
		return false;
	};
	#toggleWorktree = (): false => {
		this.#worktree = !this.#worktree;
		this.#showWorktree();
		this.#screen.render();
		return false;
	};
	#chooseBootstrap = (): false => {
		const value = BOOTSTRAPS[this.#bootstrapList.selected ?? 0];
		if (value) this.#bootstrap = value;
		return false;
	};
	#close = (): false => {
		this.dispose();
		this.#onClose();
		return false;
	};
	#save = (): false => {
		void this.#persist().catch(this.#onError);
		return false;
	};

	#persist = async (): Promise<void> => {
		const command = this.#command.getValue();
		if (!command.trim()) throw new Error("Command is required.");
		await updateAgentConfiguration(
			this.#core,
			this.#scope,
			(configuration) =>
				updatePresetConfiguration(configuration, this.#selectedPreset, {
					command,
					environment: parsePresetEnvironment(this.#environment.getValue()),
					prepare: this.#prepare.getValue(),
					worktree: this.#worktree,
					bootstrap: this.#bootstrap,
				}),
			this.#scope === "card" ? this.#task.id : undefined,
		);
		this.dispose();
		this.#onSaved(this.#scope);
	};
}
