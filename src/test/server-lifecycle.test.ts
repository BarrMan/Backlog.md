import { describe, expect, it } from "bun:test";
import { BrowserServices } from "../server/lifecycle.ts";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
	let resolve: (value: T) => void = () => {};
	let reject: (error: unknown) => void = () => {};
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

describe("BrowserServices lifecycle", () => {
	it("does not resurrect subscriptions or publish after disposal while initialization is pending", async () => {
		const initialization = deferred<{ subscribe: (listener: () => void) => () => void }>();
		let subscriptions = 0;
		let contentStoreDisposals = 0;
		let searchServiceDisposals = 0;
		const publications: unknown[] = [];
		const core = {
			getContentStore: () => initialization.promise,
			getSearchService: async () => ({}),
			disposeContentStore: () => contentStoreDisposals++,
			disposeSearchService: () => searchServiceDisposals++,
		};
		const hub = {
			publishLoading: (state: unknown) => publications.push(state),
			publishData: () => publications.push("data"),
			publishConfig: () => publications.push("config"),
		};
		const services = new BrowserServices(core as never, hub as never, () => {});

		const ready = services.ready();
		await services.dispose();
		const publicationsAtDisposal = publications.length;
		initialization.resolve({
			subscribe: () => {
				subscriptions += 1;
				return () => {};
			},
		});
		await ready;

		expect(subscriptions).toBe(0);
		expect(contentStoreDisposals).toBe(2);
		expect(searchServiceDisposals).toBe(1);
		expect(publications).toHaveLength(publicationsAtDisposal);
	});

	it("retries a rejected initialization", async () => {
		let attempts = 0;
		const publications: unknown[] = [];
		const core = {
			getContentStore: async () => {
				attempts += 1;
				if (attempts === 1) throw new Error("initialization failed");
				return { subscribe: () => () => {} };
			},
			getSearchService: async () => ({}),
			disposeContentStore: () => {},
			disposeSearchService: () => {},
		};
		const hub = {
			publishLoading: (state: unknown) => publications.push(state),
			publishData: () => {},
			publishConfig: () => {},
		};
		const services = new BrowserServices(core as never, hub as never, () => {});

		await expect(services.ready()).rejects.toThrow("initialization failed");
		await services.ready();

		expect(attempts).toBe(2);
		expect(publications).toEqual([
			{ type: "loading", message: null },
			{ type: "error", message: "initialization failed" },
			{ type: "loading", message: null },
			{ type: "loaded" },
		]);
	});
});
