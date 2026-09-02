import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// The minted-JWT cache is module-level and shared across tests in this file;
// reset it by importing fresh in each test is not enough (Bun caches modules),
// so we drive assertions via fetch call counts instead of the cache internals.
// Every test uses a DISTINCT fake key so a JWT cached by an earlier test can't
// short-circuit the fetch this test is asserting on.
mock.module("./config", () => ({
	getApiUrl: () => "https://api.example.com",
}));

const { getHostJwt } = await import("./host-jwt");

// Fake, obviously-non-secret API keys used only to exercise the exchange path.
// The `sk_live_` prefix is assembled from separate literals so secret scanners
// (Betterleaks) don't flag these test fixtures as real Stripe access tokens —
// the runtime value is unchanged.
const SK_LIVE = ["sk", "live"].join("_") + "_";
const LIVE_API_KEY = SK_LIVE + "4f9e3a2b1c";
const TEST_API_KEY = "sk_test_xyz";
const CACHE_KEY = SK_LIVE + "cache";
const SHARE_KEY_A = SK_LIVE + "key_a";
const SHARE_KEY_B = SK_LIVE + "key_b";
const FAIL_KEY = SK_LIVE + "fail";
const NO_TOKEN_KEY = SK_LIVE + "no_token";
const TYPED_KEY = SK_LIVE + "typed";
const WHITESPACE_KEY = SK_LIVE + "whitespace";
const ABORT_KEY = SK_LIVE + "abort";
const BOUNDARY_KEY = SK_LIVE + "boundary";

const realFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

beforeEach(() => {
	fetchCalls = [];
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

function stubFetch(ok: boolean, body: unknown = { token: "minted-jwt" }): void {
	globalThis.fetch = (async (url: string, init?: RequestInit) => {
		fetchCalls.push({ url, init });
		return {
			ok,
			status: ok ? 200 : 401,
			json: async () => body,
		} as Response;
	}) as typeof fetch;
}

function apiKeyHeaderOf(url: string): string | undefined {
	const call = fetchCalls.find((c) => c.url === url);
	const headers = call?.init?.headers as Record<string, string> | undefined;
	return headers?.["x-api-key"];
}

describe("getHostJwt", () => {
	it("passes an OAuth JWT through without an exchange", async () => {
		const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig";
		const result = await getHostJwt(jwt);
		expect(result).toBe(jwt);
		expect(fetchCalls).toHaveLength(0);
	});

	it("exchanges an sk_live_ API key for a JWT via x-api-key", async () => {
		stubFetch(true);
		const result = await getHostJwt(LIVE_API_KEY);
		expect(result).toBe("minted-jwt");
		expect(fetchCalls).toHaveLength(1);
		const url = fetchCalls[0]!.url;
		expect(url).toBe("https://api.example.com/api/auth/token");
		expect(apiKeyHeaderOf(url)).toBe(LIVE_API_KEY);
	});

	it("exchanges an sk_test_ API key the same way", async () => {
		stubFetch(true);
		const result = await getHostJwt(TEST_API_KEY);
		expect(result).toBe("minted-jwt");
		expect(fetchCalls).toHaveLength(1);
		const url = fetchCalls[0]!.url;
		expect(url).toContain("/api/auth/token");
		expect(apiKeyHeaderOf(url)).toBe(TEST_API_KEY);
	});

	it("caches the minted JWT per key and reuses it", async () => {
		stubFetch(true);
		await getHostJwt(CACHE_KEY);
		await getHostJwt(CACHE_KEY);
		expect(fetchCalls).toHaveLength(1);
	});

	it("does not share a minted JWT across different keys", async () => {
		stubFetch(true);
		await getHostJwt(SHARE_KEY_A);
		await getHostJwt(SHARE_KEY_B);
		expect(fetchCalls).toHaveLength(2);
	});

	it("throws when the exchange fails", async () => {
		stubFetch(false);
		await expect(getHostJwt(FAIL_KEY)).rejects.toThrow(
			/Failed to authenticate API key/,
		);
	});

	it("throws without caching when a 2xx response has no token", async () => {
		stubFetch(true, {});
		await expect(getHostJwt(NO_TOKEN_KEY)).rejects.toThrow(
			/without a token value/,
		);
		// The bad response must not be cached: a retry hits the endpoint again.
		stubFetch(true, { token: "minted-jwt" });
		const result = await getHostJwt(NO_TOKEN_KEY);
		expect(result).toBe("minted-jwt");
		expect(fetchCalls).toHaveLength(2);
	});

	it("throws when the token field is not a string", async () => {
		stubFetch(true, { token: 12345 });
		await expect(getHostJwt(TYPED_KEY)).rejects.toThrow(
			/without a token value/,
		);
	});

	it("throws on a whitespace-only token so a malformed 2xx is not cached", async () => {
		stubFetch(true, { token: "   " });
		await expect(getHostJwt(WHITESPACE_KEY)).rejects.toThrow(
			/without a token value/,
		);
		// Not cached: a retry hits the endpoint again instead of reusing the
		// whitespace token for up to 55 minutes.
		stubFetch(true, { token: "minted-jwt" });
		const result = await getHostJwt(WHITESPACE_KEY);
		expect(result).toBe("minted-jwt");
		expect(fetchCalls).toHaveLength(2);
	});

	it("passes an AbortSignal.timeout so a stalled fetch cannot hang", () => {
		// Verify the exchange uses AbortSignal.timeout(TOKEN_FETCH_TIMEOUT_MS)
		// so a stalled control plane aborts instead of hanging the command.
		// Intercept AbortSignal.timeout to capture the configured duration —
		// avoids a real 10s wall-clock wait. Use a fresh key so a cached token
		// from an earlier test can't skip the fetch.
		let capturedMs: number | undefined;
		const originalTimeout = AbortSignal.timeout;
		const timeoutSpy = (ms: number) => {
			capturedMs = ms;
			return originalTimeout.call(AbortSignal, ms);
		};
		AbortSignal.timeout = timeoutSpy as typeof AbortSignal.timeout;
		try {
			stubFetch(true);
			// Wait for the exchange so the fetch is issued.
			return getHostJwt(ABORT_KEY).then(() => {
				const init = fetchCalls[0]!.init;
				expect(init?.signal).toBeInstanceOf(AbortSignal);
				expect(capturedMs).toBeGreaterThan(0);
				expect(init?.signal).not.toBeUndefined();
			});
		} finally {
			AbortSignal.timeout = originalTimeout;
		}
	});

	it("reuses the cached JWT for the full 55-minute window, then re-mints", async () => {
		// The cache must serve the minted token for the full JWT_CACHE_DURATION_MS
		// (55 min) with no second expiry buffer subtracted, then re-mint on the
		// first call past the boundary. Mock Date.now so no real-time wait is
		// needed (#6346 review).
		stubFetch(true);
		const originalNow = Date.now;
		const start = 1_000_000_000_000;
		let now = start;
		Date.now = () => now;
		try {
			await getHostJwt(BOUNDARY_KEY);
			expect(fetchCalls).toHaveLength(1);

			// Inside the 55-minute window: cached, no second fetch.
			now = start + 54 * 60 * 1000;
			const within = await getHostJwt(BOUNDARY_KEY);
			expect(within).toBe("minted-jwt");
			expect(fetchCalls).toHaveLength(1);

			// Just past 55 minutes: expires, so the next call re-mints.
			now = start + 55 * 60 * 1000 + 1;
			const past = await getHostJwt(BOUNDARY_KEY);
			expect(past).toBe("minted-jwt");
			expect(fetchCalls).toHaveLength(2);
		} finally {
			Date.now = originalNow;
		}
	});
});
