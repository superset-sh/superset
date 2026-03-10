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
const getOpenAICredentialsFromAuthStorageMock = mock(
	(authStorage?: {
		reload: () => void;
		get: (providerId: string) =>
			| {
					type: "api_key";
					key: string;
			  }
			| {
					type: "oauth";
					access: string;
					expires?: number;
					accountId?: string;
			  }
			| undefined;
	}): MockOpenAICredentials | null => {
		const storage = authStorage ?? fakeAuthStorage;
		storage.reload();

		const credentials = ["openai-codex", "openai"]
			.map((providerId) => {
				const credential = storage.get(providerId);
				if (!credential) {
					return null;
				}

				if (credential.type === "api_key" && credential.key.trim()) {
					return {
						apiKey: credential.key.trim(),
						kind: "apiKey" as const,
						source: "auth-storage",
						providerId,
					};
				}

				if (credential.type === "oauth" && credential.access.trim()) {
					return {
						apiKey: credential.access.trim(),
						kind: "oauth" as const,
						source: "auth-storage",
						expiresAt: credential.expires,
						accountId: credential.accountId?.trim() || undefined,
						providerId,
					};
				}

				return null;
			})
			.filter(
				(credential): credential is MockOpenAICredentials =>
					credential !== null,
			);

		return (
			credentials.find(
				(credential) =>
					credential.kind !== "oauth" ||
					typeof credential.expiresAt !== "number" ||
					Date.now() < credential.expiresAt,
			) ??
			credentials[0] ??
			null
		);
	},
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
	getCredentialsFromAuthStorage: () => null,
	getCredentialsFromConfig: () => null,
	getCredentialsFromKeychain: () => null,
	getAnthropicProviderOptions: getAnthropicProviderOptionsMock,
	isClaudeCredentialExpired: () => false,
	createAnthropicOAuthSession: () => {},
	exchangeAnthropicAuthorizationCode: () => {},
}));

mock.module("../auth/openai", () => ({
	getOpenAICredentialsFromAnySource: getOpenAICredentialsFromAnySourceMock,
	getOpenAICredentialsFromAuthStorage: getOpenAICredentialsFromAuthStorageMock,
	isOpenAICredentialExpired: (credential: {
		kind: "apiKey" | "oauth";
		expiresAt?: number;
	}) =>
		credential.kind === "oauth" &&
		typeof credential.expiresAt === "number" &&
		Date.now() >= credential.expiresAt,
}));

const { getDefaultSmallModelProviders } = await import("./small-model");

describe("getDefaultSmallModelProviders", () => {
	beforeEach(() => {
		getAnthropicCredentialsFromAnySourceMock.mockReturnValue(null);
		getOpenAICredentialsFromAnySourceMock.mockReturnValue(null);
		getAnthropicProviderOptionsMock.mockClear();
		createAnthropicModelMock.mockClear();
		createOpenAIMock.mockClear();
		getOpenAICredentialsFromAuthStorageMock.mockClear();
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

	it("preserves Request details when rewriting the OpenAI OAuth transport", async () => {
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

		const abortController = new AbortController();
		const request = new Request("https://api.openai.com/v1/responses", {
			method: "POST",
			body: JSON.stringify({ prompt: "name this workspace" }),
			headers: {
				"Content-Type": "application/json",
				"X-Test-Header": "present",
				Authorization: "Bearer should-be-replaced",
			},
			signal: abortController.signal,
		});

		await oauthFetch(request);

		const [forwardedRequest] = fetchMock.mock.calls.at(-1) ?? [];
		expect(forwardedRequest).toBeInstanceOf(Request);
		if (!(forwardedRequest instanceof Request)) {
			throw new Error("fetch should receive a rewritten Request");
		}

		expect(forwardedRequest.url).toBe(
			"https://chatgpt.com/backend-api/codex/responses",
		);
		expect(forwardedRequest.method).toBe("POST");
		expect(await forwardedRequest.clone().text()).toBe(
			JSON.stringify({ prompt: "name this workspace" }),
		);
		expect(forwardedRequest.headers.get("content-type")).toBe(
			"application/json",
		);
		expect(forwardedRequest.headers.get("x-test-header")).toBe("present");
		expect(forwardedRequest.headers.get("authorization")).toBe(
			"Bearer oauth-access-token",
		);
		expect(forwardedRequest.headers.get("chatgpt-account-id")).toBe(
			"chatgpt-account",
		);
		expect(forwardedRequest.signal).toBe(abortController.signal);
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

	it("uses the Anthropic provider path for supported credentials", async () => {
		getAnthropicCredentialsFromAnySourceMock.mockReturnValue({
			apiKey: "anthropic-key",
			kind: "apiKey",
			source: "config",
		});

		const anthropicProvider = getDefaultSmallModelProviders().find(
			(provider) => provider.id === "anthropic",
		);

		expect(anthropicProvider).toBeDefined();
		const credentials = anthropicProvider?.resolveCredentials();
		expect(credentials).toEqual({
			apiKey: "anthropic-key",
			kind: "apiKey",
			source: "config",
		});
		if (!anthropicProvider || !credentials) {
			throw new Error("Anthropic provider should resolve credentials");
		}

		const model = await anthropicProvider.createModel(credentials);

		expect(model).toBe("anthropic-default-model");
		expect(getAnthropicProviderOptionsMock).toHaveBeenCalledWith(credentials);
		expect(createAnthropicModelMock).toHaveBeenCalledWith(
			"claude-haiku-4-5-20251001",
		);
	});
});
