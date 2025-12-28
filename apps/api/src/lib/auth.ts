import { clerkClient } from "@clerk/nextjs/server";
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

		if (payload.type !== "access") {
			return null;
		}

		return payload.sub as string;
	} catch {
		return null;
	}
}

/**
 * Authenticate a request and return the Clerk user ID
 *
 * Supports:
 * 1. Clerk session token (from web app)
 * 2. Desktop JWT token (from desktop app)
 *
 * Returns null if not authenticated.
 */
export async function authenticateRequest(
	request: Request,
): Promise<string | null> {
	// Try Clerk auth first
	const client = await clerkClient();
	const { isAuthenticated, toAuth } = await client.authenticateRequest(request);

	if (isAuthenticated) {
		const auth = toAuth();
		if (auth.userId) {
			return auth.userId;
		}
	}

	// Fall back to desktop JWT
	const authHeader = request.headers.get("authorization");
	if (authHeader?.startsWith("Bearer ")) {
		const token = authHeader.slice(7);
		return verifyDesktopToken(token);
	}

	return null;
}
