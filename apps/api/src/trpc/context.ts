import { verifyToken } from "@clerk/backend";
import { auth } from "@clerk/nextjs/server";
import { createTRPCContext } from "@superset/trpc";

import { env } from "../env";
import { verifyDesktopToken } from "./utils/verifyDesktopToken";

/**
 * Create tRPC context with support for both Clerk and desktop JWT auth
 *
 * Auth priority:
 * 1. Clerk session (cookie-based, handled by middleware)
 * 2. Clerk Bearer token (from Authorization header)
 * 3. Desktop JWT (Bearer token signed with DESKTOP_AUTH_SECRET)
 */
export const createContext = async ({
	req,
}: {
	req: Request;
	resHeaders: Headers;
}) => {
	// First, try Clerk auth (handles cookies via middleware)
	const clerkAuth = await auth();

	if (clerkAuth.userId) {
		return createTRPCContext({ userId: clerkAuth.userId });
	}

	// No cookie session, check for Bearer token
	const authHeader = req.headers.get("authorization");
	if (authHeader?.startsWith("Bearer ")) {
		const token = authHeader.slice(7);

		// Try to verify as Clerk token first
		try {
			const payload = await verifyToken(token, {
				secretKey: env.CLERK_SECRET_KEY,
			});
			if (payload.sub) {
				return createTRPCContext({ userId: payload.sub });
			}
		} catch {
			// Not a valid Clerk token, try desktop token
		}

		// Try to verify as desktop JWT
		const userId = await verifyDesktopToken(token);
		if (userId) {
			return createTRPCContext({ userId });
		}
	}

	// No valid auth
	return createTRPCContext({ userId: null });
};
