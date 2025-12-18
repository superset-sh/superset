import { AUTH_PROVIDERS, type AuthProvider } from "@superset/shared/constants";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Desktop auth endpoint - redirects to OAuth page
 *
 * Flow:
 * 1. Desktop opens browser to /api/auth/desktop/google?code_challenge=XXX&state=YYY
 * 2. This route redirects to /auth/desktop/google (OAuth trigger page)
 * 3. OAuth page triggers Google/GitHub OAuth
 * 4. After OAuth, /api/auth/desktop/callback creates auth code
 * 5. Desktop receives auth code via deep link
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

	// Redirect to OAuth page (always triggers fresh OAuth)
	const oauthPageUrl = new URL(`/auth/desktop/${provider}`, request.url);
	oauthPageUrl.searchParams.set("code_challenge", codeChallenge);
	oauthPageUrl.searchParams.set("state", state);

	return NextResponse.redirect(oauthPageUrl.toString());
}
