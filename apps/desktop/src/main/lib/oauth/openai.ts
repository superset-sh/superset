import * as http from "node:http";
import { generateCodeChallenge, generateCodeVerifier, generateState } from "./pkce";
import type { OAuthCredentials } from "./types";

// OpenAI OAuth constants (Codex CLI public client)
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPES = "openid profile email offline_access";
const CALLBACK_PORT = 1455;

export interface OpenAIAuthData {
	url: string;
	verifier: string;
	state: string;
	/** Whether a local callback server was started (vs. manual paste fallback) */
	useLocalServer: boolean;
}

/**
 * Build the OpenAI OAuth authorization URL.
 * Attempts to start a local HTTP server on port 1455 to catch the callback.
 * Falls back to manual code paste if the port is busy.
 */
export function buildOpenAIAuthUrl(): OpenAIAuthData {
	const verifier = generateCodeVerifier();
	const challenge = generateCodeChallenge(verifier);
	const state = generateState();

	const params = new URLSearchParams({
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
		useLocalServer: true,
	};
}

/**
 * Start a local HTTP server on port 1455 to catch the OAuth callback.
 * Resolves with the authorization code when the callback is received.
 * Rejects if the server can't start or times out (5 minutes).
 */
export function waitForOpenAICallback(
	expectedState: string,
	signal?: AbortSignal,
): Promise<string> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Aborted"));
			return;
		}

		const server = http.createServer((req, res) => {
			const url = new URL(req.url ?? "/", `http://localhost:${CALLBACK_PORT}`);

			if (url.pathname !== "/auth/callback") {
				res.writeHead(404);
				res.end("Not found");
				return;
			}

			const code = url.searchParams.get("code");
			const state = url.searchParams.get("state");
			const error = url.searchParams.get("error");

			if (error) {
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(
					`<html><body><h2>Authentication failed: ${error}</h2><p>You can close this tab.</p></body></html>`,
				);
				server.close();
				reject(new Error(`OAuth error: ${error}`));
				return;
			}

			if (!code) {
				res.writeHead(400, { "Content-Type": "text/html" });
				res.end(
					"<html><body><h2>Missing code parameter</h2><p>You can close this tab.</p></body></html>",
				);
				return;
			}

			if (state !== expectedState) {
				res.writeHead(400, { "Content-Type": "text/html" });
				res.end(
					"<html><body><h2>Invalid state parameter</h2><p>You can close this tab.</p></body></html>",
				);
				server.close();
				reject(new Error("State mismatch — possible CSRF attack"));
				return;
			}

			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(
				"<html><body><h2>Authentication successful!</h2><p>You can close this tab and return to Superset.</p></body></html>",
			);
			server.close();
			resolve(code);
		});

		server.on("error", (err) => {
			reject(err);
		});

		server.listen(CALLBACK_PORT, "127.0.0.1", () => {
			// Server started successfully
		});

		// Timeout after 5 minutes
		const timeout = setTimeout(() => {
			server.close();
			reject(new Error("OAuth callback timed out"));
		}, 5 * 60 * 1000);

		server.on("close", () => {
			clearTimeout(timeout);
		});

		signal?.addEventListener("abort", () => {
			server.close();
			reject(new Error("Aborted"));
		});
	});
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeOpenAICode(
	code: string,
	verifier: string,
): Promise<OAuthCredentials> {
	const params = new URLSearchParams({
		grant_type: "authorization_code",
		client_id: CLIENT_ID,
		code,
		redirect_uri: REDIRECT_URI,
		code_verifier: verifier,
	});

	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: params.toString(),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`OpenAI token exchange failed: ${response.status} ${text}`);
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
 * Refresh an expired OpenAI access token.
 * Returns updated credentials or null if refresh fails.
 */
export async function refreshOpenAIToken(
	refreshToken: string,
): Promise<OAuthCredentials | null> {
	const params = new URLSearchParams({
		grant_type: "refresh_token",
		client_id: CLIENT_ID,
		refresh_token: refreshToken,
	});

	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: params.toString(),
	});

	if (!response.ok) {
		console.warn("[oauth/openai] Token refresh failed:", response.status);
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
