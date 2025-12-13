import { BrowserWindow, shell } from "electron";
import type { AuthSession } from "shared/ipc-channels/auth";
import { db } from "../db";
import type { PKCEPair } from "./pkce";
import { generatePKCE } from "./pkce";
import { clearTokens, getAccessToken, storeTokens } from "./token-store";

const AUTH0_DOMAIN = process.env.VITE_AUTH0_DOMAIN || "";
const AUTH0_CLIENT_ID = process.env.VITE_AUTH0_CLIENT_ID || "";
const AUTH0_AUDIENCE = process.env.VITE_AUTH0_AUDIENCE || "";

const DEBUG_AUTH = process.env.DEBUG_AUTH === "1";

const CALLBACK_URL = "superset://auth/callback";

function debugLog(...args: unknown[]): void {
	if (DEBUG_AUTH) {
		console.log("[auth]", ...args);
	}
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REFRESH_THRESHOLD_MS = 2 * 60 * 1000;

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	id_token?: string;
	token_type: string;
	expires_in: number;
}

class AuthManager {
	private mainWindow: BrowserWindow | null = null;
	private authWindow: BrowserWindow | null = null;
	private refreshInterval: NodeJS.Timeout | null = null;
	private pendingPKCE: PKCEPair | null = null;
	private authResolve: ((value: { success: boolean; error?: string }) => void) | null = null;

	setMainWindow(window: BrowserWindow | null): void {
		this.mainWindow = window;
	}

	/**
	 * Handle the OAuth callback from the custom protocol.
	 * Called when superset://auth/callback is triggered.
	 */
	async handleCallback(url: string): Promise<void> {
		debugLog("Handling callback URL:", url);

		try {
			const urlObj = new URL(url);
			const code = urlObj.searchParams.get("code");
			const state = urlObj.searchParams.get("state");
			const error = urlObj.searchParams.get("error");
			const errorDescription = urlObj.searchParams.get("error_description");

			if (error) {
				debugLog("Auth error:", error, errorDescription);
				this.completeAuth(false, errorDescription || error);
				return;
			}

			if (!code) {
				debugLog("No authorization code in callback");
				this.completeAuth(false, "No authorization code received");
				return;
			}

			if (!this.pendingPKCE || state !== this.pendingPKCE.state) {
				debugLog("State mismatch or no pending PKCE");
				this.completeAuth(false, "Invalid state parameter");
				return;
			}

			// Exchange code for tokens
			const tokens = await this.exchangeCodeForTokens(code, this.pendingPKCE.verifier);
			if (!tokens) {
				this.completeAuth(false, "Failed to exchange code for tokens");
				return;
			}

			// Store tokens securely
			await storeTokens({
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				idToken: tokens.id_token,
			});

			// Fetch user info
			const userInfo = await this.fetchUserInfo(tokens.access_token);

			// Create session
			const session: AuthSession = {
				userId: (userInfo?.sub as string) || "unknown",
				sessionId: `auth0-${Date.now()}`,
				email: (userInfo?.email as string) || null,
				firstName:
					(userInfo?.given_name as string) ||
					(userInfo?.name as string)?.split(" ")[0] ||
					null,
				lastName:
					(userInfo?.family_name as string) ||
					(userInfo?.name as string)?.split(" ").slice(1).join(" ") ||
					null,
				imageUrl: (userInfo?.picture as string) || null,
				expiresAt: Date.now() + tokens.expires_in * 1000,
				accessToken: tokens.access_token,
			};

			await this.storeSession(session);
			this.completeAuth(true);
		} catch (err) {
			debugLog("Callback handling error:", err);
			this.completeAuth(false, err instanceof Error ? err.message : "Unknown error");
		}
	}

	private completeAuth(success: boolean, error?: string): void {
		this.pendingPKCE = null;

		if (this.authWindow && !this.authWindow.isDestroyed()) {
			this.authWindow.close();
		}
		this.authWindow = null;

		if (this.authResolve) {
			this.authResolve({ success, error });
			this.authResolve = null;
		}

		if (!success && this.mainWindow && !this.mainWindow.isDestroyed()) {
			this.mainWindow.webContents.send("auth:window-closed");
		}
	}

	private async exchangeCodeForTokens(
		code: string,
		codeVerifier: string,
	): Promise<TokenResponse | null> {
		try {
			const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					grant_type: "authorization_code",
					client_id: AUTH0_CLIENT_ID,
					code_verifier: codeVerifier,
					code,
					redirect_uri: CALLBACK_URL,
				}),
			});

			if (!response.ok) {
				const errorData = await response.text();
				debugLog("Token exchange failed:", response.status, errorData);
				return null;
			}

			const tokens = (await response.json()) as TokenResponse;
			debugLog("Token exchange successful");
			return tokens;
		} catch (error) {
			debugLog("Token exchange error:", error);
			return null;
		}
	}

	async getSession(): Promise<AuthSession | null> {
		const storedSession = db.data?.auth?.session;

		if (!storedSession) {
			return null;
		}

		const now = Date.now();

		if (storedSession.expiresAt > now) {
			const accessToken = await getAccessToken();
			return accessToken ? { ...storedSession, accessToken } : storedSession;
		}

		debugLog("Stored session expired, attempting refresh");
		return this.refreshSession();
	}

	getSessionSync(): AuthSession | null {
		return db.data?.auth?.session ?? null;
	}

	private async storeSession(authSession: AuthSession | null): Promise<void> {
		const sessionWithoutToken = authSession
			? {
					userId: authSession.userId,
					sessionId: authSession.sessionId,
					email: authSession.email,
					firstName: authSession.firstName,
					lastName: authSession.lastName,
					imageUrl: authSession.imageUrl,
					expiresAt: authSession.expiresAt,
				}
			: null;

		db.data.auth = { session: sessionWithoutToken };
		await db.write();

		if (this.mainWindow && !this.mainWindow.isDestroyed()) {
			this.mainWindow.webContents.send("auth:session-changed", authSession);
		}

		if (authSession) {
			this.startRefreshInterval();
		} else {
			this.stopRefreshInterval();
		}
	}

	async startSignIn(): Promise<{ success: boolean; error?: string }> {
		console.log("[auth] startSignIn called");
		console.log("[auth] AUTH0_DOMAIN:", AUTH0_DOMAIN);
		console.log("[auth] AUTH0_CLIENT_ID:", AUTH0_CLIENT_ID);

		if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
			return {
				success: false,
				error: "Auth0 not configured. Set VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID.",
			};
		}

		// Close existing auth window if any
		if (this.authWindow && !this.authWindow.isDestroyed()) {
			this.authWindow.focus();
			return { success: true };
		}

		// Generate PKCE pair
		this.pendingPKCE = generatePKCE();

		// Build authorization URL
		const authUrl = new URL(`https://${AUTH0_DOMAIN}/authorize`);
		authUrl.searchParams.set("client_id", AUTH0_CLIENT_ID);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("redirect_uri", CALLBACK_URL);
		authUrl.searchParams.set("scope", "openid profile email offline_access");
		authUrl.searchParams.set("code_challenge", this.pendingPKCE.challenge);
		authUrl.searchParams.set("code_challenge_method", "S256");
		authUrl.searchParams.set("state", this.pendingPKCE.state);
		authUrl.searchParams.set("prompt", "login");
		if (AUTH0_AUDIENCE) {
			authUrl.searchParams.set("audience", AUTH0_AUDIENCE);
		}

		debugLog("Opening auth URL:", authUrl.toString());
		console.log("[auth] AUTH URL:", authUrl.toString());

		return new Promise((resolve) => {
			this.authResolve = resolve;

			this.authWindow = new BrowserWindow({
				width: 500,
				height: 700,
				show: true,
				center: true,
				webPreferences: {
					nodeIntegration: false,
					contextIsolation: true,
					// Use unique partition for each auth attempt to avoid cached sessions
					partition: `auth-${Date.now()}`,
				},
				title: "Sign In to Superset",
			});

			// Intercept navigation to our callback URL
			this.authWindow.webContents.on("will-redirect", (event, url) => {
				debugLog("Will redirect to:", url);
				if (url.startsWith(CALLBACK_URL)) {
					event.preventDefault();
					this.handleCallback(url);
				}
			});

			this.authWindow.webContents.on("will-navigate", (event, url) => {
				debugLog("Will navigate to:", url);
				if (url.startsWith(CALLBACK_URL)) {
					event.preventDefault();
					this.handleCallback(url);
				}
			});

			this.authWindow.loadURL(authUrl.toString());

			this.authWindow.on("closed", () => {
				this.authWindow = null;
				// If auth wasn't completed, resolve with cancelled
				if (this.authResolve) {
					this.pendingPKCE = null;
					this.authResolve({ success: false, error: "Authentication cancelled" });
					this.authResolve = null;

					if (this.mainWindow && !this.mainWindow.isDestroyed()) {
						this.mainWindow.webContents.send("auth:window-closed");
					}
				}
			});
		});
	}

	async startSignUp(): Promise<{ success: boolean; error?: string }> {
		// Auth0 Universal Login handles both sign in and sign up
		return this.startSignIn();
	}

	private async fetchUserInfo(
		accessToken: string,
	): Promise<Record<string, unknown> | null> {
		try {
			const response = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (!response.ok) {
				debugLog("Failed to fetch userinfo:", response.status);
				return null;
			}

			const userInfo = await response.json();
			debugLog("UserInfo:", Object.keys(userInfo));
			return userInfo;
		} catch (error) {
			debugLog("Error fetching userinfo:", error);
			return null;
		}
	}

	async signOut(): Promise<{ success: boolean; error?: string }> {
		try {
			this.stopRefreshInterval();

			// Clear tokens
			await clearTokens();

			// Clear session
			await this.storeSession(null);

			// Optionally open Auth0 logout URL to clear Auth0 session
			const logoutUrl = new URL(`https://${AUTH0_DOMAIN}/v2/logout`);
			logoutUrl.searchParams.set("client_id", AUTH0_CLIENT_ID);
			// Don't set returnTo - just logout from Auth0

			return { success: true };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to sign out";
			return { success: false, error: message };
		}
	}

	async refreshSession(): Promise<AuthSession | null> {
		try {
			const { getRefreshToken } = await import("./token-store");
			const refreshToken = await getRefreshToken();

			if (!refreshToken) {
				debugLog("No refresh token available");
				await this.storeSession(null);
				return null;
			}

			// Exchange refresh token for new access token
			const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					grant_type: "refresh_token",
					client_id: AUTH0_CLIENT_ID,
					refresh_token: refreshToken,
				}),
			});

			if (!response.ok) {
				debugLog("Token refresh failed:", response.status);
				await this.storeSession(null);
				return null;
			}

			const tokens = (await response.json()) as TokenResponse;

			await storeTokens({
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token || refreshToken,
				idToken: tokens.id_token,
			});

			const userInfo = await this.fetchUserInfo(tokens.access_token);
			const storedSession = db.data?.auth?.session;

			const session: AuthSession = {
				userId: (userInfo?.sub as string) || storedSession?.userId || "unknown",
				sessionId: storedSession?.sessionId || `auth0-${Date.now()}`,
				email: (userInfo?.email as string) || storedSession?.email || null,
				firstName:
					(userInfo?.given_name as string) ||
					(userInfo?.name as string)?.split(" ")[0] ||
					storedSession?.firstName ||
					null,
				lastName:
					(userInfo?.family_name as string) ||
					(userInfo?.name as string)?.split(" ").slice(1).join(" ") ||
					storedSession?.lastName ||
					null,
				imageUrl: (userInfo?.picture as string) || storedSession?.imageUrl || null,
				expiresAt: Date.now() + tokens.expires_in * 1000,
				accessToken: tokens.access_token,
			};

			await this.storeSession(session);
			return session;
		} catch (error) {
			debugLog("Session refresh error:", error);
			return null;
		}
	}

	startRefreshInterval(): void {
		if (this.refreshInterval) {
			return;
		}

		debugLog("Starting session refresh interval");
		this.refreshInterval = setInterval(() => {
			this.refreshIfNearExpiry();
		}, REFRESH_INTERVAL_MS);
	}

	stopRefreshInterval(): void {
		if (this.refreshInterval) {
			debugLog("Stopping session refresh interval");
			clearInterval(this.refreshInterval);
			this.refreshInterval = null;
		}
	}

	private async refreshIfNearExpiry(): Promise<void> {
		const storedSession = db.data?.auth?.session;
		if (!storedSession) {
			return;
		}

		const timeUntilExpiry = storedSession.expiresAt - Date.now();
		if (timeUntilExpiry > REFRESH_THRESHOLD_MS) {
			return;
		}

		debugLog("Session near expiry, refreshing...");
		await this.refreshSession();
	}

	async validateSessionOnStartup(): Promise<void> {
		if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
			return;
		}

		try {
			const { getRefreshToken } = await import("./token-store");
			const refreshToken = await getRefreshToken();
			const storedSession = db.data?.auth?.session;

			debugLog(
				"Startup validation - stored session:",
				!!storedSession,
				"has refresh token:",
				!!refreshToken,
			);

			if (storedSession && !refreshToken) {
				debugLog("Stored session found but no refresh token - clearing session");
				await this.storeSession(null);
				return;
			}

			if (!storedSession && refreshToken) {
				debugLog("Refresh token found but no stored session - restoring");
				await this.refreshSession();
				return;
			}

			if (storedSession && refreshToken) {
				const now = Date.now();
				if (storedSession.expiresAt < now) {
					debugLog("Stored session expired on startup, refreshing");
					await this.refreshSession();
				} else {
					debugLog("Session valid on startup");
					this.startRefreshInterval();
				}
			}
		} catch (error) {
			console.error("[auth] Error validating session on startup:", error);
		}
	}
}

export const authManager = new AuthManager();
