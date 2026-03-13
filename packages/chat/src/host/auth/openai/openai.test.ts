import { beforeEach, describe, expect, it, mock } from "bun:test";

const fakeAuthStorage = {
	reload: mock(() => {}),
	get: mock(() => undefined),
};

mock.module("mastracode", () => ({
	createAuthStorage: mock(() => fakeAuthStorage),
}));

const { getOpenAICredentialsFromAuthStorage } = await import("./openai");

describe("getOpenAICredentialsFromAuthStorage", () => {
	beforeEach(() => {
		fakeAuthStorage.reload.mockClear();
		fakeAuthStorage.get.mockClear();
		fakeAuthStorage.get.mockReturnValue(undefined);
	});

	it("returns the legacy OpenAI credential when that is the only stored account", () => {
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

		expect(getOpenAICredentialsFromAuthStorage(fakeAuthStorage)).toEqual({
			apiKey: "legacy-openai-oauth",
			providerId: "openai",
			source: "auth-storage",
			kind: "oauth",
			accountId: "legacy-account",
		});
	});

	it("falls back to a later non-expired credential when the primary OpenAI slot is expired", () => {
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

		expect(getOpenAICredentialsFromAuthStorage(fakeAuthStorage)).toEqual({
			apiKey: "legacy-openai-key",
			providerId: "openai",
			source: "auth-storage",
			kind: "apiKey",
		});
	});
});
