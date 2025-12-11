import { BrowserWindow, session } from "electron";
import type { AuthSession } from "shared/ipc-channels/auth";
import { db } from "../db";

const CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY || "";

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

const AUTH_SESSION_PARTITION = "persist:clerk-auth";

class AuthManager {
	private mainWindow: BrowserWindow | null = null;
	private authWindow: BrowserWindow | null = null;

	setMainWindow(window: BrowserWindow | null): void {
		this.mainWindow = window;
	}

	getSession(): AuthSession | null {
		const data = db.data?.auth;
		console.log("[auth] getSession called, stored data:", data);

		if (!data?.session) {
			console.log("[auth] No session stored");
			return null;
		}

		const now = Date.now();
		console.log(
			"[auth] Checking expiry:",
			data.session.expiresAt,
			"vs now:",
			now,
		);

		if (data.session.expiresAt < now) {
			console.log("[auth] Session expired - clearing stale data");
			// Clear expired session synchronously in memory, persist async
			db.data.auth = { session: null };
			// Notify renderer immediately
			if (this.mainWindow && !this.mainWindow.isDestroyed()) {
				this.mainWindow.webContents.send("auth:session-changed", null);
			}
			// Persist to disk asynchronously (fire and forget, errors logged)
			db.write().catch((error) => {
				console.error("[auth] Failed to persist expired session clear:", error);
			});
			return null;
		}

		console.log("[auth] Returning session for:", data.session.email);
		return data.session;
	}

	private async storeSession(authSession: AuthSession | null): Promise<void> {
		db.data.auth = { session: authSession };
		await db.write();

		if (this.mainWindow && !this.mainWindow.isDestroyed()) {
			this.mainWindow.webContents.send("auth:session-changed", authSession);
		}
	}

	async startSignIn(): Promise<{ success: boolean; error?: string }> {
		return this.openAuthWindow("sign-in");
	}

	async startSignUp(): Promise<{ success: boolean; error?: string }> {
		return this.openAuthWindow("sign-up");
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
				title: mode === "sign-in" ? "Sign In to Superset" : "Sign Up for Superset",
			});

			// Poll for session cookie after auth completes
			const pollInterval = setInterval(async () => {
				if (this.authWindow?.isDestroyed()) {
					clearInterval(pollInterval);
					return;
				}

				const sessionData = await this.checkForSession(authSession, this.authWindow);
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
					console.log("[auth] Detected post-auth redirect, checking session...");
					// Give Clerk a moment to set cookies
					await new Promise((resolve) => setTimeout(resolve, 500));
					const sessionData = await this.checkForSession(authSession, this.authWindow);
					if (sessionData) {
						console.log("[auth] Session found after redirect:", sessionData.email);
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
				console.log("[auth] Cookies found:", cookies.map((c) => c.name).join(", "));
			}

			// Find the session cookie - Clerk uses different cookie names:
			// - __session: standard session cookie (JWT format, ~800+ bytes)
			// - __clerk_db_jwt: development token (short, not useful for us)
			// IMPORTANT: Prioritize __session as it contains the actual JWT
			let sessionCookie = cookies.find((c) => c.name === "__session");
			if (!sessionCookie) {
				sessionCookie = cookies.find((c) => c.name.startsWith("__session"));
			}

			// Only fall back to __clerk_db_jwt if no __session found AND it looks like a JWT (has 3 parts)
			if (!sessionCookie) {
				const clerkDbJwt = cookies.find((c) => c.name === "__clerk_db_jwt" || c.name.startsWith("__clerk_db_jwt"));
				if (clerkDbJwt?.value && clerkDbJwt.value.split(".").length === 3) {
					sessionCookie = clerkDbJwt;
				}
			}

			if (!sessionCookie?.value) {
				return null;
			}

			console.log("[auth] Using cookie:", sessionCookie.name, "value length:", sessionCookie.value.length);

			// Decode the JWT to get basic info
			const parts = sessionCookie.value.split(".");
			if (parts.length !== 3) {
				console.log("[auth] Not a JWT format, trying to fetch user data directly");
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
				payload = JSON.parse(
					Buffer.from(parts[1], "base64url").toString(),
				);
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
							email: user.email_addresses?.[0]?.email_address || user.primary_email_address?.email_address || null,
							firstName: user.first_name || null,
							lastName: user.last_name || null,
							imageUrl: user.image_url || user.profile_image_url || null,
						};
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

			console.log("[auth] Client API response status:", response.status);

			if (!response.ok) {
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
				email: user.email_addresses?.[0]?.email_address || user.primary_email_address?.email_address || null,
				firstName: user.first_name || null,
				lastName: user.last_name || null,
				imageUrl: user.image_url || user.profile_image_url || null,
			};
		} catch (error) {
			console.error("[auth] Error fetching user data:", error);
			return this.fetchUserDataFromEnv(authSession);
		}
	}

	private async fetchUserDataFromEnv(
		authSession: Electron.Session,
	): Promise<{
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

	async signOut(): Promise<{ success: boolean; error?: string }> {
		try {
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
	 * Find a valid Clerk session cookie from the cookie list.
	 * Supports both __session (production) and __clerk_db_jwt (development).
	 */
	private findSessionCookie(cookies: Electron.Cookie[]): Electron.Cookie | undefined {
		// Prefer __session cookie (production)
		let sessionCookie = cookies.find((c) => c.name === "__session");
		if (!sessionCookie) {
			sessionCookie = cookies.find((c) => c.name.startsWith("__session"));
		}
		// Fall back to __clerk_db_jwt if it's a valid JWT (development)
		if (!sessionCookie) {
			const clerkDbJwt = cookies.find((c) => c.name === "__clerk_db_jwt") ||
				cookies.find((c) => c.name.startsWith("__clerk_db_jwt"));
			if (clerkDbJwt?.value && clerkDbJwt.value.split(".").length === 3) {
				sessionCookie = clerkDbJwt;
			}
		}
		return sessionCookie;
	}

	/**
	 * Validate the stored session against Clerk cookies on startup.
	 * If there's a stored session but no valid Clerk cookie, clear it.
	 * If there's a valid Clerk cookie but no stored session, try to restore it.
	 * Also clears expired stored sessions.
	 */
	async validateSessionOnStartup(): Promise<void> {
		if (!CLERK_PUBLISHABLE_KEY) {
			return;
		}

		// Check if stored session is expired (getSession handles clearing)
		const storedSession = this.getSession();

		const authSession = session.fromPartition(AUTH_SESSION_PARTITION);

		try {
			const cookies = await authSession.cookies.get({});
			const sessionCookie = this.findSessionCookie(cookies);

			if (storedSession && !sessionCookie?.value) {
				// We have a stored session but no Clerk cookie - session was revoked
				console.log("[auth] Stored session found but no Clerk cookie - clearing session");
				await this.storeSession(null);
			} else if (!storedSession && sessionCookie?.value) {
				// We have a Clerk cookie but no stored session - try to restore
				console.log("[auth] Clerk cookie found but no stored session - attempting restore");
				const sessionData = await this.checkForSession(authSession);
				if (sessionData) {
					await this.storeSession(sessionData);
					console.log("[auth] Session restored from cookies");
				}
			} else if (storedSession && sessionCookie?.value) {
				// Both exist - verify the session is still valid by checking JWT expiry
				const parts = sessionCookie.value.split(".");
				if (parts.length === 3) {
					try {
						const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
						const exp = (payload.exp as number) || 0;
						if (exp * 1000 < Date.now()) {
							console.log("[auth] Clerk JWT expired - clearing session");
							await this.storeSession(null);
						}
					} catch {
						// Invalid JWT - clear session
						console.log("[auth] Invalid Clerk JWT - clearing session");
						await this.storeSession(null);
					}
				}
			}
		} catch (error) {
			console.error("[auth] Error validating session on startup:", error);
		}
	}
}

export const authManager = new AuthManager();
