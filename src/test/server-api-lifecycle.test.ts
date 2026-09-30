import { describe, expect, it } from "bun:test";
import { type ServerServices, scopedResource } from "../server/resources/api.ts";

describe("server mutation reconciliation", () => {
	it("reconciles one native 201 mutation before publication but skips rejected and exceptional responses", async () => {
		const events: string[] = [];
		const services: ServerServices = {
			createRequestScope: () =>
				({ scope: { validate: () => undefined } }) as unknown as ReturnType<ServerServices["createRequestScope"]>,
			configChanged: async () => {},
			reconcile: async () => {
				events.push("reconcile", "publish");
			},
		};
		const app = scopedResource(services, "reconciliation-test")
			.post("/api/success", ({ status }) => {
				events.push("mutation");
				return status(201, { success: true });
			})
			.post("/api/bad-request", ({ status }) => status(400, { error: "invalid" }))
			.post("/api/conflict", ({ status }) => status(409, { error: "conflict" }))
			.post("/api/exception", () => {
				throw new Error("failed mutation");
			})
			.onError(() => new Response("Internal Server Error", { status: 500 }));

		const request = async (path: string) =>
			await app.handle(new Request(`http://localhost${path}`, { method: "POST" }));

		expect((await request("/api/success")).status).toBe(201);
		expect(events).toEqual(["mutation", "reconcile", "publish"]);
		expect((await request("/api/bad-request")).status).toBe(400);
		expect((await request("/api/conflict")).status).toBe(409);
		expect((await request("/api/exception")).status).toBe(500);
		expect(events).toEqual(["mutation", "reconcile", "publish"]);
	});
});
