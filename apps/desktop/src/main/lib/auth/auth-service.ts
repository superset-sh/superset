import { EventEmitter } from "node:events";
import { TOKEN_CONFIG } from "@superset/shared/constants";
import { type BrowserWindow, shell } from "electron";
import { env } from "main/env.main";
import type { AuthProvider, AuthSession, SignInResult } from "shared/auth";
import { pkceStore } from "./pkce";
import { tokenStorage } from "./token-storage";

/**
 * Response from the refresh endpoint (includes rotated refresh token)
 */
interface RefreshResponse {
	access_token: string;
	access_token_expires_at: number;
	refresh_token: string;
	refresh_token_expires_at: number;
}

/**
 * Main authentication service
 * Handles OAuth flows, token management, and session state with auto-refresh
 */
class AuthService extends EventEmitter {
	private session: AuthSession | null = null;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private isRefreshing = false;

	/**
	 * Initialize auth service - load persisted session
	 */
	async initialize(): Promise<void> {
		const session = await tokenStorage.load();

		if (!session) {
			return;
		}

		// Check if refresh token is expired (session is truly over)
		if (session.refreshTokenExpiresAt < Date.now()) {
			console.log("[auth] Refresh token expired, clearing session");
			await this.clearSession();
			return;
		}

		// Restore session
		this.session = session;
		console.log("[auth] Session restored");

		// Check if access token needs refresh
		if (this.shouldRefreshAccessToken()) {
			console.log("[auth] Access token expired/expiring, refreshing...");
			await this.refreshAccessToken();
		}

		// Schedule next refresh
		this.scheduleRefresh();
	}

	/**
	 * Get current authentication state
	 */
	getState() {
		return {
			isSignedIn: !!this.session,
		};
	}

	/**
	 * Get access token for API calls
	 * Automatically refreshes if needed
	 */
	async getAccessToken(): Promise<string | null> {
		if (!this.session) {
			return null;
		}

		// Check if refresh token is expired
		if (this.session.refreshTokenExpiresAt < Date.now()) {
			console.log("[auth] Refresh token expired");
			await this.clearSession();
			return null;
		}

		// Refresh access token if needed
		if (this.shouldRefreshAccessToken()) {
			await this.refreshAccessToken();
		}

		return this.session?.accessToken ?? null;
	}

	/**
	 * Sign in with OAuth provider
	 * Opens system browser to web app OAuth endpoint with PKCE
	 */
	async signIn(
		provider: AuthProvider,
		_getWindow: () => BrowserWindow | null,
	): Promise<SignInResult> {
		try {
			// Generate PKCE challenge + state for CSRF protection
			const { codeChallenge, state } = pkceStore.createChallenge();

			// Build auth URL with PKCE + state parameters
			const authUrl = new URL(
				`${env.NEXT_PUBLIC_WEB_URL}/api/auth/desktop/${provider}`,
			);
			authUrl.searchParams.set("code_challenge", codeChallenge);
			authUrl.searchParams.set("code_challenge_method", "S256");
			authUrl.searchParams.set("state", state);

			// Open OAuth flow in system browser
			await shell.openExternal(authUrl.toString());

			// The rest happens async via deep link callback
			console.log("[auth] Opened OAuth flow in browser for:", provider);
			return { success: true };
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to open browser";
			console.error("[auth] Sign in failed:", message);
			pkceStore.clear(); // Clean up on failure
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
			this.scheduleRefresh();
			this.emitStateChange();

			console.log("[auth] Signed in");
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

	/**
	 * Check if access token should be refreshed
	 */
	private shouldRefreshAccessToken(): boolean {
		if (!this.session) return false;

		const timeUntilExpiry = this.session.accessTokenExpiresAt - Date.now();
		return timeUntilExpiry < TOKEN_CONFIG.REFRESH_THRESHOLD * 1000;
	}

	/**
	 * Refresh the access token using the refresh token
	 */
	private async refreshAccessToken(): Promise<void> {
		if (!this.session || this.isRefreshing) return;

		this.isRefreshing = true;

		try {
			console.log("[auth] Refreshing access token...");

			const response = await fetch(
				`${env.NEXT_PUBLIC_API_URL}/api/auth/desktop/refresh`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						refresh_token: this.session.refreshToken,
					}),
				},
			);

			if (!response.ok) {
				const errorBody = await response.json().catch(() => ({}));

				// If refresh token is invalid/expired, clear session
				if (response.status === 401) {
					console.log("[auth] Refresh token invalid, clearing session");
					await this.clearSession();
					return;
				}

				throw new Error(
					errorBody.error || `Refresh failed: ${response.status}`,
				);
			}

			const data: RefreshResponse = await response.json();

			// Update session with new access token and rotated refresh token
			this.session = {
				...this.session,
				accessToken: data.access_token,
				accessTokenExpiresAt: data.access_token_expires_at,
				refreshToken: data.refresh_token,
				refreshTokenExpiresAt: data.refresh_token_expires_at,
			};

			// Persist updated session
			await tokenStorage.save(this.session);
			console.log("[auth] Access token refreshed");

			// Reschedule next refresh
			this.scheduleRefresh();
		} catch (err) {
			console.error("[auth] Token refresh failed:", err);
		} finally {
			this.isRefreshing = false;
		}
	}

	/**
	 * Schedule automatic token refresh
	 */
	private scheduleRefresh(): void {
		// Clear existing timer
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}

		if (!this.session) return;

		// Calculate when to refresh (before expiry threshold)
		const timeUntilRefresh =
			this.session.accessTokenExpiresAt -
			Date.now() -
			TOKEN_CONFIG.REFRESH_THRESHOLD * 1000;

		if (timeUntilRefresh > 0) {
			console.log(
				`[auth] Scheduled token refresh in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`,
			);
			this.refreshTimer = setTimeout(() => {
				this.refreshAccessToken();
			}, timeUntilRefresh);
		}
	}

	private async clearSession(): Promise<void> {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		this.session = null;
		await tokenStorage.clear();
		this.emitStateChange();
	}

	private emitStateChange(): void {
		this.emit("state-changed", this.getState());
	}
}

export const authService = new AuthService();
