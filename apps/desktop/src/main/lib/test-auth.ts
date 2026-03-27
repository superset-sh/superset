import { IS_DESKTOP_TEST_MODE } from "lib/electron-app/test-mode";
import {
	clearToken,
	loadToken,
	saveToken,
} from "lib/trpc/routers/auth/utils/auth-functions";

const DESKTOP_TEST_AUTH_TOKEN_ENV = "DESKTOP_TEST_AUTH_TOKEN";
const DESKTOP_TEST_AUTH_EXPIRES_AT_ENV = "DESKTOP_TEST_AUTH_EXPIRES_AT";

export interface DesktopTestAuthState {
	expiresAt: string | null;
	tokenPresent: boolean;
}

export interface DesktopTestStoredAuthToken {
	expiresAt: string | null;
	token: string | null;
}

function assertDesktopTestMode(): void {
	if (!IS_DESKTOP_TEST_MODE) {
		throw new Error(
			"Desktop test auth helpers are only available when DESKTOP_TEST_MODE=1.",
		);
	}
}

function validateExpiresAt(expiresAt: string): string {
	const parsed = new Date(expiresAt);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(
			"DESKTOP_TEST_AUTH_EXPIRES_AT must be a valid ISO timestamp.",
		);
	}

	return parsed.toISOString();
}

function readDesktopTestAuthSeedFromEnv(): {
	expiresAt: string;
	token: string;
} | null {
	const token = process.env[DESKTOP_TEST_AUTH_TOKEN_ENV] ?? null;
	const expiresAt = process.env[DESKTOP_TEST_AUTH_EXPIRES_AT_ENV] ?? null;

	if (!token && !expiresAt) {
		return null;
	}

	if (!token || !expiresAt) {
		throw new Error(
			`${DESKTOP_TEST_AUTH_TOKEN_ENV} and ${DESKTOP_TEST_AUTH_EXPIRES_AT_ENV} must be set together.`,
		);
	}

	return {
		token,
		expiresAt: validateExpiresAt(expiresAt),
	};
}

export async function getDesktopTestAuthState(): Promise<DesktopTestAuthState> {
	assertDesktopTestMode();
	const stored = await loadToken();

	return {
		tokenPresent: Boolean(stored.token),
		expiresAt: stored.expiresAt,
	};
}

export async function getDesktopTestStoredAuthToken(): Promise<DesktopTestStoredAuthToken> {
	assertDesktopTestMode();
	return loadToken();
}

export async function seedDesktopTestAuthToken(input: {
	expiresAt: string;
	token: string;
}): Promise<DesktopTestAuthState> {
	assertDesktopTestMode();
	await saveToken({
		token: input.token,
		expiresAt: validateExpiresAt(input.expiresAt),
	});

	return getDesktopTestAuthState();
}

export async function clearDesktopTestAuthToken(): Promise<DesktopTestAuthState> {
	assertDesktopTestMode();
	await clearToken();
	return getDesktopTestAuthState();
}

export async function seedDesktopTestAuthFromEnv(): Promise<void> {
	assertDesktopTestMode();
	const seed = readDesktopTestAuthSeedFromEnv();
	if (!seed) return;

	await saveToken(seed);
	console.log("[desktop-test-auth] Seeded stored auth token from environment.");
}
