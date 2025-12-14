import { createHash } from "node:crypto";
import { type JWTPayload, jwtVerify, SignJWT } from "jose";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";

/**
 * Token durations (must match desktop/shared/auth.ts)
 */
const TOKEN_CONFIG = {
	/** Access token lifetime in seconds (1 hour) */
	ACCESS_TOKEN_EXPIRY: 60 * 60,
	/** Refresh token lifetime in seconds (30 days) */
	REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60,
} as const;

/**
 * Auth code payload structure (from the authorization step)
 */
interface AuthCodePayload extends JWTPayload {
	userId: string;
	email: string;
	name: string;
	avatarUrl: string | null;
	codeChallenge: string;
	type: "auth_code";
}

/**
 * User info included in tokens
 */
interface UserInfo {
	userId: string;
	email: string;
	name: string;
	avatarUrl: string | null;
}

/**
 * Create an access token (short-lived, for API calls)
 */
async function createAccessToken(
	user: UserInfo,
	secret: Uint8Array,
): Promise<{ token: string; expiresAt: number }> {
	const expiresAt = Date.now() + TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY * 1000;

	const token = await new SignJWT({
		userId: user.userId,
		email: user.email,
		name: user.name,
		avatarUrl: user.avatarUrl,
		type: "access",
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY}s`)
		.sign(secret);

	return { token, expiresAt };
}

/**
 * Create a refresh token (long-lived, for getting new access tokens)
 */
async function createRefreshToken(
	user: UserInfo,
	secret: Uint8Array,
): Promise<{ token: string; expiresAt: number }> {
	const expiresAt = Date.now() + TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY * 1000;

	const token = await new SignJWT({
		userId: user.userId,
		email: user.email,
		name: user.name,
		avatarUrl: user.avatarUrl,
		type: "refresh",
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY}s`)
		.sign(secret);

	return { token, expiresAt };
}

/**
 * Token exchange endpoint for desktop PKCE flow
 *
 * POST /api/auth/desktop/token
 * Body: { code: string, code_verifier: string }
 *
 * Verifies PKCE challenge and exchanges auth code for access + refresh tokens
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { code, code_verifier } = body;

		// Validate required parameters
		if (!code || typeof code !== "string") {
			return NextResponse.json(
				{ error: "Missing or invalid code parameter" },
				{ status: 400 },
			);
		}

		if (!code_verifier || typeof code_verifier !== "string") {
			return NextResponse.json(
				{ error: "Missing or invalid code_verifier parameter" },
				{ status: 400 },
			);
		}

		// Verify and decode the auth code
		const secret = new TextEncoder().encode(env.DESKTOP_AUTH_SECRET);
		let payload: AuthCodePayload;

		try {
			const result = await jwtVerify(code, secret);
			payload = result.payload as AuthCodePayload;
		} catch (verifyError) {
			console.error("[token] Auth code verification failed:", verifyError);
			return NextResponse.json(
				{ error: "Invalid or expired auth code" },
				{ status: 401 },
			);
		}

		// Verify this is an auth code (not a session token)
		if (payload.type !== "auth_code") {
			return NextResponse.json(
				{ error: "Invalid token type" },
				{ status: 400 },
			);
		}

		// Verify PKCE: SHA256(code_verifier) should equal code_challenge
		const computedChallenge = createHash("sha256")
			.update(code_verifier)
			.digest("base64url");

		if (computedChallenge !== payload.codeChallenge) {
			console.error("[token] PKCE verification failed");
			return NextResponse.json(
				{ error: "PKCE verification failed" },
				{ status: 401 },
			);
		}

		// PKCE verified! Create access and refresh tokens
		const userInfo: UserInfo = {
			userId: payload.userId,
			email: payload.email,
			name: payload.name,
			avatarUrl: payload.avatarUrl,
		};

		const [accessToken, refreshToken] = await Promise.all([
			createAccessToken(userInfo, secret),
			createRefreshToken(userInfo, secret),
		]);

		return NextResponse.json({
			access_token: accessToken.token,
			access_token_expires_at: accessToken.expiresAt,
			refresh_token: refreshToken.token,
			refresh_token_expires_at: refreshToken.expiresAt,
			user: {
				id: payload.userId,
				email: payload.email,
				name: payload.name,
				avatarUrl: payload.avatarUrl,
			},
		});
	} catch (error) {
		console.error("[token] Token exchange failed:", error);
		return NextResponse.json(
			{ error: "Token exchange failed" },
			{ status: 500 },
		);
	}
}
