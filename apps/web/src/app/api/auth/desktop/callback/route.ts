import { currentUser } from "@clerk/nextjs/server";
import { SignJWT } from "jose";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";

/** Auth code expiry in seconds (5 minutes - short-lived for security) */
const AUTH_CODE_EXPIRY = 5 * 60;

/**
 * Create an auth code JWT for the PKCE flow.
 * Contains userId and codeChallenge for verification during token exchange.
 */
async function createAuthCode(
	userId: string,
	codeChallenge: string,
): Promise<string> {
	const secret = new TextEncoder().encode(env.DESKTOP_AUTH_SECRET);

	return new SignJWT({
		userId,
		codeChallenge,
		type: "auth_code",
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${AUTH_CODE_EXPIRY}s`)
		.sign(secret);
}

/**
 * Desktop auth callback endpoint
 *
 * Called after OAuth completes successfully.
 * Creates an auth code and redirects to the deep link page.
 *
 * Flow:
 * 1. User arrives here after OAuth (authenticated via Clerk)
 * 2. We create a short-lived auth code JWT
 * 3. Redirect to /auth/desktop/callback page which triggers deep link
 * 4. Desktop exchanges auth code for access/refresh tokens via /api/auth/desktop/token
 */
export async function GET(request: NextRequest) {
	const codeChallenge = request.nextUrl.searchParams.get("code_challenge");
	const state = request.nextUrl.searchParams.get("state");

	// Validate required parameters
	if (!codeChallenge) {
		return NextResponse.redirect(
			new URL(
				"/auth/desktop/callback?error=Missing+code_challenge+parameter",
				request.url,
			),
		);
	}

	if (!state) {
		return NextResponse.redirect(
			new URL(
				"/auth/desktop/callback?error=Missing+state+parameter",
				request.url,
			),
		);
	}

	// Get the authenticated user
	const user = await currentUser();
	if (!user) {
		return NextResponse.redirect(
			new URL("/auth/desktop/callback?error=Not+authenticated", request.url),
		);
	}

	// Create the auth code
	const authCode = await createAuthCode(user.id, codeChallenge);

	// Redirect to deep link page
	const deepLinkPageUrl = new URL("/auth/desktop/callback", request.url);
	deepLinkPageUrl.searchParams.set("code", authCode);
	deepLinkPageUrl.searchParams.set("state", state);

	return NextResponse.redirect(deepLinkPageUrl.toString());
}
