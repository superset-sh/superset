import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createAuthStorage } from "mastracode";
import {
	type ClaudeCredentials,
	getCredentialsFromAnySource as getAnthropicCredentialsFromAnySource,
	getAnthropicProviderOptions,
} from "../auth/anthropic";
import {
	getOpenAICredentialsFromAnySource,
	type OpenAICredentials,
} from "../auth/openai";
import { OPENAI_AUTH_PROVIDER_ID } from "../auth/provider-ids";

export type SmallModelProviderId = "anthropic" | "openai";

export interface SmallModelCredential {
	apiKey: string;
	kind: "apiKey" | "oauth";
	source: string;
	expiresAt?: number;
	accountId?: string;
	providerId?: string;
}

export interface SmallModelProvider {
	id: SmallModelProviderId;
	name: string;
	resolveCredentials: () =>
		| SmallModelCredential
		| null
		| Promise<SmallModelCredential | null>;
	isSupported: (credentials: SmallModelCredential) => {
		supported: boolean;
		reason?: string;
	};
	createModel: (
		credentials: SmallModelCredential,
	) => unknown | Promise<unknown>;
}

const OPENAI_CODEX_API_ENDPOINT =
	"https://chatgpt.com/backend-api/codex/responses";
const OPENAI_CODEX_SMALL_MODEL_ID = "gpt-5.1-codex-mini";
const OPENAI_API_SMALL_MODEL_ID = "gpt-4o-mini";

function createOpenAICodexOAuthModel(credentials: OpenAICredentials) {
	const authStorage = createAuthStorage();
	const openAIAuthProviderId =
		credentials.providerId ?? OPENAI_AUTH_PROVIDER_ID;
	const oauthFetchImpl = async (
		url: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	): Promise<Response> => {
		authStorage.reload();
		const storedCredential = authStorage.get(openAIAuthProviderId);
		if (!storedCredential || storedCredential.type !== "oauth") {
			throw new Error("Not logged in to OpenAI Codex. Reconnect OpenAI.");
		}

		let accessToken = storedCredential.access;
		if (
			typeof storedCredential.expires === "number" &&
			Date.now() >= storedCredential.expires
		) {
			const refreshedToken = await authStorage.getApiKey(openAIAuthProviderId);
			if (!refreshedToken) {
				throw new Error(
					"Failed to refresh OpenAI Codex token. Please reconnect OpenAI.",
				);
			}
			accessToken = refreshedToken;
			authStorage.reload();
		}

		const refreshedCredential = authStorage.get(openAIAuthProviderId);
		const accountId =
			refreshedCredential &&
			typeof refreshedCredential === "object" &&
			"accountId" in refreshedCredential &&
			typeof refreshedCredential.accountId === "string" &&
			refreshedCredential.accountId.trim().length > 0
				? refreshedCredential.accountId.trim()
				: credentials.accountId?.trim() || undefined;

		const baseRequest = new Request(url, init);
		const parsedUrl = new URL(baseRequest.url);
		const shouldRewrite =
			parsedUrl.pathname.includes("/v1/responses") ||
			parsedUrl.pathname.includes("/chat/completions");
		const outgoingRequest = new Request(
			shouldRewrite ? OPENAI_CODEX_API_ENDPOINT : baseRequest.url,
			baseRequest,
		);
		const headers = new Headers(outgoingRequest.headers);
		headers.delete("authorization");
		headers.set("Authorization", `Bearer ${accessToken}`);
		if (accountId) {
			headers.set("ChatGPT-Account-Id", accountId);
		}

		return fetch(
			new Request(outgoingRequest, {
				headers,
			}),
		);
	};
	const bunFetch = globalThis.fetch as typeof fetch & {
		preconnect?: typeof globalThis.fetch;
	};
	const oauthFetch = Object.assign(
		oauthFetchImpl,
		typeof bunFetch.preconnect === "function"
			? { preconnect: bunFetch.preconnect.bind(globalThis.fetch) }
			: {},
	) as typeof fetch;

	return createOpenAI({
		apiKey: "oauth-dummy-key",
		fetch: oauthFetch,
	}).responses(OPENAI_CODEX_SMALL_MODEL_ID);
}

export function getDefaultSmallModelProviders(): SmallModelProvider[] {
	return [
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
					? createOpenAICodexOAuthModel(credentials as OpenAICredentials)
					: createOpenAI({ apiKey: credentials.apiKey }).chat(
							OPENAI_API_SMALL_MODEL_ID,
						),
		},
	];
}
