import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

type MockOpenAICredentials = {
	apiKey: string;
	kind: "apiKey" | "oauth";
	source: string;
	expiresAt?: number;
	accountId?: string;
	providerId?: string;
};

const createAnthropicModelMock = mock(() => "anthropic-default-model");
let lastCreateOpenAIOptions: { fetch?: typeof fetch } | undefined;
const createOpenAIMock = mock((options?: { fetch?: typeof fetch }) => {
	lastCreateOpenAIOptions = options;
	return Object.assign(createOpenAIResponsesModelMock, {
		chat: createOpenAIChatModelMock,
		responses: createOpenAIResponsesModelMock,
	});
});
const createOpenAIResponsesModelMock = mock(
	() => "openai-default-responses-model",
);
const createOpenAIChatModelMock = mock(() => "openai-default-chat-model");
const getAnthropicCredentialsFromAnySourceMock = mock(() => null);
const getAnthropicProviderOptionsMock = mock(() => ({ apiKey: "unused" }));
const getOpenAICredentialsFromAnySourceMock = mock(
	(() => null) as () => MockOpenAICredentials | null,
);
const fakeAuthStorage = {
	reload: mock(() => {}),
	get: mock(() => undefined),
	getApiKey: mock(async () => null),
};
const originalFetch = globalThis.fetch;
const fetchMock = mock(async () => new Response(null, { status: 200 }));

mock.module("@ai-sdk/anthropic", () => ({
	createAnthropic: mock(() => createAnthropicModelMock),
}));

mock.module("@ai-sdk/openai", () => ({
	createOpenAI: createOpenAIMock,
}));

mock.module("mastracode", () => ({
	createAuthStorage: mock(() => fakeAuthStorage),
}));

mock.module("../auth/anthropic", () => ({
	getCredentialsFromAnySource: getAnthropicCredentialsFromAnySourceMock,
	getAnthropicProviderOptions: getAnthropicProviderOptionsMock,
}));

mock.module("../auth/openai", () => ({
	getOpenAICredentialsFromAnySource: getOpenAICredentialsFromAnySourceMock,
}));

const { getDefaultSmallModelProviders } = await import("./small-model");

describe("getDefaultSmallModelProviders", () => {
	beforeEach(() => {
		getAnthropicCredentialsFromAnySourceMock.mockReturnValue(null);
		getOpenAICredentialsFromAnySourceMock.mockReturnValue(null);
		getAnthropicProviderOptionsMock.mockClear();
		createAnthropicModelMock.mockClear();
		createOpenAIMock.mockClear();
		lastCreateOpenAIOptions = undefined;
		createOpenAIResponsesModelMock.mockClear();
		createOpenAIChatModelMock.mockClear();
		fakeAuthStorage.reload.mockClear();
		fakeAuthStorage.get.mockClear();
		fakeAuthStorage.getApiKey.mockClear();
		fakeAuthStorage.get.mockReturnValue(undefined);
		fakeAuthStorage.getApiKey.mockResolvedValue(null);
		fetchMock.mockClear();
		globalThis.fetch = fetchMock as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("uses the OpenAI Codex OAuth model path for OAuth credentials", async () => {
		getOpenAICredentialsFromAnySourceMock.mockReturnValue({
			apiKey: "openai-key",
			kind: "oauth",
			source: "auth-storage",
			accountId: "chatgpt-account",
			providerId: "openai-codex",
		});
		fakeAuthStorage.get.mockReturnValue({
			type: "oauth",
			access: "oauth-access-token",
			accountId: "chatgpt-account",
		});

		const openAIProvider = getDefaultSmallModelProviders().find(
			(provider) => provider.id === "openai",
		);

		expect(openAIProvider).toBeDefined();
		const credentials = openAIProvider?.resolveCredentials();
		expect(credentials).toEqual({
			apiKey: "openai-key",
			kind: "oauth",
			source: "auth-storage",
			accountId: "chatgpt-account",
			providerId: "openai-codex",
		});
		if (!openAIProvider || !credentials) {
			throw new Error("OpenAI provider should resolve OAuth credentials");
		}

		const model = await openAIProvider.createModel(credentials);

		expect(model).toBe("openai-default-responses-model");
		expect(createOpenAIResponsesModelMock).toHaveBeenCalledWith(
			"gpt-5.1-codex-mini",
		);
		expect(createOpenAIChatModelMock).not.toHaveBeenCalled();
	});

	it("uses the resolved OpenAI provider id for the OAuth transport", async () => {
		getOpenAICredentialsFromAnySourceMock.mockReturnValue({
			apiKey: "legacy-openai-key",
			kind: "oauth",
			source: "auth-storage",
			providerId: "openai",
		});
		fakeAuthStorage.get.mockImplementation((providerId: string) => {
			if (providerId !== "openai") {
				return undefined;
			}

			return {
				type: "oauth",
				access: "legacy-openai-access",
			};
		});

		const openAIProvider = getDefaultSmallModelProviders().find(
			(provider) => provider.id === "openai",
		);
		if (!openAIProvider) {
			throw new Error("OpenAI provider should exist");
		}

		const credentials = openAIProvider.resolveCredentials();
		if (!credentials) {
			throw new Error("OpenAI provider should resolve OAuth credentials");
		}

		await openAIProvider.createModel(credentials);

		const oauthFetch = lastCreateOpenAIOptions?.fetch;
		if (!oauthFetch) {
			throw new Error("OpenAI OAuth provider should pass a fetch override");
		}
		await oauthFetch("https://api.openai.com/v1/responses", {
			headers: {
				Authorization: "Bearer should-be-replaced",
			},
		});

		expect(fakeAuthStorage.get).toHaveBeenCalledWith("openai");
		expect(fakeAuthStorage.get).not.toHaveBeenCalledWith("openai-codex");
	});

	it("uses the OpenAI chat model path for API key credentials", async () => {
		getOpenAICredentialsFromAnySourceMock.mockReturnValue({
			apiKey: "openai-key",
			kind: "apiKey",
			source: "auth-storage",
			providerId: "openai-codex",
		});

		const openAIProvider = getDefaultSmallModelProviders().find(
			(provider) => provider.id === "openai",
		);

		expect(openAIProvider).toBeDefined();
		const credentials = openAIProvider?.resolveCredentials();
		expect(credentials).toEqual({
			apiKey: "openai-key",
			kind: "apiKey",
			source: "auth-storage",
			providerId: "openai-codex",
		});
		if (!openAIProvider || !credentials) {
			throw new Error("OpenAI provider should resolve API key credentials");
		}

		const model = await openAIProvider.createModel(credentials);

		expect(model).toBe("openai-default-chat-model");
		expect(createOpenAIChatModelMock).toHaveBeenCalledWith("gpt-4o-mini");
		expect(createOpenAIResponsesModelMock).not.toHaveBeenCalled();
	});
});
