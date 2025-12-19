import { jwtVerify, SignJWT } from "jose";
import { env } from "@/env";

// Token expiration times
export const ACCESS_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
export const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Get the secret key for signing/verifying tokens
 */
export function getSecretKey(): Uint8Array {
	return new TextEncoder().encode(env.DESKTOP_AUTH_SECRET);
}

/**
 * Generate access and refresh tokens for a user
 */
export async function generateTokens(userId: string, email: string) {
	const secretKey = getSecretKey();
	const now = Date.now();
	const accessTokenExpiresAt = now + ACCESS_TOKEN_EXPIRY;
	const refreshTokenExpiresAt = now + REFRESH_TOKEN_EXPIRY;

	// Access token - short-lived, used for API calls
	const accessToken = await new SignJWT({
		sub: userId,
		email,
		type: "access",
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(Math.floor(accessTokenExpiresAt / 1000))
		.setIssuer("superset-desktop")
		.sign(secretKey);

	// Refresh token - long-lived, used to get new access tokens
	const refreshToken = await new SignJWT({
		sub: userId,
		email,
		type: "refresh",
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(Math.floor(refreshTokenExpiresAt / 1000))
		.setIssuer("superset-desktop")
		.sign(secretKey);

	return {
		accessToken,
		accessTokenExpiresAt,
		refreshToken,
		refreshTokenExpiresAt,
	};
}

/**
 * Verify a refresh token and return its payload
 */
export async function verifyRefreshToken(token: string): Promise<{
	userId: string;
	email: string;
} | null> {
	try {
		const secretKey = getSecretKey();
		const { payload } = await jwtVerify(token, secretKey, {
			issuer: "superset-desktop",
		});

		// Ensure it's a refresh token
		if (payload.type !== "refresh") {
			return null;
		}

		return {
			userId: payload.sub as string,
			email: payload.email as string,
		};
	} catch {
		return null;
	}
}
