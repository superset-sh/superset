import { createAuthStorage } from "mastracode";
import {
	getCredentialsFromConfig as getAnthropicCredentialsFromConfig,
	getCredentialsFromKeychain as getAnthropicCredentialsFromKeychain,
	isClaudeCredentialExpired,
} from "../auth/anthropic";
import { isOpenAICredentialExpired } from "../auth/openai";
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
import type { AuthStatus } from "./auth-storage-types";
import {
	clearApiKeyForProvider,
	clearCredentialForProvider,
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

type OpenAIAuthStorage = ReturnType<typeof createAuthStorage>;

function summarizeAnthropicAuthUrl(url: string): Record<string, unknown> {
	try {
		const parsed = new URL(url);
		return {
			authOrigin: parsed.origin,
			authPathname: parsed.pathname,
			hasStateParam: parsed.searchParams.has("state"),
			hasCodeChallengeParam: parsed.searchParams.has("code_challenge"),
		};
	} catch {
		return {
			authOrigin: null,
			authPathname: null,
			hasStateParam: null,
			hasCodeChallengeParam: null,
		};
	}
}

function summarizeAnthropicManualInput(input: string): Record<string, unknown> {
	const trimmed = input.trim();
	const looksLikeCallbackUrl = (() => {
		try {
			const url = new URL(trimmed);
			return Boolean(
				url.searchParams.get("code") && url.searchParams.get("state"),
			);
		} catch {
			return false;
		}
	})();

	return {
		manualInputKind: looksLikeCallbackUrl
			? "callback_url"
			: "code_or_code_state",
		manualInputHasStateDelimiter: trimmed.includes("#"),
		manualInputLength: trimmed.length,
	};
}

function hasAnthropicEnvCredential(
	variables: AnthropicEnvVariables,
	fallbackApiKey?: string,
): boolean {
	return Boolean(
		buildAnthropicRuntimeEnv(variables, {
			fallbackApiKey,
		}).ANTHROPIC_API_KEY?.trim(),
	);
}

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

	getAnthropicAuthStatus(): AuthStatus {
		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const storedCredential = authStorage.get(ANTHROPIC_AUTH_PROVIDER_ID);
		const hasManagedOAuth = storedCredential?.type === "oauth";
		const configCredential = getAnthropicCredentialsFromConfig();
		const keychainCredential = getAnthropicCredentialsFromKeychain();
		const externalCandidates = [configCredential, keychainCredential].filter(
			(credential): credential is NonNullable<typeof configCredential> =>
				credential !== null,
		);
		const externalCredential = externalCandidates.find(
			(credential) => !isClaudeCredentialExpired(credential),
		);
		const expiredExternalCredential = externalCandidates.find((credential) =>
			isClaudeCredentialExpired(credential),
		);
		if (externalCredential) {
			const status: AuthStatus = {
				authenticated: true,
				method: externalCredential.kind === "oauth" ? "oauth" : "api_key",
				source: "external",
				issue: null,
				...(hasManagedOAuth ? { hasManagedOAuth: true } : {}),
			};
			this.logAuthResolution("anthropic", {
				resolvedMethod: status.method,
				resolvedSource: status.source,
				externalConfigFound: Boolean(configCredential),
				externalConfigKind: configCredential?.kind ?? null,
				externalKeychainFound: Boolean(keychainCredential),
				externalKeychainKind: keychainCredential?.kind ?? null,
				externalRuntimeAllowed: false,
				hasAnthropicApiKeyEnv: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
				hasAnthropicAuthTokenEnv: Boolean(
					process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
				),
				storageMethod: null,
				hasEnvConfig: false,
				managedRuntimeEnvKeys: Object.keys(
					this.currentAnthropicRuntimeEnv,
				).sort(),
			});
			return status;
		}

		const storageMethod = resolveAuthMethodForProvider(
			authStorage,
			ANTHROPIC_AUTH_PROVIDER_ID,
			(credential) =>
				credential.access.trim().length > 0 &&
				(typeof credential.expires !== "number" ||
					credential.expires > Date.now()),
		);
		const hasExpiredManagedOAuth =
			storedCredential?.type === "oauth" &&
			typeof storedCredential.expires === "number" &&
			storedCredential.expires <= Date.now();
		const anthropicEnvConfig = this.getAnthropicEnvConfig();
		const hasEnvConfig = Object.keys(anthropicEnvConfig.variables).length > 0;
		const hasManagedEnvCredential =
			hasEnvConfig &&
			hasAnthropicEnvCredential(
				anthropicEnvConfig.variables,
				this.getStoredAnthropicApiKey(),
			);
		if (hasManagedEnvCredential) {
			const status: AuthStatus = {
				authenticated: true,
				method: "env",
				source: "managed",
				issue: null,
				...(hasManagedOAuth ? { hasManagedOAuth: true } : {}),
			};
			this.logAuthResolution("anthropic", {
				resolvedMethod: status.method,
				resolvedSource: status.source,
				externalConfigFound: false,
				externalKeychainFound: false,
				externalRuntimeAllowed: false,
				hasAnthropicApiKeyEnv: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
				hasAnthropicAuthTokenEnv: Boolean(
					process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
				),
				storageMethod,
				hasEnvConfig,
				managedRuntimeEnvKeys: Object.keys(
					this.currentAnthropicRuntimeEnv,
				).sort(),
			});
			return status;
		}
		if (storageMethod === "oauth") {
			const status: AuthStatus = {
				authenticated: true,
				method: "oauth",
				source: "managed",
				issue: null,
				hasManagedOAuth: true,
			};
			this.logAuthResolution("anthropic", {
				resolvedMethod: status.method,
				resolvedSource: status.source,
				externalConfigFound: false,
				externalKeychainFound: false,
				externalRuntimeAllowed: false,
				hasAnthropicApiKeyEnv: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
				hasAnthropicAuthTokenEnv: Boolean(
					process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
				),
				storageMethod,
				hasEnvConfig,
				managedRuntimeEnvKeys: Object.keys(
					this.currentAnthropicRuntimeEnv,
				).sort(),
			});
			return status;
		}
		if (storageMethod === "api_key") {
			const status: AuthStatus = {
				authenticated: true,
				method: "api_key",
				source: "managed",
				issue: null,
				...(hasManagedOAuth ? { hasManagedOAuth: true } : {}),
			};
			this.logAuthResolution("anthropic", {
				resolvedMethod: status.method,
				resolvedSource: status.source,
				externalConfigFound: false,
				externalKeychainFound: false,
				externalRuntimeAllowed: false,
				hasAnthropicApiKeyEnv: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
				hasAnthropicAuthTokenEnv: Boolean(
					process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
				),
				storageMethod,
				hasEnvConfig,
				managedRuntimeEnvKeys: Object.keys(
					this.currentAnthropicRuntimeEnv,
				).sort(),
			});
			return status;
		}
		if (expiredExternalCredential) {
			const status: AuthStatus = {
				authenticated: false,
				method: "oauth",
				source: "external",
				issue: "expired",
				...(hasManagedOAuth ? { hasManagedOAuth: true } : {}),
			};
			this.logAuthResolution("anthropic", {
				resolvedMethod: status.method,
				resolvedSource: status.source,
				resolvedIssue: status.issue,
				externalConfigFound: Boolean(configCredential),
				externalConfigKind: configCredential?.kind ?? null,
				externalKeychainFound: Boolean(keychainCredential),
				externalKeychainKind: keychainCredential?.kind ?? null,
				externalRuntimeAllowed: false,
				hasAnthropicApiKeyEnv: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
				hasAnthropicAuthTokenEnv: Boolean(
					process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
				),
				storageMethod,
				hasEnvConfig,
				managedRuntimeEnvKeys: Object.keys(
					this.currentAnthropicRuntimeEnv,
				).sort(),
			});
			return status;
		}
		if (hasExpiredManagedOAuth) {
			const status: AuthStatus = {
				authenticated: false,
				method: "oauth",
				source: "managed",
				issue: "expired",
				hasManagedOAuth: true,
			};
			this.logAuthResolution("anthropic", {
				resolvedMethod: status.method,
				resolvedSource: status.source,
				resolvedIssue: status.issue,
				externalConfigFound: false,
				externalKeychainFound: false,
				externalRuntimeAllowed: false,
				hasAnthropicApiKeyEnv: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
				hasAnthropicAuthTokenEnv: Boolean(
					process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
				),
				storageMethod,
				hasEnvConfig,
				managedRuntimeEnvKeys: Object.keys(
					this.currentAnthropicRuntimeEnv,
				).sort(),
			});
			return status;
		}
		const status: AuthStatus = {
			authenticated: false,
			method: null,
			source: null,
			issue: null,
			...(hasManagedOAuth ? { hasManagedOAuth: true } : {}),
		};
		this.logAuthResolution("anthropic", {
			resolvedMethod: status.method,
			resolvedSource: status.source,
			externalConfigFound: false,
			externalKeychainFound: false,
			externalRuntimeAllowed: false,
			hasAnthropicApiKeyEnv: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
			hasAnthropicAuthTokenEnv: Boolean(
				process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
			),
			storageMethod,
			hasEnvConfig,
			managedRuntimeEnvKeys: Object.keys(
				this.currentAnthropicRuntimeEnv,
			).sort(),
		});
		return status;
	}

	async getOpenAIAuthStatus(): Promise<AuthStatus> {
		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(OPENAI_AUTH_PROVIDER_ID);
		const hasExpiredOAuth =
			credential?.type === "oauth" &&
			isOpenAICredentialExpired({
				kind: "oauth",
				expiresAt:
					typeof credential.expires === "number"
						? credential.expires
						: undefined,
			});
		const method = resolveAuthMethodForProvider(
			authStorage,
			OPENAI_AUTH_PROVIDER_ID,
			(storedCredential) =>
				typeof storedCredential.expires !== "number" ||
				storedCredential.expires > Date.now(),
		);
		const status: AuthStatus = {
			authenticated: method !== null,
			method: hasExpiredOAuth ? "oauth" : method,
			source: method !== null || hasExpiredOAuth ? "managed" : null,
			issue: hasExpiredOAuth ? "expired" : null,
		};
		this.logAuthResolution("openai", {
			resolvedMethod: status.method,
			resolvedSource: status.source,
			externalRuntimeAllowed: false,
			storageMethod: method,
			hasOpenAIApiKeyEnv: Boolean(process.env.OPENAI_API_KEY?.trim()),
			hasOpenAIAuthTokenEnv: Boolean(process.env.OPENAI_AUTH_TOKEN?.trim()),
		});
		return status;
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

	async disconnectOpenAIOAuth(): Promise<{ success: true }> {
		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(OPENAI_AUTH_PROVIDER_ID);
		if (credential?.type === "oauth") {
			clearCredentialForProvider(authStorage, OPENAI_AUTH_PROVIDER_ID);
		}
		this.logAuthResolution("openai", {
			event: "disconnect-oauth",
			storedCredentialType: credential?.type ?? null,
			removed: credential?.type === "oauth",
		});
		return { success: true };
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

	async disconnectAnthropicOAuth(): Promise<{ success: true }> {
		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(ANTHROPIC_AUTH_PROVIDER_ID);
		if (credential?.type === "oauth") {
			clearCredentialForProvider(authStorage, ANTHROPIC_AUTH_PROVIDER_ID);
			const config = getAnthropicEnvConfigFromDisk({
				configPath: this.anthropicEnvConfigPath,
			});
			this.setStoredAnthropicApiKeyFromEnvVariables(config.variables);
			this.applyAnthropicRuntimeEnv(config.variables);
		}
		this.logAuthResolution("anthropic", {
			event: "disconnect-oauth",
			storedCredentialType: credential?.type ?? null,
			removed: credential?.type === "oauth",
		});
		return { success: true };
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
			supportsManualCodeInput: true,
			onStartRequested: () => {
				this.logAnthropicOAuth("start-requested");
			},
			onAuthInfo: (info) => {
				this.logAnthropicOAuth(
					"auth-url-received",
					summarizeAnthropicAuthUrl(info.url),
				);
			},
			onPromptRequested: () => {
				this.logAnthropicOAuth("manual-code-prompt-requested");
			},
			onManualCodeInputRequested: () => {
				this.logAnthropicOAuth("manual-code-input-requested");
			},
			onLoginFailed: (message) => {
				this.logAnthropicOAuth("login-failed", { message });
			},
			onAuthUrlTimeoutOrError: (message) => {
				this.logAnthropicOAuth("auth-url-timeout-or-error", { message });
			},
			onAuthUrlReturned: () => {
				this.logAnthropicOAuth("auth-url-returned-to-ui");
			},
			onCancelWithActiveSession: () => {
				this.logAnthropicOAuth("cancel-requested-with-active-session");
			},
			onCancelWithoutSession: () => {
				this.logAnthropicOAuth("cancel-requested-without-session");
			},
			onSessionCleared: () => {
				this.logAnthropicOAuth("session-cleared");
			},
			onCompleteWithManualInput: (manualInput) => {
				this.logAnthropicOAuth(
					"complete-called-with-manual-input",
					summarizeAnthropicManualInput(manualInput),
				);
			},
			onCompleteWithoutManualInput: () => {
				this.logAnthropicOAuth("complete-called-without-manual-input");
			},
			onLoginSettled: (hasError) => {
				this.logAnthropicOAuth("login-promise-settled", { hasError });
			},
			onMissingOAuthCredential: (credentialType) => {
				this.logAnthropicOAuth("complete-missing-oauth-credential", {
					credentialType,
				});
			},
			onCompleteSuccess: (credential) => {
				this.logAnthropicOAuth("complete-success", {
					credentialType: credential.type,
					expiresAt: credential.expires,
				});
			},
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

	private logAnthropicOAuth(
		event: string,
		details: Record<string, unknown> = {},
	): void {
		console.info("[chat-service][anthropic-oauth]", {
			event,
			...details,
		});
	}

	private logAuthResolution(
		provider: "anthropic" | "openai",
		details: Record<string, unknown>,
	): void {
		console.info("[chat-service][auth-resolution]", {
			provider,
			...details,
		});
	}
}
