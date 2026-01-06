import { PROTOCOL_SCHEMES } from "@superset/shared/constants";

/**
 * Result of handling an auth deep link
 */
export interface AuthDeepLinkResult {
	success: boolean;
	accessToken?: string;
	accessTokenExpiresAt?: number;
	refreshToken?: string;
	refreshTokenExpiresAt?: number;
	state?: string;
	error?: string;
}

/**
 * Handle authentication deep links from web callback
 * Format: superset-dev://auth/callback?accessToken=XXX&accessTokenExpiresAt=YYY&refreshToken=ZZZ&refreshTokenExpiresAt=WWW&state=SSS
 */
export async function handleAuthDeepLink(
	url: string,
): Promise<AuthDeepLinkResult> {
	try {
		const parsedUrl = new URL(url);

		// Check if this is an auth callback
		const isAuthCallback =
			parsedUrl.host === "auth" && parsedUrl.pathname === "/callback";

		if (!isAuthCallback) {
			return { success: false, error: "Not an auth callback URL" };
		}

		// Check for error response
		const error = parsedUrl.searchParams.get("error");
		if (error) {
			const errorDescription = parsedUrl.searchParams.get("error_description");
			return { success: false, error: errorDescription || error };
		}

		// Get all tokens and metadata
		const accessToken = parsedUrl.searchParams.get("accessToken");
		const accessTokenExpiresAtStr = parsedUrl.searchParams.get(
			"accessTokenExpiresAt",
		);
		const refreshToken = parsedUrl.searchParams.get("refreshToken");
		const refreshTokenExpiresAtStr = parsedUrl.searchParams.get(
			"refreshTokenExpiresAt",
		);
		const state = parsedUrl.searchParams.get("state");

		if (!accessToken) {
			return { success: false, error: "No access token in callback" };
		}

		if (!accessTokenExpiresAtStr) {
			return {
				success: false,
				error: "No access token expiration in callback",
			};
		}

		if (!refreshToken) {
			return { success: false, error: "No refresh token in callback" };
		}

		if (!refreshTokenExpiresAtStr) {
			return {
				success: false,
				error: "No refresh token expiration in callback",
			};
		}

		if (!state) {
			return { success: false, error: "No state in callback" };
		}

		const accessTokenExpiresAt = Number.parseInt(accessTokenExpiresAtStr, 10);
		if (Number.isNaN(accessTokenExpiresAt)) {
			return {
				success: false,
				error: "Invalid access token expiration in callback",
			};
		}

		const refreshTokenExpiresAt = Number.parseInt(refreshTokenExpiresAtStr, 10);
		if (Number.isNaN(refreshTokenExpiresAt)) {
			return {
				success: false,
				error: "Invalid refresh token expiration in callback",
			};
		}

		return {
			success: true,
			accessToken,
			accessTokenExpiresAt,
			refreshToken,
			refreshTokenExpiresAt,
			state,
		};
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Failed to process auth callback";
		console.error("[auth] Deep link handling failed:", message);
		return { success: false, error: message };
	}
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
		// Accept "auth" host for callbacks
		return (
			validProtocols.includes(parsedUrl.protocol) && parsedUrl.host === "auth"
		);
	} catch {
		return false;
	}
}
