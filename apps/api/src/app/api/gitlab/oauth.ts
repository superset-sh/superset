import { createHash, randomBytes } from "node:crypto";
import { GitlabApiError } from "@superset/trpc/lib/gitlab/api";
import { assertGitLabOAuthOrigin } from "@superset/trpc/lib/gitlab/oauth-origin";
import { parseGitlabTokenResponse } from "@superset/trpc/lib/gitlab/oauth-token";
import { safeGitLabFetch } from "@superset/trpc/lib/gitlab/transport";

export const GITLAB_OAUTH_SCOPE = "api read_repository";

export function createPkcePair(): { verifier: string; challenge: string } {
	const verifier = randomBytes(32).toString("base64url");
	return {
		verifier,
		challenge: createHash("sha256").update(verifier).digest("base64url"),
	};
}

export function buildAuthorizeUrl(params: {
	origin: string;
	clientId: string;
	redirectUri: string;
	state: string;
	challenge: string;
	issuer?: string;
}): string {
	const origin = assertGitLabOAuthOrigin(params.origin, params.issuer);
	if (!params.clientId) throw new Error("GitLab OAuth is not configured");
	const url = new URL(`${origin}/oauth/authorize`);
	url.searchParams.set("client_id", params.clientId);
	url.searchParams.set("redirect_uri", params.redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("state", params.state);
	url.searchParams.set("scope", GITLAB_OAUTH_SCOPE);
	url.searchParams.set("code_challenge", params.challenge);
	url.searchParams.set("code_challenge_method", "S256");
	return url.toString();
}

export async function exchangeAuthorizationCode(
	params: {
		origin: string;
		clientId: string;
		clientSecret: string;
		redirectUri: string;
		code: string;
		verifier: string;
		issuer?: string;
	},
	send = safeGitLabFetch,
): Promise<{
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: Date;
}> {
	if (!params.clientId || !params.clientSecret)
		throw new Error("GitLab OAuth is not configured");
	const origin = assertGitLabOAuthOrigin(params.origin, params.issuer);
	const response = await send(`${origin}/oauth/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: params.clientId,
			client_secret: params.clientSecret,
			code: params.code,
			grant_type: "authorization_code",
			redirect_uri: params.redirectUri,
			code_verifier: params.verifier,
		}),
	});
	if (!response.ok) throw new GitlabApiError(response.status, "/oauth/token");
	return parseGitlabTokenResponse(await response.json().catch(() => null));
}
