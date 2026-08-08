import { describe, expect, test } from "bun:test";
import {
	collectClaudeUsage,
	createClaudeCredentialReader,
	parseClaudeUsageResponse,
} from "./claude";

describe("parseClaudeUsageResponse", () => {
	test("maps the five-hour and weekly windows to remaining capacity", () => {
		expect(
			parseClaudeUsageResponse({
				five_hour: {
					utilization: 37,
					resets_at: "2026-07-21T18:30:00.000Z",
				},
				seven_day: {
					utilization: 61,
					resets_at: "2026-07-25T09:02:00.000Z",
				},
			}),
		).toEqual([
			{
				id: "five_hour",
				label: "5 hour",
				usedPercent: 37,
				remainingPercent: 63,
				resetAt: Date.parse("2026-07-21T18:30:00.000Z"),
				windowSeconds: 18_000,
			},
			{
				id: "seven_day",
				label: "Weekly",
				usedPercent: 61,
				remainingPercent: 39,
				resetAt: Date.parse("2026-07-25T09:02:00.000Z"),
				windowSeconds: 604_800,
			},
		]);
	});

	test("ignores malformed buckets and clamps provider percentages", () => {
		expect(
			parseClaudeUsageResponse({
				five_hour: { utilization: -8, resets_at: "not-a-date" },
				seven_day: { utilization: 140, resets_at: null },
				seven_day_sonnet: { utilization: 50 },
			}),
		).toEqual([
			{
				id: "five_hour",
				label: "5 hour",
				usedPercent: 0,
				remainingPercent: 100,
				resetAt: null,
				windowSeconds: 18_000,
			},
			{
				id: "seven_day",
				label: "Weekly",
				usedPercent: 100,
				remainingPercent: 0,
				resetAt: null,
				windowSeconds: 604_800,
			},
		]);
		expect(parseClaudeUsageResponse(null)).toEqual([]);
	});
});

describe("collectClaudeUsage", () => {
	test("calls only the Anthropic quota endpoint and never returns credentials", async () => {
		let requestUrl = "";
		let requestInit: RequestInit | undefined;
		const result = await collectClaudeUsage({
			readCredentials: async () => ({
				accessToken: "claude-secret-token",
				accountLabel: "Max",
				expiresAt: null,
			}),
			fetchUsage: async (url, init) => {
				requestUrl = url;
				requestInit = init;
				return new Response(
					JSON.stringify({ five_hour: { utilization: 25 } }),
					{ status: 200 },
				);
			},
		});

		expect(requestUrl).toBe("https://api.anthropic.com/api/oauth/usage");
		expect(requestInit?.method).toBe("GET");
		expect(requestInit?.redirect).toBe("error");
		expect(new Headers(requestInit?.headers).get("authorization")).toBe(
			"Bearer claude-secret-token",
		);
		expect(result.status).toBe("ok");
		expect(result.accountLabel).toBe("Max");
		expect(JSON.stringify(result)).not.toContain("claude-secret-token");
	});

	test("does not make a request when Claude Code is not configured", async () => {
		let requestCount = 0;
		const result = await collectClaudeUsage({
			readCredentials: async () => null,
			fetchUsage: async () => {
				requestCount += 1;
				return new Response();
			},
		});

		expect(requestCount).toBe(0);
		expect(result.status).toBe("not-configured");
	});

	test("turns provider failures into a safe unavailable state", async () => {
		const result = await collectClaudeUsage({
			readCredentials: async () => ({
				accessToken: "secret",
				accountLabel: null,
				expiresAt: null,
			}),
			fetchUsage: async () => new Response(null, { status: 429 }),
		});

		expect(result).toMatchObject({
			status: "unavailable",
			windows: [],
			errorMessage: "Claude usage is temporarily unavailable.",
		});
	});
});

describe("createClaudeCredentialReader", () => {
	test("re-reads the macOS Keychain so account switches are detected", async () => {
		let keychainReads = 0;
		let fileReads = 0;
		const readCredentials = createClaudeCredentialReader({
			platform: "darwin",
			now: () => 1_000,
			readKeychain: async () => {
				keychainReads += 1;
				return {
					accessToken: "keychain-token",
					accountLabel: "Max",
					expiresAt: 2_000,
				};
			},
			readSupersetCredentials: async () => {
				fileReads += 1;
				return {
					apiKey: "managed-token",
					kind: "oauth",
					source: "auth-storage",
					expiresAt: 2_000,
				};
			},
		});

		expect(await readCredentials()).toEqual({
			accessToken: "keychain-token",
			accountLabel: "Max",
			expiresAt: 2_000,
		});
		expect(await readCredentials()).toEqual({
			accessToken: "keychain-token",
			accountLabel: "Max",
			expiresAt: 2_000,
		});
		expect(keychainReads).toBe(2);
		expect(fileReads).toBe(0);
	});

	test("uses Superset's managed credential resolver when Keychain has no login", async () => {
		const readCredentials = createClaudeCredentialReader({
			platform: "darwin",
			now: () => 1_000,
			readKeychain: async () => null,
			readSupersetCredentials: async () => ({
				apiKey: "managed-token",
				kind: "oauth",
				source: "auth-storage",
				expiresAt: 2_000,
			}),
		});

		expect((await readCredentials())?.accessToken).toBe("managed-token");
	});

	test("never returns an expired OAuth token", async () => {
		const readCredentials = createClaudeCredentialReader({
			platform: "darwin",
			now: () => 2_000,
			readKeychain: async () => ({
				accessToken: "expired-keychain-token",
				accountLabel: "Max",
				expiresAt: 1_000,
			}),
			readSupersetCredentials: async () => ({
				apiKey: "expired-managed-token",
				kind: "oauth",
				source: "auth-storage",
				expiresAt: 1_500,
			}),
		});

		expect(await readCredentials()).toBeNull();
	});

	test("does not use API keys with the OAuth-only usage endpoint", async () => {
		const readCredentials = createClaudeCredentialReader({
			platform: "linux",
			now: () => 1_000,
			readKeychain: async () => null,
			readSupersetCredentials: async () => ({
				apiKey: "anthropic-api-key",
				kind: "apiKey",
				source: "config",
			}),
		});

		expect(await readCredentials()).toBeNull();
	});
});
