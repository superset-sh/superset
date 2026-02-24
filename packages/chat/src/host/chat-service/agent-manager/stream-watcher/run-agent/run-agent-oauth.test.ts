import { beforeEach, describe, expect, it, mock } from "bun:test";

const getCredentialsFromConfig = mock(() => null);
const getOrRefreshAnthropicOAuthCredentials = mock(async () => null);

mock.module("../../../../auth/anthropic", () => ({
	getCredentialsFromConfig,
	getOrRefreshAnthropicOAuthCredentials,
}));

const { syncAnthropicOAuthToken } = await import("./run-agent-oauth");

beforeEach(() => {
	getCredentialsFromConfig.mockClear();
	getOrRefreshAnthropicOAuthCredentials.mockClear();
});

describe("syncAnthropicOAuthToken", () => {
	it("returns synced and sets auth token when oauth credentials are available", async () => {
		getCredentialsFromConfig.mockReturnValue({
			kind: "oauth",
			apiKey: "access-old",
			source: "config",
			configPath: "/tmp/credentials.json",
		});
		getOrRefreshAnthropicOAuthCredentials.mockResolvedValue({
			kind: "oauth",
			apiKey: "access-new",
			source: "config",
			configPath: "/tmp/credentials.json",
		});

		const result = await syncAnthropicOAuthToken();

		expect(result).toBe("synced");
	});

	it("returns unavailable when oauth is not configured", async () => {
		getCredentialsFromConfig.mockReturnValue(null);
		getOrRefreshAnthropicOAuthCredentials.mockResolvedValue(null);

		const result = await syncAnthropicOAuthToken();

		expect(result).toBe("unavailable");
	});

	it("returns reauth-required when oauth is configured but refresh fails", async () => {
		getCredentialsFromConfig.mockReturnValue({
			kind: "oauth",
			apiKey: "expired",
			source: "config",
			configPath: "/tmp/credentials.json",
		});
		getOrRefreshAnthropicOAuthCredentials.mockResolvedValue(null);

		const result = await syncAnthropicOAuthToken();

		expect(result).toBe("reauth-required");
	});
});
