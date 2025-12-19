import { auth } from "@clerk/nextjs/server";
import { createTRPCContext } from "@superset/trpc";

/**
 * Create tRPC context with support for Clerk auth (sessions and OAuth tokens)
 *
 * Auth methods supported:
 * 1. Clerk session (cookie-based, web app)
 * 2. Clerk OAuth token (Bearer token from desktop app)
 *
 * The `acceptsToken: 'oauth_token'` option allows the desktop app to
 * authenticate using Clerk OAuth access tokens obtained through the
 * PKCE OAuth flow.
 */
export const createContext = async ({
	req: _req,
}: {
	req: Request;
	resHeaders: Headers;
}) => {
	// Clerk auth handles both session cookies and OAuth Bearer tokens
	// acceptsToken: 'oauth_token' allows OAuth tokens from desktop app
	const clerkAuth = await auth({ acceptsToken: "oauth_token" });

	if (clerkAuth.userId) {
		return createTRPCContext({ userId: clerkAuth.userId });
	}

	// No valid auth
	return createTRPCContext({ userId: null });
};
