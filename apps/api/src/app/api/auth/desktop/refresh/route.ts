import { generateTokens, verifyRefreshToken } from "../tokens";

/**
 * Refresh access token using a valid refresh token
 *
 * POST /api/auth/desktop/refresh
 * Body: { refreshToken: string }
 * Returns: { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt }
 *
 * This endpoint allows the desktop app to get new tokens without
 * requiring the user to re-authenticate through Google OAuth.
 */
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { refreshToken } = body as { refreshToken: string };

		if (!refreshToken) {
			return Response.json({ error: "Missing refresh token" }, { status: 400 });
		}

		// Verify the refresh token
		const tokenData = await verifyRefreshToken(refreshToken);

		if (!tokenData) {
			return Response.json(
				{ error: "Invalid or expired refresh token" },
				{ status: 401 },
			);
		}

		// Generate new tokens (rotate both access and refresh tokens)
		const tokens = await generateTokens(tokenData.userId, tokenData.email);

		console.log("[auth/refresh] Tokens refreshed for user:", tokenData.userId);

		return Response.json(tokens);
	} catch (error) {
		console.error("[auth/refresh] Error:", error);
		return Response.json({ error: "Internal server error" }, { status: 500 });
	}
}
