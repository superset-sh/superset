import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const getSession = mock(async () => ({
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
}));
const findLinearConnection = mock(async () => ({
	accessToken: "linear-token",
}));

mock.module("@superset/auth/server", () => ({
	auth: {
		api: {
			getSession,
		},
	},
}));

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findFirst: findLinearConnection,
			},
		},
	},
}));

mock.module("@superset/db/schema", () => ({
	integrationConnections: {
		organizationId: "organizationId",
		provider: "provider",
	},
	usersSlackUsers: {
		id: "id",
		slackUserId: "slackUserId",
		teamId: "teamId",
	},
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ conditions, type: "and" }),
	eq: (field: unknown, value: unknown) => ({ field, type: "eq", value }),
}));

const originalFetch = globalThis.fetch;
const { GET } = await import("./route");

function linearImageRequest(linearUrl: string): Request {
	const url = new URL("http://localhost/api/proxy/linear-image");
	url.searchParams.set("url", linearUrl);
	return new Request(url);
}

describe("linear image proxy", () => {
	beforeEach(() => {
		getSession.mockClear();
		findLinearConnection.mockClear();
		getSession.mockResolvedValue({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		});
		findLinearConnection.mockResolvedValue({ accessToken: "linear-token" });
		globalThis.fetch = originalFetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("keeps authenticated Linear images out of shared caches", async () => {
		const fetchLinearImage = mock(
			async () =>
				new Response(new Uint8Array([1, 2, 3]), {
					headers: { "content-type": "image/jpeg" },
				}),
		);
		globalThis.fetch = fetchLinearImage as unknown as typeof fetch;

		const response = await GET(
			linearImageRequest("https://uploads.linear.app/private-image.jpg"),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/jpeg");
		expect(response.headers.get("cache-control")).toBe(
			"private, no-store, max-age=0",
		);
		expect(response.headers.get("pragma")).toBe("no-cache");
		expect(response.headers.get("vary")).toBe("Cookie, Authorization");
		expect(fetchLinearImage.mock.calls[0]?.[0]).toBe(
			"https://uploads.linear.app/private-image.jpg",
		);
		expect(fetchLinearImage.mock.calls[0]?.[1]).toEqual({
			headers: { Authorization: "Bearer linear-token" },
		});
	});

	test("rejects non-Linear image hosts before fetching", async () => {
		const fetchLinearImage = mock(async () => new Response("unexpected"));
		globalThis.fetch = fetchLinearImage as unknown as typeof fetch;

		const response = await GET(
			linearImageRequest("https://example.com/private-image.jpg"),
		);

		expect(response.status).toBe(400);
		expect(await response.text()).toBe(
			"Only uploads.linear.app URLs are allowed",
		);
		expect(fetchLinearImage).not.toHaveBeenCalled();
	});
});
