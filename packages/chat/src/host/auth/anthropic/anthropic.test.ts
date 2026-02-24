import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	clearAnthropicOAuthRefreshState,
	getCredentialsFromConfig,
	getOrRefreshAnthropicOAuthCredentials,
} from "./anthropic";

const tempDirs: string[] = [];

function createConfigFile(config: Record<string, unknown>): string {
	const dir = mkdtempSync(join(tmpdir(), "anthropic-auth-"));
	tempDirs.push(dir);
	const file = join(dir, "credentials.json");
	writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
	return file;
}

afterEach(() => {
	clearAnthropicOAuthRefreshState();
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("getCredentialsFromConfig", () => {
	it("parses claudeAiOauth credentials", () => {
		const configPath = createConfigFile({
			claudeAiOauth: {
				accessToken: "access-1",
				refreshToken: "refresh-1",
				expiresAt: 1_800_000_000,
			},
		});

		const result = getCredentialsFromConfig({ configPaths: [configPath] });

		expect(result?.kind).toBe("oauth");
		if (result?.kind !== "oauth") return;
		expect(result.apiKey).toBe("access-1");
		expect(result.refreshToken).toBe("refresh-1");
		expect(result.expiresAt).toBe(1_800_000_000_000);
		expect(result.configPath).toBe(configPath);
	});

	it("parses api key credentials", () => {
		const configPath = createConfigFile({
			apiKey: "sk-ant-123",
		});

		const result = getCredentialsFromConfig({ configPaths: [configPath] });
		expect(result).toEqual({
			apiKey: "sk-ant-123",
			source: "config",
			kind: "apiKey",
		});
	});
});

describe("getOrRefreshAnthropicOAuthCredentials", () => {
	it("does not refresh when token is still valid", async () => {
		const now = 1_700_000_000_000;
		const configPath = createConfigFile({
			claudeAiOauth: {
				accessToken: "still-valid",
				refreshToken: "refresh-1",
				expiresAt: now + 10 * 60 * 1000,
			},
		});
		const fetchImpl = mock(async () => {
			throw new Error("fetch should not be called");
		});

		const result = await getOrRefreshAnthropicOAuthCredentials({
			configPaths: [configPath],
			fetchImpl: fetchImpl as unknown as typeof fetch,
			nowMs: () => now,
		});

		expect(fetchImpl).toHaveBeenCalledTimes(0);
		expect(result?.apiKey).toBe("still-valid");
	});

	it("refreshes an expired token and persists updated credentials", async () => {
		const now = 1_700_000_000_000;
		const configPath = createConfigFile({
			claudeAiOauth: {
				accessToken: "expired-access",
				refreshToken: "refresh-old",
				expiresAt: now - 60_000,
			},
		});
		const fetchImpl = mock(async () => {
			return new Response(
				JSON.stringify({
					access_token: "access-new",
					refresh_token: "refresh-new",
					expires_in: 3600,
				}),
				{ status: 200 },
			);
		});

		const result = await getOrRefreshAnthropicOAuthCredentials({
			configPaths: [configPath],
			fetchImpl: fetchImpl as unknown as typeof fetch,
			nowMs: () => now,
		});

		expect(result?.apiKey).toBe("access-new");
		expect(result?.refreshToken).toBe("refresh-new");
		expect(result?.expiresAt).toBe(now + 3_600_000);
		expect(fetchImpl).toHaveBeenCalledTimes(1);

		const saved = JSON.parse(readFileSync(configPath, "utf-8")) as {
			claudeAiOauth?: {
				accessToken?: string;
				refreshToken?: string;
				expiresAt?: number;
			};
		};
		expect(saved.claudeAiOauth?.accessToken).toBe("access-new");
		expect(saved.claudeAiOauth?.refreshToken).toBe("refresh-new");
		expect(saved.claudeAiOauth?.expiresAt).toBe(now + 3_600_000);
	});

	it("uses a fresh fallback expiry when refresh response omits expires_in", async () => {
		const now = 1_700_000_000_000;
		const configPath = createConfigFile({
			claudeAiOauth: {
				accessToken: "expired-access",
				refreshToken: "refresh-old",
				expiresAt: now - 60_000,
			},
		});
		const fetchImpl = mock(async () => {
			return new Response(
				JSON.stringify({
					access_token: "access-new",
					refresh_token: "refresh-new",
				}),
				{ status: 200 },
			);
		});

		const result = await getOrRefreshAnthropicOAuthCredentials({
			configPaths: [configPath],
			fetchImpl: fetchImpl as unknown as typeof fetch,
			nowMs: () => now,
		});

		expect(result?.apiKey).toBe("access-new");
		expect(result?.refreshToken).toBe("refresh-new");
		expect(result?.expiresAt).toBeGreaterThan(now);
		expect(fetchImpl).toHaveBeenCalledTimes(1);

		const saved = JSON.parse(readFileSync(configPath, "utf-8")) as {
			claudeAiOauth?: {
				refreshToken?: string;
				expiresAt?: number;
			};
		};
		expect(saved.claudeAiOauth?.refreshToken).toBe("refresh-new");
		expect(saved.claudeAiOauth?.expiresAt).toBeGreaterThan(now);
	});

	it("returns existing token when best-effort refresh fails but token is not expired", async () => {
		const now = 1_700_000_000_000;
		const configPath = createConfigFile({
			oauth_access_token: "access-stale",
			oauth_refresh_token: "refresh-old",
			oauth_expires_at: now + 60_000,
		});
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
		const fetchImpl = mock(async () => {
			return new Response("bad refresh", { status: 401 });
		});

		try {
			const result = await getOrRefreshAnthropicOAuthCredentials({
				configPaths: [configPath],
				fetchImpl: fetchImpl as unknown as typeof fetch,
				nowMs: () => now,
			});

			expect(result?.apiKey).toBe("access-stale");
			expect(result?.refreshToken).toBe("refresh-old");
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("returns null when forced refresh fails", async () => {
		const now = 1_700_000_000_000;
		const configPath = createConfigFile({
			oauthAccessToken: "access-old",
			oauthRefreshToken: "refresh-old",
			oauthExpiresAt: now + 60_000,
		});
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
		const fetchImpl = mock(async () => {
			return new Response("refresh failed", { status: 500 });
		});

		try {
			const result = await getOrRefreshAnthropicOAuthCredentials({
				forceRefresh: true,
				configPaths: [configPath],
				fetchImpl: fetchImpl as unknown as typeof fetch,
				nowMs: () => now,
			});
			expect(result).toBeNull();
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("returns null when forced refresh times out", async () => {
		const now = 1_700_000_000_000;
		const configPath = createConfigFile({
			oauthAccessToken: "access-old",
			oauthRefreshToken: "refresh-old",
			oauthExpiresAt: now + 60_000,
		});
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
		const fetchImpl = mock(async () => {
			const timeoutError = new Error("aborted");
			timeoutError.name = "AbortError";
			throw timeoutError;
		});

		try {
			const result = await getOrRefreshAnthropicOAuthCredentials({
				forceRefresh: true,
				configPaths: [configPath],
				fetchImpl: fetchImpl as unknown as typeof fetch,
				nowMs: () => now,
			});
			expect(result).toBeNull();
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("returns null when forced refresh is requested but refresh token is missing", async () => {
		const now = 1_700_000_000_000;
		const configPath = createConfigFile({
			oauthAccessToken: "expired_access",
			oauthExpiresAt: now - 60_000,
		});
		const fetchImpl = mock(async () => {
			throw new Error("fetch should not be called without refresh token");
		});

		const result = await getOrRefreshAnthropicOAuthCredentials({
			forceRefresh: true,
			configPaths: [configPath],
			fetchImpl: fetchImpl as unknown as typeof fetch,
			nowMs: () => now,
		});

		expect(result).toBeNull();
		expect(fetchImpl).toHaveBeenCalledTimes(0);
	});

	it("returns null when token is expired and refresh token is missing", async () => {
		const now = 1_700_000_000_000;
		const configPath = createConfigFile({
			oauthAccessToken: "expired_access",
			oauthExpiresAt: now - 60_000,
		});
		const fetchImpl = mock(async () => {
			throw new Error("fetch should not be called without refresh token");
		});

		const result = await getOrRefreshAnthropicOAuthCredentials({
			configPaths: [configPath],
			fetchImpl: fetchImpl as unknown as typeof fetch,
			nowMs: () => now,
		});

		expect(result).toBeNull();
		expect(fetchImpl).toHaveBeenCalledTimes(0);
	});

	it("deduplicates concurrent refresh calls for the same config path", async () => {
		const now = 1_700_000_000_000;
		const configPath = createConfigFile({
			claudeAiOauth: {
				accessToken: "expired-access",
				refreshToken: "refresh-old",
				expiresAt: now - 60_000,
			},
		});
		const fetchImpl = mock(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return new Response(
				JSON.stringify({
					access_token: "access-new",
					refresh_token: "refresh-new",
					expires_in: 3600,
				}),
				{ status: 200 },
			);
		});

		const [resultA, resultB] = await Promise.all([
			getOrRefreshAnthropicOAuthCredentials({
				configPaths: [configPath],
				fetchImpl: fetchImpl as unknown as typeof fetch,
				nowMs: () => now,
			}),
			getOrRefreshAnthropicOAuthCredentials({
				configPaths: [configPath],
				fetchImpl: fetchImpl as unknown as typeof fetch,
				nowMs: () => now,
			}),
		]);

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(resultA?.apiKey).toBe("access-new");
		expect(resultB?.apiKey).toBe("access-new");
	});

	it("does not share in-flight refreshes across different config paths", async () => {
		const now = 1_700_000_000_000;
		const configPathA = createConfigFile({
			claudeAiOauth: {
				accessToken: "expired-a",
				refreshToken: "refresh-a",
				expiresAt: now - 60_000,
			},
		});
		const configPathB = createConfigFile({
			claudeAiOauth: {
				accessToken: "expired-b",
				refreshToken: "refresh-b",
				expiresAt: now - 60_000,
			},
		});
		const fetchImpl = mock(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				const body =
					typeof init?.body === "string"
						? (JSON.parse(init.body) as { refresh_token?: string })
						: {};
				const refreshToken = body.refresh_token;
				return new Response(
					JSON.stringify({
						access_token: `access-${refreshToken}`,
						refresh_token: `refresh-next-${refreshToken}`,
						expires_in: 3600,
					}),
					{ status: 200 },
				);
			},
		);

		const [resultA, resultB] = await Promise.all([
			getOrRefreshAnthropicOAuthCredentials({
				configPaths: [configPathA],
				fetchImpl: fetchImpl as unknown as typeof fetch,
				nowMs: () => now,
			}),
			getOrRefreshAnthropicOAuthCredentials({
				configPaths: [configPathB],
				fetchImpl: fetchImpl as unknown as typeof fetch,
				nowMs: () => now,
			}),
		]);

		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(resultA?.apiKey).toBe("access-refresh-a");
		expect(resultB?.apiKey).toBe("access-refresh-b");
	});
});
