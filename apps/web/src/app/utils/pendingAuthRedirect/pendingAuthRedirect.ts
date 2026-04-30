import { cookies } from "next/headers";

/**
 * Reads the `superset_pending_auth_redirect` cookie set by the
 * sign-in middleware (`proxy.ts`) when it caught an unauth request.
 * The middleware stashes the original `{ path, params }` so a page
 * can recover its query params after the sign-in round-trip — the
 * `?redirect=` query param alone can't carry nested ?x=y safely
 * through better-auth's OAuth state.
 *
 * Returns the original params if the cookie is present and the path
 * matches; clears the cookie either way.
 */

const COOKIE_NAME = "superset_pending_auth_redirect";

interface StoredPendingRedirect {
	path: string;
	params: Record<string, string>;
}

export async function consumePendingAuthParams(
	expectedPath: string,
): Promise<Record<string, string> | null> {
	const cookieStore = await cookies();
	const cookie = cookieStore.get(COOKIE_NAME);
	if (!cookie) return null;

	let parsed: StoredPendingRedirect;
	try {
		parsed = JSON.parse(cookie.value) as StoredPendingRedirect;
	} catch {
		cookieStore.delete(COOKIE_NAME);
		return null;
	}

	if (parsed.path !== expectedPath) return null;

	cookieStore.delete(COOKIE_NAME);
	return parsed.params;
}
