import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { join } from "node:path";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { PROTOCOL_SCHEME } from "shared/constants";
import { decrypt, encrypt } from "./crypto-storage";

interface StoredAccount {
	token: string;
	expiresAt: string;
	userId: string;
	email?: string;
	name?: string;
	image?: string;
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
 * Parse stored data, handling both legacy single-token and new multi-account formats.
 */
function parseStoredData(raw: string): StoredAccount[] {
	const parsed = JSON.parse(raw);
	if (Array.isArray(parsed)) {
		return parsed;
	}
	// Legacy format: { token, expiresAt }
	if (parsed.token && parsed.expiresAt) {
		return [
			{ token: parsed.token, expiresAt: parsed.expiresAt, userId: "unknown" },
		];
	}
	return [];
}

/**
 * Load all stored accounts from encrypted disk storage.
 */
export async function loadAllAccounts(): Promise<StoredAccount[]> {
	try {
		const data = decrypt(await fs.readFile(TOKEN_FILE));
		return parseStoredData(data);
	} catch {
		return [];
	}
}

/**
 * Save all accounts to encrypted disk storage.
 */
async function saveAllAccounts(accounts: StoredAccount[]): Promise<void> {
	await fs.writeFile(TOKEN_FILE, encrypt(JSON.stringify(accounts)));
}

/**
 * Load the active (first) token from encrypted disk storage.
 */
export async function loadToken(): Promise<{
	token: string | null;
	expiresAt: string | null;
}> {
	const accounts = await loadAllAccounts();
	const active = accounts[0];
	if (active) {
		return { token: active.token, expiresAt: active.expiresAt };
	}
	return { token: null, expiresAt: null };
}

/**
 * Persist token to encrypted disk storage and notify subscribers.
 * If a userId already exists, updates it. Otherwise appends and makes it active.
 */
export async function saveToken({
	token,
	expiresAt,
	userId,
	email,
	name,
	image,
}: {
	token: string;
	expiresAt: string;
	userId?: string;
	email?: string;
	name?: string;
	image?: string;
}): Promise<void> {
	const accounts = await loadAllAccounts();
	const newAccount: StoredAccount = {
		token,
		expiresAt,
		userId: userId ?? "unknown",
		email,
		name,
		image,
	};

	const existingIndex = accounts.findIndex(
		(a) => a.userId === newAccount.userId,
	);
	if (existingIndex >= 0) {
		accounts[existingIndex] = newAccount;
		// Move to front (make active)
		accounts.unshift(accounts.splice(existingIndex, 1)[0]);
	} else {
		// New account — prepend to make active
		accounts.unshift(newAccount);
	}

	await saveAllAccounts(accounts);
	authEvents.emit("token-saved", { token, expiresAt });
}

/**
 * Switch the active account by moving the specified userId to the front.
 */
export async function setActiveAccount(userId: string): Promise<{
	token: string;
	expiresAt: string;
} | null> {
	const accounts = await loadAllAccounts();
	const index = accounts.findIndex((a) => a.userId === userId);
	if (index < 0) return null;

	const [account] = accounts.splice(index, 1);
	accounts.unshift(account);
	await saveAllAccounts(accounts);

	authEvents.emit("token-saved", {
		token: account.token,
		expiresAt: account.expiresAt,
	});
	return { token: account.token, expiresAt: account.expiresAt };
}

/**
 * Remove a specific account by userId.
 */
export async function removeAccount(userId: string): Promise<boolean> {
	const accounts = await loadAllAccounts();
	const index = accounts.findIndex((a) => a.userId === userId);
	if (index < 0) return false;

	const wasActive = index === 0;
	accounts.splice(index, 1);

	if (accounts.length === 0) {
		await fs.unlink(TOKEN_FILE).catch(() => {});
		authEvents.emit("token-cleared");
		return true;
	}

	await saveAllAccounts(accounts);

	if (wasActive) {
		// Switch to next account
		const next = accounts[0];
		authEvents.emit("token-saved", {
			token: next.token,
			expiresAt: next.expiresAt,
		});
	}

	return true;
}

/**
 * Update account metadata (email, name, image) for a userId.
 */
export async function updateAccountMeta({
	userId,
	email,
	name,
	image,
}: {
	userId: string;
	email?: string;
	name?: string;
	image?: string;
}): Promise<void> {
	const accounts = await loadAllAccounts();
	const account = accounts.find((a) => a.userId === userId);
	if (!account) return;

	if (email !== undefined) account.email = email;
	if (name !== undefined) account.name = name;
	if (image !== undefined) account.image = image;

	await saveAllAccounts(accounts);
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
		if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return null;
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
