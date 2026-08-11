import { describe, expect, test } from "bun:test";
import { collectCodexUsage, parseCodexUsageResponse } from "./codex";
import type { CodexIdentity, codexProfileStore } from "./codex-profiles";

function emptyProfileStore(): typeof codexProfileStore {
	return {
		activeAuthPath: "/tmp/auth.json",
		activeIdentity: () => null,
		listProfiles: async () => [],
		importActive: async () => {
			throw new Error("not used");
		},
		activate: async () => {
			throw new Error("not used");
		},
		getSnapshot: () => null,
		putSnapshot: async () => {},
		accountRows: async () => [],
		addViaIsolatedLogin: async () => {
			throw new Error("not used");
		},
	};
}

describe("parseCodexUsageResponse", () => {
	test("maps the official app-server rate-limit response", () => {
		expect(
			parseCodexUsageResponse({
				rateLimits: {
					planType: "pro",
					primary: {
						usedPercent: 28,
						windowDurationMins: 300,
						resetsAt: 1_774_119_600,
					},
					secondary: {
						usedPercent: 55,
						windowDurationMins: 10_080,
						resetsAt: 1_774_407_720,
					},
				},
			}),
		).toEqual({
			accountLabel: "PRO",
			planLabel: "PRO",
			windows: [
				{
					id: "primary",
					label: "5 hour",
					usedPercent: 28,
					remainingPercent: 72,
					resetAt: 1_774_119_600_000,
					windowSeconds: 18_000,
				},
				{
					id: "secondary",
					label: "Weekly",
					usedPercent: 55,
					remainingPercent: 45,
					resetAt: 1_774_407_720_000,
					windowSeconds: 604_800,
				},
			],
		});
	});

	test("prefers the named Codex bucket and clamps percentages", () => {
		expect(
			parseCodexUsageResponse({
				rateLimits: { primary: { usedPercent: 10 } },
				rateLimitsByLimitId: {
					codex: {
						primary: {
							usedPercent: 125,
							windowDurationMins: 60,
						},
						secondary: { usedPercent: "unknown" },
					},
				},
			}),
		).toEqual({
			accountLabel: null,
			planLabel: null,
			windows: [
				{
					id: "primary",
					label: "1 hour",
					usedPercent: 100,
					remainingPercent: 0,
					resetAt: null,
					windowSeconds: 3_600,
				},
			],
		});
		expect(parseCodexUsageResponse({})).toEqual({
			accountLabel: null,
			planLabel: null,
			windows: [],
		});
	});
});

describe("collectCodexUsage", () => {
	test("uses only the local Codex app-server result", async () => {
		let readCount = 0;
		const result = await collectCodexUsage({
			profileStore: emptyProfileStore(),
			readRateLimits: async () => {
				readCount += 1;
				return {
					status: "ok",
					value: {
						rateLimits: {
							planType: "pro",
							primary: { usedPercent: 20 },
						},
					},
				};
			},
		});

		expect(readCount).toBe(1);
		expect(result.status).toBe("ok");
		expect(result.accountLabel).toBe("PRO");
		expect(JSON.stringify(result)).not.toContain("accessToken");
	});

	test("reports Codex as not configured when the executable is absent", async () => {
		const result = await collectCodexUsage({
			profileStore: emptyProfileStore(),
			readRateLimits: async () => ({ status: "not-configured" }),
		});

		expect(result.status).toBe("not-configured");
	});

	test("turns app-server failures into a safe unavailable state", async () => {
		const result = await collectCodexUsage({
			profileStore: emptyProfileStore(),
			readRateLimits: async () => ({ status: "unavailable" }),
		});

		expect(result).toMatchObject({
			status: "unavailable",
			windows: [],
			errorMessage: "Codex usage is temporarily unavailable.",
		});
	});

	test("does not cache a live reading when the active account changes mid-poll", async () => {
		const firstIdentity: CodexIdentity = {
			accountId: "acct_a",
			email: "first@example.com",
			plan: "pro",
		};
		const secondIdentity: CodexIdentity = {
			accountId: "acct_b",
			email: "second@example.com",
			plan: "pro",
		};
		const snapshots: string[] = [];
		let identityReads = 0;
		const store: typeof codexProfileStore = {
			...emptyProfileStore(),
			activeIdentity: () => {
				identityReads += 1;
				return identityReads === 1 ? firstIdentity : secondIdentity;
			},
			putSnapshot: async (snapshot) => {
				snapshots.push(snapshot.accountId);
			},
			accountRows: async () => [
				{
					id: "codex:acct_b",
					providerId: "codex",
					profileName: "second-example-com",
					accountLabel: "second@example.com",
					planLabel: "pro",
					isActive: true,
					status: "no-data",
					statusMessage: "Use Codex once to record limits",
					windows: [],
				},
			],
		};

		const result = await collectCodexUsage({
			profileStore: store,
			readRateLimits: async () => ({
				status: "ok",
				value: {
					rateLimits: {
						planType: "pro",
						primary: { usedPercent: 20 },
					},
				},
			}),
		});

		expect(snapshots).toEqual([]);
		expect(result.activeAccountId).toBe("codex:acct_b");
		expect(result.windows).toEqual([]);
		expect(result.accounts[0]?.accountLabel).toBe("second@example.com");
	});
});
