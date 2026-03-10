import { beforeEach, describe, expect, it, mock } from "bun:test";

type MockOpenAICredentials = {
	apiKey: string;
	kind: "apiKey" | "oauth";
	source: string;
	expiresAt?: number;
	accountId?: string;
};

const createAnthropicModelMock = mock(() => "anthropic-default-model");
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

mock.module("@ai-sdk/anthropic", () => ({
	createAnthropic: mock(() => createAnthropicModelMock),
}));

mock.module("@ai-sdk/openai", () => ({
	createOpenAI: mock(() =>
		Object.assign(createOpenAIResponsesModelMock, {
			chat: createOpenAIChatModelMock,
			responses: createOpenAIResponsesModelMock,
		}),
	),
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
		createOpenAIResponsesModelMock.mockClear();
		createOpenAIChatModelMock.mockClear();
		fakeAuthStorage.reload.mockClear();
		fakeAuthStorage.get.mockClear();
		fakeAuthStorage.getApiKey.mockClear();
		fakeAuthStorage.get.mockReturnValue(undefined);
		fakeAuthStorage.getApiKey.mockResolvedValue(null);
	});

	it("uses the OpenAI Codex OAuth model path for OAuth credentials", async () => {
		getOpenAICredentialsFromAnySourceMock.mockReturnValue({
			apiKey: "openai-key",
			kind: "oauth",
			source: "auth-storage",
			accountId: "chatgpt-account",
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

	it("uses the OpenAI chat model path for API key credentials", async () => {
		getOpenAICredentialsFromAnySourceMock.mockReturnValue({
			apiKey: "openai-key",
			kind: "apiKey",
			source: "auth-storage",
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
