import { TmuxWorkspace } from "../../agent-workspace/tmux-workspace.ts";
import type { Core } from "../../core/backlog.ts";
import { collectAvailableLabels } from "../../utils/label-filter.ts";
import { getPriorityOptions } from "../../utils/priority-config.ts";
import { getProjectValues } from "../../utils/project-config.ts";
import { getTaskTypeValues } from "../../utils/task-type-config.ts";
import { createFilterHeader, type FilterHeader } from "../components/filter-header.ts";
import { FooterSearch } from "../components/footer-search.ts";
import { keymapKeys } from "../keymap.ts";
import { openTaskFilterPicker, taskFilterHeaderControls } from "../task-filter-wiring.ts";
import { buildTaskViewerMilestoneFilterModel } from "../task-viewer/controller.ts";
import { createScreen, formatTuiTitle } from "../tui.ts";
import { createLatestWorkspaceSearchPublisher, getWorkspaceFooterContent } from "./footer.ts";
import { createWorkspaceFilters, type SharedWorkspaceState, withWorkspaceSearch } from "./state.ts";

/**
 * Quitting is a teardown, not a client detach: `quitWorkspace` removes the tmux workspace session so
 * no orphan agent panes survive, and `detach` stays as the fallback for hosts that only offer it.
 */
export type WorkspaceQuittableHost = {
	detach?: () => Promise<void>;
	quitWorkspace?: () => Promise<void>;
};

export async function quitWorkspaceHost(host: WorkspaceQuittableHost): Promise<void> {
	if (host.quitWorkspace) {
		await host.quitWorkspace();
		return;
	}
	await host.detach?.();
}

type NativeHost = Pick<TmuxWorkspace, "focusAgent"> &
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

const DEFAULT_STATUSES = ["To Do", "In Progress", "Done"];

export type WorkspaceScreen = ReturnType<typeof createScreen>;

type RegionCleanup = () => void | Promise<void>;

/**
 * Shared scaffolding for the standalone navigation and footer panes. Both wire up widgets in an
 * async setup pass, subscribe to shared workspace state, and resolve "exit" once the screen dies.
 */
function mountNativeRegion(
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

export function mountNavigationRegion(screen: WorkspaceScreen, core: Core, host: NativeHost): Promise<"exit"> {
	let header: FilterHeader | undefined;
	return mountNativeRegion(
		screen,
		async ({ screen, adopt }) => {
			const [config, tasks, milestones, archived] = await Promise.all([
				core.filesystem.loadConfig(),
				core.filesystem.listTasks(),
				core.filesystem.listMilestones(),
				core.filesystem.listArchivedMilestones(),
			]);
			const shared = ((await host.workspaceState?.<SharedWorkspaceState>()) ?? {}) as SharedWorkspaceState;
			let navigationFilters = shared.filters ?? createWorkspaceFilters();
			const statuses = config?.statuses ?? DEFAULT_STATUSES;
			const labels = collectAvailableLabels(tasks, config?.labels ?? []);
			const milestoneModel = buildTaskViewerMilestoneFilterModel(milestones, archived);
			header = createFilterHeader({
				parent: screen,
				statuses,
				availableLabels: labels,
				availableMilestones: milestoneModel.availableMilestoneTitles,
				visibleFilters: taskFilterHeaderControls(getProjectValues(config)).filter((id) => id !== "search"),
				initialFilters: navigationFilters,
				onFilterChange: (filters) =>
					void (async () => {
						navigationFilters = filters;
						await host.updateWorkspaceState?.<SharedWorkspaceState>((state) => ({ ...state, filters }));
					})(),
				onFilterPickerOpen: (id) =>
					void openTaskFilterPicker({
						screen,
						filterId: id,
						filters: navigationFilters,
						statuses,
						taskTypes: getTaskTypeValues(config),
						projects: getProjectValues(config),
						priorityOptions: getPriorityOptions(config),
						labels,
						milestones: milestoneModel.availableMilestoneTitles,
					}).then((next) => {
						if (next) {
							navigationFilters = next;
							header?.setFilters(next);
							void host.updateWorkspaceState?.<SharedWorkspaceState>((state) => ({ ...state, filters: next }));
						}
					}),
			});
			screen.key(keymapKeys("shared", "tab"), () => {
				void host.focusAgent(false);
				return false;
			});
			screen.key(keymapKeys("workspace", "search"), () => {
				void host.focusSearch?.();
				return false;
			});
			const resize = () => {
				header?.rebuild();
				void host.resizeNavigation?.(header?.getHeight() ?? 0);
				screen.render();
			};
			screen.on("resize", resize);
			void host.resizeNavigation?.(header.getHeight());
			screen.key(keymapKeys("shared", "quitWithoutEscape"), () => {
				void quitWorkspaceHost(host);
				return false;
			});
			if (host.subscribeWorkspaceState) {
				const dispose = await host.subscribeWorkspaceState<SharedWorkspaceState>((shared) => {
					if (!shared.filters || JSON.stringify(shared.filters) === JSON.stringify(navigationFilters)) return;
					navigationFilters = shared.filters;
					header?.setFilters(navigationFilters);
					screen.render();
				});
				adopt(async () => dispose());
			}
		},
		() => header?.destroy(),
	);
}

export function mountFooterRegion(screen: WorkspaceScreen, host: NativeHost): Promise<"exit"> {
	let footer: FooterSearch | undefined;
	let filters = createWorkspaceFilters();
	let context: SharedWorkspaceState["footerContext"] = "tasks";
	let message: string | undefined;
	let pending = Promise.resolve();
	let pendingQuery: string | undefined;
	const applyShared = (shared: SharedWorkspaceState | undefined) => {
		if (shared?.filters) filters = shared.filters;
		context = shared?.footerContext ?? context;
		message = shared?.footerMessage;
	};
	/** Subscription updates are authoritative, so an absent context falls back to the tasks footer. */
	const applySharedUpdate = (shared: SharedWorkspaceState) => {
		if (shared.filters) filters = shared.filters;
		context = shared.footerContext ?? "tasks";
		message = shared.footerMessage;
	};
	return mountNativeRegion(
		screen,
		async ({ screen, adopt }) => {
			const queryPublisher = createLatestWorkspaceSearchPublisher(async (query) => {
				await host.updateWorkspaceState?.<SharedWorkspaceState>((state) => ({
					...state,
					filters: withWorkspaceSearch(state.filters ?? filters, query),
					footerEditing: footer?.isEditing ?? false,
				}));
			});
			footer = new FooterSearch({
				screen,
				content: () => (message ? ` {red-fg}${message}{/}` : getWorkspaceFooterContent(context, filters.search)),
				query: () => filters.search,
				onQueryChange: (query) => {
					filters = withWorkspaceSearch(filters, query);
					pendingQuery = query;
					footer?.render();
					screen.render();
					pending = queryPublisher.submit(query);
				},
				onFocusChange: (editing) => {
					pending = queryPublisher
						.flush()
						.then(() =>
							host.updateWorkspaceState?.<SharedWorkspaceState>((state) => ({ ...state, footerEditing: editing })),
						);
				},
				onSubmit: async () => {
					screen.render();
					await queryPublisher.flush();
					await pending;
					await host.focusTasks?.();
				},
				onCancel: async () => {
					screen.render();
					await queryPublisher.flush();
					await pending;
					await host.focusTasks?.();
				},
				onHeightChange: (height) => void host.resizeFooter?.(height),
			});
			applyShared(await host.workspaceState?.<SharedWorkspaceState>());
			footer.render();
			screen.key(keymapKeys("workspace", "search"), () => {
				void (async () => {
					applyShared(await host.workspaceState?.<SharedWorkspaceState>());
					footer?.focus();
				})();
				return false;
			});
			screen.on("resize", () => {
				footer?.restoreInput();
				footer?.render();
				screen.render();
			});
			if (host.subscribeWorkspaceState) {
				const dispose = await host.subscribeWorkspaceState<SharedWorkspaceState>((shared) => {
					if (footer?.isEditing) return;
					if (pendingQuery !== undefined) {
						if (shared.filters?.search !== pendingQuery) return;
						pendingQuery = undefined;
					}
					applySharedUpdate(shared);
					footer?.render();
					screen.render();
				});
				adopt(async () => dispose());
			}
		},
		() => footer?.destroy(),
	);
}

export function resolveNativeHost(core: Core, host: NativeHost | undefined): NativeHost {
	return host ?? new TmuxWorkspace(core.filesystem.rootDir);
}

export function createRegionScreen(): WorkspaceScreen {
	return createScreen({ title: formatTuiTitle("Workspace") });
}

export type { NativeHost };
