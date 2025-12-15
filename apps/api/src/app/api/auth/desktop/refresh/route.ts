import { TOKEN_CONFIG } from "@superset/shared/constants";
import { type JWTPayload, jwtVerify, SignJWT } from "jose";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";

/**
 * Refresh token payload structure (minimal claims)
 */
interface RefreshTokenPayload extends JWTPayload {
	userId: string;
	type: "refresh";
}

/**
 * Refresh endpoint for desktop auth
 *
 * POST /api/auth/desktop/refresh
 * Body: { refresh_token: string }
 *
 * Exchanges a valid refresh token for new access + refresh tokens
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { refresh_token } = body;

		// Validate required parameters
		if (!refresh_token || typeof refresh_token !== "string") {
			return NextResponse.json(
				{ error: "Missing or invalid refresh_token parameter" },
				{ status: 400 },
			);
		}

		// Verify and decode the refresh token
		const secret = new TextEncoder().encode(env.DESKTOP_AUTH_SECRET);
		let payload: RefreshTokenPayload;

		try {
			const result = await jwtVerify(refresh_token, secret);
			payload = result.payload as RefreshTokenPayload;
		} catch (verifyError) {
			console.error("[refresh] Token verification failed:", verifyError);
			return NextResponse.json(
				{ error: "Invalid or expired refresh token" },
				{ status: 401 },
			);
		}

		// Verify this is a refresh token
		if (payload.type !== "refresh") {
			return NextResponse.json(
				{ error: "Invalid token type" },
				{ status: 400 },
			);
		}

		// Create a new access token
		const accessTokenExpiresAt =
			Date.now() + TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY * 1000;

		const accessToken = await new SignJWT({
			userId: payload.userId,
			type: "access",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime(`${TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY}s`)
			.sign(secret);

		// Create a new refresh token (rotation - old one becomes invalid)
		const refreshTokenExpiresAt =
			Date.now() + TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY * 1000;

		const newRefreshToken = await new SignJWT({
			userId: payload.userId,
			type: "refresh",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime(`${TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY}s`)
			.sign(secret);

		return NextResponse.json({
			access_token: accessToken,
			access_token_expires_at: accessTokenExpiresAt,
			refresh_token: newRefreshToken,
			refresh_token_expires_at: refreshTokenExpiresAt,
		});
	} catch (error) {
		console.error("[refresh] Token refresh failed:", error);
		return NextResponse.json(
			{ error: "Token refresh failed" },
			{ status: 500 },
		);
	}
}
