import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@superset/auth/server", () => ({
	auth: {
		api: {
			getSession: async () => ({
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			}),
		},
	},
}));

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findFirst: async () => ({
					organizationId: "org-1",
					provider: "linear",
					accessToken: "linear-token",
				}),
			},
		},
	},
}));

mock.module("@superset/db/schema", () => ({
	integrationConnections: {
		organizationId: "organizationId",
		provider: "provider",
	},
}));

const LINEAR_IMAGE_HOST = "uploads.linear.app";

function proxyRequest(target: string): Request {
	return new Request(
		`http://localhost/api/proxy/linear-image?url=${encodeURIComponent(target)}`,
	);
}

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const { GET } = await import("./route");

describe("linear-image proxy", () => {
	test("rejects non-image content types instead of passing them through", async () => {
		// Simulate an upstream response with a non-image content type.
		globalThis.fetch = mock(
			async () =>
				new Response("<script>alert(1)</script>", {
					status: 200,
					headers: { "content-type": "text/html" },
				}),
		) as unknown as typeof fetch;

		const response = await GET(
			proxyRequest(`https://${LINEAR_IMAGE_HOST}/evil`),
		);

		// The proxy should NOT serve text/html back to the browser.
		expect(response.headers.get("content-type")).not.toBe("text/html");
	});

	test("only allows https URLs", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { "content-type": "image/png" },
				}),
		) as unknown as typeof fetch;

		const response = await GET(
			proxyRequest(`http://${LINEAR_IMAGE_HOST}/insecure.png`),
		);

		// A non-https scheme should be rejected.
		expect(response.status).toBe(400);
	});

	test("serves valid images through unchanged", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { "content-type": "image/png" },
				}),
		) as unknown as typeof fetch;

		const response = await GET(
			proxyRequest(`https://${LINEAR_IMAGE_HOST}/valid.png`),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/png");
	});
});
