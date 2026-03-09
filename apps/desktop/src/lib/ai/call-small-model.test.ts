import { describe, expect, it } from "bun:test";
import { callSmallModel } from "./call-small-model";

describe("callSmallModel", () => {
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
						source: "runtime-env",
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
				credentialSource: "runtime-env",
				outcome: "empty-result",
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
						source: "runtime-env",
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
						source: "runtime-env",
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
				credentialSource: "runtime-env",
				outcome: "failed",
				reason: "provider unavailable",
			},
			{
				providerId: "anthropic",
				providerName: "Anthropic",
				credentialKind: "apiKey",
				credentialSource: "runtime-env",
				outcome: "succeeded",
			},
		]);
	});
});
