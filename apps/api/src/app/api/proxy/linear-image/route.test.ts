import { describe, expect, mock, test } from "bun:test";

// Mock auth
mock.module("@superset/auth/server", () => ({
	auth: {
		api: {
			getSession: mock(() =>
				Promise.resolve({
					user: { id: "user-1" },
					session: { activeOrganizationId: "org-1" },
				}),
			),
		},
	},
}));

// Mock db
const mockFindFirst = mock(() =>
	Promise.resolve({
		organizationId: "org-1",
		provider: "linear",
		accessToken: "test-token",
	}),
);

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findFirst: mockFindFirst,
			},
		},
	},
}));

mock.module("@superset/db/schema", () => ({
	integrationConnections: {},
}));

mock.module("drizzle-orm", () => ({
	and: mock((...args: unknown[]) => args),
	eq: mock((col: unknown, val: unknown) => ({ col, val })),
}));

function makeRequest(searchParams: Record<string, string>): Request {
	const url = new URL("http://localhost/api/proxy/linear-image");
	for (const [k, v] of Object.entries(searchParams)) {
		url.searchParams.set(k, v);
	}
	return new Request(url.toString());
}

describe("GET /api/proxy/linear-image", () => {
	describe("content-type validation (bug #2229)", () => {
		test("passes through non-image content type — reproduces the bug", async () => {
			// Arrange: upstream returns text/html
			const originalFetch = globalThis.fetch;
			globalThis.fetch = mock(() =>
				Promise.resolve(
					new Response("<html>not an image</html>", {
						status: 200,
						headers: { "Content-Type": "text/html; charset=utf-8" },
					}),
				),
			) as typeof fetch;

			const { GET } = await import("./route");
			const response = await GET(
				makeRequest({
					url: "https://uploads.linear.app/abc/image.png",
				}),
			);

			// Bug: without validation the proxy returns 200 with text/html
			// Expected after fix: 400 because text/html is not an allowed image type
			expect(response.status).toBe(400);

			globalThis.fetch = originalFetch;
		});

		test("allows valid image content types", async () => {
			for (const ct of [
				"image/png",
				"image/jpeg",
				"image/gif",
				"image/webp",
				"image/svg+xml",
			]) {
				const originalFetch = globalThis.fetch;
				globalThis.fetch = mock(() =>
					Promise.resolve(
						new Response(new Uint8Array([0, 1, 2]).buffer, {
							status: 200,
							headers: { "Content-Type": ct },
						}),
					),
				) as typeof fetch;

				// Re-import to reset module-level state
				const { GET } = await import("./route");
				const response = await GET(
					makeRequest({
						url: "https://uploads.linear.app/abc/image.png",
					}),
				);

				expect(response.status).toBe(200);
				expect(response.headers.get("Content-Type")).toBe(ct);

				globalThis.fetch = originalFetch;
			}
		});
	});

	describe("protocol validation (bug #2229)", () => {
		test("rejects non-https URLs — reproduces the bug", async () => {
			const { GET } = await import("./route");

			// http:// scheme — should be rejected after fix
			const response = await GET(
				makeRequest({
					url: "http://uploads.linear.app/abc/image.png",
				}),
			);

			// Bug: without protocol check the proxy accepts http:// URLs
			// Expected after fix: 400 because only https is allowed
			expect(response.status).toBe(400);
		});
	});
});
