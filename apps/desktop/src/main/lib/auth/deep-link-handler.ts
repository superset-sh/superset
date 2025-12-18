import { env } from "main/env.main";
import type { AuthSession } from "shared/auth";
import { PROTOCOL_SCHEMES } from "shared/constants";
import { pkceStore } from "./pkce";

/**
 * Token exchange response from the API (no user info - fetch via tRPC)
 */
interface TokenExchangeResponse {
	access_token: string;
	access_token_expires_at: number;
	refresh_token: string;
	refresh_token_expires_at: number;
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
 * Handle authentication deep links from the web app
 * Implements PKCE flow: exchanges auth code for access + refresh tokens
 */
export async function handleAuthDeepLink(
	url: string,
): Promise<AuthDeepLinkResult> {
	try {
		const parsedUrl = new URL(url);

		// Check if this is an auth callback
		if (parsedUrl.host !== "auth" || parsedUrl.pathname !== "/callback") {
			return { success: false, error: "Not an auth callback URL" };
		}

		// Check for error response
		const error = parsedUrl.searchParams.get("error");
		if (error) {
			pkceStore.clear();
			return { success: false, error };
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

		// Exchange the code for tokens
		const tokenResponse = await exchangeCodeForTokens(code, codeVerifier);

		return {
			success: true,
			session: {
				accessToken: tokenResponse.access_token,
				accessTokenExpiresAt: tokenResponse.access_token_expires_at,
				refreshToken: tokenResponse.refresh_token,
				refreshTokenExpiresAt: tokenResponse.refresh_token_expires_at,
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
 * Exchange auth code + code_verifier for access and refresh tokens
 */
async function exchangeCodeForTokens(
	code: string,
	codeVerifier: string,
): Promise<TokenExchangeResponse> {
	const response = await fetch(
		`${env.NEXT_PUBLIC_API_URL}/api/auth/desktop/token`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				code,
				code_verifier: codeVerifier,
			}),
		},
	);

	if (!response.ok) {
		const errorBody = await response.json().catch(() => ({}));
		throw new Error(
			errorBody.error || `Token exchange failed: ${response.status}`,
		);
	}

	return response.json();
}

/**
 * Check if a URL is an auth-related deep link
 */
export function isAuthDeepLink(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		// Accept both production and dev protocols
		const validProtocols = [
			`${PROTOCOL_SCHEMES.PROD}:`,
			`${PROTOCOL_SCHEMES.DEV}:`,
		];
		return (
			validProtocols.includes(parsedUrl.protocol) && parsedUrl.host === "auth"
		);
	} catch {
		return false;
	}
}
