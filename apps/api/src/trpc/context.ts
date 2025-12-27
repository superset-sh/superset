import { clerkClient } from "@clerk/nextjs/server";
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
 * 1. Clerk session token (Bearer token from web app)
 * 2. Desktop JWT token (Bearer token from desktop app)
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
	const authHeader = req.headers.get("authorization");

	// First try Clerk auth (handles session tokens from web app as Bearer tokens)
	const client = await clerkClient();
	const { isSignedIn, toAuth } = await client.authenticateRequest(req);

	if (isSignedIn) {
		const auth = toAuth();
		if (auth.userId) {
			return createTRPCContext({ userId: auth.userId });
		}
	}

	// If no Clerk auth, try desktop JWT token
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
