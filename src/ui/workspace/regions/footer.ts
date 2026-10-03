import { FooterSearch } from "../../components/footer-search.ts";
import { keymapKeys } from "../../keymap.ts";
import { createLatestWorkspaceSearchPublisher, getWorkspaceFooterContent } from "../footer.ts";
import { createWorkspaceFilters, type SharedWorkspaceState, withWorkspaceSearch } from "../state.ts";
import { mountNativeRegion, type NativeHost, type WorkspaceScreen } from "./shared.ts";

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
