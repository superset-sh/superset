import { Auth0Client } from "@auth0/nextjs-auth0/server";

import type { AppSession } from "./types";

/**
 * Auth0 client instance for server-side operations.
 *
 * Configuration is loaded from environment variables:
 * - AUTH0_SECRET
 * - AUTH0_BASE_URL
 * - AUTH0_ISSUER_BASE_URL
 * - AUTH0_CLIENT_ID
 * - AUTH0_CLIENT_SECRET
 */
export const auth0 = new Auth0Client();

/**
 * Get the current session from Auth0.
 * Returns null if user is not authenticated.
 */
export async function getSession(): Promise<AppSession> {
	try {
		return await auth0.getSession();
	} catch {
		return null;
	}
}

export { Auth0Client };
