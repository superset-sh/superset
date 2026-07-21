import { describe, expect, test } from "bun:test";
import { collectCodexUsage, parseCodexUsageResponse } from "./codex";

describe("parseCodexUsageResponse", () => {
	test("maps primary and secondary Codex windows", () => {
		expect(
			parseCodexUsageResponse({
				rate_limit: {
					primary_window: {
						used_percent: 28,
						limit_window_seconds: 18_000,
						reset_at: 1_774_119_600,
					},
					secondary_window: {
						used_percent: 55,
						limit_window_seconds: 604_800,
						reset_at: 1_774_407_720,
					},
				},
			}),
		).toEqual([
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
		]);
	});

	test("returns only valid windows and clamps percentages", () => {
		expect(
			parseCodexUsageResponse({
				rate_limit: {
					primary_window: {
						used_percent: 125,
						limit_window_seconds: 3_600,
					},
					secondary_window: { used_percent: "unknown" },
				},
			}),
		).toEqual([
			{
				id: "primary",
				label: "1 hour",
				usedPercent: 100,
				remainingPercent: 0,
				resetAt: null,
				windowSeconds: 3_600,
			},
		]);
		expect(parseCodexUsageResponse({})).toEqual([]);
	});
});

describe("collectCodexUsage", () => {
	test("calls only the ChatGPT quota endpoint and never returns credentials", async () => {
		let requestUrl = "";
		let requestInit: RequestInit | undefined;
		const result = await collectCodexUsage({
			readCredentials: async () => ({
				accessToken: "codex-secret-token",
				accountId: "account-123",
			}),
			fetchUsage: async (url, init) => {
				requestUrl = url;
				requestInit = init;
				return new Response(
					JSON.stringify({
						email: "coder@example.com",
						rate_limit: {
							primary_window: { used_percent: 20 },
						},
					}),
					{ status: 200 },
				);
			},
		});

		expect(requestUrl).toBe("https://chatgpt.com/backend-api/wham/usage");
		expect(requestInit?.method).toBe("GET");
		expect(requestInit?.redirect).toBe("error");
		const headers = new Headers(requestInit?.headers);
		expect(headers.get("authorization")).toBe("Bearer codex-secret-token");
		expect(headers.get("chatgpt-account-id")).toBe("account-123");
		expect(result.status).toBe("ok");
		expect(result.accountLabel).toBe("coder@example.com");
		expect(JSON.stringify(result)).not.toContain("codex-secret-token");
	});

	test("does not make a request when Codex is not configured", async () => {
		let requestCount = 0;
		const result = await collectCodexUsage({
			readCredentials: async () => null,
			fetchUsage: async () => {
				requestCount += 1;
				return new Response();
			},
		});

		expect(requestCount).toBe(0);
		expect(result.status).toBe("not-configured");
	});

	test("turns malformed responses into a safe unavailable state", async () => {
		const result = await collectCodexUsage({
			readCredentials: async () => ({
				accessToken: "secret",
				accountId: null,
			}),
			fetchUsage: async () =>
				new Response(JSON.stringify({ rate_limit: null }), { status: 200 }),
		});

		expect(result).toMatchObject({
			status: "unavailable",
			windows: [],
			errorMessage: "Codex usage is temporarily unavailable.",
		});
	});
});
