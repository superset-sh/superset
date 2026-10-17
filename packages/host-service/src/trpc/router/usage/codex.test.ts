import { afterEach, expect, it, mock, spyOn } from "bun:test";
import { fetchCodexSubscriptionQuota } from "./codex";

const usage = (availableCount: number) => ({
	rate_limit: { primary_window: { used_percent: 25 } },
	rate_limit_reset_credits: { available_count: availableCount },
});

const mockFetch = (
	implementation: (input: Parameters<typeof fetch>[0]) => Promise<Response>,
) =>
	spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(implementation, { preconnect: globalThis.fetch.preconnect }),
	);

afterEach(() => {
	mock.restore();
});

it("shows the usage count and earliest available expiry", async () => {
	const early = new Date(Date.now() + 60_000);
	const late = new Date(Date.now() + 120_000);
	mockFetch(async (input) =>
		String(input).endsWith("rate-limit-reset-credits")
			? Response.json({
					available_count: 2,
					credits: [
						{ status: "available", expires_at: late.toISOString() },
						{ status: "available", expires_at: early.toISOString() },
						{ status: "redeemed", expires_at: early.toISOString() },
					],
				})
			: Response.json(usage(2)),
	);

	const quota = await fetchCodexSubscriptionQuota("token", undefined, true);
	expect(quota.resetCredits).toEqual({
		availableCount: 2,
		nextExpiresAt: early,
	});
});

it("keeps the count when expiry details fail", async () => {
	const fetchSpy = mockFetch(async (input) =>
		String(input).endsWith("rate-limit-reset-credits")
			? new Response(null, { status: 500 })
			: Response.json(usage(2)),
	);

	const quota = await fetchCodexSubscriptionQuota("token", undefined, true);
	expect(quota.resetCredits).toEqual({
		availableCount: 2,
		nextExpiresAt: null,
	});
	expect(fetchSpy).toHaveBeenCalledTimes(2);
});

it("does not trust expiry details from a different count snapshot", async () => {
	mockFetch(async (input) =>
		String(input).endsWith("rate-limit-reset-credits")
			? Response.json({
					available_count: 1,
					credits: [
						{
							status: "available",
							expires_at: new Date(Date.now() + 60_000).toISOString(),
						},
					],
				})
			: Response.json(usage(2)),
	);

	const quota = await fetchCodexSubscriptionQuota("token", undefined, true);
	expect(quota.resetCredits).toEqual({
		availableCount: 2,
		nextExpiresAt: null,
	});
});

it("skips expiry details when no resets are available", async () => {
	const fetchSpy = mockFetch(async () => Response.json(usage(0)));
	const zero = await fetchCodexSubscriptionQuota("token", undefined, true);
	expect(zero.resetCredits).toEqual({ availableCount: 0, nextExpiresAt: null });
	expect(fetchSpy).toHaveBeenCalledTimes(1);
});
