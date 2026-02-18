import { generateCodeChallenge, generateCodeVerifier, generateState } from "./pkce";
import type { OAuthCredentials } from "./types";

// Anthropic OAuth constants (Claude Code public client)
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTH_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const SCOPES = "org:create_api_key user:profile user:inference";

export interface AnthropicAuthData {
	url: string;
	verifier: string;
	state: string;
}

/**
 * Build the Anthropic OAuth authorization URL.
 * Returns the URL to open in the browser and the PKCE verifier to store.
 *
 * Anthropic uses a device-code-style flow where the user is redirected to
 * REDIRECT_URI with `?code=<code>#<state>` appended. The user copies the
 * full string (e.g. "abc123#xyz789") and pastes it back into the app.
 */
export function buildAnthropicAuthUrl(): AnthropicAuthData {
	const verifier = generateCodeVerifier();
	const challenge = generateCodeChallenge(verifier);
	const state = generateState();

	const params = new URLSearchParams({
		code: "true",
		client_id: CLIENT_ID,
		response_type: "code",
		redirect_uri: REDIRECT_URI,
		scope: SCOPES,
		code_challenge: challenge,
		code_challenge_method: "S256",
		state,
	});

	return {
		url: `${AUTH_URL}?${params.toString()}`,
		verifier,
		state,
	};
}

/**
 * Exchange an authorization code for tokens.
 *
 * The `codeInput` is the string the user pastes from the redirect URL.
 * It may be in the form "code#state" or just "code".
 */
export async function exchangeAnthropicCode(
	codeInput: string,
	verifier: string,
): Promise<OAuthCredentials> {
	const parts = codeInput.trim().split("#");
	const code = parts[0];
	const state = parts[1] ?? undefined;

	const payload = {
		code,
		state,
		grant_type: "authorization_code",
		client_id: CLIENT_ID,
		redirect_uri: REDIRECT_URI,
		code_verifier: verifier,
	};

	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Anthropic token exchange failed: ${response.status} ${text}`);
	}

	const data = (await response.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
	};

	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
		tokenType: data.token_type,
		scope: data.scope,
	};
}

/**
 * Refresh an expired Anthropic access token using the refresh token.
 * Returns updated credentials or null if refresh fails.
 */
export async function refreshAnthropicToken(
	refreshToken: string,
): Promise<OAuthCredentials | null> {
	const payload = {
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		client_id: CLIENT_ID,
	};

	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		console.warn("[oauth/anthropic] Token refresh failed:", response.status);
		return null;
	}

	const data = (await response.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
	};

	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token ?? refreshToken,
		expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
		tokenType: data.token_type,
		scope: data.scope,
	};
}
