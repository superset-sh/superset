interface StoredToken {
	token: string | null;
	expiresAt: string | null;
}

// The stored expiresAt is written once at sign-in and the server extends the
// session daily, so it says nothing about whether the session is still valid.
export function resolveStoredToken(
	storedToken: StoredToken | null | undefined,
): string | null {
	return storedToken?.token || null;
}
