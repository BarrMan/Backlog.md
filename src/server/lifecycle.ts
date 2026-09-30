import type { Core } from "../core/backlog.ts";
import type { ContentStore } from "../core/content-store.ts";
import type { SearchService } from "../core/search-service.ts";
import type { ServerServices } from "./resources/api.ts";
import type { WebSocketHub } from "./websocket-hub.ts";

export class BrowserServices implements ServerServices {
	private contentStore: ContentStore | null = null;
	private searchService: SearchService | null = null;
	private readyPromise: Promise<void> | null = null;
	private servicesReady = false;
	private unsubscribe?: () => void;
	private generation = 0;
	private disposed = false;

	constructor(
		private readonly core: Core,
		private readonly hub: WebSocketHub,
		private readonly onConfigChanged: (projectName: string) => void,
	) {}

	wasReady(): boolean {
		return this.servicesReady;
	}
	configChanged(projectName: string): void {
		this.onConfigChanged(projectName);
	}

	async ready(): Promise<void> {
		if (!this.readyPromise) {
			this.disposed = false;
			const generation = this.generation;
			this.hub.publishLoading({ type: "loading", message: null });
			const promise = this.initialize(generation)
				.then(() => {
					if (this.isCurrent(generation)) this.hub.publishLoading({ type: "loaded" });
				})
				.catch((error) => {
					if (this.readyPromise === promise) this.readyPromise = null;
					if (this.isCurrent(generation)) {
						this.hub.publishLoading({ type: "error", message: error instanceof Error ? error.message : String(error) });
					}
					throw error;
				});
			this.readyPromise = promise;
		}
		await this.readyPromise;
	}

	async store(): Promise<ContentStore> {
		await this.ready();
		if (!this.contentStore) throw new Error("Content store not initialized");
		return this.contentStore;
	}

	async search(): Promise<SearchService> {
		await this.ready();
		if (!this.searchService) throw new Error("Search service not initialized");
		return this.searchService;
	}

	async dispose(): Promise<void> {
		this.generation += 1;
		this.disposed = true;
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.core.disposeSearchService();
		this.core.disposeContentStore();
		this.contentStore = null;
		this.searchService = null;
		this.readyPromise = null;
		this.servicesReady = false;
	}

	private async initialize(generation: number): Promise<void> {
		const contentStore = await this.core.getContentStore((message) => {
			if (this.isCurrent(generation)) this.hub.publishLoading({ type: "loading", message });
		});
		if (!this.isCurrent(generation)) {
			if (this.disposed) this.core.disposeContentStore();
			return;
		}
		this.contentStore = contentStore;
		if (!this.unsubscribe)
			this.unsubscribe = this.contentStore.subscribe((event) => {
				if (!this.isCurrent(generation)) return;
				if (event.type === "config") {
					this.onConfigChanged(event.config.projectName);
					this.hub.publishConfig();
				} else if (event.type !== "ready" || this.servicesReady) this.hub.publishData();
			});
		const searchService = await this.core.getSearchService();
		if (!this.isCurrent(generation)) {
			if (this.disposed) this.core.disposeSearchService();
			return;
		}
		this.searchService = searchService;
		this.servicesReady = true;
	}

	private isCurrent(generation: number): boolean {
		return !this.disposed && this.generation === generation;
	}
}
