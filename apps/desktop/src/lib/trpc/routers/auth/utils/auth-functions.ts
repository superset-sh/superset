import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { join } from "node:path";
import { PROTOCOL_SCHEMES } from "@superset/shared/constants";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { decrypt, encrypt } from "./crypto-storage";

interface StoredAuth {
	token: string;
	expiresAt: string;
}

export const TOKEN_FILE = join(SUPERSET_HOME_DIR, "auth-token.enc");
export const stateStore = new Map<string, number>();

/**
 * Event emitter for auth-related events.
 * Used by tRPC subscription to notify renderer of token changes.
 *
 * Events:
 * - "token-saved": { token, expiresAt } - New token saved (OAuth callback)
 * - "token-cleared": (no data) - Token deleted (sign-out)
 */
export const authEvents = new EventEmitter();

/**
 * Load token from encrypted disk storage.
 */
export async function loadToken(): Promise<{
	token: string | null;
	expiresAt: string | null;
}> {
	try {
		const data = decrypt(await fs.readFile(TOKEN_FILE));
		const parsed: StoredAuth = JSON.parse(data);
		return { token: parsed.token, expiresAt: parsed.expiresAt };
	} catch {
		return { token: null, expiresAt: null };
	}
}

/**
 * Persist token to encrypted disk storage and notify subscribers.
 */
export async function saveToken({
	token,
	expiresAt,
}: {
	token: string;
	expiresAt: string;
}): Promise<void> {
	const storedAuth: StoredAuth = { token, expiresAt };
	await fs.writeFile(TOKEN_FILE, encrypt(JSON.stringify(storedAuth)));
	authEvents.emit("token-saved", { token, expiresAt });
}

/**
 * Handle OAuth callback from deep link.
 * Validates CSRF state and saves token.
 */
export async function handleAuthCallback(params: {
	token: string;
	expiresAt: string;
	state: string;
}): Promise<{ success: boolean; error?: string }> {
	if (!stateStore.has(params.state)) {
		return { success: false, error: "Invalid or expired auth session" };
	}
	stateStore.delete(params.state);

	await saveToken({ token: params.token, expiresAt: params.expiresAt });

	return { success: true };
}

/**
 * Parse and validate auth deep link URL.
 */
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
