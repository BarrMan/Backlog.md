import { describe, expect, it } from "bun:test";
import { createLatestWorkspaceSearchPublisher } from "../ui/workspace/controller.ts";

describe("workspace search publisher", () => {
	it("publishes the latest clear after an in-flight query", async () => {
		const published: string[] = [];
		let markStarted: (() => void) | undefined;
		let releaseFirst: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const firstReleased = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const publisher = createLatestWorkspaceSearchPublisher(async (query) => {
			published.push(query);
			if (query) {
				markStarted?.();
				await firstReleased;
			}
		});
		publisher.submit("query");
		await started;
		publisher.submit("");
		releaseFirst?.();
		await publisher.flush();
		expect(published).toEqual(["query", ""]);
	});

	it("keeps the final focus update behind an in-flight query", async () => {
		const published: string[] = [];
		let release: (() => void) | undefined;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const publisher = createLatestWorkspaceSearchPublisher(async (query) => {
			await blocked;
			published.push(query);
		});
		publisher.submit("query");
		const finalFocus = publisher.flush().then(() => published.push("focus:false"));
		release?.();
		await finalFocus;
		expect(published).toEqual(["query", "focus:false"]);
	});
});
