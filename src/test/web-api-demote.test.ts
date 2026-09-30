import { afterEach, describe, expect, it } from "bun:test";
import { ApiClient, ApiError } from "../web/lib/api.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("Web demote API client", () => {
	it("does not retry demotion and preserves the first server error", async () => {
		let calls = 0;
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			calls += 1;
			if (String(input) === "/api/status") return Response.json({ initialized: true, projectScope: "project-a" });
			expect(new Headers(init?.headers).get("X-Backlog-Project-Scope")).toBe("project-a");
			return Response.json({ error: "Git commit failed after moving the task" }, { status: 500 });
		}) as unknown as typeof globalThis.fetch;

		const client = new ApiClient({ retries: 3 });
		const error = await client.demoteTask("TASK-1").then(
			() => null,
			(reason: unknown) => reason,
		);

		expect(calls).toBe(2);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({
			message: "Git commit failed after moving the task",
			status: 500,
		});
	});
});
