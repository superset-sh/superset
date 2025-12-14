import { currentUser } from "@clerk/nextjs/server";
import { SignJWT } from "jose";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";

const DESKTOP_PROTOCOL =
	process.env.NODE_ENV === "development" ? "superset-dev" : "superset";

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
	if (!["google", "github"].includes(provider)) {
		return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
	}

	// Get PKCE parameters
	const codeChallenge = request.nextUrl.searchParams.get("code_challenge");
	const codeChallengeMethod = request.nextUrl.searchParams.get(
		"code_challenge_method",
	);

	// Validate PKCE parameters
	if (!codeChallenge) {
		return NextResponse.json(
			{ error: "Missing code_challenge parameter" },
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

	// User is authenticated - create auth code (short-lived JWT with user info + code_challenge)
	const authCode = await createAuthCode({
		userId: user.id,
		email: user.emailAddresses[0]?.emailAddress ?? "",
		name:
			user.firstName && user.lastName
				? `${user.firstName} ${user.lastName}`
				: (user.username ?? "User"),
		avatarUrl: user.imageUrl,
		codeChallenge,
	});

	// Redirect to desktop app via deep link with auth code (not the final token)
	const desktopUrl = new URL(`${DESKTOP_PROTOCOL}://auth/callback`);
	desktopUrl.searchParams.set("code", authCode);

	return NextResponse.redirect(desktopUrl.toString());
}

interface AuthCodePayload {
	userId: string;
	email: string;
	name: string;
	avatarUrl: string | null;
	codeChallenge: string;
}

/**
 * Create a short-lived auth code containing user info and PKCE challenge
 * This code must be exchanged with the code_verifier to get the actual token
 */
async function createAuthCode(payload: AuthCodePayload): Promise<string> {
	const secret = new TextEncoder().encode(env.DESKTOP_AUTH_SECRET);

	const jwt = await new SignJWT({
		userId: payload.userId,
		email: payload.email,
		name: payload.name,
		avatarUrl: payload.avatarUrl,
		codeChallenge: payload.codeChallenge,
		type: "auth_code", // Mark this as an auth code, not a session token
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("5m") // Auth code expires in 5 minutes
		.sign(secret);

	return jwt;
}
