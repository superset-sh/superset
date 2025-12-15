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

		// Require access tokens only (allowlist, not blocklist)
		if (payload.type !== "access") {
			console.warn(
				`[auth] Rejected token - expected type 'access', got '${payload.type}'`,
			);
			return null;
		}

		if (typeof payload.userId !== "string") {
			return null;
		}

		return payload.userId;
	} catch {
		return null;
	}
}
