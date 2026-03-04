import { createHash, randomBytes } from "node:crypto";

const CLIENT_ID = Buffer.from(
	"OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl",
	"base64",
).toString("utf8");
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const SCOPES = "org:create_api_key user:profile user:inference";
const TOKEN_EXCHANGE_TIMEOUT_MS = 15_000;

export interface AnthropicOAuthSession {
	verifier: string;
	state: string;
	authUrl: string;
	createdAt: number;
}

export interface AnthropicOAuthCredentials {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
}

function base64Url(input: Buffer): string {
	return input
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function generatePKCE(): { verifier: string; challenge: string } {
	const verifier = base64Url(randomBytes(32));
	const challenge = base64Url(createHash("sha256").update(verifier).digest());
	return { verifier, challenge };
}

function parseOAuthCallbackUrl(
	value: string,
): { code: string; state: string } | null {
	try {
		const url = new URL(value);
		const code = url.searchParams.get("code")?.trim();
		const state = url.searchParams.get("state")?.trim();
		if (code && state) {
			return { code, state };
		}
		return null;
	} catch {
		return null;
	}
}

function parseAuthorizationCodeInput(value: string): {
	code: string;
	state: string;
} {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error("Authorization code is required");
	}

	const callbackData = parseOAuthCallbackUrl(trimmed);
	if (callbackData) {
		return callbackData;
	}

	const [codeRaw, stateRaw] = trimmed.split("#", 2);
	const code = codeRaw?.trim();
	const state = stateRaw?.trim();
	if (!code) throw new Error("Authorization code is required");
	if (!state) {
		throw new Error(
			"Authorization state is required. Paste code in the format code#state.",
		);
	}

	return {
		code,
		state,
	};
}

export function createAnthropicOAuthSession(): AnthropicOAuthSession {
	const { verifier, challenge } = generatePKCE();
	const state = base64Url(randomBytes(32));

	const authParams = new URLSearchParams({
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
		verifier,
		state,
		authUrl: `${AUTHORIZE_URL}?${authParams.toString()}`,
		createdAt: Date.now(),
	};
}

export async function exchangeAnthropicAuthorizationCode(input: {
	rawCode: string;
	verifier: string;
	expectedState: string;
}): Promise<AnthropicOAuthCredentials> {
	const { code, state } = parseAuthorizationCodeInput(input.rawCode);
	if (state !== input.expectedState) {
		throw new Error(
			"Authorization state mismatch. Start auth again and use the latest code.",
		);
	}

	let response: Response;
	try {
		response = await fetch(TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
			body: JSON.stringify({
				grant_type: "authorization_code",
				client_id: CLIENT_ID,
				code,
				state,
				redirect_uri: REDIRECT_URI,
				code_verifier: input.verifier,
			}),
		});
	} catch (error) {
		if (
			error instanceof Error &&
			(error.name === "TimeoutError" || error.name === "AbortError")
		) {
			throw new Error("Anthropic token exchange timed out. Try again.");
		}
		throw error;
	}

	if (!response.ok) {
		const errorText = await response.text().catch(() => "");
		throw new Error(
			`Anthropic token exchange failed (${response.status}): ${errorText || "Unknown error"}`,
		);
	}

	const data = (await response.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
	};

	if (
		typeof data.access_token !== "string" ||
		typeof data.refresh_token !== "string" ||
		typeof data.expires_in !== "number"
	) {
		throw new Error("Anthropic token response is invalid");
	}

	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		expiresAt: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
	};
}
