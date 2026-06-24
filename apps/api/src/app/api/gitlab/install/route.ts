import { auth } from "@superset/auth/server";
import { findOrgMembership } from "@superset/db/utils";

import { env } from "@/env";
import { assertSafeGitLabHost, SsrfError } from "@/lib/gitlab/ssrf";
import { createSignedState } from "@/lib/oauth-state";
import {
	buildAuthorizeUrl,
	createPkcePair,
	GITLAB_DEFAULT_HOST,
	GITLAB_GROUP_COOKIE,
	GITLAB_HOST_COOKIE,
	GITLAB_PKCE_COOKIE,
} from "../oauth";

/** httpOnly, short-lived cookie scoped to the GitLab callback. */
function flowCookie(name: string, value: string): string {
	return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/api/gitlab; Max-Age=600`;
}

/**
 * Starts the GitLab OAuth (PKCE) flow for connecting a group. The org/user are
 * carried in an HMAC-signed state (CSRF); the PKCE verifier + chosen group + host
 * ride in short-lived httpOnly cookies.
 */
export async function GET(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const organizationId = url.searchParams.get("organizationId");
	const groupId = url.searchParams.get("groupId");
	const host = url.searchParams.get("host") ?? GITLAB_DEFAULT_HOST;

	if (!organizationId || !groupId) {
		return Response.json(
			{ error: "Missing organizationId or groupId parameter" },
			{ status: 400 },
		);
	}

	const membership = await findOrgMembership({
		userId: session.user.id,
		organizationId,
	});
	if (!membership) {
		return Response.json(
			{ error: "User is not a member of this organization" },
			{ status: 403 },
		);
	}

	if (!env.GITLAB_CLIENT_ID) {
		return Response.json(
			{ error: "GitLab integration not configured" },
			{ status: 500 },
		);
	}

	let origin: string;
	try {
		origin = await assertSafeGitLabHost(host);
	} catch (error) {
		if (error instanceof SsrfError) {
			return Response.json({ error: error.message }, { status: 400 });
		}
		throw error;
	}

	const { verifier, challenge } = createPkcePair();
	const state = createSignedState({
		organizationId,
		userId: session.user.id,
	});

	const authorizeUrl = buildAuthorizeUrl({
		origin,
		clientId: env.GITLAB_CLIENT_ID,
		redirectUri: `${env.NEXT_PUBLIC_API_URL}/api/gitlab/callback`,
		state,
		challenge,
	});

	const headers = new Headers({ Location: authorizeUrl });
	headers.append("Set-Cookie", flowCookie(GITLAB_PKCE_COOKIE, verifier));
	headers.append("Set-Cookie", flowCookie(GITLAB_GROUP_COOKIE, groupId));
	headers.append("Set-Cookie", flowCookie(GITLAB_HOST_COOKIE, host));
	return new Response(null, { status: 302, headers });
}
