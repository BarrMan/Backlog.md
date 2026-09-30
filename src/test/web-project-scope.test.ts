import { afterEach, expect, test } from "bun:test";
import type { BacklogConfig } from "../types/index.ts";
import { ApiClient, type ApiError } from "../web/lib/api.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

test("bootstraps once and sends the pinned scope with API requests", async () => {
	const requests: Array<{ url: string; scope: string | null }> = [];
	globalThis.fetch = (async (input, init) => {
		const url = String(input);
		requests.push({ url, scope: new Headers(init?.headers).get("X-Backlog-Project-Scope") });
		if (url === "/api/status") return Response.json({ initialized: true, projectScope: "scope/a b" });
		return Response.json([]);
	}) as typeof fetch;
	const client = new ApiClient({ retries: 0 });
	await Promise.all([client.fetchStatuses(), client.fetchTasks()]);
	expect(requests).toEqual([
		{ url: "/api/status", scope: null },
		{ url: "/api/statuses", scope: "scope/a b" },
		{ url: "/api/tasks?crossBranch=true", scope: "scope/a b" },
	]);
});

test("fails closed when a later status response names another project", async () => {
	let statusCalls = 0;
	globalThis.fetch = (async (input) => {
		if (String(input) !== "/api/status") return Response.json([]);
		statusCalls += 1;
		return Response.json({ initialized: true, projectScope: statusCalls === 1 ? "project-a" : "project-b" });
	}) as typeof fetch;
	const client = new ApiClient({ retries: 0 });
	await client.checkStatus();
	await expect(client.checkStatus()).rejects.toMatchObject({
		code: "PROJECT_SCOPE_MISMATCH",
		status: 409,
	} satisfies Partial<ApiError>);
});

test("does not retry or re-bootstrap after a scoped request is rejected", async () => {
	let requests = 0;
	globalThis.fetch = (async (input) => {
		requests += 1;
		if (String(input) === "/api/status") return Response.json({ initialized: true, projectScope: "project-a" });
		return Response.json(
			{ error: "Project scope does not match this server", code: "PROJECT_SCOPE_MISMATCH" },
			{ status: 409 },
		);
	}) as typeof fetch;
	const client = new ApiClient({ retries: 3 });
	await expect(client.fetchStatuses()).rejects.toMatchObject({
		code: "PROJECT_SCOPE_MISMATCH",
		status: 409,
	} satisfies Partial<ApiError>);
	expect(requests).toBe(2);
});

test("does not retry a mutation when its response is lost", async () => {
	let requests = 0;
	globalThis.fetch = (async (input) => {
		requests += 1;
		if (String(input) === "/api/status") return Response.json({ initialized: true, projectScope: "project-a" });
		throw new TypeError("connection reset after write");
	}) as typeof fetch;
	const client = new ApiClient({ retries: 3 });
	await expect(
		client.createTask({
			title: "One attempt",
			status: "To Do",
			assignee: [],
			labels: [],
			dependencies: [],
			rawContent: "",
		}),
	).rejects.toThrow("Request failed after 1 attempts");
	expect(requests).toBe(2);
});

test("adopts a new scope only from a successful initialization response", async () => {
	const client = new ApiClient({ retries: 0 });
	const requests: string[] = [];
	globalThis.fetch = (async (input) => {
		requests.push(String(input));
		if (String(input) === "/api/status") return Response.json({ initialized: false, projectScope: "before-init" });
		if (String(input) === "/api/init")
			return Response.json({ success: true, projectName: "Demo", projectScope: "after-init" });
		return Response.json([]);
	}) as typeof fetch;
	await client.fetchStatuses();
	await client.initializeProject({ projectName: "Demo", integrationMode: "none" });
	await client.fetchStatuses();
	expect(requests).toEqual(["/api/status", "/api/statuses", "/api/init", "/api/statuses"]);
});

test("adopts the scope returned by a successful explicit config update", async () => {
	const client = new ApiClient({ retries: 0 });
	const requests: Array<{ url: string; scope: string | null }> = [];
	globalThis.fetch = (async (input, init) => {
		const url = String(input);
		requests.push({ url, scope: new Headers(init?.headers).get("X-Backlog-Project-Scope") });
		if (url === "/api/status") return Response.json({ initialized: true, projectScope: "before-config" });
		if (url === "/api/config")
			return new Response(JSON.stringify({ projectName: "Moved" }), {
				headers: { "Content-Type": "application/json", "X-Backlog-Project-Scope": "after-config" },
			});
		return Response.json([]);
	}) as typeof fetch;
	await client.fetchStatuses();
	await client.updateConfig({} as BacklogConfig);
	await client.fetchStatuses();
	expect(requests).toEqual([
		{ url: "/api/status", scope: null },
		{ url: "/api/statuses", scope: "before-config" },
		{ url: "/api/config", scope: "before-config" },
		{ url: "/api/statuses", scope: "after-config" },
	]);
});
