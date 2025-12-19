import { auth } from "@clerk/nextjs/server";
import { createTRPCContext } from "@superset/trpc";
import { jwtVerify } from "jose";
import { env } from "@/env";

/**
 * Verify desktop JWT access token
 * Only accepts access tokens (type: "access"), not refresh tokens
 */
async function verifyDesktopToken(token: string): Promise<string | null> {
	try {
		const secretKey = new TextEncoder().encode(env.DESKTOP_AUTH_SECRET);
		const { payload } = await jwtVerify(token, secretKey, {
			issuer: "superset-desktop",
		});

		// Only accept access tokens for API authentication
		if (payload.type !== "access") {
			return null;
		}

		return payload.sub as string;
	} catch {
		return null;
	}
}

/**
 * Create tRPC context with support for multiple auth methods
 *
 * Auth methods supported (in order of precedence):
 * 1. Clerk session (cookie-based, web app)
 * 2. Clerk OAuth token (Bearer token from desktop app - legacy)
 * 3. Desktop JWT token (Bearer token from desktop app with Google OAuth)
 *
 * The `acceptsToken: 'oauth_token'` option allows the desktop app to
 * authenticate using Clerk OAuth access tokens obtained through the
 * PKCE OAuth flow (legacy method).
 *
 * Desktop JWT tokens are signed with DESKTOP_AUTH_SECRET and contain
 * the Clerk user ID in the `sub` claim.
 */
export const createContext = async ({
	req,
}: {
	req: Request;
	resHeaders: Headers;
}) => {
	// First try Clerk auth (handles both session cookies and OAuth Bearer tokens)
	const clerkAuth = await auth({ acceptsToken: "oauth_token" });

	if (clerkAuth.userId) {
		return createTRPCContext({ userId: clerkAuth.userId });
	}

	// If no Clerk auth, try desktop JWT token
	const authHeader = req.headers.get("authorization");
	if (authHeader?.startsWith("Bearer ")) {
		const token = authHeader.slice(7);
		const userId = await verifyDesktopToken(token);
		if (userId) {
			return createTRPCContext({ userId });
		}
	}

	// No valid auth
	return createTRPCContext({ userId: null });
};
