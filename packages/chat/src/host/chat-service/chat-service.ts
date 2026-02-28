import { createAuthStorage } from "mastracode";

type OpenAIAuthMethod = "api_key" | "oauth" | null;
type AnthropicAuthMethod = "api_key" | "oauth" | null;
type AuthStorageCredential =
	| { type: "api_key"; key: string }
	| { type: "oauth"; access: string; expires: number; refresh?: string };
type OAuthAuthInfo = {
	url: string;
	instructions?: string;
};
type OAuthSession = {
	createdAt: number;
	abortController: AbortController;
	resolveManualCode: (code: string) => void;
	rejectManualCode: (reason?: unknown) => void;
	loginPromise: Promise<void>;
	error: Error | null;
};

const OPENAI_AUTH_PROVIDER_ID = "openai-codex";
const ANTHROPIC_AUTH_PROVIDER_ID = "anthropic";
type OpenAIAuthStorage = ReturnType<typeof createAuthStorage>;

export class ChatService {
	private anthropicOAuthSession: OAuthSession | null = null;
	private openAIOAuthSession: OAuthSession | null = null;
	private authStorage: OpenAIAuthStorage | null = null;
	private static readonly ANTHROPIC_AUTH_SESSION_TTL_MS = 10 * 60 * 1000;
	private static readonly OPENAI_AUTH_SESSION_TTL_MS = 10 * 60 * 1000;
	private static readonly OAUTH_URL_TIMEOUT_MS = 10_000;

	getAnthropicAuthStatus(): {
		authenticated: boolean;
		method: AnthropicAuthMethod;
	} {
		const method = this.resolveAnthropicAuthMethod();
		return { authenticated: method !== null, method };
	}

	async getOpenAIAuthStatus(): Promise<{
		authenticated: boolean;
		method: OpenAIAuthMethod;
	}> {
		const method = this.resolveOpenAIAuthMethod();
		return { authenticated: method !== null, method };
	}

	async setOpenAIApiKey(input: { apiKey: string }): Promise<{ success: true }> {
		const trimmedApiKey = input.apiKey.trim();
		if (trimmedApiKey.length === 0) {
			throw new Error("OpenAI API key is required");
		}

		const authStorage = this.getAuthStorage();
		authStorage.reload();
		authStorage.set(OPENAI_AUTH_PROVIDER_ID, {
			type: "api_key",
			key: trimmedApiKey,
		} satisfies AuthStorageCredential);
		return { success: true };
	}

	async clearOpenAIApiKey(): Promise<{ success: true }> {
		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(OPENAI_AUTH_PROVIDER_ID);
		if (credential?.type !== "api_key") {
			return { success: true };
		}

		authStorage.remove(OPENAI_AUTH_PROVIDER_ID);

		return { success: true };
	}

	async startOpenAIOAuth(): Promise<{ url: string; instructions: string }> {
		this.clearOpenAIOAuthSession();

		const authStorage = this.getAuthStorage();
		authStorage.reload();

		let resolveAuthInfo: ((info: OAuthAuthInfo) => void) | null = null;
		let rejectAuthInfo: ((reason?: unknown) => void) | null = null;
		const authInfoPromise = new Promise<OAuthAuthInfo>((resolve, reject) => {
			resolveAuthInfo = resolve;
			rejectAuthInfo = reject;
		});

		let resolveManualCode: ((code: string) => void) | null = null;
		let rejectManualCode: ((reason?: unknown) => void) | null = null;
		let manualCodeRequested = false;
		const manualCodePromise = new Promise<string>((resolve, reject) => {
			resolveManualCode = resolve;
			rejectManualCode = reject;
		});

		const abortController = new AbortController();
		const session: OAuthSession = {
			createdAt: Date.now(),
			abortController,
			resolveManualCode: (code: string) => {
				resolveManualCode?.(code);
				resolveManualCode = null;
				rejectManualCode = null;
			},
			rejectManualCode: (reason?: unknown) => {
				if (!manualCodeRequested) {
					resolveManualCode = null;
					rejectManualCode = null;
					return;
				}
				rejectManualCode?.(reason);
				resolveManualCode = null;
				rejectManualCode = null;
			},
			loginPromise: Promise.resolve(),
			error: null,
		};
		this.openAIOAuthSession = session;

		const loginPromise = authStorage
			.login(OPENAI_AUTH_PROVIDER_ID, {
				onAuth: (info) => {
					resolveAuthInfo?.(info);
					resolveAuthInfo = null;
					rejectAuthInfo = null;
				},
				onPrompt: async () => {
					manualCodeRequested = true;
					return manualCodePromise;
				},
				onManualCodeInput: async () => {
					manualCodeRequested = true;
					return manualCodePromise;
				},
				signal: abortController.signal,
			})
			.catch((error: unknown) => {
				const message =
					error instanceof Error && error.message.trim()
						? error.message
						: "OpenAI OAuth failed";
				const normalizedError = new Error(message);
				session.error = normalizedError;
				rejectAuthInfo?.(normalizedError);
				rejectAuthInfo = null;
				resolveAuthInfo = null;
			});
		session.loginPromise = loginPromise;

		let authInfo: OAuthAuthInfo;
		try {
			authInfo = await Promise.race([
				authInfoPromise,
				new Promise<OAuthAuthInfo>((_, reject) => {
					setTimeout(() => {
						reject(new Error("Timed out while waiting for OpenAI OAuth URL"));
					}, ChatService.OAUTH_URL_TIMEOUT_MS);
				}),
			]);
		} catch (error) {
			this.clearOpenAIOAuthSession();
			throw error;
		}

		return {
			url: authInfo.url,
			instructions:
				authInfo.instructions ??
				"Authorize OpenAI in your browser. If callback doesn't complete automatically, paste the code or callback URL here.",
		};
	}

	cancelOpenAIOAuth(): { success: true } {
		if (this.openAIOAuthSession) {
			this.openAIOAuthSession.abortController.abort();
			this.openAIOAuthSession.rejectManualCode(
				new Error("OpenAI auth cancelled"),
			);
		}
		this.openAIOAuthSession = null;
		return { success: true };
	}

	async completeOpenAIOAuth(input: {
		code?: string;
	}): Promise<{ success: true }> {
		const session = this.openAIOAuthSession;
		if (!session) {
			throw new Error("No active OpenAI auth session. Start auth again.");
		}

		const elapsed = Date.now() - session.createdAt;
		if (elapsed > ChatService.OPENAI_AUTH_SESSION_TTL_MS) {
			this.clearOpenAIOAuthSession();
			throw new Error(
				"OpenAI auth session expired. Start auth again and retry.",
			);
		}

		const trimmedCode = input.code?.trim();
		if (trimmedCode) {
			session.resolveManualCode(trimmedCode);
		}

		await session.loginPromise;
		const error = session.error;
		this.clearOpenAIOAuthSession();
		if (error) {
			throw error;
		}

		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(OPENAI_AUTH_PROVIDER_ID);
		if (credential?.type !== "oauth") {
			throw new Error("OpenAI OAuth did not return credentials");
		}
		return { success: true };
	}

	async setAnthropicApiKey(input: {
		apiKey: string;
	}): Promise<{ success: true }> {
		const trimmedApiKey = input.apiKey.trim();
		if (trimmedApiKey.length === 0) {
			throw new Error("Anthropic API key is required");
		}

		const authStorage = this.getAuthStorage();
		authStorage.reload();
		authStorage.set(ANTHROPIC_AUTH_PROVIDER_ID, {
			type: "api_key",
			key: trimmedApiKey,
		} satisfies AuthStorageCredential);
		return { success: true };
	}

	async clearAnthropicApiKey(): Promise<{ success: true }> {
		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(ANTHROPIC_AUTH_PROVIDER_ID);
		if (credential?.type !== "api_key") {
			return { success: true };
		}

		authStorage.remove(ANTHROPIC_AUTH_PROVIDER_ID);

		return { success: true };
	}

	async startAnthropicOAuth(): Promise<{ url: string; instructions: string }> {
		this.clearAnthropicOAuthSession();

		const authStorage = this.getAuthStorage();
		authStorage.reload();

		let resolveAuthInfo: ((info: OAuthAuthInfo) => void) | null = null;
		let rejectAuthInfo: ((reason?: unknown) => void) | null = null;
		const authInfoPromise = new Promise<OAuthAuthInfo>((resolve, reject) => {
			resolveAuthInfo = resolve;
			rejectAuthInfo = reject;
		});

		let resolveManualCode: ((code: string) => void) | null = null;
		let rejectManualCode: ((reason?: unknown) => void) | null = null;
		let manualCodeRequested = false;
		const manualCodePromise = new Promise<string>((resolve, reject) => {
			resolveManualCode = resolve;
			rejectManualCode = reject;
		});

		const abortController = new AbortController();
		const session: OAuthSession = {
			createdAt: Date.now(),
			abortController,
			resolveManualCode: (code: string) => {
				resolveManualCode?.(code);
				resolveManualCode = null;
				rejectManualCode = null;
			},
			rejectManualCode: (reason?: unknown) => {
				if (!manualCodeRequested) {
					resolveManualCode = null;
					rejectManualCode = null;
					return;
				}
				rejectManualCode?.(reason);
				resolveManualCode = null;
				rejectManualCode = null;
			},
			loginPromise: Promise.resolve(),
			error: null,
		};
		this.anthropicOAuthSession = session;

		const loginPromise = authStorage
			.login(ANTHROPIC_AUTH_PROVIDER_ID, {
				onAuth: (info) => {
					resolveAuthInfo?.(info);
					resolveAuthInfo = null;
					rejectAuthInfo = null;
				},
				onPrompt: async () => {
					manualCodeRequested = true;
					return manualCodePromise;
				},
				signal: abortController.signal,
			})
			.catch((error: unknown) => {
				const message =
					error instanceof Error && error.message.trim()
						? error.message
						: "Anthropic OAuth failed";
				const normalizedError = new Error(message);
				session.error = normalizedError;
				rejectAuthInfo?.(normalizedError);
				rejectAuthInfo = null;
				resolveAuthInfo = null;
			});
		session.loginPromise = loginPromise;

		let authInfo: OAuthAuthInfo;
		try {
			authInfo = await Promise.race([
				authInfoPromise,
				new Promise<OAuthAuthInfo>((_, reject) => {
					setTimeout(() => {
						reject(
							new Error("Timed out while waiting for Anthropic OAuth URL"),
						);
					}, ChatService.OAUTH_URL_TIMEOUT_MS);
				}),
			]);
		} catch (error) {
			this.clearAnthropicOAuthSession();
			throw error;
		}

		return {
			url: authInfo.url,
			instructions:
				authInfo.instructions ??
				"Authorize Anthropic in your browser, then paste the code shown there (format: code#state).",
		};
	}

	cancelAnthropicOAuth(): { success: true } {
		if (this.anthropicOAuthSession) {
			this.anthropicOAuthSession.abortController.abort();
			this.anthropicOAuthSession.rejectManualCode(
				new Error("Anthropic auth cancelled"),
			);
		}
		this.anthropicOAuthSession = null;
		return { success: true };
	}

	async completeAnthropicOAuth(input: {
		code?: string;
	}): Promise<{ success: true; expiresAt: number }> {
		const session = this.anthropicOAuthSession;
		if (!session) {
			throw new Error("No active Anthropic auth session. Start auth again.");
		}

		const elapsed = Date.now() - session.createdAt;
		if (elapsed > ChatService.ANTHROPIC_AUTH_SESSION_TTL_MS) {
			this.clearAnthropicOAuthSession();
			throw new Error(
				"Anthropic auth session expired. Start auth again and paste a fresh code.",
			);
		}

		const trimmedCode = input.code?.trim();
		if (trimmedCode) {
			session.resolveManualCode(trimmedCode);
		}

		await session.loginPromise;
		const error = session.error;
		this.clearAnthropicOAuthSession();
		if (error) {
			throw error;
		}

		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(ANTHROPIC_AUTH_PROVIDER_ID);
		if (credential?.type !== "oauth") {
			throw new Error("Anthropic OAuth did not return credentials");
		}
		return { success: true, expiresAt: credential.expires };
	}

	private resolveOpenAIAuthMethod(): OpenAIAuthMethod {
		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(OPENAI_AUTH_PROVIDER_ID);
		if (credential?.type === "oauth") {
			return "oauth";
		}
		if (credential?.type === "api_key" && credential.key.trim().length > 0) {
			return "api_key";
		}
		return null;
	}

	private resolveAnthropicAuthMethod(): AnthropicAuthMethod {
		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(ANTHROPIC_AUTH_PROVIDER_ID);
		if (credential?.type === "oauth" && credential.access.trim().length > 0) {
			return "oauth";
		}
		if (credential?.type === "api_key" && credential.key.trim().length > 0) {
			return "api_key";
		}
		return null;
	}

	private getAuthStorage(): OpenAIAuthStorage {
		if (!this.authStorage) {
			// Standalone auth storage bootstrap.
			// This path intentionally avoids full createMastraCode runtime initialization.
			this.authStorage = createAuthStorage();
		}
		return this.authStorage;
	}

	private clearOpenAIOAuthSession(): void {
		if (!this.openAIOAuthSession) return;
		this.openAIOAuthSession.abortController.abort();
		this.openAIOAuthSession.rejectManualCode(
			new Error("OpenAI auth session closed"),
		);
		this.openAIOAuthSession = null;
	}

	private clearAnthropicOAuthSession(): void {
		if (!this.anthropicOAuthSession) return;
		this.anthropicOAuthSession.abortController.abort();
		this.anthropicOAuthSession.rejectManualCode(
			new Error("Anthropic auth session closed"),
		);
		this.anthropicOAuthSession = null;
	}
}
