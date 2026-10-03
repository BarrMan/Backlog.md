import { TmuxWorkspace } from "../../../agent-workspace/tmux-workspace.ts";
import type { Core } from "../../../core/backlog.ts";
import { createScreen, formatTuiTitle } from "../../tui.ts";
import type { WorkspaceQuittableHost } from "./quit.ts";

export type NativeHost = Pick<TmuxWorkspace, "focusAgent"> &
	Partial<
		Pick<
			TmuxWorkspace,
			| "detach"
			| "focusSearch"
			| "focusTasks"
			| "resizeNavigation"
			| "resizeFooter"
			| "workspaceState"
			| "updateWorkspaceState"
			| "subscribeWorkspaceState"
		>
	> &
	WorkspaceQuittableHost;

export type WorkspaceScreen = ReturnType<typeof createScreen>;

type RegionCleanup = () => void | Promise<void>;

/**
 * Shared scaffolding for the standalone navigation and footer panes. Both wire up widgets in an
 * async setup pass, subscribe to shared workspace state, and resolve "exit" once the screen dies.
 */
export function mountNativeRegion(
	screen: ReturnType<typeof createScreen>,
	setup: (context: {
		screen: ReturnType<typeof createScreen>;
		adopt: (cleanup: RegionCleanup) => void;
	}) => Promise<void>,
	destroyWidgets: () => void,
): Promise<"exit"> {
	return new Promise((resolve) => {
		let closed = false;
		let cleanup: RegionCleanup = () => {};
		screen.on("destroy", () => {
			if (closed) return;
			closed = true;
			void Promise.resolve(cleanup()).catch(() => {});
			destroyWidgets();
			screen.destroy();
			resolve("exit");
		});
		void setup({
			screen,
			adopt: (next) => {
				cleanup = next;
			},
		}).then(
			() => screen.render(),
			// Destroying the screen runs the destroy handler above, which performs cleanup and resolves.
			() => screen.destroy(),
		);
	});
}

export function resolveNativeHost(core: Core, host: NativeHost | undefined): NativeHost {
	return host ?? new TmuxWorkspace(core.filesystem.rootDir);
}

export function createRegionScreen(): WorkspaceScreen {
	return createScreen({ title: formatTuiTitle("Workspace") });
}
