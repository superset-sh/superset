import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
	type ClaudeCredentials,
	getCredentialsFromAnySource as getAnthropicCredentialsFromAnySource,
	getAnthropicProviderOptions,
	getOpenAICredentialsFromAnySource,
} from "@superset/chat/host";

type SmallModelCredential = {
	apiKey: string;
	kind: "apiKey" | "oauth";
	source: string;
};

export type SmallModelProviderId = "anthropic" | "openai";

export interface SmallModelAttempt {
	providerId: SmallModelProviderId;
	providerName: string;
	credentialKind?: SmallModelCredential["kind"];
	credentialSource?: string;
	outcome:
		| "missing-credentials"
		| "unsupported-credentials"
		| "empty-result"
		| "failed"
		| "succeeded";
	reason?: string;
}

export interface SmallModelInvocationContext {
	providerId: SmallModelProviderId;
	providerName: string;
	model: unknown;
	credentials: SmallModelCredential;
}

export interface SmallModelProvider<
	TCredentials extends SmallModelCredential = SmallModelCredential,
> {
	id: SmallModelProviderId;
	name: string;
	resolveCredentials: () => TCredentials | null;
	isSupported: (credentials: TCredentials) => {
		supported: boolean;
		reason?: string;
	};
	createModel: (credentials: TCredentials) => unknown | Promise<unknown>;
}

const DEFAULT_SMALL_MODEL_PROVIDERS: SmallModelProvider[] = [
	{
		id: "anthropic",
		name: "Anthropic",
		resolveCredentials: () => getAnthropicCredentialsFromAnySource(),
		isSupported: () => ({ supported: true }),
		createModel: (credentials) =>
			createAnthropic(
				getAnthropicProviderOptions(credentials as ClaudeCredentials),
			)("claude-haiku-4-5-20251001"),
	},
	{
		id: "openai",
		name: "OpenAI",
		resolveCredentials: () => getOpenAICredentialsFromAnySource(),
		isSupported: (credentials) =>
			credentials.kind === "apiKey"
				? { supported: true }
				: {
						supported: false,
						reason:
							"OpenAI Codex OAuth credentials do not support the generic small-model path.",
					},
		createModel: (credentials) =>
			createOpenAI({ apiKey: credentials.apiKey })("gpt-4o-mini"),
	},
];

export async function callSmallModel<TResult>({
	invoke,
	providers = DEFAULT_SMALL_MODEL_PROVIDERS,
}: {
	invoke: (
		context: SmallModelInvocationContext,
	) => Promise<TResult | null | undefined>;
	providers?: SmallModelProvider[];
}): Promise<{
	result: TResult | null;
	attempts: SmallModelAttempt[];
}> {
	const attempts: SmallModelAttempt[] = [];

	for (const provider of providers) {
		const credentials = provider.resolveCredentials();
		if (!credentials) {
			attempts.push({
				providerId: provider.id,
				providerName: provider.name,
				outcome: "missing-credentials",
			});
			continue;
		}

		const support = provider.isSupported(credentials);
		if (!support.supported) {
			attempts.push({
				providerId: provider.id,
				providerName: provider.name,
				credentialKind: credentials.kind,
				credentialSource: credentials.source,
				outcome: "unsupported-credentials",
				reason: support.reason,
			});
			continue;
		}

		try {
			const model = await provider.createModel(credentials);
			const result = await invoke({
				providerId: provider.id,
				providerName: provider.name,
				model,
				credentials,
			});
			if (result) {
				attempts.push({
					providerId: provider.id,
					providerName: provider.name,
					credentialKind: credentials.kind,
					credentialSource: credentials.source,
					outcome: "succeeded",
				});
				return { result, attempts };
			}

			attempts.push({
				providerId: provider.id,
				providerName: provider.name,
				credentialKind: credentials.kind,
				credentialSource: credentials.source,
				outcome: "empty-result",
			});
		} catch (error) {
			attempts.push({
				providerId: provider.id,
				providerName: provider.name,
				credentialKind: credentials.kind,
				credentialSource: credentials.source,
				outcome: "failed",
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return {
		result: null,
		attempts,
	};
}
