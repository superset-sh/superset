import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("host-service smoke", () => {
	let host: TestHost;

	beforeEach(async () => {
		host = await createTestHost();
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("health.check returns ok without auth", async () => {
		const result = await host.unauthenticatedTrpc.health.check.query();
		expect(result).toEqual({ status: "ok" });
	});

	test("health.check returns ok with auth", async () => {
		const result = await host.trpc.health.check.query();
		expect(result).toEqual({ status: "ok" });
	});

	test("protected procedure rejects requests without bearer token", async () => {
		await expect(
			host.unauthenticatedTrpc.host.info.query(),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("host.info round-trips through fake cloud api", async () => {
		const orgId = "00000000-0000-0000-0000-0000000000aa";
		host = await replaceHost(host, {
			organizationId: orgId,
			apiOverrides: {
				"organization.getByIdFromJwt.query": (input) => {
					expect(input).toEqual({ id: orgId });
					return { id: orgId, name: "Test Org", slug: "test-org" };
				},
			},
		});

		const info = await host.trpc.host.info.query();
		expect(info.organization).toEqual({
			id: orgId,
			name: "Test Org",
			slug: "test-org",
		});
		expect(info.platform).toEqual(process.platform);
		expect(typeof info.uptime).toBe("number");
		expect(host.apiCalls.map((c) => c.path)).toContain(
			"organization.getByIdFromJwt.query",
		);
	});

	test("CORS preflight allows configured origin and rejects others", async () => {
		const allowed = await host.fetch(
			"http://host-service.test/trpc/health.check",
			{
				method: "OPTIONS",
				headers: {
					origin: "http://localhost:5173",
					"access-control-request-method": "GET",
					"access-control-request-headers": "content-type",
				},
			},
		);
		expect(allowed.headers.get("access-control-allow-origin")).toBe(
			"http://localhost:5173",
		);

		const rejected = await host.fetch(
			"http://host-service.test/trpc/health.check",
			{
				method: "OPTIONS",
				headers: {
					origin: "http://evil.example",
					"access-control-request-method": "GET",
				},
			},
		);
		// A misconfigured wildcard `*` would also satisfy `not.toBe("http://evil.example")`
		// — assert the header is absent entirely, which is what Hono's CORS
		// middleware does for a non-allowlisted origin.
		expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
	});

	test("websocket routes reject unauthenticated upgrade attempts", async () => {
		const res = await host.fetch("http://host-service.test/events");
		expect(res.status).toBe(401);
	});
});

async function replaceHost(
	current: TestHost,
	options: Parameters<typeof createTestHost>[0],
): Promise<TestHost> {
	await current.dispose();
	return createTestHost(options);
}
