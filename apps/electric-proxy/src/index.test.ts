import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Env } from "./types";

const verifyJWT = mock(async () => ({
	email: "user@example.com",
	organizationIds: ["org-1", "org-2"],
	sub: "user-1",
}));

mock.module("./auth", () => ({ verifyJWT }));

const worker = (await import("./index")).default;
const originalFetch = globalThis.fetch;

const env = {
	AUTH_URL: "https://app.example",
	ELECTRIC_SECRET: "server-secret",
	ELECTRIC_SHAPE_URL: "https://electric.example/v1/shape",
} satisfies Env;

function request(path: string, init?: RequestInit): Request {
	return new Request(`https://proxy.example${path}`, init);
}

describe("electric proxy worker", () => {
	beforeEach(() => {
		verifyJWT.mockClear();
		verifyJWT.mockResolvedValue({
			email: "user@example.com",
			organizationIds: ["org-1", "org-2"],
			sub: "user-1",
		});
		globalThis.fetch = originalFetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("requires a bearer token", async () => {
		const response = await worker.fetch(request("/shape?table=tasks"), env);

		expect(response.status).toBe(401);
		expect(await response.text()).toBe(
			"Missing or invalid Authorization header",
		);
	});

	test("requires organizationId for organization-scoped tables", async () => {
		const response = await worker.fetch(
			request("/shape?table=tasks", {
				headers: { Authorization: "Bearer token" },
			}),
			env,
		);

		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Missing organizationId parameter");
	});

	test("rejects organizations outside the JWT memberships", async () => {
		const response = await worker.fetch(
			request("/shape?table=tasks&organizationId=org-3", {
				headers: { Authorization: "Bearer token" },
			}),
			env,
		);

		expect(response.status).toBe(403);
		expect(await response.text()).toBe("Not a member of this organization");
	});

	test("strips auth-bearing headers before forwarding upstream", async () => {
		const fetchUpstream = mock(
			async () =>
				new Response("shape", {
					headers: {
						"content-encoding": "br",
						"content-length": "999",
						"electric-handle": "handle-1",
					},
				}),
		);
		globalThis.fetch = fetchUpstream as unknown as typeof fetch;

		const response = await worker.fetch(
			request("/shape?table=tasks&organizationId=org-1&handle=h1", {
				headers: {
					Authorization: "Bearer token",
					Cookie: "session=secret",
					"X-Client-Header": "keep-me",
				},
			}),
			env,
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("shape");
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("content-encoding")).toBeNull();
		expect(response.headers.get("content-length")).toBeNull();
		expect(response.headers.get("vary")).toBe("Authorization");

		const [forwardedInput, forwardedInit] = fetchUpstream.mock
			.calls[0] as unknown as [RequestInfo | URL, RequestInit | undefined];
		const forwardedUrl = new URL(String(forwardedInput));
		expect(forwardedUrl.searchParams.get("table")).toBe("tasks");
		expect(forwardedUrl.searchParams.get("where")).toBe(
			'"organization_id" = $1',
		);
		expect(forwardedUrl.searchParams.get("params[1]")).toBe("org-1");
		const forwardedHeaders = new Headers(forwardedInit?.headers);
		expect(forwardedHeaders.get("Authorization")).toBeNull();
		expect(forwardedHeaders.get("Cookie")).toBeNull();
		expect(forwardedHeaders.get("X-Client-Header")).toBe("keep-me");
	});

	test("allows auth.organizations without an organizationId parameter", async () => {
		const fetchUpstream = mock(async () => new Response("organizations"));
		globalThis.fetch = fetchUpstream as unknown as typeof fetch;

		// JWT claims arrive UNSORTED here; the proxy sorts them (index.ts:74) so
		// Electric receives a stable shape handle regardless of claim ordering.
		verifyJWT.mockResolvedValue({
			email: "user@example.com",
			organizationIds: ["org-2", "org-1"],
			sub: "user-1",
		});

		const response = await worker.fetch(
			request("/shape?table=auth.organizations", {
				headers: { Authorization: "Bearer token" },
			}),
			env,
		);

		expect(response.status).toBe(200);
		const [forwardedInput] = fetchUpstream.mock.calls[0] as unknown as [
			RequestInfo | URL,
			RequestInit | undefined,
		];
		const forwardedUrl = new URL(String(forwardedInput));
		expect(forwardedUrl.searchParams.get("where")).toBe('"id" in ($1, $2)');
		expect(forwardedUrl.searchParams.get("params[1]")).toBe("org-1");
		expect(forwardedUrl.searchParams.get("params[2]")).toBe("org-2");
	});

	test("rejects unknown tables at the HTTP layer", async () => {
		const response = await worker.fetch(
			request("/shape?table=unknown_table&organizationId=org-1", {
				headers: { Authorization: "Bearer token" },
			}),
			env,
		);

		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Unknown table: unknown_table");
	});
});
