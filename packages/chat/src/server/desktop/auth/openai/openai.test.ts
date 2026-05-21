import { beforeEach, describe, expect, it, mock } from "bun:test";

const fakeAuthStorage = {
	reload: mock(() => {}),
	get: mock(() => undefined),
	getApiKey: mock(async (_providerId: string) => null as string | null),
};

mock.module("mastracode", () => ({
	createAuthStorage: mock(() => fakeAuthStorage),
	createMastraCode: mock(async () => ({
		harness: {},
		mcpManager: null,
		hookManager: null,
		authStorage: null,
		storageWarning: undefined,
	})),
}));

const { getOpenAICredentialsFromAuthStorage } = await import("./openai");

describe("getOpenAICredentialsFromAuthStorage", () => {
	beforeEach(() => {
		fakeAuthStorage.reload.mockClear();
		fakeAuthStorage.get.mockClear();
		fakeAuthStorage.getApiKey.mockClear();
		fakeAuthStorage.get.mockReturnValue(undefined);
		fakeAuthStorage.getApiKey.mockImplementation(
			async (_providerId: string) => null,
		);
	});

	it("returns the legacy OpenAI credential when that is the only stored account", async () => {
		fakeAuthStorage.get.mockImplementation((providerId: string) => {
			if (providerId === "openai") {
				return {
					type: "oauth",
					access: "legacy-openai-oauth",
					accountId: "legacy-account",
				};
			}

			return undefined;
		});

		expect(await getOpenAICredentialsFromAuthStorage(fakeAuthStorage)).toEqual({
			apiKey: "legacy-openai-oauth",
			providerId: "openai",
			source: "auth-storage",
			kind: "oauth",
			accountId: "legacy-account",
		});
	});

	it("falls back to a later non-expired credential when the primary OpenAI slot is expired", async () => {
		fakeAuthStorage.get.mockImplementation((providerId: string) => {
			if (providerId === "openai-codex") {
				return {
					type: "oauth",
					access: "expired-openai-oauth",
					expires: Date.now() - 1_000,
				};
			}
			if (providerId === "openai") {
				return {
					type: "api_key",
					key: "legacy-openai-key",
				};
			}

			return undefined;
		});

		// Refresh the codex slot fails (no refresh token), falling back to the
		// expired raw credential. The resolver should still pick the
		// non-expired API-key credential from the next provider slot.
		fakeAuthStorage.getApiKey.mockImplementation(
			async (_providerId: string) => null,
		);

		expect(await getOpenAICredentialsFromAuthStorage(fakeAuthStorage)).toEqual({
			apiKey: "legacy-openai-key",
			providerId: "openai",
			source: "auth-storage",
			kind: "apiKey",
		});
	});

	it("refreshes an expired OAuth credential via authStorage.getApiKey instead of returning it as expired", async () => {
		// Initial state: stored credential is expired.
		const expiredAt = Date.now() - 60_000;
		const refreshedAt = Date.now() + 3_600_000;
		let currentExpires = expiredAt;
		let currentAccess = "stale-access-token";

		fakeAuthStorage.get.mockImplementation((providerId: string) => {
			if (providerId === "openai") {
				return {
					type: "oauth",
					access: currentAccess,
					expires: currentExpires,
					accountId: "acct-123",
				};
			}
			return undefined;
		});

		// mastracode's getApiKey refreshes the token and persists the new
		// credential back to storage. Simulate that by mutating the stored
		// credential when getApiKey is invoked.
		fakeAuthStorage.getApiKey.mockImplementation(async (providerId: string) => {
			if (providerId === "openai") {
				currentAccess = "fresh-access-token";
				currentExpires = refreshedAt;
				return currentAccess;
			}
			return null;
		});

		const result = await getOpenAICredentialsFromAuthStorage(fakeAuthStorage);

		expect(fakeAuthStorage.getApiKey).toHaveBeenCalledWith("openai");
		expect(result).toEqual({
			apiKey: "fresh-access-token",
			providerId: "openai",
			source: "auth-storage",
			kind: "oauth",
			expiresAt: refreshedAt,
			accountId: "acct-123",
		});
	});

	it("falls through to expired when refresh fails", async () => {
		const expiredAt = Date.now() - 60_000;
		fakeAuthStorage.get.mockImplementation((providerId: string) => {
			if (providerId === "openai") {
				return {
					type: "oauth",
					access: "stale-access-token",
					expires: expiredAt,
				};
			}
			return undefined;
		});

		fakeAuthStorage.getApiKey.mockImplementation(
			async (_providerId: string) => {
				throw new Error("refresh token revoked");
			},
		);

		const result = await getOpenAICredentialsFromAuthStorage(fakeAuthStorage);

		// When refresh fails we still surface the stored (expired) credential so
		// the caller can decide to mark it as expired and prompt reconnect.
		expect(result).not.toBeNull();
		expect(result?.kind).toBe("oauth");
		expect(result?.expiresAt).toBe(expiredAt);
	});
});
