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
	authStorage.set(providerId, {
		type: "api_key",
		key: trimmedApiKey,
	});
}

export function clearApiKeyForProvider(
	authStorage: AuthStorageLike,
	providerId: string,
): void {
	authStorage.reload();
	const credential = authStorage.get(providerId);
	if (credential?.type !== "api_key") {
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
	return null;
}
