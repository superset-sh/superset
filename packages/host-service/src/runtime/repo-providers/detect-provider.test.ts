import { afterEach, describe, expect, mock, test } from "bun:test";

import { __clearProviderCache, detectProvider } from "./detect-provider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetch(
	impl: (
		input: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	) => Promise<Response>,
): void {
	globalThis.fetch = mock(impl) as unknown as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	__clearProviderCache();
});

// ---------------------------------------------------------------------------
// Tests — §8 provider detection
// ---------------------------------------------------------------------------

describe("detectProvider — GitLab capability probe", () => {
	test("github.com short-circuits to 'github' without fetching", async () => {
		let fetchCalled = false;
		mockFetch(async () => {
			fetchCalled = true;
			return new Response("", { status: 200 });
		});

		const result = await detectProvider("github.com");

		expect(result).toBe("github");
		expect(fetchCalled).toBe(false);
	});

	test("gitlab.com short-circuits to 'gitlab' without fetching", async () => {
		let fetchCalled = false;
		mockFetch(async () => {
			fetchCalled = true;
			return new Response("", { status: 200 });
		});

		const result = await detectProvider("gitlab.com");

		expect(result).toBe("gitlab");
		expect(fetchCalled).toBe(false);
	});

	test("200 response from /api/v4/version resolves to 'gitlab'", async () => {
		mockFetch(async () => new Response('{"version":"16.0"}', { status: 200 }));

		const result = await detectProvider("gl.acme.dev");

		expect(result).toBe("gitlab");
	});

	test("401 response from /api/v4/version resolves to 'gitlab' (auth required but endpoint exists)", async () => {
		mockFetch(async () => new Response("Unauthorized", { status: 401 }));

		const result = await detectProvider("gitlab.enterprise.com");

		expect(result).toBe("gitlab");
	});

	test("404 response from /api/v4/version resolves to 'unknown'", async () => {
		mockFetch(async () => new Response("Not Found", { status: 404 }));

		const result = await detectProvider("some.random.host");

		expect(result).toBe("unknown");
	});

	test("503 response resolves to 'unknown'", async () => {
		mockFetch(async () => new Response("Service Unavailable", { status: 503 }));

		const result = await detectProvider("another.host");

		expect(result).toBe("unknown");
	});

	test("network error (fetch throws) resolves to 'unknown'", async () => {
		mockFetch(async () => {
			throw new TypeError("Failed to fetch");
		});

		const result = await detectProvider("unreachable.host");

		expect(result).toBe("unknown");
	});

	test("result is cached — second call does not re-fetch", async () => {
		let fetchCount = 0;
		mockFetch(async () => {
			fetchCount++;
			return new Response('{"version":"15.0"}', { status: 200 });
		});

		const first = await detectProvider("cached.gl.host");
		const second = await detectProvider("cached.gl.host");

		expect(first).toBe("gitlab");
		expect(second).toBe("gitlab");
		// Only one HTTP request, not two.
		expect(fetchCount).toBe(1);
	});

	test("__clearProviderCache resets so a subsequent call re-fetches", async () => {
		let fetchCount = 0;
		mockFetch(async () => {
			fetchCount++;
			return new Response('{"version":"15.0"}', { status: 200 });
		});

		await detectProvider("resettable.host");
		__clearProviderCache();
		await detectProvider("resettable.host");

		expect(fetchCount).toBe(2);
	});

	test("probe URL targets /api/v4/version on the exact host", async () => {
		const fetchedUrls: string[] = [];
		mockFetch(async (input) => {
			fetchedUrls.push(input instanceof Request ? input.url : String(input));
			return new Response("", { status: 200 });
		});

		await detectProvider("custom.gitlab.host");

		expect(fetchedUrls).toEqual(["https://custom.gitlab.host/api/v4/version"]);
	});

	test("different hosts are probed and cached independently", async () => {
		const fetchedUrls: string[] = [];
		mockFetch(async (input) => {
			const url = input instanceof Request ? input.url : String(input);
			fetchedUrls.push(url);
			// Return 200 for the "gl" host, 404 for the "other" host.
			return new Response("", {
				status: url.includes("gl.self.managed") ? 200 : 404,
			});
		});

		const r1 = await detectProvider("gl.self.managed");
		const r2 = await detectProvider("other.self.managed");
		// Second calls — should use cache.
		const r1b = await detectProvider("gl.self.managed");
		const r2b = await detectProvider("other.self.managed");

		expect(r1).toBe("gitlab");
		expect(r2).toBe("unknown");
		expect(r1b).toBe("gitlab");
		expect(r2b).toBe("unknown");
		// Each host probed exactly once.
		expect(fetchedUrls.length).toBe(2);
	});
});
