export const AUTHENTICATED_SESSION_RECOVERY_TIMEOUT_MS = 20_000;

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

export function hasAuthenticatedSessionRecoveryTimedOut({
	recoveryStartedAtMs,
	nowMs = Date.now(),
	timeoutMs = AUTHENTICATED_SESSION_RECOVERY_TIMEOUT_MS,
}: {
	recoveryStartedAtMs: number | null;
	nowMs?: number;
	timeoutMs?: number;
}): boolean {
	return (
		recoveryStartedAtMs !== null && nowMs - recoveryStartedAtMs >= timeoutMs
	);
}
