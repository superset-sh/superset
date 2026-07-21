import { describe, expect, test } from "bun:test";
import type { ProviderUsage } from "lib/trpc/routers/provider-usage.schema";
import {
	formatResetLabel,
	getLowestRemainingPercent,
	getPrimaryWindow,
} from "./usageIndicatorPolicy";

const provider: ProviderUsage = {
	providerId: "claude",
	providerName: "Claude",
	status: "ok",
	accountLabel: "Max",
	windows: [
		{
			id: "weekly",
			label: "Weekly",
			usedPercent: 55,
			remainingPercent: 45,
			resetAt: null,
			windowSeconds: 604_800,
		},
		{
			id: "five-hour",
			label: "5 hour",
			usedPercent: 28,
			remainingPercent: 72,
			resetAt: null,
			windowSeconds: 18_000,
		},
	],
	errorMessage: null,
};

describe("usageIndicatorPolicy", () => {
	test("uses the shortest provider window for the compact runway", () => {
		expect(getPrimaryWindow(provider)?.id).toBe("five-hour");
	});

	test("shows the lowest remaining primary capacity across active providers", () => {
		const codex: ProviderUsage = {
			...provider,
			providerId: "codex",
			providerName: "Codex",
			windows: provider.windows.map((window) => ({
				...window,
				remainingPercent: window.id === "five-hour" ? 38 : 60,
			})),
		};
		expect(getLowestRemainingPercent([provider, codex])).toBe(38);
		expect(
			getLowestRemainingPercent([
				{ ...provider, status: "not-configured", windows: [] },
			]),
		).toBeNull();
	});

	test("formats relative and exact reset time together", () => {
		const now = Date.parse("2026-07-21T14:48:00.000Z");
		const resetAt = Date.parse("2026-07-21T18:30:00.000Z");
		expect(formatResetLabel(resetAt, now, "UTC")).toBe(
			"3h 42m · Jul 21, 6:30 PM",
		);
	});
});
