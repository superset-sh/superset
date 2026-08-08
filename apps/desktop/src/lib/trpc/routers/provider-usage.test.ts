import { describe, expect, test } from "bun:test";
import { createProviderUsageRouter } from "./provider-usage";
import type { ProviderUsageSnapshot } from "./provider-usage.schema";

const snapshot: ProviderUsageSnapshot = {
	providers: [
		{
			providerId: "claude",
			providerName: "Claude",
			status: "ok",
			accountLabel: "Max",
			windows: [],
			errorMessage: null,
		},
	],
	collectedAt: 1_000,
};

describe("providerUsage router", () => {
	test("returns a validated snapshot and forwards forced refresh", async () => {
		let force = false;
		const usageRouter = createProviderUsageRouter(async (options) => {
			force = options?.force ?? false;
			return snapshot;
		});
		const caller = usageRouter.createCaller({});

		expect(await caller.getSnapshot({ force: true })).toEqual(snapshot);
		expect(force).toBe(true);
	});

	test("strips fields outside the renderer contract", async () => {
		const usageRouter = createProviderUsageRouter(async () => {
			return {
				...snapshot,
				providers: snapshot.providers.map((provider) => ({
					...provider,
					accessToken: "must-never-reach-renderer",
				})),
			} as ProviderUsageSnapshot;
		});
		const caller = usageRouter.createCaller({});

		const result = await caller.getSnapshot();
		expect(result.providers[0]).not.toHaveProperty("accessToken");
		expect(JSON.stringify(result)).not.toContain("must-never-reach-renderer");
	});
});
