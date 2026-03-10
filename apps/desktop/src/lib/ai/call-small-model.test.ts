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

mock.module("@superset/chat/host", () => ({
	getCredentialsFromAnySource: getAnthropicCredentialsFromAnySourceMock,
	getAnthropicProviderOptions: getAnthropicProviderOptionsMock,
	getOpenAICredentialsFromAnySource: getOpenAICredentialsFromAnySourceMock,
	generateTitleFromMessage: mock(async () => null),
}));

const { callSmallModel } = await import("./call-small-model");

describe("callSmallModel", () => {
	beforeEach(() => {
		getAnthropicCredentialsFromAnySourceMock.mockReturnValue(null);
		getOpenAICredentialsFromAnySourceMock.mockReturnValue(null);
		createAnthropicModelMock.mockClear();
		createOpenAIResponsesModelMock.mockClear();
		createOpenAIChatModelMock.mockClear();
	});

	it("skips unsupported credentials and falls through to the next working provider", async () => {
		const { result, attempts } = await callSmallModel({
			providers: [
				{
					id: "openai",
					name: "OpenAI",
					resolveCredentials: () => ({
						apiKey: "oauth-token",
						kind: "oauth",
						source: "auth-storage",
					}),
					isSupported: () => ({
						supported: false,
						reason: "unsupported oauth",
					}),
					createModel: () => "openai-model",
				},
				{
					id: "anthropic",
					name: "Anthropic",
					resolveCredentials: () => ({
						apiKey: "anthropic-token",
						kind: "oauth",
						source: "auth-storage",
					}),
					isSupported: () => ({ supported: true }),
					createModel: () => "anthropic-model",
				},
			],
			invoke: async ({ providerId, model }) =>
				providerId === "anthropic" && model === "anthropic-model"
					? "generated title"
					: null,
		});

		expect(result).toBe("generated title");
		expect(attempts).toEqual([
			{
				providerId: "openai",
				providerName: "OpenAI",
				credentialKind: "oauth",
				credentialSource: "auth-storage",
				issue: {
					code: "unsupported_credentials",
					capability: "small_model_tasks",
					remediation: "add_api_key",
					message: "unsupported oauth",
				},
				outcome: "unsupported-credentials",
				reason: "unsupported oauth",
			},
			{
				providerId: "anthropic",
				providerName: "Anthropic",
				credentialKind: "oauth",
				credentialSource: "auth-storage",
				outcome: "succeeded",
			},
		]);
	});

	it("uses the OpenAI Codex OAuth model path for default OpenAI OAuth requests", async () => {
		getOpenAICredentialsFromAnySourceMock.mockReturnValue({
			apiKey: "openai-key",
			kind: "oauth",
			source: "auth-storage",
			accountId: "chatgpt-account",
		});

		const { result, attempts } = await callSmallModel({
			providerOrder: ["openai"],
			invoke: async ({ providerId, model }) =>
				providerId === "openai" && model === "openai-default-responses-model"
					? "generated title"
					: null,
		});

		expect(result).toBe("generated title");
		expect(createOpenAIResponsesModelMock).toHaveBeenCalledWith(
			"gpt-5.1-codex-mini",
		);
		expect(createOpenAIChatModelMock).not.toHaveBeenCalled();
		expect(attempts).toEqual([
			{
				providerId: "openai",
				providerName: "OpenAI",
				credentialKind: "oauth",
				credentialSource: "auth-storage",
				outcome: "succeeded",
			},
		]);
	});

	it("uses the OpenAI chat model path for default API key requests", async () => {
		getOpenAICredentialsFromAnySourceMock.mockReturnValue({
			apiKey: "openai-key",
			kind: "apiKey",
			source: "auth-storage",
		});

		const { result, attempts } = await callSmallModel({
			providerOrder: ["openai"],
			invoke: async ({ providerId, model }) =>
				providerId === "openai" && model === "openai-default-chat-model"
					? "generated title"
					: null,
		});

		expect(result).toBe("generated title");
		expect(createOpenAIChatModelMock).toHaveBeenCalledWith("gpt-4o-mini");
		expect(createOpenAIResponsesModelMock).not.toHaveBeenCalled();
		expect(attempts).toEqual([
			{
				providerId: "openai",
				providerName: "OpenAI",
				credentialKind: "apiKey",
				credentialSource: "auth-storage",
				outcome: "succeeded",
			},
		]);
	});

	it("allows OpenAI OAuth credentials on the small-model path", async () => {
		const { result, attempts } = await callSmallModel({
			providers: [
				{
					id: "openai",
					name: "OpenAI",
					resolveCredentials: () => ({
						apiKey: "oauth-token",
						kind: "oauth",
						source: "auth-storage",
					}),
					isSupported: () => ({ supported: true }),
					createModel: () => "openai-model",
				},
			],
			invoke: async ({ providerId, model }) =>
				providerId === "openai" && model === "openai-model"
					? "generated title"
					: null,
		});

		expect(result).toBe("generated title");
		expect(attempts).toEqual([
			{
				providerId: "openai",
				providerName: "OpenAI",
				credentialKind: "oauth",
				credentialSource: "auth-storage",
				outcome: "succeeded",
			},
		]);
	});

	it("treats empty-string results as successful model output", async () => {
		const { result, attempts } = await callSmallModel({
			providers: [
				{
					id: "openai",
					name: "OpenAI",
					resolveCredentials: () => ({
						apiKey: "oauth-token",
						kind: "oauth",
						source: "auth-storage",
					}),
					isSupported: () => ({ supported: true }),
					createModel: () => "openai-model",
				},
			],
			invoke: async () => "",
		});

		expect(result).toBe("");
		expect(attempts).toEqual([
			{
				providerId: "openai",
				providerName: "OpenAI",
				credentialKind: "oauth",
				credentialSource: "auth-storage",
				outcome: "succeeded",
			},
		]);
	});

	it("classifies missing OpenAI scopes as a canonical provider issue", async () => {
		const { result, attempts } = await callSmallModel({
			providers: [
				{
					id: "openai",
					name: "OpenAI",
					resolveCredentials: () => ({
						apiKey: "oauth-token",
						kind: "oauth",
						source: "auth-storage",
					}),
					isSupported: () => ({ supported: true }),
					createModel: () => "openai-model",
				},
			],
			invoke: async () => {
				throw new Error(
					"You have insufficient permissions for this operation. Missing scopes: api.responses.write.",
				);
			},
		});

		expect(result).toBeNull();
		expect(attempts).toEqual([
			{
				providerId: "openai",
				providerName: "OpenAI",
				credentialKind: "oauth",
				credentialSource: "auth-storage",
				issue: {
					code: "missing_scope",
					capability: "small_model_tasks",
					remediation: "check_permissions",
					scope: "api.responses.write",
					message: "OpenAI needs permission api.responses.write",
				},
				outcome: "failed",
				reason:
					"You have insufficient permissions for this operation. Missing scopes: api.responses.write.",
			},
		]);
	});

	it("returns null after exhausting providers", async () => {
		const { result, attempts } = await callSmallModel({
			providers: [
				{
					id: "anthropic",
					name: "Anthropic",
					resolveCredentials: () => null,
					isSupported: () => ({ supported: true }),
					createModel: () => "unused",
				},
				{
					id: "openai",
					name: "OpenAI",
					resolveCredentials: () => ({
						apiKey: "api-key",
						kind: "apiKey",
						source: "auth-storage",
					}),
					isSupported: () => ({ supported: true }),
					createModel: () => "openai-model",
				},
			],
			invoke: async () => null,
		});

		expect(result).toBeNull();
		expect(attempts).toEqual([
			{
				providerId: "anthropic",
				providerName: "Anthropic",
				outcome: "missing-credentials",
			},
			{
				providerId: "openai",
				providerName: "OpenAI",
				credentialKind: "apiKey",
				credentialSource: "auth-storage",
				outcome: "empty-result",
			},
		]);
	});

	it("skips expired oauth credentials before attempting the request", async () => {
		const { result, attempts } = await callSmallModel({
			providers: [
				{
					id: "anthropic",
					name: "Anthropic",
					resolveCredentials: () => ({
						apiKey: "expired-oauth",
						kind: "oauth",
						source: "config",
						expiresAt: Date.now() - 1_000,
					}),
					isSupported: () => ({ supported: true }),
					createModel: () => "anthropic-model",
				},
			],
			invoke: async () => "should-not-run",
		});

		expect(result).toBeNull();
		expect(attempts).toEqual([
			{
				providerId: "anthropic",
				providerName: "Anthropic",
				credentialKind: "oauth",
				credentialSource: "config",
				issue: {
					code: "expired",
					capability: "chat",
					remediation: "reconnect",
					message: "Anthropic session expired",
				},
				outcome: "expired-credentials",
				reason: "Anthropic session expired",
			},
		]);
	});

	it("continues after a provider throws and returns the next successful result", async () => {
		const { result, attempts } = await callSmallModel({
			providers: [
				{
					id: "openai",
					name: "OpenAI",
					resolveCredentials: () => ({
						apiKey: "api-key",
						kind: "apiKey",
						source: "auth-storage",
					}),
					isSupported: () => ({ supported: true }),
					createModel: () => {
						throw new Error("provider unavailable");
					},
				},
				{
					id: "anthropic",
					name: "Anthropic",
					resolveCredentials: () => ({
						apiKey: "anthropic-key",
						kind: "apiKey",
						source: "config",
					}),
					isSupported: () => ({ supported: true }),
					createModel: () => "anthropic-model",
				},
			],
			invoke: async ({ providerId, model }) =>
				providerId === "anthropic" && model === "anthropic-model"
					? "fallback title"
					: null,
		});

		expect(result).toBe("fallback title");
		expect(attempts).toEqual([
			{
				providerId: "openai",
				providerName: "OpenAI",
				credentialKind: "apiKey",
				credentialSource: "auth-storage",
				issue: {
					code: "unknown_error",
					capability: "small_model_tasks",
					remediation: "try_again",
					message: "OpenAI could not complete this request",
				},
				outcome: "failed",
				reason: "provider unavailable",
			},
			{
				providerId: "anthropic",
				providerName: "Anthropic",
				credentialKind: "apiKey",
				credentialSource: "config",
				outcome: "succeeded",
			},
		]);
	});

	it("respects providerOrder when a caller prefers one provider first", async () => {
		const visited: string[] = [];

		await callSmallModel({
			providers: [
				{
					id: "anthropic",
					name: "Anthropic",
					resolveCredentials: () => ({
						apiKey: "anthropic-key",
						kind: "apiKey",
						source: "config",
					}),
					isSupported: () => ({ supported: true }),
					createModel: () => "anthropic-model",
				},
				{
					id: "openai",
					name: "OpenAI",
					resolveCredentials: () => ({
						apiKey: "openai-key",
						kind: "apiKey",
						source: "auth-storage",
					}),
					isSupported: () => ({ supported: true }),
					createModel: () => "openai-model",
				},
			],
			providerOrder: ["openai", "anthropic"],
			invoke: async ({ providerId }) => {
				visited.push(providerId);
				return "title";
			},
		});

		expect(visited).toEqual(["openai"]);
	});
});
