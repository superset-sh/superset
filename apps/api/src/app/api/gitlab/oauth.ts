import { createHash, randomBytes } from "node:crypto";

/** Default GitLab SaaS host. OAuth is gitlab.com / statically-configured only. */
export const GITLAB_DEFAULT_HOST = "gitlab.com";

/** Minimized scope (spec §7): read-only API access is all the sync needs. */
export const GITLAB_OAUTH_SCOPE = "read_api";

/** Names of the short-lived cookies that carry per-flow OAuth state. */
export const GITLAB_PKCE_COOKIE = "gl_pkce";
export const GITLAB_GROUP_COOKIE = "gl_group";
export const GITLAB_HOST_COOKIE = "gl_host";

/** Generates a PKCE verifier + S256 challenge pair. */
export function createPkcePair(): { verifier: string; challenge: string } {
	const verifier = randomBytes(32).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	return { verifier, challenge };
}

export function buildAuthorizeUrl(params: {
	origin: string;
	clientId: string;
	redirectUri: string;
	state: string;
	challenge: string;
}): string {
	const url = new URL(`${params.origin}/oauth/authorize`);
	url.searchParams.set("client_id", params.clientId);
	url.searchParams.set("redirect_uri", params.redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("state", params.state);
	url.searchParams.set("scope", GITLAB_OAUTH_SCOPE);
	url.searchParams.set("code_challenge", params.challenge);
	url.searchParams.set("code_challenge_method", "S256");
	return url.toString();
}

export interface GitLabTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	token_type: string;
}

/** Exchanges an authorization code for tokens (PKCE; no client secret in the URL). */
export async function exchangeCodeForToken(params: {
	origin: string;
	clientId: string;
	clientSecret: string;
	code: string;
	redirectUri: string;
	codeVerifier: string;
}): Promise<GitLabTokenResponse> {
	const res = await fetch(`${params.origin}/oauth/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: params.clientId,
			client_secret: params.clientSecret,
			code: params.code,
			grant_type: "authorization_code",
			redirect_uri: params.redirectUri,
			code_verifier: params.codeVerifier,
		}),
	});
	if (!res.ok) {
		throw new Error(`GitLab token exchange failed (${res.status})`);
	}
	return (await res.json()) as GitLabTokenResponse;
}
