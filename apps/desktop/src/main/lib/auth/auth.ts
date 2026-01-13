import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { join } from "node:path";
import { authClient } from "@superset/auth/client";
import type { AuthProvider } from "@superset/shared/constants";
import { PROTOCOL_SCHEMES } from "@superset/shared/constants";
import { shell } from "electron";
import { env } from "main/env.main";
import { SUPERSET_HOME_DIR } from "../app-environment";
import { decrypt, encrypt } from "./crypto-storage";

export interface SignInResult {
	success: boolean;
	error?: string;
}

const TOKEN_FILE = join(SUPERSET_HOME_DIR, "auth-token.enc");
const stateStore = new Map<string, number>();

export function parseAuthDeepLink(
	url: string,
): { token: string; expiresAt: string; state: string } | null {
	try {
		const parsed = new URL(url);
		const validProtocols = [
			`${PROTOCOL_SCHEMES.PROD}:`,
			`${PROTOCOL_SCHEMES.DEV}:`,
		];
		if (!validProtocols.includes(parsed.protocol)) return null;
		if (parsed.host !== "auth" || parsed.pathname !== "/callback") return null;

		const token = parsed.searchParams.get("token");
		const expiresAt = parsed.searchParams.get("expiresAt");
		const state = parsed.searchParams.get("state");
		if (!token || !expiresAt || !state) return null;
		return { token, expiresAt, state };
	} catch {
		return null;
	}
}

interface StoredAuth {
	token: string;
	expiresAt: string;
}

type SessionResponse = Awaited<ReturnType<typeof authClient.getSession>>;
/** Session data from the auth API */
export type AuthSession = NonNullable<SessionResponse["data"]>;
type Session = AuthSession;

class AuthService extends EventEmitter {
	private token: string | null = null;
	private expiresAt: Date | null = null;
	private session: Session | null = null;

	async initialize(): Promise<void> {
		try {
			const data = decrypt(await fs.readFile(TOKEN_FILE));
			const parsed: StoredAuth = JSON.parse(data);
			this.token = parsed.token;
			this.expiresAt = new Date(parsed.expiresAt);

			if (this.isExpired()) {
				console.log("[auth] Session expired, clearing");
				await this.signOut();
			} else {
				console.log("[auth] Session restored");
				// Fetch session data from API
				await this.refreshSession();
			}
		} catch {
			this.token = null;
			this.expiresAt = null;
		}
	}

	private isExpired(): boolean {
		if (!this.expiresAt) return true;
		// Consider expired 5 minutes before actual expiry for safety
		const bufferMs = 5 * 60 * 1000;
		return Date.now() > this.expiresAt.getTime() - bufferMs;
	}

	getState() {
		const state = {
			isSignedIn: !!this.token && !this.isExpired(),
			expiresAt: this.expiresAt?.toISOString() ?? null,
		};
		console.log("[auth] getState called:", {
			hasToken: !!this.token,
			isExpired: this.isExpired(),
			isSignedIn: state.isSignedIn,
		});
		return state;
	}

	getAccessToken(): string | null {
		const expired = this.isExpired();
		const token = expired ? null : this.token;
		console.log("[auth] getAccessToken called:", {
			hasToken: !!this.token,
			isExpired: expired,
			returning: token ? "token" : "null",
		});
		return token;
	}

	getSession(): Session | null {
		return this.session;
	}

	private async refreshSession(): Promise<void> {
		const token = this.getAccessToken();
		if (!token) {
			this.session = null;
			return;
		}

		try {
			const { data: session, error } = await authClient.getSession({
				fetchOptions: {
					headers: {
						Authorization: `Bearer ${token}`,
					},
				},
			});

			if (error) {
				console.error("[auth] Failed to refresh session:", error);
				this.session = null;
				return;
			}

			this.session = session;
			this.emit("session-changed", this.session);
		} catch (error) {
			console.error("[auth] Failed to refresh session:", error);
			this.session = null;
		}
	}

	async setActiveOrganization(organizationId: string): Promise<void> {
		const token = this.getAccessToken();
		if (!token) throw new Error("Not authenticated");

		const { error } = await authClient.organization.setActive({
			organizationId,
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		if (error) {
			throw new Error(`Failed to set active organization: ${error.message}`);
		}

		// Refresh session to get updated activeOrganizationId
		await this.refreshSession();
	}

	async signIn(provider: AuthProvider): Promise<SignInResult> {
		try {
			const state = crypto.randomBytes(32).toString("base64url");
			stateStore.set(state, Date.now());

			const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
			for (const [s, ts] of stateStore) {
				if (ts < tenMinutesAgo) stateStore.delete(s);
			}

			const connectUrl = new URL(
				`${env.NEXT_PUBLIC_API_URL}/api/auth/desktop/connect`,
			);
			connectUrl.searchParams.set("provider", provider);
			connectUrl.searchParams.set("state", state);
			await shell.openExternal(connectUrl.toString());
			return { success: true };
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : "Failed to open browser",
			};
		}
	}

	async handleAuthCallback(params: {
		token: string;
		expiresAt: string;
		state: string;
	}): Promise<SignInResult> {
		if (!stateStore.has(params.state)) {
			return { success: false, error: "Invalid or expired auth session" };
		}
		stateStore.delete(params.state);

		this.token = params.token;
		this.expiresAt = new Date(params.expiresAt);

		const storedAuth: StoredAuth = {
			token: this.token,
			expiresAt: params.expiresAt,
		};
		await fs.writeFile(TOKEN_FILE, encrypt(JSON.stringify(storedAuth)));

		console.log("[auth] Token saved, fetching session...");

		// Fetch session data from API before emitting state change
		await this.refreshSession();

		console.log("[auth] Session fetched, emitting state change");
		const state = this.getState();
		console.log("[auth] EMIT state-changed from handleAuthCallback:", state);
		this.emit("state-changed", state);

		return { success: true };
	}

	async signOut(): Promise<void> {
		console.log("[auth] signOut called");
		this.token = null;
		this.expiresAt = null;
		this.session = null;
		try {
			await fs.unlink(TOKEN_FILE);
		} catch {}
		const state = this.getState();
		console.log("[auth] EMIT state-changed from signOut:", state);
		this.emit("state-changed", state);
	}
}

export const authService = new AuthService();
