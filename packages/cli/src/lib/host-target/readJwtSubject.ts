/**
 * The `sub` claim of a JWT, read without verification — the CLI is naming
 * itself to a local host it already authenticates to with the host's secret,
 * so there is nothing to verify against. Null for anything that is not a JWT
 * (an `sk_live_` API key, a malformed token); the caller then simply sends
 * no user id.
 */
export function readJwtSubject(token: string): string | null {
	const parts = token.split(".");
	if (parts.length !== 3 || !parts[1]) return null;
	try {
		const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
		const payload: unknown = JSON.parse(atob(padded));
		if (typeof payload !== "object" || payload === null) return null;
		const sub = (payload as { sub?: unknown }).sub;
		return typeof sub === "string" && sub.length > 0 ? sub : null;
	} catch {
		return null;
	}
}
