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
		expect(result).toEqual({
			status: "ok",
			cloudRegistered: false,
			registrationError: null,
		});
	});

	test("health.check returns ok with auth", async () => {
		const result = await host.trpc.health.check.query();
		expect(result).toEqual({
			status: "ok",
			cloudRegistered: false,
			registrationError: null,
		});
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

	test("session-jwt returns the current bearer token for local host-auth clients", async () => {
		host = await replaceHost(host, {
			cloudApiUrl: "https://api.example.test",
			apiAuthHeaders: { Authorization: "Bearer jwt-from-desktop-session" },
		});

		const response = await host.fetch(
			"http://host-service.test/auth/session-jwt",
			{
				headers: { authorization: `Bearer ${host.psk}` },
			},
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			token: "jwt-from-desktop-session",
			apiUrl: "https://api.example.test",
		});
	});

	test("session-jwt rejects unauthenticated requests", async () => {
		const response = await host.fetch(
			"http://host-service.test/auth/session-jwt",
		);
		expect(response.status).toBe(401);
	});

	test("session-jwt returns 412 when no session credential can be minted", async () => {
		host = await replaceHost(host, {
			apiAuthError: new Error("Failed to mint JWT: 401"),
		});

		const response = await host.fetch(
			"http://host-service.test/auth/session-jwt",
			{
				headers: { authorization: `Bearer ${host.psk}` },
			},
		);

		expect(response.status).toBe(412);
	});

	test("session-jwt does not exist in sandbox run mode", async () => {
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
		try {
			host = await replaceHost(host, {
				apiAuthHeaders: { Authorization: "Bearer jwt-from-desktop-session" },
			});

			const response = await host.fetch(
				"http://host-service.test/auth/session-jwt",
				{
					headers: { authorization: `Bearer ${host.psk}` },
				},
			);

			expect(response.status).toBe(404);
		} finally {
			delete process.env.SUPERSET_HOST_RUN_MODE;
		}
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
