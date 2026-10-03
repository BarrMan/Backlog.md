import type { Core } from "../../../core/backlog.ts";
import { collectAvailableLabels } from "../../../utils/label-filter.ts";
import { getPriorityOptions } from "../../../utils/priority-config.ts";
import { getProjectValues } from "../../../utils/project-config.ts";
import { getTaskTypeValues } from "../../../utils/task-type-config.ts";
import { createFilterHeader, type FilterHeader } from "../../components/filter-header.ts";
import { keymapKeys } from "../../keymap.ts";
import { openTaskFilterPicker, taskFilterHeaderControls } from "../../task-filter-wiring.ts";
import { buildTaskViewerMilestoneFilterModel } from "../../task-viewer/controller.ts";
import { createWorkspaceFilters, type SharedWorkspaceState } from "../state.ts";
import { quitWorkspaceHost } from "./quit.ts";
import { mountNativeRegion, type NativeHost, type WorkspaceScreen } from "./shared.ts";

const DEFAULT_STATUSES = ["To Do", "In Progress", "Done"];

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
