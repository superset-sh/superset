import { EventEmitter } from "node:events";
import { type BrowserWindow, shell } from "electron";
import type {
	AuthProvider,
	AuthSession,
	AuthState,
	SignInResult,
} from "shared/auth";
import { tokenStorage } from "./token-storage";

// Web app URL for OAuth - defaults to production, can be overridden
const WEB_APP_URL =
	process.env.NEXT_PUBLIC_WEB_URL ?? "https://app.superset.sh";

/**
 * Main authentication service
 * Handles OAuth flows, token management, and session state
 */
class AuthService extends EventEmitter {
	private session: AuthSession | null = null;

	/**
	 * Initialize auth service - load persisted session
	 */
	async initialize(): Promise<void> {
		const session = await tokenStorage.load();

		if (!session) {
			return;
		}

		// Check if session is expired
		if (session.expiresAt < Date.now()) {
			console.log("[auth] Stored session expired, clearing");
			await this.clearSession();
			return;
		}

		// Restore session
		this.session = session;
		console.log("[auth] Session restored for user:", this.session.user.email);
	}

	/**
	 * Get current authentication state
	 */
	getState(): AuthState {
		return {
			isSignedIn: !!this.session,
			user: this.session?.user ?? null,
		};
	}

	/**
	 * Get access token for API calls
	 * Returns null if session is expired
	 */
	async getAccessToken(): Promise<string | null> {
		if (!this.session) {
			return null;
		}

		// Check if expired
		if (this.session.expiresAt < Date.now()) {
			console.log("[auth] Session expired");
			await this.clearSession();
			return null;
		}

		return this.session.token;
	}

	/**
	 * Sign in with OAuth provider
	 * Opens system browser to web app OAuth endpoint
	 */
	async signIn(
		provider: AuthProvider,
		_getWindow: () => BrowserWindow | null,
	): Promise<SignInResult> {
		try {
			const authUrl = `${WEB_APP_URL}/api/auth/desktop/${provider}`;

			// Open OAuth flow in system browser
			await shell.openExternal(authUrl);

			// The rest happens async via deep link callback
			console.log("[auth] Opened OAuth flow in browser for:", provider);
			return { success: true };
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to open browser";
			console.error("[auth] Sign in failed:", message);
			return { success: false, error: message };
		}
	}

	/**
	 * Handle session received from deep link callback
	 */
	async handleDeepLinkAuth(session: AuthSession): Promise<SignInResult> {
		try {
			this.session = session;
			await tokenStorage.save(session);
			this.emitStateChange();

			console.log("[auth] Signed in as:", this.session.user.email);
			return { success: true };
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to complete sign in";
			console.error("[auth] Auth handling failed:", message);
			await this.clearSession();
			return { success: false, error: message };
		}
	}

	/**
	 * Sign out - clear session
	 */
	async signOut(): Promise<void> {
		await this.clearSession();
		console.log("[auth] Signed out");
	}

	private async clearSession(): Promise<void> {
		this.session = null;
		await tokenStorage.clear();
		this.emitStateChange();
	}

	private emitStateChange(): void {
		this.emit("state-changed", this.getState());
	}
}

export const authService = new AuthService();
