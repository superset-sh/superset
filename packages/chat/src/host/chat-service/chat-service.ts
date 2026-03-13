import { createAuthStorage } from "mastracode";
import {
	getCredentialsFromConfig as getAnthropicCredentialsFromConfig,
	getCredentialsFromKeychain as getAnthropicCredentialsFromKeychain,
	isClaudeCredentialExpired,
} from "../auth/anthropic";
import {
	getOpenAICredentialsFromAuthStorage,
	isOpenAICredentialExpired,
} from "../auth/openai";
import {
	ANTHROPIC_AUTH_PROVIDER_ID,
	OPENAI_AUTH_PROVIDER_ID,
	OPENAI_AUTH_PROVIDER_IDS,
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

type OpenAIAuthStorage = ReturnType<typeof createAuthStorage>;

function hasAnthropicEnvCredential(variables: AnthropicEnvVariables): boolean {
	return Boolean(
		variables.ANTHROPIC_API_KEY?.trim() ||
			variables.ANTHROPIC_AUTH_TOKEN?.trim(),
	);
}

function stripAnthropicCredentialEnvVariables(
	variables: AnthropicEnvVariables,
): AnthropicEnvVariables {
	const nextVariables = { ...variables };
	delete nextVariables.ANTHROPIC_API_KEY;
	delete nextVariables.ANTHROPIC_AUTH_TOKEN;
	return nextVariables;
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
		this.applyAnthropicRuntimeEnv(
			stripAnthropicCredentialEnvVariables(persistedConfig.variables),
		);
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
			hasEnvConfig && hasAnthropicEnvCredential(anthropicEnvConfig.variables);
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
		const credential = getOpenAICredentialsFromAuthStorage(
			this.getAuthStorage(),
		);
		const hasExpiredOAuth =
			credential !== null && isOpenAICredentialExpired(credential);
		const method = credential
			? credential.kind === "oauth"
				? "oauth"
				: "api_key"
			: null;
		const status: AuthStatus = {
			authenticated: method !== null && !hasExpiredOAuth,
			method: hasExpiredOAuth ? "oauth" : method,
			source: method !== null ? "managed" : null,
			issue: hasExpiredOAuth ? "expired" : null,
		};
		this.logAuthResolution("openai", {
			resolvedMethod: status.method,
			resolvedSource: status.source,
			externalRuntimeAllowed: false,
			storageProviderId: credential?.providerId ?? null,
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
		const authStorage = this.getAuthStorage();
		for (const providerId of OPENAI_AUTH_PROVIDER_IDS) {
			clearApiKeyForProvider(authStorage, providerId);
		}
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
		const removedProviderIds: string[] = [];
		for (const providerId of OPENAI_AUTH_PROVIDER_IDS) {
			const credential = authStorage.get(providerId);
			if (credential?.type !== "oauth") {
				continue;
			}

			clearCredentialForProvider(authStorage, providerId);
			removedProviderIds.push(providerId);
		}
		this.logAuthResolution("openai", {
			event: "disconnect-oauth",
			removed: removedProviderIds.length > 0,
			removedProviderIds,
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
		this.applyAnthropicRuntimeEnv(
			stripAnthropicCredentialEnvVariables(config.variables),
		);
		return { success: true };
	}

	async clearAnthropicApiKey(): Promise<{ success: true }> {
		clearApiKeyForProvider(this.getAuthStorage(), ANTHROPIC_AUTH_PROVIDER_ID);
		const config = getAnthropicEnvConfigFromDisk({
			configPath: this.anthropicEnvConfigPath,
		});
		this.applyAnthropicRuntimeEnv(
			stripAnthropicCredentialEnvVariables(config.variables),
		);
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
		this.applyAnthropicRuntimeEnv(
			stripAnthropicCredentialEnvVariables(configVariables),
		);
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
			this.applyAnthropicRuntimeEnv(
				stripAnthropicCredentialEnvVariables(config.variables),
			);
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

	private applyAnthropicRuntimeEnv(variables: AnthropicEnvVariables): void {
		const runtimeEnv = buildAnthropicRuntimeEnv(variables);
		applyAnthropicRuntimeEnvToProcess(runtimeEnv, {
			previousRuntimeEnv: this.currentAnthropicRuntimeEnv,
		});
		this.currentAnthropicRuntimeEnv = runtimeEnv;
	}

	private logAuthResolution(
		provider: "anthropic" | "openai",
		details: Record<string, unknown>,
	): void {
		if (process.env.SUPERSET_DEBUG_AUTH !== "1") {
			return;
		}

		console.info("[chat-service][auth-resolution]", {
			provider,
			...details,
		});
	}
}
