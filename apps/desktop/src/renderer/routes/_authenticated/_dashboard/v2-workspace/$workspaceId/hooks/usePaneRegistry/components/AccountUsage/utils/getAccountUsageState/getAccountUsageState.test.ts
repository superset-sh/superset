import { describe, expect, test } from "bun:test";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { getAccountUsageState } from "./getAccountUsageState";

const now = Date.now();
const account: UsageAccount = {
	agent: "claude",
	credentialKind: "subscription",
	selection: null,
	accountKey: "alice",
	email: "alice@example.com",
	plan: "max",
	status: "ok",
	statusDetail: null,
	sourceLabel: "default",
	windows: [
		{
			id: "five_hour",
			label: "Session",
			usedPercent: 25,
			resetsAt: new Date(now + 3600000),
		},
		{
			id: "seven_day_sonnet",
			label: "Sonnet",
			usedPercent: 99,
			resetsAt: new Date(now + 3600000),
		},
	],
	isDefault: true,
	creditsBalance: null,
	extraUsage: null,
	fetchedAt: new Date(now),
};
const input = {
	supported: true,
	identity: {
		agent: "claude" as const,
		selection: null,
		credentialKind: "subscription" as const,
		email: "alice@example.com",
	},
	accounts: [account],
	loading: false,
	failed: false,
	now,
};
describe("pane quota selection", () => {
	test("uses the bound account even when another login is the default", () => {
		const result = getAccountUsageState({
			...input,
			accounts: [
				{ ...account, selection: "/work", accountKey: "work" },
				{ ...account, isDefault: false },
			],
		});
		expect(result.account?.accountKey).toBe("alice");
		expect(result.state).toBe("ready");
	});
	test("does not substitute the default for unknown or changed logins", () => {
		expect(getAccountUsageState({ ...input, identity: null }).state).toBe(
			"unverified",
		);
		expect(
			getAccountUsageState({
				...input,
				identity: { ...input.identity, email: "bob@example.com" },
			}).account,
		).toBeUndefined();
	});
	test("model-specific caps do not set the general usage severity", () => {
		expect(getAccountUsageState(input).tightest?.usedPercent).toBe(25);
	});
	test("reset, old observations and provider failures are stale", () => {
		expect(getAccountUsageState({ ...input, now: now + 3600001 }).state).toBe(
			"stale",
		);
		expect(getAccountUsageState({ ...input, now: now + 600001 }).state).toBe(
			"stale",
		);
		expect(getAccountUsageState({ ...input, failed: true }).state).toBe(
			"stale",
		);
	});
	test("API billing never receives a subscription meter", () => {
		const result = getAccountUsageState({
			...input,
			identity: { ...input.identity, credentialKind: "api_key" },
		});
		expect(result.state).toBe("api");
		expect(result.account).toBeUndefined();
	});
	test("unsupported agents and missing quota are not zero usage", () => {
		expect(getAccountUsageState({ ...input, supported: false }).state).toBe(
			"unavailable",
		);
		expect(getAccountUsageState({ ...input, accounts: [] }).state).toBe(
			"unavailable",
		);
	});
});
