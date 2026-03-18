import type {
	AuthStorageCredential,
	AuthStorageLike,
	OAuthAuthInfo,
	OAuthLoginCallbacks,
	StoredOAuthCredential,
} from "./auth-storage-types";

type OAuthSession = {
	createdAt: number;
	abortController: AbortController;
	resolveManualCode: (code: string) => void;
	rejectManualCode: (reason?: unknown) => void;
	loginPromise: Promise<void>;
	error: Error | null;
};

export type OAuthFlowOptions = {
	providerId: string;
	providerName: string;
	sessionSlot: string;
	ttlMs: number;
	urlTimeoutMs: number;
	expiredMessage: string;
	defaultInstructions: string;
	supportsManualCodeInput?: boolean;
	onStartRequested?: () => void;
	onAuthInfo?: (info: OAuthAuthInfo) => void;
	onPromptRequested?: () => void;
	onManualCodeInputRequested?: () => void;
	onLoginFailed?: (message: string) => void;
	onAuthUrlTimeoutOrError?: (message: string) => void;
	onAuthUrlReturned?: () => void;
	onCancelWithActiveSession?: () => void;
	onCancelWithoutSession?: () => void;
	onSessionCleared?: () => void;
	onCompleteWithManualInput?: (input: string) => void;
	onCompleteWithoutManualInput?: () => void;
	onLoginSettled?: (hasError: boolean) => void;
	onMissingOAuthCredential?: (
		credentialType: AuthStorageCredential["type"] | null,
	) => void;
	onCompleteSuccess?: (credential: StoredOAuthCredential) => void;
};

export class OAuthFlowController {
	private sessions = new Map<string, OAuthSession>();

	constructor(private readonly getAuthStorage: () => AuthStorageLike) {}

	async start(
		options: OAuthFlowOptions,
	): Promise<{ url: string; instructions: string }> {
		options.onStartRequested?.();
		this.clear(options);

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
		this.sessions.set(options.sessionSlot, session);

		const callbacks: OAuthLoginCallbacks = {
			onAuth: (info) => {
				options.onAuthInfo?.(info);
				resolveAuthInfo?.(info);
				resolveAuthInfo = null;
				rejectAuthInfo = null;
			},
			onPrompt: async (_prompt) => {
				manualCodeRequested = true;
				options.onPromptRequested?.();
				return manualCodePromise;
			},
			signal: abortController.signal,
		};
		if (options.supportsManualCodeInput) {
			callbacks.onManualCodeInput = async () => {
				manualCodeRequested = true;
				options.onManualCodeInputRequested?.();
				return manualCodePromise;
			};
		}

		const loginPromise = authStorage
			.login(options.providerId, callbacks)
			.catch((error: unknown) => {
				const message =
					error instanceof Error && error.message.trim()
						? error.message
						: `${options.providerName} OAuth failed`;
				const normalizedError = new Error(message);
				session.error = normalizedError;
				options.onLoginFailed?.(message);
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
							new Error(
								`Timed out while waiting for ${options.providerName} OAuth URL`,
							),
						);
					}, options.urlTimeoutMs);
				}),
			]);
		} catch (error) {
			options.onAuthUrlTimeoutOrError?.(
				error instanceof Error ? error.message : String(error),
			);
			this.clear(options);
			throw error;
		}

		options.onAuthUrlReturned?.();
		return {
			url: authInfo.url,
			instructions: authInfo.instructions ?? options.defaultInstructions,
		};
	}

	async complete(
		options: OAuthFlowOptions,
		rawCode?: string,
	): Promise<StoredOAuthCredential> {
		const session = this.sessions.get(options.sessionSlot);
		if (!session) {
			throw new Error(
				`No active ${options.providerName} auth session. Start auth again.`,
			);
		}

		const elapsed = Date.now() - session.createdAt;
		if (elapsed > options.ttlMs) {
			this.clear(options);
			throw new Error(options.expiredMessage);
		}

		const trimmedCode = rawCode?.trim();
		if (trimmedCode) {
			options.onCompleteWithManualInput?.(trimmedCode);
			session.resolveManualCode(trimmedCode);
		} else {
			options.onCompleteWithoutManualInput?.();
		}

		await session.loginPromise;
		const error = session.error;
		options.onLoginSettled?.(Boolean(error));
		this.clear(options);
		if (error) {
			throw error;
		}

		const authStorage = this.getAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(options.providerId);
		if (credential?.type !== "oauth") {
			options.onMissingOAuthCredential?.(credential?.type ?? null);
			throw new Error(
				`${options.providerName} OAuth did not return credentials`,
			);
		}
		options.onCompleteSuccess?.(credential);
		return credential;
	}

	cancel(options: OAuthFlowOptions): { success: true } {
		const session = this.sessions.get(options.sessionSlot);
		if (session) {
			options.onCancelWithActiveSession?.();
			session.abortController.abort();
			session.rejectManualCode(
				new Error(`${options.providerName} auth cancelled`),
			);
		} else {
			options.onCancelWithoutSession?.();
		}
		this.sessions.delete(options.sessionSlot);
		return { success: true };
	}

	private clear(options: OAuthFlowOptions): void {
		const session = this.sessions.get(options.sessionSlot);
		if (!session) return;

		options.onSessionCleared?.();
		session.abortController.abort();
		session.rejectManualCode(
			new Error(`${options.providerName} auth session closed`),
		);
		this.sessions.delete(options.sessionSlot);
	}
}
