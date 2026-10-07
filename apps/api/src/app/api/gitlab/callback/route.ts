import { assertGitLabOAuthOrigin } from "@superset/trpc/lib/gitlab/oauth-origin";
import { assertSafeGitLabHost } from "@superset/trpc/lib/gitlab/ssrf";
import { env } from "@/env";
import { exitOAuthFlow, STATE_COOKIES } from "@/lib/integrations/oauthFlow";
import { connectFailureCode, identifyToken } from "../gitlab-api";
import { completeGitlabConnection } from "../lifecycle";
import { exchangeAuthorizationCode } from "../oauth";
import { resolveGitlabOAuthCallback } from "../oauth-state";
import { gitlabReturnUrl } from "../redirect";

export async function GET(request: Request): Promise<Response> {
	const response = await finishCallback(request);
	return new Response(null, { status: 303, headers: response.headers });
}

async function finishCallback(request: Request): Promise<Response> {
	if (!env.GITLAB_OAUTH_CLIENT_ID || !env.GITLAB_OAUTH_CLIENT_SECRET)
		return exitOAuthFlow(
			STATE_COOKIES.gitlab,
			gitlabReturnUrl({ error: "oauth_not_configured" }),
		);
	const callback = await resolveGitlabOAuthCallback(request, (error) =>
		gitlabReturnUrl({ error }),
	);
	if (callback instanceof Response) return callback;
	const fail = (error: string) =>
		callback.exit(gitlabReturnUrl({ error }, callback));
	let origin: string;
	try {
		origin = await assertSafeGitLabHost(
			callback.pending.host,
			undefined,
			env.GITLAB_ISSUER,
		);
		assertGitLabOAuthOrigin(origin, env.GITLAB_ISSUER);
	} catch {
		return fail("host_not_allowed");
	}
	let tokens: Awaited<ReturnType<typeof exchangeAuthorizationCode>>;
	try {
		tokens = await exchangeAuthorizationCode({
			origin,
			clientId: env.GITLAB_OAUTH_CLIENT_ID,
			clientSecret: env.GITLAB_OAUTH_CLIENT_SECRET,
			issuer: env.GITLAB_ISSUER,
			redirectUri: `${env.NEXT_PUBLIC_API_URL}/api/gitlab/callback`,
			code: callback.params.code,
			verifier: callback.pending.verifier,
		});
	} catch (error) {
		return fail(connectFailureCode(error));
	}
	let identity: Awaited<ReturnType<typeof identifyToken>>;
	try {
		identity = await identifyToken({
			origin,
			token: tokens.accessToken,
			groupPath: callback.pending.groupPath,
		});
	} catch (error) {
		return fail(connectFailureCode(error));
	}
	const result = await completeGitlabConnection({
		member: callback,
		origin,
		token: tokens.accessToken,
		refreshToken: tokens.refreshToken,
		expiresAt: tokens.tokenExpiresAt,
		auth: "oauth",
		identity,
	});
	if (!result.connected) return fail("already_connected");
	return callback.exit(
		gitlabReturnUrl(
			{
				connected: "1",
				error: result.hookFailed ? "hook_failed" : undefined,
			},
			callback,
		),
	);
}
