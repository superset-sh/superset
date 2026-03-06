import { createAuthStorage } from "mastracode";
import {
	ANTHROPIC_AUTH_PROVIDER_ID,
	OPENAI_AUTH_PROVIDER_ID,
} from "../auth/provider-ids";
import {
	type AnthropicEnvVariables,
	type AnthropicRuntimeEnv,
	applyAnthropicRuntimeEnv as applyAnthropicRuntimeEnvToProcess,
	buildAnthropicRuntimeEnv,
	clearAnthropicEnvConfig as clearAnthropicEnvConfigOnDisk,
	getAnthropicEnvConfig as getAnthropicEnvConfigFromDisk,
	parseAnthropicEnvText,
	setAnthropicEnvConfig as setAnthropicEnvConfigOnDisk,
} from "./anthropic-env-config";
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

interface ChatServiceOptions {
	anthropicEnvConfigPath?: string;
}

export class ChatService {
	private authStorage: OpenAIAuthStorage | null = null;
	private readonly oauthFlowController = new OAuthFlowController(() =>
		this.getAuthStorage(),
	);
	private readonly anthropicEnvConfigPath: string | undefined;
	private currentAnthropicRuntimeEnv: AnthropicRuntimeEnv = {};
	private static readonly ANTHROPIC_AUTH_SESSION_TTL_MS = 10 * 60 * 1000;
	private static readonly OPENAI_AUTH_SESSION_TTL_MS = 10 * 60 * 1000;
	private static readonly OAUTH_URL_TIMEOUT_MS = 10_000;

	constructor(options?: ChatServiceOptions) {
		this.anthropicEnvConfigPath = options?.anthropicEnvConfigPath;
		const persistedConfig = getAnthropicEnvConfigFromDisk({
			configPath: this.anthropicEnvConfigPath,
		});
		this.applyAnthropicRuntimeEnv(persistedConfig.variables);
	}

	getAnthropicAuthStatus(): {
		authenticated: boolean;
		method: AnthropicAuthMethod;
	} {
		const storageMethod = resolveAuthMethodForProvider(
			this.getAuthStorage(),
			ANTHROPIC_AUTH_PROVIDER_ID,
			(credential) => credential.access.trim().length > 0,
		);
		if (storageMethod === "oauth") {
			return { authenticated: true, method: "oauth" };
		}
		const hasEnvConfig =
			Object.keys(this.getAnthropicEnvConfig().variables).length > 0;
		if (hasEnvConfig) {
			return { authenticated: true, method: "env" };
		}
		if (storageMethod === "api_key") {
			return { authenticated: true, method: "api_key" };
		}
		return { authenticated: false, method: null };
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
		const config = getAnthropicEnvConfigFromDisk({
			configPath: this.anthropicEnvConfigPath,
		});
		this.applyAnthropicRuntimeEnv(config.variables, input.apiKey);
		return { success: true };
	}

	async clearAnthropicApiKey(): Promise<{ success: true }> {
		clearApiKeyForProvider(this.getAuthStorage(), ANTHROPIC_AUTH_PROVIDER_ID);
		const config = getAnthropicEnvConfigFromDisk({
			configPath: this.anthropicEnvConfigPath,
		});
		this.applyAnthropicRuntimeEnv(config.variables);
		return { success: true };
	}

	getAnthropicEnvConfig(): {
		envText: string;
		variables: AnthropicEnvVariables;
	} {
		return getAnthropicEnvConfigFromDisk({
			configPath: this.anthropicEnvConfigPath,
		});
	}

	async setAnthropicEnvConfig(input: {
		envText: string;
	}): Promise<{ success: true }> {
		const configVariables = parseAnthropicEnvText(input.envText);

		setAnthropicEnvConfigOnDisk(
			{
				envText: input.envText,
			},
			{
				configPath: this.anthropicEnvConfigPath,
			},
		);
		this.clearStoredAnthropicOAuthCredential();
		this.setStoredAnthropicApiKeyFromEnvVariables(configVariables);
		this.applyAnthropicRuntimeEnv(configVariables);
		return { success: true };
	}

	async clearAnthropicEnvConfig(): Promise<{ success: true }> {
		clearAnthropicEnvConfigOnDisk({
			configPath: this.anthropicEnvConfigPath,
		});
		clearApiKeyForProvider(this.getAuthStorage(), ANTHROPIC_AUTH_PROVIDER_ID);
		this.applyAnthropicRuntimeEnv({});
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

	private getStoredAnthropicApiKey(): string | undefined {
		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(ANTHROPIC_AUTH_PROVIDER_ID);
		if (credential?.type !== "api_key") return undefined;
		const key = credential.key.trim();
		return key.length > 0 ? key : undefined;
	}

	private clearStoredAnthropicOAuthCredential(): void {
		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(ANTHROPIC_AUTH_PROVIDER_ID);
		if (credential?.type !== "oauth") return;
		authStorage.remove(ANTHROPIC_AUTH_PROVIDER_ID);
	}

	private setStoredAnthropicApiKeyFromEnvVariables(
		variables: AnthropicEnvVariables,
	): void {
		const rawApiKey =
			variables.ANTHROPIC_API_KEY ?? variables.ANTHROPIC_AUTH_TOKEN;
		const apiKey = rawApiKey?.trim();
		if (!apiKey) return;

		const authStorage = this.getAuthStorage();
		authStorage.reload();
		authStorage.set(ANTHROPIC_AUTH_PROVIDER_ID, {
			type: "api_key",
			key: apiKey,
		});
	}

	private applyAnthropicRuntimeEnv(
		variables: AnthropicEnvVariables,
		fallbackApiKey?: string,
	): void {
		const runtimeEnv = buildAnthropicRuntimeEnv(variables, {
			fallbackApiKey: fallbackApiKey ?? this.getStoredAnthropicApiKey(),
		});
		applyAnthropicRuntimeEnvToProcess(runtimeEnv, {
			previousRuntimeEnv: this.currentAnthropicRuntimeEnv,
		});
		this.currentAnthropicRuntimeEnv = runtimeEnv;
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
