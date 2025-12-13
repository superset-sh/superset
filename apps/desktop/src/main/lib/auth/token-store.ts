import * as keytar from "keytar";

const SERVICE_NAME = "superset-desktop";

const ACCOUNTS = {
	accessToken: "auth0-access-token",
	refreshToken: "auth0-refresh-token",
	idToken: "auth0-id-token",
} as const;

export interface StoredTokens {
	accessToken: string | null;
	refreshToken: string | null;
	idToken: string | null;
}

/**
 * Store authentication tokens securely using the OS keychain.
 * Uses keytar which stores in:
 * - macOS: Keychain
 * - Windows: Credential Vault
 * - Linux: libsecret
 */
export async function storeTokens(tokens: {
	accessToken?: string;
	refreshToken?: string;
	idToken?: string;
}): Promise<void> {
	const promises: Promise<void>[] = [];

	if (tokens.accessToken !== undefined) {
		if (tokens.accessToken) {
			promises.push(
				keytar.setPassword(
					SERVICE_NAME,
					ACCOUNTS.accessToken,
					tokens.accessToken,
				),
			);
		} else {
			promises.push(
				keytar
					.deletePassword(SERVICE_NAME, ACCOUNTS.accessToken)
					.then(() => {}),
			);
		}
	}

	if (tokens.refreshToken !== undefined) {
		if (tokens.refreshToken) {
			promises.push(
				keytar.setPassword(
					SERVICE_NAME,
					ACCOUNTS.refreshToken,
					tokens.refreshToken,
				),
			);
		} else {
			promises.push(
				keytar
					.deletePassword(SERVICE_NAME, ACCOUNTS.refreshToken)
					.then(() => {}),
			);
		}
	}

	if (tokens.idToken !== undefined) {
		if (tokens.idToken) {
			promises.push(
				keytar.setPassword(SERVICE_NAME, ACCOUNTS.idToken, tokens.idToken),
			);
		} else {
			promises.push(
				keytar.deletePassword(SERVICE_NAME, ACCOUNTS.idToken).then(() => {}),
			);
		}
	}

	await Promise.all(promises);
}

/**
 * Retrieve all stored tokens from the OS keychain.
 */
export async function getTokens(): Promise<StoredTokens> {
	const [accessToken, refreshToken, idToken] = await Promise.all([
		keytar.getPassword(SERVICE_NAME, ACCOUNTS.accessToken),
		keytar.getPassword(SERVICE_NAME, ACCOUNTS.refreshToken),
		keytar.getPassword(SERVICE_NAME, ACCOUNTS.idToken),
	]);

	return {
		accessToken,
		refreshToken,
		idToken,
	};
}

/**
 * Clear all stored tokens from the OS keychain.
 */
export async function clearTokens(): Promise<void> {
	await Promise.all([
		keytar.deletePassword(SERVICE_NAME, ACCOUNTS.accessToken),
		keytar.deletePassword(SERVICE_NAME, ACCOUNTS.refreshToken),
		keytar.deletePassword(SERVICE_NAME, ACCOUNTS.idToken),
	]);
}

/**
 * Get just the access token (commonly needed for API calls).
 */
export async function getAccessToken(): Promise<string | null> {
	return keytar.getPassword(SERVICE_NAME, ACCOUNTS.accessToken);
}

/**
 * Get just the refresh token (needed for token refresh).
 */
export async function getRefreshToken(): Promise<string | null> {
	return keytar.getPassword(SERVICE_NAME, ACCOUNTS.refreshToken);
}

/**
 * Get just the ID token (contains user profile claims).
 */
export async function getIdToken(): Promise<string | null> {
	return keytar.getPassword(SERVICE_NAME, ACCOUNTS.idToken);
}
