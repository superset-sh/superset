import { describe, expect, it } from "bun:test";
import { fetchOllamaAccounts, parseOllamaUsage } from "./ollama-quota";

describe("parseOllamaUsage", () => {
	it("maps the monthly fraction to a percent", () => {
		expect(
			parseOllamaUsage({
				activity: { cost: "0.00000", models: [] },
				limits: { monthly: { usage: 0.42, models: [] } },
			}),
		).toEqual({
			windows: [
				{ id: "monthly", label: "Monthly", usedPercent: 42, resetsAt: null },
			],
		});
	});

	it("accepts a zero usage", () => {
		expect(
			parseOllamaUsage({ limits: { monthly: { usage: 0, models: [] } } }),
		)?.toMatchObject({ windows: [{ id: "monthly", usedPercent: 0 }] });
	});

	it("returns null for missing or odd-shaped limits", () => {
		expect(parseOllamaUsage(null)).toBeNull();
		expect(parseOllamaUsage([])).toBeNull();
		expect(parseOllamaUsage({})).toBeNull();
		expect(parseOllamaUsage({ limits: null })).toBeNull();
		expect(parseOllamaUsage({ limits: { monthly: {} } })).toBeNull();
		expect(
			parseOllamaUsage({ limits: { monthly: { usage: "lots" } } }),
		).toBeNull();
		expect(
			parseOllamaUsage({ limits: { monthly: { usage: Number.NaN } } }),
		).toBeNull();
		// Unknown window shapes are ignored, not guessed at.
		expect(parseOllamaUsage({ limits: { session: { usage: 0.5 } } })).toBeNull();
	});

	it("clamps out-of-range fractions", () => {
		expect(
			parseOllamaUsage({ limits: { monthly: { usage: 2 } } }),
		)?.toMatchObject({ windows: [{ usedPercent: 100 }] });
		expect(
			parseOllamaUsage({ limits: { monthly: { usage: -1 } } }),
		)?.toMatchObject({ windows: [{ usedPercent: 0 }] });
	});
});

describe("fetchOllamaAccounts", () => {
	it("returns no accounts without a key", async () => {
		await expect(fetchOllamaAccounts(null)).resolves.toEqual([]);
	});

	it("maps a usage response to session and weekly windows", async () => {
		const seen: Record<string, string> = {};
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (_url: unknown, init?: { headers?: unknown }) => {
			for (const [key, value] of Object.entries(
				(init?.headers ?? {}) as Record<string, string>,
			)) {
				seen[key] = value;
			}
			return new Response(
				JSON.stringify({
					limits: { monthly: { usage: 0.42, models: [] } },
				}),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;
		try {
			const accounts = await fetchOllamaAccounts("key-123");
			expect(seen["Authorization"]).toBe("Bearer key-123");
			expect(accounts).toHaveLength(1);
			expect(accounts[0]).toMatchObject({
				agent: "ollama",
				credentialKind: "api_key",
				status: "ok",
			});
			expect(accounts[0]?.windows).toEqual([
				{ id: "monthly", label: "Monthly", usedPercent: 42, resetsAt: null },
			]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("reports token_expired on 401 without retrying", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
		try {
			const accounts = await fetchOllamaAccounts("bad-key");
			expect(accounts[0]).toMatchObject({ status: "token_expired" });
			expect(accounts[0]?.windows).toEqual([]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("reports unavailable when the network fails", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			throw new Error("fetch failed");
		}) as unknown as typeof fetch;
		try {
			const accounts = await fetchOllamaAccounts("key-123");
			expect(accounts[0]).toMatchObject({
				status: "unavailable",
				statusDetail: "fetch failed",
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
