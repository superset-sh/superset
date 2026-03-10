import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
	type ClaudeCredentials,
	getCredentialsFromAnySource as getAnthropicCredentialsFromAnySource,
	getAnthropicProviderOptions,
	getOpenAICredentialsFromAnySource,
} from "@superset/chat/host";
import {
	classifyProviderIssue,
	type ProviderId,
	type ProviderIssue,
} from "shared/ai/provider-status";
import { createAuthStorage } from "mastracode";
import {
	clearProviderIssue,
	reportProviderIssue,
} from "./provider-diagnostics";

type SmallModelCredential = {
	apiKey: string;
	kind: "apiKey" | "oauth";
	source: string;
	expiresAt?: number;
	accountId?: string;
};

export type SmallModelProviderId = ProviderId;

export interface SmallModelAttempt {
	providerId: SmallModelProviderId;
	providerName: string;
	credentialKind?: SmallModelCredential["kind"];
	credentialSource?: string;
	issue?: ProviderIssue;
	outcome:
		| "missing-credentials"
		| "expired-credentials"
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

const OPENAI_AUTH_PROVIDER_ID = "openai-codex";
const OPENAI_CODEX_API_ENDPOINT =
	"https://chatgpt.com/backend-api/codex/responses";
const OPENAI_CODEX_SMALL_MODEL_ID = "gpt-5.1-codex-mini";
const OPENAI_API_SMALL_MODEL_ID = "gpt-4o-mini";

function createOpenAICodexOAuthModel(credentials: SmallModelCredential) {
	const authStorage = createAuthStorage();
	const oauthFetchImpl = async (
		url: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	): Promise<Response> => {
		authStorage.reload();
		const storedCredential = authStorage.get(OPENAI_AUTH_PROVIDER_ID);
		if (!storedCredential || storedCredential.type !== "oauth") {
			throw new Error("Not logged in to OpenAI Codex. Reconnect OpenAI.");
		}

		let accessToken = storedCredential.access;
		if (
			typeof storedCredential.expires === "number" &&
			Date.now() >= storedCredential.expires
		) {
			const refreshedToken = await authStorage.getApiKey(
				OPENAI_AUTH_PROVIDER_ID,
			);
			if (!refreshedToken) {
				throw new Error(
					"Failed to refresh OpenAI Codex token. Please reconnect OpenAI.",
				);
			}
			accessToken = refreshedToken;
			authStorage.reload();
		}

		const refreshedCredential = authStorage.get(OPENAI_AUTH_PROVIDER_ID);
		const accountId =
			refreshedCredential &&
			typeof refreshedCredential === "object" &&
			"accountId" in refreshedCredential &&
			typeof refreshedCredential.accountId === "string" &&
			refreshedCredential.accountId.trim().length > 0
				? refreshedCredential.accountId.trim()
				: credentials.accountId?.trim() || undefined;

		const headers = new Headers(init?.headers);
		headers.delete("authorization");
		headers.set("Authorization", `Bearer ${accessToken}`);
		if (accountId) {
			headers.set("ChatGPT-Account-Id", accountId);
		}

		const parsedUrl =
			url instanceof URL
				? url
				: new URL(typeof url === "string" ? url : url.url);
		const shouldRewrite =
			parsedUrl.pathname.includes("/v1/responses") ||
			parsedUrl.pathname.includes("/chat/completions");
		const finalUrl = shouldRewrite
			? new URL(OPENAI_CODEX_API_ENDPOINT)
			: parsedUrl;

		return fetch(finalUrl, {
			...init,
			headers,
		});
	};
	const oauthFetch = Object.assign(oauthFetchImpl, {
		preconnect: globalThis.fetch.preconnect.bind(globalThis.fetch),
	}) satisfies typeof fetch;

	return createOpenAI({
		apiKey: "oauth-dummy-key",
		fetch: oauthFetch,
	}).responses(OPENAI_CODEX_SMALL_MODEL_ID);
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
		isSupported: () => ({ supported: true }),
		createModel: (credentials) =>
			credentials.kind === "oauth"
				? createOpenAICodexOAuthModel(credentials)
				: createOpenAI({ apiKey: credentials.apiKey }).chat(
						OPENAI_API_SMALL_MODEL_ID,
					),
	},
];

function orderProviders(
	providers: SmallModelProvider[],
	providerOrder?: SmallModelProviderId[],
): SmallModelProvider[] {
	if (!providerOrder || providerOrder.length === 0) {
		return providers;
	}

	const rank = new Map(
		providerOrder.map((providerId, index) => [providerId, index]),
	);
	return [...providers].sort((left, right) => {
		const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
		const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
		return leftRank - rightRank;
	});
}

export async function callSmallModel<TResult>({
	invoke,
	providers = DEFAULT_SMALL_MODEL_PROVIDERS,
	providerOrder,
}: {
	invoke: (
		context: SmallModelInvocationContext,
	) => Promise<TResult | null | undefined>;
	providers?: SmallModelProvider[];
	providerOrder?: SmallModelProviderId[];
}): Promise<{
	result: TResult | null;
	attempts: SmallModelAttempt[];
}> {
	const attempts: SmallModelAttempt[] = [];

	for (const provider of orderProviders(providers, providerOrder)) {
		const credentials = provider.resolveCredentials();
		if (!credentials) {
			attempts.push({
				providerId: provider.id,
				providerName: provider.name,
				outcome: "missing-credentials",
			});
			clearProviderIssue(provider.id);
			continue;
		}
		if (
			credentials.kind === "oauth" &&
			typeof credentials.expiresAt === "number" &&
			credentials.expiresAt <= Date.now()
		) {
			const issue: ProviderIssue = {
				code: "expired",
				capability: "chat",
				remediation: "reconnect",
				message: `${provider.name} session expired`,
			};
			attempts.push({
				providerId: provider.id,
				providerName: provider.name,
				credentialKind: credentials.kind,
				credentialSource: credentials.source,
				issue,
				outcome: "expired-credentials",
				reason: issue.message,
			});
			reportProviderIssue(provider.id, issue);
			continue;
		}

		const support = provider.isSupported(credentials);
		if (!support.supported) {
			const issue: ProviderIssue = {
				code: "unsupported_credentials",
				capability: "small_model_tasks",
				remediation: "add_api_key",
				message:
					support.reason ??
					`${provider.name} credentials are not supported for this request`,
			};
			attempts.push({
				providerId: provider.id,
				providerName: provider.name,
				credentialKind: credentials.kind,
				credentialSource: credentials.source,
				issue,
				outcome: "unsupported-credentials",
				reason: support.reason,
			});
			reportProviderIssue(provider.id, issue);
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
			if (result != null) {
				attempts.push({
					providerId: provider.id,
					providerName: provider.name,
					credentialKind: credentials.kind,
					credentialSource: credentials.source,
					outcome: "succeeded",
				});
				clearProviderIssue(provider.id);
				return { result, attempts };
			}

			attempts.push({
				providerId: provider.id,
				providerName: provider.name,
				credentialKind: credentials.kind,
				credentialSource: credentials.source,
				outcome: "empty-result",
			});
			clearProviderIssue(provider.id);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			const issue = classifyProviderIssue({
				providerId: provider.id,
				errorMessage: reason,
			});
			attempts.push({
				providerId: provider.id,
				providerName: provider.name,
				credentialKind: credentials.kind,
				credentialSource: credentials.source,
				issue,
				outcome: "failed",
				reason,
			});
			reportProviderIssue(provider.id, issue);
		}
	}

	return {
		result: null,
		attempts,
	};
}
