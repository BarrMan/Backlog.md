import { AgentSessionService } from "../../agent-workspace/sessions.ts";
import { TmuxWorkspace } from "../../agent-workspace/tmux-workspace.ts";
import { WorkspaceStateService } from "../../agent-workspace/workspace-state.ts";
import type { Core } from "../../core/backlog.ts";
import type { Task } from "../../types/index.ts";
import { openTaskComposer, type TaskComposerOptions } from "../components/task-composer.ts";
import { buildTaskViewerMilestoneFilterModel } from "../task-viewer/controller.ts";
import { createScreen, formatTuiTitle } from "../tui.ts";
import {
	createRegionScreen,
	mountFooterRegion,
	mountNavigationRegion,
	resolveNativeHost,
	type WorkspaceQuittableHost,
	type WorkspaceScreen,
} from "./native-regions.ts";
import { type WorkspaceHost, WorkspacePane } from "./pane.ts";
import { createWorkspaceViewState, type WorkspaceViewState } from "./state.ts";

export type { WorkspaceHost };

export type AgentWorkspaceOptions = {
	screen?: WorkspaceScreen;
	service?: AgentSessionService;
	workspaceState?: WorkspaceStateService;
	host?: WorkspaceHost;
	state?: WorkspaceViewState;
	taskComposer?: (options: TaskComposerOptions) => Promise<Task | null>;
	region?: "workspace-nav" | "workspace-tasks" | "workspace-details" | "workspace-footer";
};

/**
 * Entry point for `backlog workspace-ui <region>`. Each region runs as its own process, so this
 * only resolves the region, defaults the collaborators, and hands off to {@link WorkspacePane} for
 * the task/details panes (or to the standalone region mounts for nav and footer).
 */
export class AgentWorkspaceController {
	readonly #core: Core;
	readonly #options: AgentWorkspaceOptions;

	constructor(core: Core, options: AgentWorkspaceOptions = {}) {
		this.#core = core;
		this.#options = options;
	}

	async run(): Promise<"exit"> {
		if (!process.stdout.isTTY) {
			console.log("Workspace requires an interactive terminal.");
			return "exit";
		}
		const { region } = this.#options;
		const core = this.#core;
		if (region === "workspace-nav")
			return mountNavigationRegion(
				this.#options.screen ?? createRegionScreen(),
				core,
				resolveNativeHost(core, this.#options.host),
			);
		if (region === "workspace-footer")
			return mountFooterRegion(
				this.#options.screen ?? createRegionScreen(),
				resolveNativeHost(core, this.#options.host),
			);

		const config = await core.filesystem.loadConfig();
		const [milestones, archivedMilestones] = await Promise.all([
			core.filesystem.listMilestones(),
			core.filesystem.listArchivedMilestones(),
		]);
		const service = this.#options.service ?? new AgentSessionService(core);
		const pane = new WorkspacePane({
			core,
			screen: this.#options.screen ?? createScreen({ title: formatTuiTitle("Workspace", config?.projectName) }),
			host: this.#options.host ?? new TmuxWorkspace(core.filesystem.rootDir),
			workspaceState: this.#options.workspaceState ?? new WorkspaceStateService(core, { sessions: service }),
			state: this.#options.state ?? createWorkspaceViewState(),
			initialConfig: config,
			milestoneModel: buildTaskViewerMilestoneFilterModel(milestones, archivedMilestones),
			region,
			taskComposer: this.#options.taskComposer ?? openTaskComposer,
		});
		return pane.run();
	}
}

export type { WorkspaceQuittableHost };
