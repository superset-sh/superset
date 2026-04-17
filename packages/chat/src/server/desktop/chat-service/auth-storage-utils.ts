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
	authStorage.setStoredApiKey(providerId, trimmedApiKey);
}

export function clearApiKeyForProvider(
	authStorage: AuthStorageLike,
	providerId: string,
): void {
	authStorage.reload();

	// Clear the dedicated API-key slot (apikey:<providerId>)
	if (authStorage.hasStoredApiKey(providerId)) {
		authStorage.remove(`apikey:${providerId}`);
	}

	// Also clear the legacy main slot if it holds an api_key credential,
	// for backwards compatibility with keys stored before this fix.
	const credential = authStorage.get(providerId);
	if (credential?.type === "api_key") {
		authStorage.remove(providerId);
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
	// Check the dedicated API-key slot (apikey:<providerId>), which persists
	// independently of OAuth connect/disconnect cycles.
	if (authStorage.hasStoredApiKey(providerId)) {
		return "api_key";
	}
	return null;
}
