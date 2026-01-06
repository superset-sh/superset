import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { type BrowserWindow, shell } from "electron";
import { env } from "main/env.main";
import type { AuthProvider, AuthSession, SignInResult } from "shared/auth";
import { tokenStorage } from "./token-storage";

/**
 * Store for state parameter (CSRF protection)
 */
const stateStore = new Map<string, number>(); // state -> timestamp

/**
 * Generate random state for CSRF protection
 */
function generateState(): string {
	const state = crypto.randomBytes(32).toString("base64url");
	stateStore.set(state, Date.now());
	// Clean up old states (older than 10 minutes)
	const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
	for (const [s, timestamp] of stateStore) {
		if (timestamp < tenMinutesAgo) {
			stateStore.delete(s);
		}
	}
	return state;
}

/**
 * Verify and consume state
 */
function verifyState(state: string): boolean {
	if (!stateStore.has(state)) {
		return false;
	}
	stateStore.delete(state);
	return true;
}

interface TokenResponse {
	accessToken: string;
	accessTokenExpiresAt: number;
	refreshToken: string;
	refreshTokenExpiresAt: number;
}

/**
 * Type guard to validate token response shape at runtime
 */
function isValidTokenResponse(data: unknown): data is TokenResponse {
	if (typeof data !== "object" || data === null) {
		return false;
	}
	const obj = data as Record<string, unknown>;
	return (
		typeof obj.accessToken === "string" &&
		obj.accessToken.length > 0 &&
		typeof obj.accessTokenExpiresAt === "number" &&
		obj.accessTokenExpiresAt > 0 &&
		typeof obj.refreshToken === "string" &&
		obj.refreshToken.length > 0 &&
		typeof obj.refreshTokenExpiresAt === "number" &&
		obj.refreshTokenExpiresAt > 0
	);
}

/**
 * Main authentication service
 * Handles direct Google OAuth flow, with token exchange via API
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

		// Check if access token is expired
		if (session.accessTokenExpiresAt < Date.now()) {
			console.log("[auth] Access token expired on startup");

			// Check if refresh token is still valid
			if (session.refreshToken && session.refreshTokenExpiresAt > Date.now()) {
				console.log("[auth] Attempting to refresh tokens on startup");
				this.session = session; // Temporarily set to allow refresh
				const result = await this.refreshTokens();

				if (result === "success") {
					console.log("[auth] Session restored via token refresh");
					return;
				}

				if (result === "network_error") {
					// Offline - keep session with expired access token
					// User can work offline, and we'll refresh when online
					console.log("[auth] Offline - keeping session for offline use");
					this.session = session;
					return;
				}

				// result === "invalid" - tokens are revoked, must clear
			}

			// Refresh token invalid/expired or no refresh token
			console.log("[auth] Session fully expired, clearing");
			await this.clearSession();
			return;
		}

		// Restore session
		this.session = session;
		console.log("[auth] Session restored");
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
	 * Automatically refreshes if access token is expired but refresh token is valid
	 * Returns null if offline or tokens invalid (caller should handle gracefully)
	 */
	async getAccessToken(): Promise<string | null> {
		if (!this.session) {
			return null;
		}

		// Check if access token is expired
		if (this.session.accessTokenExpiresAt < Date.now()) {
			console.log("[auth] Access token expired, attempting refresh");

			// Check if refresh token is still valid
			if (
				this.session.refreshToken &&
				this.session.refreshTokenExpiresAt > Date.now()
			) {
				const result = await this.refreshTokens();
				if (result === "success") {
					return this.session.accessToken;
				}
				if (result === "network_error") {
					// Offline - return null but don't clear session
					// User stays signed in, but can't make API calls until online
					console.log("[auth] Offline - cannot refresh token");
					return null;
				}
				// result === "invalid" - fall through to clear session
			}

			// Refresh failed or no valid refresh token
			console.log("[auth] Session fully expired, clearing");
			await this.clearSession();
			return null;
		}

		return this.session.accessToken;
	}

	/**
	 * Refresh tokens using the refresh token
	 * Returns: 'success' | 'invalid' | 'network_error'
	 * - 'success': Tokens refreshed successfully
	 * - 'invalid': Tokens are invalid/revoked (should clear session)
	 * - 'network_error': Network unavailable (should keep session for offline use)
	 */
	private async refreshTokens(): Promise<
		"success" | "invalid" | "network_error"
	> {
		if (!this.session?.refreshToken) {
			return "invalid";
		}

		try {
			const response = await fetch(
				`${env.NEXT_PUBLIC_API_URL}/api/auth/desktop/refresh`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						refreshToken: this.session.refreshToken,
					}),
				},
			);

			if (!response.ok) {
				console.error("[auth] Token refresh failed:", response.status);
				// 401/403 means tokens are actually invalid, not a network issue
				if (response.status === 401 || response.status === 403) {
					return "invalid";
				}
				// Other errors (500, etc) - treat as temporary, keep session
				return "network_error";
			}

			let data: unknown;
			try {
				data = await response.json();
			} catch (parseErr) {
				console.error(
					"[auth] Token refresh JSON parse error:",
					parseErr instanceof Error ? parseErr.message : parseErr,
				);
				return "invalid";
			}

			// Validate response shape before persisting
			if (!isValidTokenResponse(data)) {
				console.error(
					"[auth] Token refresh response missing required fields:",
					data,
				);
				return "invalid";
			}

			// Update session with validated tokens
			this.session = {
				accessToken: data.accessToken,
				accessTokenExpiresAt: data.accessTokenExpiresAt,
				refreshToken: data.refreshToken,
				refreshTokenExpiresAt: data.refreshTokenExpiresAt,
			};

			await tokenStorage.save(this.session);
			console.log("[auth] Tokens refreshed successfully");
			this.emit("tokens-refreshed");
			return "success";
		} catch (err) {
			// Network errors (offline, DNS failure, etc) - keep session for offline use
			const errType = err instanceof Error ? err.constructor.name : typeof err;
			const errMsg = err instanceof Error ? err.message : String(err);
			console.error(`[auth] Token refresh network error (${errType}):`, errMsg);
			return "network_error";
		}
	}

	/**
	 * Sign in with OAuth provider
	 * Opens system browser directly to provider's OAuth (bypasses Clerk UI)
	 */
	async signIn(
		provider: AuthProvider,
		_getWindow: () => BrowserWindow | null,
	): Promise<SignInResult> {
		try {
			// Generate state for CSRF protection
			const state = generateState();

			let authUrl: URL;

			if (provider === "github") {
				// Build GitHub OAuth URL
				authUrl = new URL("https://github.com/login/oauth/authorize");
				authUrl.searchParams.set("client_id", env.GH_CLIENT_ID);
				authUrl.searchParams.set(
					"redirect_uri",
					`${env.NEXT_PUBLIC_WEB_URL}/api/auth/desktop/github`,
				);
				authUrl.searchParams.set("scope", "user:email");
				authUrl.searchParams.set("state", state);
			} else {
				// Build Google OAuth URL (default)
				authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
				authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
				authUrl.searchParams.set(
					"redirect_uri",
					`${env.NEXT_PUBLIC_WEB_URL}/api/auth/desktop/google`,
				);
				authUrl.searchParams.set("response_type", "code");
				authUrl.searchParams.set("scope", "openid email profile");
				authUrl.searchParams.set("state", state);
				// Force account selection every time
				authUrl.searchParams.set("prompt", "select_account");
				authUrl.searchParams.set("access_type", "online");
			}

			// Open OAuth flow in system browser
			await shell.openExternal(authUrl.toString());

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
	 * Handle auth callback with all tokens from web
	 */
	async handleAuthCallback(params: {
		accessToken: string;
		accessTokenExpiresAt: number;
		refreshToken: string;
		refreshTokenExpiresAt: number;
		state: string;
	}): Promise<SignInResult> {
		try {
			// Verify state for CSRF protection
			if (!verifyState(params.state)) {
				return { success: false, error: "Invalid or expired auth session" };
			}

			// Create session with both access and refresh tokens
			const session: AuthSession = {
				accessToken: params.accessToken,
				accessTokenExpiresAt: params.accessTokenExpiresAt,
				refreshToken: params.refreshToken,
				refreshTokenExpiresAt: params.refreshTokenExpiresAt,
			};

			this.session = session;
			await tokenStorage.save(session);
			this.emitStateChange();

			console.log("[auth] Signed in via Google OAuth with refresh token");
			return { success: true };
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to complete sign in";
			console.error("[auth] Auth callback handling failed:", message);
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
