import { BrowserWindow, session } from "electron";
import type { AuthSession } from "shared/ipc-channels/auth";
import { store } from "../storage-manager";

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

interface StoredAuthData {
	session: AuthSession | null;
}

const AUTH_STORE_KEY = "clerk_auth";
const AUTH_SESSION_PARTITION = "persist:clerk-auth";

class AuthManager {
	private mainWindow: BrowserWindow | null = null;
	private authWindow: BrowserWindow | null = null;

	setMainWindow(window: BrowserWindow | null): void {
		this.mainWindow = window;
	}

	getSession(): AuthSession | null {
		const data = store.get(AUTH_STORE_KEY) as StoredAuthData | undefined;
		if (!data?.session) return null;

		if (data.session.expiresAt < Date.now()) {
			return null;
		}

		return data.session;
	}

	private storeSession(authSession: AuthSession | null): void {
		store.set(AUTH_STORE_KEY, { session: authSession });

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

				const sessionData = await this.checkForSession(authSession);
				if (sessionData) {
					console.log("[auth] Session detected:", sessionData.email);
					clearInterval(pollInterval);
					this.storeSession(sessionData);
					this.authWindow?.close();
				}
			}, 1000);

			await this.authWindow.loadURL(authUrl);

			this.authWindow.on("closed", () => {
				clearInterval(pollInterval);
				this.authWindow = null;
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
	): Promise<AuthSession | null> {
		try {
			const cookies = await authSession.cookies.get({});
			const sessionCookie = cookies.find((c) => c.name === "__session");

			// Log all cookies for debugging
			const cookieNames = cookies.map((c) => c.name);
			if (cookieNames.length > 0) {
				console.log("[auth] Cookies found:", cookieNames.join(", "));
			}

			if (!sessionCookie?.value) {
				return null;
			}

			console.log("[auth] Found __session cookie");

			// Decode the JWT
			const parts = sessionCookie.value.split(".");
			if (parts.length !== 3) {
				return null;
			}

			const payload = JSON.parse(
				Buffer.from(parts[1], "base64url").toString(),
			);

			// Check if this is a valid session (has user ID)
			if (!payload.sub) {
				return null;
			}

			return {
				userId: payload.sub || "",
				sessionId: payload.sid || "",
				email: payload.email || null,
				firstName: payload.first_name || null,
				lastName: payload.last_name || null,
				imageUrl: payload.image_url || null,
				expiresAt: (payload.exp || 0) * 1000,
			};
		} catch {
			return null;
		}
	}

	async handleCallback(_url: string): Promise<void> {
		// Not used with BrowserWindow approach
	}

	async signOut(): Promise<{ success: boolean; error?: string }> {
		try {
			this.storeSession(null);

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
}

export const authManager = new AuthManager();
