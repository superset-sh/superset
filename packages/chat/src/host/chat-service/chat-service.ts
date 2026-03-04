import { createAuthStorage } from "mastracode";
import type { AuthMethod } from "./auth-storage-types";
import {
	clearApiKeyForProvider,
	resolveAuthMethodForProvider,
	setApiKeyForProvider,
} from "./auth-storage-utils";
import {
	OAuthFlowController,
	type OAuthFlowOptions,
} from "./oauth-flow-controller";
import {
	parseOpenAIOAuthUrl,
	summarizeOpenAIManualInput,
} from "./openai-oauth-debug";

type OpenAIAuthMethod = AuthMethod;
type AnthropicAuthMethod = AuthMethod;

type OpenAIAuthStorage = ReturnType<typeof createAuthStorage>;

const OPENAI_AUTH_PROVIDER_ID = "openai-codex";
const ANTHROPIC_AUTH_PROVIDER_ID = "anthropic";

export class ChatService {
	private authStorage: OpenAIAuthStorage | null = null;
	private readonly oauthFlowController = new OAuthFlowController(() =>
		this.getAuthStorage(),
	);
	private static readonly ANTHROPIC_AUTH_SESSION_TTL_MS = 10 * 60 * 1000;
	private static readonly OPENAI_AUTH_SESSION_TTL_MS = 10 * 60 * 1000;
	private static readonly OAUTH_URL_TIMEOUT_MS = 10_000;

	getAnthropicAuthStatus(): {
		authenticated: boolean;
		method: AnthropicAuthMethod;
	} {
		const method = resolveAuthMethodForProvider(
			this.getAuthStorage(),
			ANTHROPIC_AUTH_PROVIDER_ID,
			(credential) => credential.access.trim().length > 0,
		);
		return { authenticated: method !== null, method };
	}

	async getOpenAIAuthStatus(): Promise<{
		authenticated: boolean;
		method: OpenAIAuthMethod;
	}> {
		const method = resolveAuthMethodForProvider(
			this.getAuthStorage(),
			OPENAI_AUTH_PROVIDER_ID,
		);
		return { authenticated: method !== null, method };
	}

	async setOpenAIApiKey(input: { apiKey: string }): Promise<{ success: true }> {
		setApiKeyForProvider(
			this.getAuthStorage(),
			OPENAI_AUTH_PROVIDER_ID,
			input.apiKey,
			"OpenAI API key is required",
		);
		return { success: true };
	}

	async clearOpenAIApiKey(): Promise<{ success: true }> {
		clearApiKeyForProvider(this.getAuthStorage(), OPENAI_AUTH_PROVIDER_ID);
		return { success: true };
	}

	async startOpenAIOAuth(): Promise<{ url: string; instructions: string }> {
		return this.oauthFlowController.start(this.getOpenAIOAuthFlowOptions());
	}

	cancelOpenAIOAuth(): { success: true } {
		return this.oauthFlowController.cancel(this.getOpenAIOAuthFlowOptions());
	}

	async completeOpenAIOAuth(input: {
		code?: string;
	}): Promise<{ success: true }> {
		await this.oauthFlowController.complete(
			this.getOpenAIOAuthFlowOptions(),
			input.code,
		);
		return { success: true };
	}

	async setAnthropicApiKey(input: {
		apiKey: string;
	}): Promise<{ success: true }> {
		setApiKeyForProvider(
			this.getAuthStorage(),
			ANTHROPIC_AUTH_PROVIDER_ID,
			input.apiKey,
			"Anthropic API key is required",
		);
		return { success: true };
	}

	async clearAnthropicApiKey(): Promise<{ success: true }> {
		clearApiKeyForProvider(this.getAuthStorage(), ANTHROPIC_AUTH_PROVIDER_ID);
		return { success: true };
	}

	async startAnthropicOAuth(): Promise<{ url: string; instructions: string }> {
		return this.oauthFlowController.start(this.getAnthropicOAuthFlowOptions());
	}

	cancelAnthropicOAuth(): { success: true } {
		return this.oauthFlowController.cancel(this.getAnthropicOAuthFlowOptions());
	}

	async completeAnthropicOAuth(input: {
		code?: string;
	}): Promise<{ success: true; expiresAt: number }> {
		const credential = await this.oauthFlowController.complete(
			this.getAnthropicOAuthFlowOptions(),
			input.code,
		);
		return { success: true, expiresAt: credential.expires };
	}

	private getOpenAIOAuthFlowOptions(): OAuthFlowOptions {
		return {
			providerId: OPENAI_AUTH_PROVIDER_ID,
			providerName: "OpenAI",
			sessionSlot: "openai",
			ttlMs: ChatService.OPENAI_AUTH_SESSION_TTL_MS,
			urlTimeoutMs: ChatService.OAUTH_URL_TIMEOUT_MS,
			expiredMessage:
				"OpenAI auth session expired. Start auth again and retry.",
			defaultInstructions:
				"Authorize OpenAI in your browser. If callback doesn't complete automatically, paste the code or callback URL here.",
			supportsManualCodeInput: true,
			onStartRequested: () => {
				this.logOpenAIOAuth("start-requested");
			},
			onAuthInfo: (info) => {
				const authDetails = parseOpenAIOAuthUrl(info.url);
				this.logOpenAIOAuth("auth-url-received", authDetails);
				if (authDetails.redirectUriMatchesExpected === false) {
					this.logOpenAIOAuth("unexpected-callback-target", authDetails);
				}
			},
			onPromptRequested: () => {
				this.logOpenAIOAuth("manual-code-prompt-requested");
			},
			onManualCodeInputRequested: () => {
				this.logOpenAIOAuth("manual-code-input-requested");
			},
			onLoginFailed: (message) => {
				this.logOpenAIOAuth("login-failed", { message });
			},
			onAuthUrlTimeoutOrError: (message) => {
				this.logOpenAIOAuth("auth-url-timeout-or-error", { message });
			},
			onAuthUrlReturned: () => {
				this.logOpenAIOAuth("auth-url-returned-to-ui");
			},
			onCancelWithActiveSession: () => {
				this.logOpenAIOAuth("cancel-requested-with-active-session");
			},
			onCancelWithoutSession: () => {
				this.logOpenAIOAuth("cancel-requested-without-session");
			},
			onSessionCleared: () => {
				this.logOpenAIOAuth("session-cleared");
			},
			onCompleteWithManualInput: (manualInput) => {
				this.logOpenAIOAuth(
					"complete-called-with-manual-input",
					summarizeOpenAIManualInput(manualInput),
				);
			},
			onCompleteWithoutManualInput: () => {
				this.logOpenAIOAuth("complete-called-without-manual-input");
			},
			onLoginSettled: (hasError) => {
				this.logOpenAIOAuth("login-promise-settled", { hasError });
			},
			onMissingOAuthCredential: (credentialType) => {
				this.logOpenAIOAuth("complete-missing-oauth-credential", {
					credentialType,
				});
			},
			onCompleteSuccess: (credential) => {
				this.logOpenAIOAuth("complete-success", {
					credentialType: credential.type,
					expiresAt: credential.expires,
				});
			},
		};
	}

	private getAnthropicOAuthFlowOptions(): OAuthFlowOptions {
		return {
			providerId: ANTHROPIC_AUTH_PROVIDER_ID,
			providerName: "Anthropic",
			sessionSlot: "anthropic",
			ttlMs: ChatService.ANTHROPIC_AUTH_SESSION_TTL_MS,
			urlTimeoutMs: ChatService.OAUTH_URL_TIMEOUT_MS,
			expiredMessage:
				"Anthropic auth session expired. Start auth again and paste a fresh code.",
			defaultInstructions:
				"Authorize Anthropic in your browser, then paste the code shown there (format: code#state).",
		};
	}

	private getAuthStorage(): OpenAIAuthStorage {
		if (!this.authStorage) {
			// Standalone auth storage bootstrap.
			// This path intentionally avoids full createMastraCode runtime initialization.
			this.authStorage = createAuthStorage();
		}
		return this.authStorage;
	}

	private logOpenAIOAuth(
		event: string,
		details: Record<string, unknown> = {},
	): void {
		console.info("[chat-service][openai-oauth]", {
			event,
			...details,
		});
	}
}
