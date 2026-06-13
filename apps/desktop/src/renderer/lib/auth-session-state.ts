export function isStoredAuthTokenCurrent(
	expiresAt: string | null | undefined,
	nowMs = Date.now(),
): boolean {
	if (!expiresAt) return false;
	const expiresAtMs = Date.parse(expiresAt);
	return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
}

export function shouldRecoverAuthenticatedSession({
	hasLocalToken,
	isOnline,
	isSignedIn,
	skipEnvValidation,
}: {
	hasLocalToken: boolean;
	isOnline: boolean;
	isSignedIn: boolean;
	skipEnvValidation: boolean;
}): boolean {
	return !skipEnvValidation && hasLocalToken && !isSignedIn && isOnline;
}
