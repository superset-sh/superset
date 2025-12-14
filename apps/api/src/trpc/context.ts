import { auth } from "@clerk/nextjs/server";
import { createTRPCContext } from "@superset/trpc";

import { verifyDesktopToken } from "./utils/verifyDesktopToken";

/**
 * Create tRPC context with support for both Clerk and desktop JWT auth
 *
 * Auth priority:
 * 1. Clerk session (cookie or Clerk Bearer token)
 * 2. Desktop JWT (Bearer token signed with DESKTOP_AUTH_SECRET)
 */
export const createContext = async ({
	req,
}: {
	req: Request;
	resHeaders: Headers;
}) => {
	// First, try Clerk auth (handles cookies and Clerk Bearer tokens)
	const clerkAuth = await auth();

	if (clerkAuth.userId) {
		return createTRPCContext({ userId: clerkAuth.userId });
	}

	// No Clerk session, check for desktop JWT
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
