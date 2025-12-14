import { jwtVerify } from "jose";

import { env } from "@/env";

/**
 * Verify a desktop JWT token and extract userId
 *
 * Only accepts access tokens - rejects auth_code and refresh tokens
 */
export async function verifyDesktopToken(
	token: string,
): Promise<string | null> {
	try {
		const secret = new TextEncoder().encode(env.DESKTOP_AUTH_SECRET);
		const { payload } = await jwtVerify(token, secret);

		if (typeof payload.userId !== "string") {
			return null;
		}

		// Only accept access tokens (reject auth_code and refresh tokens)
		if (payload.type === "auth_code" || payload.type === "refresh") {
			console.warn(`[auth] Rejected ${payload.type} token - wrong token type`);
			return null;
		}

		return payload.userId;
	} catch {
		return null;
	}
}
