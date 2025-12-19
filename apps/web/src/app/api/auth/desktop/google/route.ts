import { redirect } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000";

/**
 * Google OAuth callback handler for desktop auth
 *
 * GET /api/auth/desktop/google?code=...&state=...
 *
 * Exchanges the Google auth code for a desktop session token via the API,
 * then redirects to the success page which handles the deep link.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");
	const errorDescription = url.searchParams.get("error_description");

	// Handle OAuth error from Google
	if (error) {
		const errorUrl = new URL("/auth/desktop/success", WEB_URL);
		errorUrl.searchParams.set("error", errorDescription || error);
		redirect(errorUrl.toString());
	}

	// Validate required params
	if (!code || !state) {
		const errorUrl = new URL("/auth/desktop/success", WEB_URL);
		errorUrl.searchParams.set("error", "Missing authentication parameters");
		redirect(errorUrl.toString());
	}

	// Exchange the Google code for a desktop session token
	let tokenData: {
		accessToken: string;
		accessTokenExpiresAt: number;
		refreshToken: string;
		refreshTokenExpiresAt: number;
	} | null = null;
	let exchangeError: string | null = null;

	try {
		const response = await fetch(`${API_URL}/api/auth/desktop/google`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				code,
				redirectUri: `${WEB_URL}/api/auth/desktop/google`,
			}),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			exchangeError = errorData.error || "Failed to complete sign in";
		} else {
			tokenData = (await response.json()) as {
				accessToken: string;
				accessTokenExpiresAt: number;
				refreshToken: string;
				refreshTokenExpiresAt: number;
			};
		}
	} catch (err) {
		console.error("[api/auth/desktop/google] Error:", err);
		exchangeError = "An unexpected error occurred";
	}

	// Handle errors (redirect outside try-catch so NEXT_REDIRECT works)
	if (exchangeError || !tokenData) {
		const errorUrl = new URL("/auth/desktop/success", WEB_URL);
		errorUrl.searchParams.set("error", exchangeError || "Failed to sign in");
		redirect(errorUrl.toString());
	}

	// Redirect to success page with all tokens
	const successUrl = new URL("/auth/desktop/success", WEB_URL);
	successUrl.searchParams.set("accessToken", tokenData.accessToken);
	successUrl.searchParams.set(
		"accessTokenExpiresAt",
		tokenData.accessTokenExpiresAt.toString(),
	);
	successUrl.searchParams.set("refreshToken", tokenData.refreshToken);
	successUrl.searchParams.set(
		"refreshTokenExpiresAt",
		tokenData.refreshTokenExpiresAt.toString(),
	);
	successUrl.searchParams.set("state", state);
	redirect(successUrl.toString());
}
