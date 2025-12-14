import { auth } from "@clerk/nextjs/server";
import { createTRPCContext } from "@superset/trpc";
import { jwtVerify } from "jose";
import { env } from "@/env";

/**
 * Desktop JWT payload structure
 */
interface DesktopJwtPayload {
	userId: string;
	email: string;
	name: string;
	avatarUrl: string | null;
}

/**
 * Verify a desktop JWT token
 */
async function verifyDesktopToken(
	token: string,
): Promise<DesktopJwtPayload | null> {
	try {
		const secret = new TextEncoder().encode(env.DESKTOP_AUTH_SECRET);
		const { payload } = await jwtVerify(token, secret);

		if (
			typeof payload.userId !== "string" ||
			typeof payload.email !== "string"
		) {
			return null;
		}

		return {
			userId: payload.userId,
			email: payload.email as string,
			name: (payload.name as string) ?? "",
			avatarUrl: (payload.avatarUrl as string | null) ?? null,
		};
	} catch {
		return null;
	}
}

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
	const clerkSession = await auth();

	if (clerkSession.userId) {
		return createTRPCContext({ session: clerkSession });
	}

	// No Clerk session, check for desktop JWT
	const authHeader = req.headers.get("authorization");
	if (authHeader?.startsWith("Bearer ")) {
		const token = authHeader.slice(7);
		const desktopPayload = await verifyDesktopToken(token);

		if (desktopPayload) {
			// Create a Clerk-compatible session object for desktop auth
			// This allows desktop clients to use the same protectedProcedure
			// We cast to unknown first since we're creating a minimal compatible object
			return createTRPCContext({
				session: {
					userId: desktopPayload.userId,
					sessionId: "desktop-session",
					sessionClaims: {},
					sessionStatus: "active",
					actor: undefined,
					orgId: undefined,
					orgRole: undefined,
					orgSlug: undefined,
					orgPermissions: undefined,
					organization: undefined,
					getToken: async () => token,
					has: () => false,
					debug: () => ({}),
				} as unknown as Parameters<typeof createTRPCContext>[0]["session"],
			});
		}
	}

	// No valid auth - return unauthenticated context
	return createTRPCContext({ session: clerkSession });
};
