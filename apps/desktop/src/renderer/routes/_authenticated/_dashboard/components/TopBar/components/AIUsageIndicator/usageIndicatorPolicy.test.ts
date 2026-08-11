import { describe, expect, test } from "bun:test";
import type { ProviderUsage } from "lib/trpc/routers/provider-usage.schema";
import {
	defaultUsageMetricSelection,
	formatResetLabel,
	getLowestRemainingPercent,
	getLowestSelectedRemainingPercent,
	getMenuBarSummaryParts,
	getPrimaryWindow,
	getProviderUsageRefetchInterval,
	shouldQueryProviderUsage,
} from "./usageIndicatorPolicy";

const provider: ProviderUsage = {
	providerId: "claude",
	providerName: "Claude",
	status: "ok",
	accountLabel: "Max",
	activeAccountId: "claude:max",
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
	accounts: [
		{
			id: "claude:max",
			providerId: "claude",
			profileName: "max",
			accountLabel: "Max",
			planLabel: "Max",
			isActive: true,
			status: "ok",
			statusMessage: null,
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
		},
	],
	errorMessage: null,
};

describe("usageIndicatorPolicy", () => {
	test("keeps provider network calls cold until the meter is opened", () => {
		expect(shouldQueryProviderUsage(false)).toBe(false);
		expect(getProviderUsageRefetchInterval(false)).toBe(false);
		expect(shouldQueryProviderUsage(true)).toBe(true);
		expect(getProviderUsageRefetchInterval(true)).toBe(5 * 60_000);
	});

	test("uses the shortest provider window for the compact runway", () => {
		expect(getPrimaryWindow(provider)?.id).toBe("five-hour");
	});

	test("shows the lowest remaining primary capacity across active providers", () => {
		const codex: ProviderUsage = {
			...provider,
			providerId: "codex",
			providerName: "Codex",
			activeAccountId: "codex:pro",
			windows: provider.windows.map((window) => ({
				...window,
				remainingPercent: window.id === "five-hour" ? 38 : 60,
			})),
			accounts: [
				{
					id: "codex:pro",
					providerId: "codex",
					profileName: "pro",
					accountLabel: "person@example.com",
					planLabel: "pro",
					isActive: true,
					status: "ok",
					statusMessage: null,
					windows: provider.windows.map((window) => ({
						...window,
						remainingPercent: window.id === "five-hour" ? 38 : 60,
					})),
				},
			],
		};
		expect(getLowestRemainingPercent([provider, codex])).toBe(38);
		expect(
			getLowestRemainingPercent([
				{ ...provider, status: "not-configured", windows: [] },
			]),
		).toBeNull();
	});

	test("defaults the compact summary to Claude 5-hour and Codex weekly", () => {
		const codex: ProviderUsage = {
			...provider,
			providerId: "codex",
			providerName: "Codex",
			activeAccountId: "codex:pro",
			windows: [
				{
					id: "primary",
					label: "Weekly",
					usedPercent: 60,
					remainingPercent: 40,
					resetAt: null,
					windowSeconds: 604_800,
				},
				{
					id: "secondary",
					label: "5h",
					usedPercent: 90,
					remainingPercent: 10,
					resetAt: null,
					windowSeconds: 18_000,
				},
			],
			accounts: [],
		};

		expect(getMenuBarSummaryParts([provider, codex])).toEqual(["A 72", "C 40"]);
		expect(
			getLowestSelectedRemainingPercent(
				[provider, codex],
				defaultUsageMetricSelection,
			),
		).toBe(40);
	});

	test("can include weekly and Fable-style limits when selected", () => {
		const providerWithFable: ProviderUsage = {
			...provider,
			windows: [
				...provider.windows,
				{
					id: "limit:weekly_model:fable",
					label: "Fable wk",
					usedPercent: 64,
					remainingPercent: 36,
					resetAt: null,
					windowSeconds: 604_800,
				},
			],
		};

		expect(
			getMenuBarSummaryParts([providerWithFable], {
				showsClaudeFiveHour: true,
				showsClaudeWeekly: true,
				showsClaudeFable: true,
				showsCodexWeekly: false,
			}),
		).toEqual(["A 5h 72", "W 45", "F 36"]);
	});

	test("formats relative and exact reset time together", () => {
		const now = Date.parse("2026-07-21T14:48:00.000Z");
		const resetAt = Date.parse("2026-07-21T18:30:00.000Z");
		expect(formatResetLabel(resetAt, now, "UTC")).toBe(
			"3h 42m · Jul 21, 6:30 PM",
		);
	});
});
