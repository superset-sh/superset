import { env } from "main/env.main";
import type { AuthSession } from "shared/auth";
import { PROTOCOL_SCHEMES } from "shared/constants";
import { pkceStore } from "./pkce";

/**
 * Token exchange response from Clerk's OAuth token endpoint
 */
interface ClerkTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token?: string;
	scope: string;
	id_token?: string;
}

/**
 * Result of handling an auth deep link
 */
export interface AuthDeepLinkResult {
	success: boolean;
	session?: AuthSession;
	error?: string;
}

/**
 * Handle authentication deep links from Clerk OAuth
 * Implements PKCE flow: exchanges auth code for access + refresh tokens at Clerk's token endpoint
 */
export async function handleAuthDeepLink(
	url: string,
): Promise<AuthDeepLinkResult> {
	try {
		const parsedUrl = new URL(url);

		// Check if this is a Clerk OAuth callback (new flow)
		const isClerkOAuth =
			parsedUrl.host === "oauth" && parsedUrl.pathname === "/callback";
		// Also support legacy auth callback for backwards compatibility
		const isLegacyAuth =
			parsedUrl.host === "auth" && parsedUrl.pathname === "/callback";

		if (!isClerkOAuth && !isLegacyAuth) {
			return { success: false, error: "Not an auth callback URL" };
		}

		// Check for error response
		const error = parsedUrl.searchParams.get("error");
		if (error) {
			const errorDescription = parsedUrl.searchParams.get("error_description");
			pkceStore.clear();
			return { success: false, error: errorDescription || error };
		}

		// Get the auth code and state (PKCE flow with CSRF protection)
		const code = parsedUrl.searchParams.get("code");
		const state = parsedUrl.searchParams.get("state");

		if (!code) {
			pkceStore.clear();
			return { success: false, error: "No auth code in callback" };
		}

		if (!state) {
			pkceStore.clear();
			return { success: false, error: "No state in callback" };
		}

		// Get the stored code verifier (also verifies state matches)
		const codeVerifier = pkceStore.consumeVerifier(state);
		if (!codeVerifier) {
			return {
				success: false,
				error: "Invalid or expired auth session",
			};
		}

		// Exchange the code for tokens at Clerk's token endpoint
		const tokenResponse = await exchangeCodeWithClerk(code, codeVerifier);

		// Calculate expiry timestamps
		const now = Date.now();
		const accessTokenExpiresAt = now + tokenResponse.expires_in * 1000;
		// Clerk refresh tokens typically last 7 days, but we'll use a conservative estimate
		const refreshTokenExpiresAt = now + 7 * 24 * 60 * 60 * 1000;

		return {
			success: true,
			session: {
				accessToken: tokenResponse.access_token,
				accessTokenExpiresAt,
				refreshToken: tokenResponse.refresh_token || "",
				refreshTokenExpiresAt,
			},
		};
	} catch (err) {
		pkceStore.clear();
		const message =
			err instanceof Error ? err.message : "Failed to process auth callback";
		console.error("[auth] Deep link handling failed:", message);
		return { success: false, error: message };
	}
}

/**
 * Exchange auth code + code_verifier for tokens at Clerk's OAuth token endpoint
 */
async function exchangeCodeWithClerk(
	code: string,
	codeVerifier: string,
): Promise<ClerkTokenResponse> {
	const response = await fetch(`${env.CLERK_OAUTH_DOMAIN}/oauth/token`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: env.CLERK_OAUTH_CLIENT_ID,
			code,
			// Must match the redirect_uri used in the authorize request
			redirect_uri: `${env.NEXT_PUBLIC_WEB_URL}/auth/desktop/callback`,
			code_verifier: codeVerifier,
		}),
	});

	if (!response.ok) {
		const errorBody = await response.json().catch(() => ({}));
		throw new Error(
			errorBody.error_description ||
				errorBody.error ||
				`Token exchange failed: ${response.status}`,
		);
	}

	return response.json();
}

/**
 * Check if a URL is an auth-related deep link
 * Supports both new Clerk OAuth flow (oauth://callback) and legacy flow (auth://callback)
 */
export function isAuthDeepLink(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		// Accept both production and dev protocols
		const validProtocols = [
			`${PROTOCOL_SCHEMES.PROD}:`,
			`${PROTOCOL_SCHEMES.DEV}:`,
		];
		// Accept both "oauth" (new Clerk flow) and "auth" (legacy flow)
		const validHosts = ["oauth", "auth"];
		return (
			validProtocols.includes(parsedUrl.protocol) &&
			validHosts.includes(parsedUrl.host)
		);
	} catch {
		return false;
	}
}
