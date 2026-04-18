// WORKAROUND: backup/restore API keys across OAuth connect/disconnect.
// mastracode's resolveModel only reads API keys from the main authStorage
// slot, which OAuth login overwrites and disconnect clears. We back up to
// the dedicated apikey: slot before OAuth and restore after disconnect.
// Remove once mastra-ai/mastra#15483 lands and we bump mastracode.
import type {
	AuthMethod,
	AuthStorageLike,
	StoredOAuthCredential,
} from "./auth-storage-types";

export function setApiKeyForProvider(
	authStorage: AuthStorageLike,
	providerId: string,
	rawApiKey: string,
	requiredMessage: string,
): void {
	const trimmedApiKey = rawApiKey.trim();
	if (trimmedApiKey.length === 0) {
		throw new Error(requiredMessage);
	}

	authStorage.reload();
	// Store in main slot (mastracode's resolveModel reads from here).
	authStorage.set(providerId, {
		type: "api_key",
		key: trimmedApiKey,
	});
	// Also store in dedicated apikey: slot as a backup that survives
	// OAuth connect/disconnect cycles.
	authStorage.setStoredApiKey(providerId, trimmedApiKey);
}

export function clearApiKeyForProvider(
	authStorage: AuthStorageLike,
	providerId: string,
): void {
	authStorage.reload();

	// Clear the dedicated backup slot.
	if (authStorage.hasStoredApiKey(providerId)) {
		authStorage.remove(`apikey:${providerId}`);
	}

	// Clear the main slot if it holds an api_key.
	const credential = authStorage.get(providerId);
	if (credential?.type === "api_key") {
		authStorage.remove(providerId);
	}
}

/**
 * Save the current API key to the backup slot before OAuth overwrites
 * the main slot. Call this BEFORE authStorage.login().
 */
export function backupApiKeyBeforeOAuth(
	authStorage: AuthStorageLike,
	providerId: string,
): void {
	authStorage.reload();
	const credential = authStorage.get(providerId);
	if (
		credential?.type === "api_key" &&
		credential.key.trim().length > 0 &&
		!authStorage.hasStoredApiKey(providerId)
	) {
		authStorage.setStoredApiKey(providerId, credential.key.trim());
	}
}

/**
 * Restore the API key from the backup slot after OAuth is disconnected.
 * Call this AFTER removing the OAuth credential from the main slot.
 */
export function restoreApiKeyAfterOAuthDisconnect(
	authStorage: AuthStorageLike,
	providerId: string,
): void {
	authStorage.reload();
	const storedApiKey = authStorage.getStoredApiKey(providerId);
	if (storedApiKey && storedApiKey.trim().length > 0) {
		authStorage.set(providerId, {
			type: "api_key",
			key: storedApiKey.trim(),
		});
	}
}

export function clearCredentialForProvider(
	authStorage: AuthStorageLike,
	providerId: string,
): void {
	authStorage.reload();
	if (!authStorage.get(providerId)) {
		return;
	}

	authStorage.remove(providerId);
}

export function resolveAuthMethodForProvider(
	authStorage: AuthStorageLike,
	providerId: string,
	isOAuthValid: (credential: StoredOAuthCredential) => boolean = () => true,
): AuthMethod {
	authStorage.reload();
	const credential = authStorage.get(providerId);
	if (credential?.type === "oauth" && isOAuthValid(credential)) {
		return "oauth";
	}
	if (credential?.type === "api_key" && credential.key.trim().length > 0) {
		return "api_key";
	}
	// Check the backup slot — API key may have been displaced by OAuth.
	if (authStorage.hasStoredApiKey(providerId)) {
		return "api_key";
	}
	return null;
}
