import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { integrationConnections } from "@superset/db/schema";
import { handleLinearImageProxy } from "./route-core";

const findFirstIntegrationConnection = mock(async () => ({
	accessToken: "linear-token",
}));
const getRouteSession = mock(async () => ({
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
}));
const andClause = mock((...clauses: unknown[]) => ({ clauses, type: "and" }));
const eqClause = mock((left: unknown, right: unknown) => ({
	left,
	right,
	type: "eq",
}));
const isNullClause = mock((column: unknown) => ({
	column,
	type: "isNull",
}));

mock.module("@superset/auth/server", () => ({
	auth: {
		api: {
			getSession: getRouteSession,
		},
	},
}));

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findFirst: findFirstIntegrationConnection,
			},
		},
	},
}));

mock.module("drizzle-orm", () => ({
	and: andClause,
	eq: eqClause,
	isNull: isNullClause,
}));

const { GET } = await import("./route");

const getSession = mock(async () => ({
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
}));
const findLinearConnection = mock(async () => ({
	accessToken: "linear-token",
}));
const fetchLinearImage = mock(
	async () =>
		new Response(new Uint8Array([1, 2, 3]), {
			headers: { "content-type": "image/jpeg" },
		}),
);
const originalConsoleError = console.error;
const consoleError = mock(() => undefined);

const originalFetch = globalThis.fetch;
const routeFetch = mock(
	async () =>
		new Response(new Uint8Array([4, 5, 6]), {
			headers: { "content-type": "image/png" },
		}),
);

function linearImageRequest(linearUrl: string, init?: RequestInit): Request {
	const url = new URL("http://localhost/api/proxy/linear-image");
	url.searchParams.set("url", linearUrl);
	return new Request(url, init);
}

function proxy(request: Request) {
	return handleLinearImageProxy(request, {
		fetch: fetchLinearImage as unknown as typeof fetch,
		findLinearConnection,
		getSession,
	});
}

function streamWithCancel(): {
	body: ReadableStream<Uint8Array>;
	cancel: ReturnType<typeof mock>;
} {
	const cancel = mock(() => undefined);

	return {
		body: new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("denied"));
			},
			cancel,
		}),
		cancel,
	};
}

function expectNoStoreHeaders(response: Response) {
	expect(response.headers.get("cache-control")).toBe("no-store");
	expect(response.headers.get("pragma")).toBe("no-cache");
	expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("linear image proxy", () => {
	beforeEach(() => {
		getSession.mockClear();
		findLinearConnection.mockClear();
		fetchLinearImage.mockClear();
		findFirstIntegrationConnection.mockClear();
		getRouteSession.mockClear();
		andClause.mockClear();
		eqClause.mockClear();
		isNullClause.mockClear();
		routeFetch.mockClear();
		consoleError.mockClear();
		getSession.mockResolvedValue({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		});
		findLinearConnection.mockResolvedValue({ accessToken: "linear-token" });
		findFirstIntegrationConnection.mockResolvedValue({
			accessToken: "linear-token",
		});
		getRouteSession.mockResolvedValue({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		});
		routeFetch.mockResolvedValue(
			new Response(new Uint8Array([4, 5, 6]), {
				headers: { "content-type": "image/png" },
			}),
		);
		globalThis.fetch = routeFetch as unknown as typeof fetch;
		fetchLinearImage.mockResolvedValue(
			new Response(new Uint8Array([1, 2, 3]), {
				headers: { "content-type": "image/jpeg" },
			}),
		);
		console.error = consoleError;
	});

	afterEach(() => {
		console.error = originalConsoleError;
		globalThis.fetch = originalFetch;
	});

	test("keeps authenticated Linear images out of shared caches", async () => {
		const response = await proxy(
			linearImageRequest("https://uploads.linear.app/private-image.jpg"),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/jpeg");
		expectNoStoreHeaders(response);
		expect(response.headers.has("vary")).toBe(false);
		expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
			1, 2, 3,
		]);
		expect(fetchLinearImage.mock.calls[0]?.[0]).toBe(
			"https://uploads.linear.app/private-image.jpg",
		);
		const fetchOptions = fetchLinearImage.mock.calls[0]?.[1] as
			| RequestInit
			| undefined;
		expect(fetchOptions?.headers).toEqual({
			Authorization: "Bearer linear-token",
		});
		expect(fetchOptions?.redirect).toBe("error");
		expect(fetchOptions?.signal instanceof AbortSignal).toBe(true);
	});

	test("GET queries only active Linear integrations for the session organization", async () => {
		const response = await GET(
			linearImageRequest("https://uploads.linear.app/private-image.png"),
		);

		expect(response.status).toBe(200);
		expect(findFirstIntegrationConnection).toHaveBeenCalledTimes(1);
		expect(getRouteSession.mock.calls[0]?.[0]).toEqual({
			headers: expect.any(Headers),
		});
		expect(eqClause.mock.calls).toEqual([
			[integrationConnections.organizationId, "org-1"],
			[integrationConnections.provider, "linear"],
		]);
		expect(isNullClause.mock.calls).toEqual([
			[integrationConnections.disconnectedAt],
		]);
		expect(andClause.mock.calls[0]).toEqual([
			{
				left: integrationConnections.organizationId,
				right: "org-1",
				type: "eq",
			},
			{
				left: integrationConnections.provider,
				right: "linear",
				type: "eq",
			},
			{ column: integrationConnections.disconnectedAt, type: "isNull" },
		]);
		expect(routeFetch.mock.calls[0]?.[1]).toMatchObject({
			headers: { Authorization: "Bearer linear-token" },
			redirect: "error",
		});
	});

	test("applies a timeout signal to upstream Linear image fetches", async () => {
		const originalTimeout = AbortSignal.timeout;
		const timeoutSignal = new AbortController().signal;
		const timeout = mock(() => timeoutSignal);

		Object.defineProperty(AbortSignal, "timeout", {
			configurable: true,
			value: timeout,
		});

		try {
			const response = await proxy(
				linearImageRequest("https://uploads.linear.app/private-image.jpg"),
			);

			expect(response.status).toBe(200);
			expect(timeout).toHaveBeenCalledWith(15_000);
			const fetchOptions = fetchLinearImage.mock.calls[0]?.[1] as
				| RequestInit
				| undefined;
			expect(fetchOptions?.signal instanceof AbortSignal).toBe(true);
		} finally {
			Object.defineProperty(AbortSignal, "timeout", {
				configurable: true,
				value: originalTimeout,
			});
		}
	});

	test("propagates client aborts to the upstream Linear image fetch", async () => {
		const controller = new AbortController();
		controller.abort();
		fetchLinearImage.mockImplementationOnce(async () => {
			throw new DOMException("The operation was aborted.", "AbortError");
		});

		const response = await proxy(
			linearImageRequest("https://uploads.linear.app/private-image.jpg", {
				signal: controller.signal,
			}),
		);

		expect(response.status).toBe(499);
		expect(response.statusText).toBe("Client Closed Request");
		expectNoStoreHeaders(response);
		expect(await response.text()).toBe("Client closed request");
		const fetchOptions = fetchLinearImage.mock.calls[0]?.[1] as
			| RequestInit
			| undefined;
		expect(fetchOptions?.signal instanceof AbortSignal).toBe(true);
		expect(fetchOptions?.signal?.aborted).toBe(true);
		expect(consoleError).not.toHaveBeenCalled();
	});

	test("rejects non-Linear image hosts before fetching", async () => {
		const response = await proxy(
			linearImageRequest("https://example.com/private-image.jpg"),
		);

		expect(response.status).toBe(400);
		expectNoStoreHeaders(response);
		expect(await response.text()).toBe(
			"Only https://uploads.linear.app URLs are allowed",
		);
		expect(findLinearConnection).not.toHaveBeenCalled();
		expect(fetchLinearImage).not.toHaveBeenCalled();
	});

	test("rejects non-HTTPS Linear image URLs before attaching auth", async () => {
		const response = await proxy(
			linearImageRequest("http://uploads.linear.app/private-image.jpg"),
		);

		expect(response.status).toBe(400);
		expectNoStoreHeaders(response);
		expect(await response.text()).toBe(
			"Only https://uploads.linear.app URLs are allowed",
		);
		expect(findLinearConnection).not.toHaveBeenCalled();
		expect(fetchLinearImage).not.toHaveBeenCalled();
	});

	test("rejects credentialed Linear image URLs before attaching auth", async () => {
		const response = await proxy(
			linearImageRequest(
				"https://user:pass@uploads.linear.app/private-image.jpg",
			),
		);

		expect(response.status).toBe(400);
		expectNoStoreHeaders(response);
		expect(await response.text()).toBe(
			"Linear image URLs cannot include credentials",
		);
		expect(findLinearConnection).not.toHaveBeenCalled();
		expect(fetchLinearImage).not.toHaveBeenCalled();
	});

	test("keeps upstream failures out of caches without logging raw URLs", async () => {
		const upstreamBody = streamWithCancel();
		fetchLinearImage.mockResolvedValueOnce(
			new Response(upstreamBody.body, {
				status: 403,
				statusText: "Forbidden",
			}),
		);

		const response = await proxy(
			linearImageRequest(
				"https://uploads.linear.app/private-image.jpg?sig=secret",
			),
		);

		expect(response.status).toBe(403);
		expectNoStoreHeaders(response);
		expect(await response.text()).toBe("Failed to fetch image from Linear");
		expect(consoleError.mock.calls[0]?.[1]).toEqual({
			hasQuery: true,
			host: "uploads.linear.app",
			pathLength: "/private-image.jpg".length,
			status: 403,
			statusText: "Forbidden",
		});
		expect(upstreamBody.cancel).toHaveBeenCalled();
	});

	test("rejects active image content types from Linear", async () => {
		const upstreamBody = streamWithCancel();
		fetchLinearImage.mockResolvedValueOnce(
			new Response(upstreamBody.body, {
				headers: { "content-type": "image/svg+xml" },
			}),
		);

		const response = await proxy(
			linearImageRequest("https://uploads.linear.app/private-image.svg"),
		);

		expect(response.status).toBe(415);
		expectNoStoreHeaders(response);
		expect(await response.text()).toBe("Unsupported Linear image content type");
		expect(upstreamBody.cancel).toHaveBeenCalled();
	});

	test("returns a no-store bad gateway when hardened fetch throws", async () => {
		fetchLinearImage.mockImplementationOnce(async () => {
			throw new TypeError("fetch aborted");
		});

		const response = await proxy(
			linearImageRequest("https://uploads.linear.app/private-image.jpg"),
		);

		expect(response.status).toBe(502);
		expectNoStoreHeaders(response);
		expect(await response.text()).toBe("Failed to fetch image from Linear");
		const fetchOptions = fetchLinearImage.mock.calls[0]?.[1] as
			| RequestInit
			| undefined;
		expect(fetchOptions?.headers).toEqual({
			Authorization: "Bearer linear-token",
		});
		expect(fetchOptions?.redirect).toBe("error");
		expect(fetchOptions?.signal instanceof AbortSignal).toBe(true);
		expect(consoleError.mock.calls[0]?.[1]).toEqual({
			errorName: "TypeError",
			hasQuery: false,
			host: "uploads.linear.app",
			pathLength: "/private-image.jpg".length,
		});
	});

	test("keeps missing Linear integrations out of caches", async () => {
		findLinearConnection.mockResolvedValueOnce(null);

		const response = await proxy(
			linearImageRequest("https://uploads.linear.app/private-image.jpg"),
		);

		expect(response.status).toBe(400);
		expectNoStoreHeaders(response);
		expect(await response.text()).toBe("Linear integration not connected");
		expect(fetchLinearImage).not.toHaveBeenCalled();
	});

	test("keeps auth backend exceptions out of caches", async () => {
		getSession.mockImplementationOnce(async () => {
			throw new Error("session backend down");
		});

		const response = await proxy(
			linearImageRequest("https://uploads.linear.app/private-image.jpg"),
		);

		expect(response.status).toBe(500);
		expectNoStoreHeaders(response);
		expect(await response.text()).toBe("Failed to proxy Linear image");
		expect(fetchLinearImage).not.toHaveBeenCalled();
		expect(consoleError.mock.calls[0]?.[1]).toEqual({ errorName: "Error" });
	});

	test("keeps database exceptions out of caches", async () => {
		findLinearConnection.mockImplementationOnce(async () => {
			throw new Error("database down");
		});

		const response = await proxy(
			linearImageRequest("https://uploads.linear.app/private-image.jpg"),
		);

		expect(response.status).toBe(500);
		expectNoStoreHeaders(response);
		expect(await response.text()).toBe("Failed to proxy Linear image");
		expect(fetchLinearImage).not.toHaveBeenCalled();
		expect(consoleError.mock.calls[0]?.[1]).toEqual({ errorName: "Error" });
	});
});
