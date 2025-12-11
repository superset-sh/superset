import { BrowserWindow, session } from "electron";
import type { AuthSession } from "shared/ipc-channels/auth";
import { db } from "../db";

const CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY || "";

// Refresh interval: check every 5 minutes if session needs refresh
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
// Refresh threshold: refresh if expiring within 2 minutes
const REFRESH_THRESHOLD_MS = 2 * 60 * 1000;

// Extract Clerk frontend API domain from publishable key
function getClerkFrontendApi(): string {
	if (!CLERK_PUBLISHABLE_KEY) {
		throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
	}
	const keyPart = CLERK_PUBLISHABLE_KEY.replace(/^pk_(test|live)_/, "");
	const decoded = Buffer.from(keyPart, "base64").toString("utf-8");
	return decoded.replace("$", "");
}

// Get Account Portal URL for sign-in/sign-up pages
function getClerkAccountPortalUrl(): string {
	const frontendApi = getClerkFrontendApi();
	return frontendApi.replace(".clerk.accounts.dev", ".accounts.dev");
}

interface StoredAuthData {
	session: AuthSession | null;
}

const AUTH_SESSION_PARTITION = "persist:clerk-auth";

class AuthManager {
	private mainWindow: BrowserWindow | null = null;
	private authWindow: BrowserWindow | null = null;
	private refreshInterval: NodeJS.Timeout | null = null;

	setMainWindow(window: BrowserWindow | null): void {
		this.mainWindow = window;
	}

	/**
	 * Get the current session. If stored session is expired but cookies are still valid,
	 * attempts to refresh from cookies before returning null.
	 * Preserves profile data from the old session if the refresh lacks it.
	 */
	async getSession(): Promise<AuthSession | null> {
		const data = db.data?.auth;

		if (!data?.session) {
			return null;
		}

		const storedSession = data.session;
		const now = Date.now();

		// If session hasn't expired, return it directly
		if (storedSession.expiresAt > now) {
			return storedSession;
		}

		// Session expired - try to refresh from cookies
		console.log(
			"[auth] Stored session expired, attempting refresh from cookies",
		);
		const authSession = session.fromPartition(AUTH_SESSION_PARTITION);
		const refreshedSession = await this.checkForSession(authSession);

		if (refreshedSession) {
			// Merge profile data from old session if refresh lacks it
			const finalSession = this.hasProfileData(refreshedSession)
				? refreshedSession
				: this.mergeProfileData(refreshedSession, storedSession);

			console.log(
				"[auth] Session refreshed successfully, hasProfile:",
				this.hasProfileData(finalSession),
			);
			await this.storeSession(finalSession);
			return finalSession;
		}

		// Refresh failed - clear the stale session
		console.log("[auth] Session refresh failed - clearing stale session");
		await this.storeSession(null);
		return null;
	}

	/**
	 * Synchronous version for cases where async isn't possible.
	 * Returns stored session without refresh attempt.
	 */
	getSessionSync(): AuthSession | null {
		return db.data?.auth?.session ?? null;
	}

	private async storeSession(authSession: AuthSession | null): Promise<void> {
		db.data.auth = { session: authSession };
		await db.write();

		if (this.mainWindow && !this.mainWindow.isDestroyed()) {
			this.mainWindow.webContents.send("auth:session-changed", authSession);
		}

		// Start/stop refresh interval based on session state
		if (authSession) {
			this.startRefreshInterval();
		} else {
			this.stopRefreshInterval();
		}
	}

	/**
	 * Check if a session has profile data (email, name, or avatar).
	 */
	private hasProfileData(session: AuthSession): boolean {
		return !!(
			session.email ||
			session.firstName ||
			session.lastName ||
			session.imageUrl
		);
	}

	/**
	 * Merge profile data from an old session into a new session.
	 * Used when refreshing to preserve profile data if the new token lacks it.
	 */
	private mergeProfileData(
		newSession: AuthSession,
		oldSession: AuthSession,
	): AuthSession {
		return {
			...newSession,
			email: newSession.email || oldSession.email,
			firstName: newSession.firstName || oldSession.firstName,
			lastName: newSession.lastName || oldSession.lastName,
			imageUrl: newSession.imageUrl || oldSession.imageUrl,
		};
	}

	async startSignIn(): Promise<{ success: boolean; error?: string }> {
		return this.openAuthWindow("sign-in");
	}

	async startSignUp(): Promise<{ success: boolean; error?: string }> {
		// Use sign-in for OAuth flows - Clerk will automatically create an account
		// if one doesn't exist, and sign in if one does. This prevents the loop
		// where a user with an existing account clicks "Sign Up" and gets stuck.
		return this.openAuthWindow("sign-in");
	}

	private async openAuthWindow(
		mode: "sign-in" | "sign-up",
	): Promise<{ success: boolean; error?: string }> {
		try {
			if (this.authWindow && !this.authWindow.isDestroyed()) {
				this.authWindow.focus();
				return { success: true };
			}

			const accountPortal = getClerkAccountPortalUrl();
			const authUrl = `https://${accountPortal}/${mode}`;
			const authSession = session.fromPartition(AUTH_SESSION_PARTITION);

			this.authWindow = new BrowserWindow({
				width: 450,
				height: 650,
				show: true,
				center: true,
				resizable: false,
				minimizable: false,
				maximizable: false,
				webPreferences: {
					nodeIntegration: false,
					contextIsolation: true,
					session: authSession,
				},
				title:
					mode === "sign-in" ? "Sign In to Superset" : "Sign Up for Superset",
			});

			// Poll for session cookie after auth completes
			const pollInterval = setInterval(async () => {
				if (this.authWindow?.isDestroyed()) {
					clearInterval(pollInterval);
					return;
				}

				const sessionData = await this.checkForSession(
					authSession,
					this.authWindow,
				);
				if (sessionData) {
					console.log("[auth] Session detected:", sessionData.email);
					clearInterval(pollInterval);
					await this.storeSession(sessionData);
					this.authWindow?.close();
				}
			}, 1000);

			// Listen for navigation to detect auth completion
			this.authWindow.webContents.on("did-navigate", async (_event, url) => {
				console.log("[auth] Navigated to:", url);

				// If we hit the default-redirect, auth likely completed
				if (url.includes("default-redirect") || url.includes("/sso-callback")) {
					console.log(
						"[auth] Detected post-auth redirect, checking session...",
					);
					// Give Clerk a moment to set cookies
					await new Promise((resolve) => setTimeout(resolve, 500));
					const sessionData = await this.checkForSession(
						authSession,
						this.authWindow,
					);
					if (sessionData) {
						console.log(
							"[auth] Session found after redirect:",
							sessionData.email,
						);
						clearInterval(pollInterval);
						await this.storeSession(sessionData);
						this.authWindow?.close();
					}
				}
			});

			await this.authWindow.loadURL(authUrl);

			this.authWindow.on("closed", () => {
				clearInterval(pollInterval);
				this.authWindow = null;
				// Notify renderer that auth window was closed (cancelled or completed)
				if (this.mainWindow && !this.mainWindow.isDestroyed()) {
					this.mainWindow.webContents.send("auth:window-closed");
				}
			});

			return { success: true };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to open auth window";
			return { success: false, error: message };
		}
	}

	private async checkForSession(
		authSession: Electron.Session,
		authWindow?: BrowserWindow | null,
	): Promise<AuthSession | null> {
		try {
			const cookies = await authSession.cookies.get({});

			// Log all cookies for debugging
			if (cookies.length > 0) {
				console.log(
					"[auth] Cookies found:",
					cookies.map((c) => c.name).join(", "),
				);
			}

			// Find the session cookie using shared helper
			const sessionCookie = this.findSessionCookie(cookies);

			if (!sessionCookie?.value) {
				return null;
			}

			console.log(
				"[auth] Using cookie:",
				sessionCookie.name,
				"value length:",
				sessionCookie.value.length,
			);

			// Decode the JWT to get basic info
			const parts = sessionCookie.value.split(".");
			if (parts.length !== 3) {
				console.log(
					"[auth] Not a JWT format, trying to fetch user data directly",
				);
				// Not a JWT - try to get user data from the window directly
				const userData = await this.fetchUserDataFromWindow(authWindow);
				if (userData) {
					return {
						userId: "unknown",
						sessionId: sessionCookie.value.substring(0, 20),
						email: userData.email,
						firstName: userData.firstName,
						lastName: userData.lastName,
						imageUrl: userData.imageUrl,
						expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days default
					};
				}
				return null;
			}

			let payload: Record<string, unknown>;
			try {
				payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
			} catch {
				console.log("[auth] Failed to decode JWT payload");
				return null;
			}
			console.log("[auth] JWT payload keys:", Object.keys(payload).join(", "));

			// Check if this is a valid session (has user ID)
			const sub = payload.sub as string | undefined;
			if (!sub) {
				console.log("[auth] No user ID in JWT");
				return null;
			}

			const sid = (payload.sid as string) || "";
			const exp = (payload.exp as number) || 0;

			// The JWT itself may contain user info - check common claim names
			const email =
				(payload.email as string) ||
				(payload.primary_email as string) ||
				(payload["https://clerk.dev/email"] as string) ||
				null;
			const firstName =
				(payload.first_name as string) ||
				(payload.given_name as string) ||
				(payload["https://clerk.dev/first_name"] as string) ||
				null;
			const lastName =
				(payload.last_name as string) ||
				(payload.family_name as string) ||
				(payload["https://clerk.dev/last_name"] as string) ||
				null;
			const imageUrl =
				(payload.image_url as string) ||
				(payload.picture as string) ||
				(payload["https://clerk.dev/image_url"] as string) ||
				null;

			// If we got user info from JWT, use it directly
			if (email || firstName) {
				console.log("[auth] Got user info from JWT");
				return {
					userId: sub,
					sessionId: sid,
					email,
					firstName,
					lastName,
					imageUrl,
					expiresAt: exp * 1000,
				};
			}

			// Try to fetch user data from the auth window's Clerk instance
			let userData = await this.fetchUserDataFromWindow(authWindow);

			// Fallback to API fetch
			if (!userData) {
				userData = await this.fetchUserData(authSession, sessionCookie.value);
			}

			return {
				userId: sub,
				sessionId: sid,
				email: userData?.email || null,
				firstName: userData?.firstName || null,
				lastName: userData?.lastName || null,
				imageUrl: userData?.imageUrl || null,
				expiresAt: exp * 1000,
			};
		} catch (error) {
			console.error("[auth] Error checking session:", error);
			return null;
		}
	}

	private async fetchUserDataFromWindow(
		authWindow?: BrowserWindow | null,
	): Promise<{
		email: string | null;
		firstName: string | null;
		lastName: string | null;
		imageUrl: string | null;
	} | null> {
		if (!authWindow || authWindow.isDestroyed()) {
			return null;
		}

		try {
			// Execute JavaScript in the auth window to get user data from Clerk
			const userData = await authWindow.webContents.executeJavaScript(`
				(function() {
					// Try to get Clerk from the window
					const clerk = window.Clerk;
					if (!clerk || !clerk.user) {
						return null;
					}
					const user = clerk.user;
					return {
						email: user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress || null,
						firstName: user.firstName || null,
						lastName: user.lastName || null,
						imageUrl: user.imageUrl || null,
					};
				})();
			`);

			if (userData) {
				console.log("[auth] Got user data from window:", userData.firstName);
				return userData;
			}
		} catch (error) {
			console.log("[auth] Could not get user data from window:", error);
		}

		return null;
	}

	private async fetchUserData(
		authSession: Electron.Session,
		sessionToken?: string,
	): Promise<{
		email: string | null;
		firstName: string | null;
		lastName: string | null;
		imageUrl: string | null;
	} | null> {
		try {
			const frontendApi = getClerkFrontendApi();

			// Try the /v1/me endpoint with the session token as Bearer auth
			if (sessionToken) {
				const meResponse = await authSession.fetch(
					`https://${frontendApi}/v1/me`,
					{
						headers: {
							Accept: "application/json",
							Authorization: `Bearer ${sessionToken}`,
						},
					},
				);

				console.log("[auth] /v1/me response status:", meResponse.status);

				if (meResponse.ok) {
					const meData = await meResponse.json();
					console.log("[auth] /v1/me data keys:", Object.keys(meData));
					const user = meData?.response || meData;
					if (user?.email_addresses || user?.first_name) {
						console.log("[auth] Found user from /v1/me:", user.first_name);
						return {
							email:
								user.email_addresses?.[0]?.email_address ||
								user.primary_email_address?.email_address ||
								null,
							firstName: user.first_name || null,
							lastName: user.last_name || null,
							imageUrl: user.image_url || user.profile_image_url || null,
						};
					}
					console.log(
						"[auth] /v1/me returned ok but no user data in response:",
						JSON.stringify(meData).substring(0, 200),
					);
				} else {
					// Log the failure reason
					try {
						const errorBody = await meResponse.text();
						console.log(
							"[auth] /v1/me failed:",
							meResponse.status,
							errorBody.substring(0, 200),
						);
					} catch {
						console.log("[auth] /v1/me failed:", meResponse.status);
					}
				}
			}

			// Fallback: Try /v1/client with cookies
			const response = await authSession.fetch(
				`https://${frontendApi}/v1/client`,
				{
					headers: {
						Accept: "application/json",
						"Content-Type": "application/json",
					},
					credentials: "include",
				},
			);

			console.log("[auth] /v1/client response status:", response.status);

			if (!response.ok) {
				try {
					const errorBody = await response.text();
					console.log(
						"[auth] /v1/client failed:",
						response.status,
						errorBody.substring(0, 200),
					);
				} catch {
					console.log("[auth] /v1/client failed:", response.status);
				}
				return this.fetchUserDataFromEnv(authSession);
			}

			const data = await response.json();
			console.log("[auth] Client data keys:", Object.keys(data));

			// Extract user from active session
			const activeSession = data?.response?.sessions?.find(
				(s: { status: string }) => s.status === "active",
			);
			const user = activeSession?.user;

			if (!user) {
				console.log("[auth] No active user in response, trying env endpoint");
				return this.fetchUserDataFromEnv(authSession);
			}

			console.log("[auth] Found user:", user.first_name, user.last_name);

			return {
				email:
					user.email_addresses?.[0]?.email_address ||
					user.primary_email_address?.email_address ||
					null,
				firstName: user.first_name || null,
				lastName: user.last_name || null,
				imageUrl: user.image_url || user.profile_image_url || null,
			};
		} catch (error) {
			console.error("[auth] Error fetching user data:", error);
			return this.fetchUserDataFromEnv(authSession);
		}
	}

	private async fetchUserDataFromEnv(authSession: Electron.Session): Promise<{
		email: string | null;
		firstName: string | null;
		lastName: string | null;
		imageUrl: string | null;
	} | null> {
		try {
			const accountPortal = getClerkAccountPortalUrl();

			// Try fetching the environment which includes user data
			const response = await authSession.fetch(
				`https://${accountPortal}/v1/environment?_clerk_js_version=5`,
				{
					headers: {
						Accept: "application/json",
					},
					credentials: "include",
				},
			);

			console.log("[auth] Environment API response status:", response.status);

			if (!response.ok) {
				return null;
			}

			const data = await response.json();

			// The environment response might have user info
			const user = data?.user || data?.response?.user;
			if (user) {
				console.log("[auth] Found user in environment");
				return {
					email: user.email_addresses?.[0]?.email_address || null,
					firstName: user.first_name || null,
					lastName: user.last_name || null,
					imageUrl: user.image_url || null,
				};
			}

			return null;
		} catch (error) {
			console.error("[auth] Environment fetch error:", error);
			return null;
		}
	}

	/**
	 * Sign out: clears both the DB session and all Clerk cookies.
	 * User must re-authenticate next time.
	 */
	async signOut(): Promise<{ success: boolean; error?: string }> {
		try {
			// Stop refresh interval
			this.stopRefreshInterval();

			await this.storeSession(null);

			// Clear auth cookies
			const authSession = session.fromPartition(AUTH_SESSION_PARTITION);
			await authSession.clearStorageData();

			return { success: true };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to sign out";
			return { success: false, error: message };
		}
	}

	async refreshSession(): Promise<AuthSession | null> {
		return this.getSession();
	}

	/**
	 * Start the background refresh interval that keeps the session fresh.
	 * Should be called after successful authentication.
	 */
	startRefreshInterval(): void {
		if (this.refreshInterval) {
			return; // Already running
		}

		console.log("[auth] Starting session refresh interval");
		this.refreshInterval = setInterval(() => {
			this.refreshIfNearExpiry();
		}, REFRESH_INTERVAL_MS);
	}

	/**
	 * Stop the background refresh interval.
	 */
	stopRefreshInterval(): void {
		if (this.refreshInterval) {
			console.log("[auth] Stopping session refresh interval");
			clearInterval(this.refreshInterval);
			this.refreshInterval = null;
		}
	}

	/**
	 * Refresh the session if it's near expiry.
	 * Called periodically by the refresh interval.
	 * Preserves profile data from the old session if the refresh lacks it.
	 */
	private async refreshIfNearExpiry(): Promise<void> {
		const storedSession = db.data?.auth?.session;
		if (!storedSession) {
			return;
		}

		const timeUntilExpiry = storedSession.expiresAt - Date.now();
		if (timeUntilExpiry > REFRESH_THRESHOLD_MS) {
			return; // Not near expiry yet
		}

		console.log("[auth] Session near expiry, refreshing...");
		const authSession = session.fromPartition(AUTH_SESSION_PARTITION);
		const refreshedSession = await this.checkForSession(authSession);

		if (refreshedSession) {
			// Merge profile data from old session if refresh lacks it
			const finalSession = this.hasProfileData(refreshedSession)
				? refreshedSession
				: this.mergeProfileData(refreshedSession, storedSession);

			console.log(
				"[auth] Session refreshed via interval, hasProfile:",
				this.hasProfileData(finalSession),
			);
			await this.storeSession(finalSession);
		} else {
			console.log("[auth] Session refresh failed - cookies may have expired");
			// Don't clear yet - let getSession handle it when actually needed
		}
	}

	/**
	 * Find a valid Clerk session cookie from the cookie list.
	 * Supports both __session (production) and __clerk_db_jwt (development).
	 */
	private findSessionCookie(
		cookies: Electron.Cookie[],
	): Electron.Cookie | undefined {
		// Prefer __session cookie (production)
		let sessionCookie = cookies.find((c) => c.name === "__session");
		if (!sessionCookie) {
			sessionCookie = cookies.find((c) => c.name.startsWith("__session"));
		}
		// Fall back to __clerk_db_jwt if it's a valid JWT (development)
		if (!sessionCookie) {
			const clerkDbJwt =
				cookies.find((c) => c.name === "__clerk_db_jwt") ||
				cookies.find((c) => c.name.startsWith("__clerk_db_jwt"));
			if (clerkDbJwt?.value && clerkDbJwt.value.split(".").length === 3) {
				sessionCookie = clerkDbJwt;
			}
		}
		return sessionCookie;
	}

	/**
	 * Validate and refresh the stored session against Clerk cookies on startup.
	 *
	 * - If stored session exists but cookies are gone: clear session
	 * - If cookies exist but no stored session: restore from cookies
	 * - If stored session is expired but cookies are valid: refresh session
	 * - Starts the refresh interval if a valid session exists
	 */
	async validateSessionOnStartup(): Promise<void> {
		if (!CLERK_PUBLISHABLE_KEY) {
			return;
		}

		const authSession = session.fromPartition(AUTH_SESSION_PARTITION);

		try {
			const cookies = await authSession.cookies.get({});
			const sessionCookie = this.findSessionCookie(cookies);
			const storedData = db.data?.auth?.session;

			console.log(
				"[auth] Startup validation - stored session:",
				!!storedData,
				"cookie:",
				!!sessionCookie?.value,
			);

			if (storedData && !sessionCookie?.value) {
				// We have a stored session but no Clerk cookie - session was revoked externally
				console.log(
					"[auth] Stored session found but no Clerk cookie - clearing session",
				);
				await this.storeSession(null);
				return;
			}

			if (!storedData && sessionCookie?.value) {
				// We have a Clerk cookie but no stored session - try to restore
				console.log(
					"[auth] Clerk cookie found but no stored session - attempting restore",
				);
				const sessionData = await this.checkForSession(authSession);
				if (sessionData) {
					await this.storeSession(sessionData);
					console.log(
						"[auth] Session restored from cookies, hasProfile:",
						this.hasProfileData(sessionData),
					);
					this.startRefreshInterval();
				}
				return;
			}

			if (storedData && sessionCookie?.value) {
				// Both exist - check if we need to refresh
				const now = Date.now();
				if (storedData.expiresAt < now) {
					// Stored session expired - try to refresh from cookies
					console.log(
						"[auth] Stored session expired on startup, attempting refresh",
					);
					const refreshedSession = await this.checkForSession(authSession);
					if (refreshedSession) {
						// Merge profile data from old session if refresh lacks it
						const finalSession = this.hasProfileData(refreshedSession)
							? refreshedSession
							: this.mergeProfileData(refreshedSession, storedData);

						await this.storeSession(finalSession);
						console.log(
							"[auth] Session refreshed on startup, hasProfile:",
							this.hasProfileData(finalSession),
						);
						this.startRefreshInterval();
					} else {
						// Cookie exists but can't get a valid token - clear the expired session
						// so the UI doesn't show signed in with a dead token
						console.log(
							"[auth] Could not refresh session from cookies - clearing expired session",
						);
						await this.storeSession(null);
					}
				} else {
					// Session still valid
					console.log("[auth] Session valid on startup");
					this.startRefreshInterval();
				}
			}
		} catch (error) {
			console.error("[auth] Error validating session on startup:", error);
		}
	}
}

export const authManager = new AuthManager();
