import { describe, expect, test } from "bun:test";
import type { ProviderUsage } from "lib/trpc/routers/provider-usage.schema";
import { createProviderUsageCollector } from ".";

const claudeUsage: ProviderUsage = {
	providerId: "claude",
	providerName: "Claude",
	status: "ok",
	accountLabel: "Max",
	windows: [],
	errorMessage: null,
};

const codexUsage: ProviderUsage = {
	providerId: "codex",
	providerName: "Codex",
	status: "ok",
	accountLabel: "Pro",
	windows: [],
	errorMessage: null,
};

describe("createProviderUsageCollector", () => {
	test("caches snapshots for five minutes and supports forced refresh", async () => {
		let now = 1_000;
		let claudeCalls = 0;
		let codexCalls = 0;
		const collect = createProviderUsageCollector({
			now: () => now,
			collectClaude: async () => {
				claudeCalls += 1;
				return claudeUsage;
			},
			collectCodex: async () => {
				codexCalls += 1;
				return codexUsage;
			},
		});

		const first = await collect();
		now += 299_999;
		const cached = await collect();
		const forced = await collect({ force: true });

		expect(cached).toBe(first);
		expect(forced).not.toBe(first);
		expect(claudeCalls).toBe(2);
		expect(codexCalls).toBe(2);
	});

	test("refreshes when the five-minute cache expires", async () => {
		let now = 1_000;
		let calls = 0;
		const collect = createProviderUsageCollector({
			now: () => now,
			collectClaude: async () => {
				calls += 1;
				return claudeUsage;
			},
			collectCodex: async () => codexUsage,
		});

		await collect();
		now += 300_000;
		await collect();

		expect(calls).toBe(2);
	});

	test("deduplicates simultaneous collection", async () => {
		let resolveClaude: ((usage: ProviderUsage) => void) | undefined;
		let claudeCalls = 0;
		const collect = createProviderUsageCollector({
			now: () => 1_000,
			collectClaude: () => {
				claudeCalls += 1;
				return new Promise((resolve) => {
					resolveClaude = resolve;
				});
			},
			collectCodex: async () => codexUsage,
		});

		const first = collect();
		const second = collect();
		resolveClaude?.(claudeUsage);

		expect(await second).toBe(await first);
		expect(claudeCalls).toBe(1);
	});
});
