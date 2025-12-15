import { randomUUID } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { AUTH_PROVIDERS, type AuthProvider } from "@superset/shared/constants";
import { SignJWT } from "jose";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";

/**
 * Desktop auth endpoint with PKCE support
 *
 * Flow:
 * 1. Desktop opens browser to /api/auth/desktop/google?code_challenge=XXX
 * 2. If not authenticated, redirect to Clerk sign-in
 * 3. Once authenticated, create auth code (JWT with user info + code_challenge)
 * 4. Redirect to desktop via deep link with auth code
 * 5. Desktop exchanges code + code_verifier at /api/auth/desktop/token endpoint
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ provider: string }> },
) {
	const { provider } = await params;

	// Validate provider
	if (!AUTH_PROVIDERS.includes(provider as AuthProvider)) {
		return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
	}

	// Get PKCE + state parameters
	const codeChallenge = request.nextUrl.searchParams.get("code_challenge");
	const codeChallengeMethod = request.nextUrl.searchParams.get(
		"code_challenge_method",
	);
	const state = request.nextUrl.searchParams.get("state");

	// Validate required parameters
	if (!codeChallenge) {
		return NextResponse.json(
			{ error: "Missing code_challenge parameter" },
			{ status: 400 },
		);
	}

	if (!state) {
		return NextResponse.json(
			{ error: "Missing state parameter" },
			{ status: 400 },
		);
	}

	// Validate code_challenge format: base64url charset, 43-128 chars (RFC 7636)
	const base64urlRegex = /^[A-Za-z0-9_-]+$/;
	if (
		codeChallenge.length < 43 ||
		codeChallenge.length > 128 ||
		!base64urlRegex.test(codeChallenge)
	) {
		return NextResponse.json(
			{ error: "Invalid code_challenge format" },
			{ status: 400 },
		);
	}

	if (codeChallengeMethod && codeChallengeMethod !== "S256") {
		return NextResponse.json(
			{ error: "Only S256 code_challenge_method is supported" },
			{ status: 400 },
		);
	}

	// Check if user is authenticated
	const user = await currentUser();

	if (!user) {
		// Redirect to sign-in with callback to this endpoint (preserving PKCE params)
		const callbackUrl = new URL(request.url);
		const signInUrl = new URL("/sign-in", request.url);
		signInUrl.searchParams.set(
			"redirect_url",
			`${callbackUrl.pathname}${callbackUrl.search}`,
		);
		return NextResponse.redirect(signInUrl);
	}

	// User is authenticated - create auth code with minimal claims (no PII in URLs)
	// User profile is looked up server-side during token exchange
	const authCode = await createAuthCode({
		userId: user.id,
		codeChallenge,
	});

	// Redirect to web callback page (which will open the desktop app)
	const callbackUrl = new URL("/auth/desktop/callback", request.url);
	callbackUrl.searchParams.set("code", authCode);
	callbackUrl.searchParams.set("state", state);

	return NextResponse.redirect(callbackUrl.toString());
}

interface AuthCodePayload {
	userId: string;
	codeChallenge: string;
}

/**
 * Create a short-lived auth code with minimal claims (no PII)
 * User profile is looked up server-side during token exchange
 * Includes jti (JWT ID) for replay protection
 */
async function createAuthCode(payload: AuthCodePayload): Promise<string> {
	const secret = new TextEncoder().encode(env.DESKTOP_AUTH_SECRET);

	const jwt = await new SignJWT({
		userId: payload.userId,
		codeChallenge: payload.codeChallenge,
		type: "auth_code",
	})
		.setProtectedHeader({ alg: "HS256" })
		.setJti(randomUUID()) // Unique ID for replay protection
		.setIssuedAt()
		.setExpirationTime("5m") // Auth code expires in 5 minutes
		.sign(secret);

	return jwt;
}
