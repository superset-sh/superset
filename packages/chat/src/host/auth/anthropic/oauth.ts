import { createHash, randomBytes } from "node:crypto";

const CLIENT_ID = Buffer.from(
	"OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl",
	"base64",
).toString("utf8");
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const SCOPES = "org:create_api_key user:profile user:inference";

export interface AnthropicOAuthSession {
	verifier: string;
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

function parseAuthorizationCodeInput(
	value: string,
	fallbackState: string,
): { code: string; state: string } {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error("Authorization code is required");
	}

	const [codeRaw, stateRaw] = trimmed.split("#", 2);
	const code = codeRaw?.trim();
	if (!code) {
		throw new Error("Authorization code is required");
	}

	return {
		code,
		state: stateRaw?.trim() || fallbackState,
	};
}

export function createAnthropicOAuthSession(): AnthropicOAuthSession {
	const { verifier, challenge } = generatePKCE();

	const authParams = new URLSearchParams({
		code: "true",
		client_id: CLIENT_ID,
		response_type: "code",
		redirect_uri: REDIRECT_URI,
		scope: SCOPES,
		code_challenge: challenge,
		code_challenge_method: "S256",
		state: verifier,
	});

	return {
		verifier,
		authUrl: `${AUTHORIZE_URL}?${authParams.toString()}`,
		createdAt: Date.now(),
	};
}

export async function exchangeAnthropicAuthorizationCode(input: {
	rawCode: string;
	verifier: string;
}): Promise<AnthropicOAuthCredentials> {
	const { code, state } = parseAuthorizationCodeInput(
		input.rawCode,
		input.verifier,
	);

	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			grant_type: "authorization_code",
			client_id: CLIENT_ID,
			code,
			state,
			redirect_uri: REDIRECT_URI,
			code_verifier: input.verifier,
		}),
	});

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
