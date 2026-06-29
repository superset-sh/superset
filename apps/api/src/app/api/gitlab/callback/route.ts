import { db } from "@superset/db/client";
import {
	type GitLabConfig,
	integrationConnections,
	members,
} from "@superset/db/schema";
import { Client } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { assertSafeGitLabHost } from "@/lib/gitlab/ssrf";
import { verifySignedState } from "@/lib/oauth-state";
import { GitLabClient } from "../client";
import {
	exchangeCodeForToken,
	GITLAB_DEFAULT_HOST,
	GITLAB_GROUP_COOKIE,
	GITLAB_HOST_COOKIE,
	GITLAB_PKCE_COOKIE,
} from "../oauth";

const qstash = new Client({ token: env.QSTASH_TOKEN });

function parseCookies(header: string | null): Record<string, string> {
	if (!header) return {};
	const out: Record<string, string> = {};
	for (const part of header.split(";")) {
		const idx = part.indexOf("=");
		if (idx === -1) continue;
		const key = part.slice(0, idx).trim();
		out[key] = decodeURIComponent(part.slice(idx + 1).trim());
	}
	return out;
}

/** Clears the short-lived flow cookies on the redirect response. */
function clearedCookieHeaders(location: string): Headers {
	const headers = new Headers({ Location: location });
	for (const name of [
		GITLAB_PKCE_COOKIE,
		GITLAB_GROUP_COOKIE,
		GITLAB_HOST_COOKIE,
	]) {
		headers.append(
			"Set-Cookie",
			`${name}=; HttpOnly; Secure; SameSite=Lax; Path=/api/gitlab; Max-Age=0`,
		);
	}
	return headers;
}

function redirectTo(path: string) {
	return new Response(null, {
		status: 302,
		headers: clearedCookieHeaders(`${env.NEXT_PUBLIC_WEB_URL}${path}`),
	});
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");

	if (!code || !state) {
		return redirectTo("/integrations/gitlab?error=missing_params");
	}

	const stateData = verifySignedState(state);
	if (!stateData) {
		return redirectTo("/integrations/gitlab?error=invalid_state");
	}
	const { organizationId, userId } = stateData;

	const cookies = parseCookies(request.headers.get("cookie"));
	const codeVerifier = cookies[GITLAB_PKCE_COOKIE];
	const groupId = cookies[GITLAB_GROUP_COOKIE];
	const host = cookies[GITLAB_HOST_COOKIE] ?? GITLAB_DEFAULT_HOST;

	if (!codeVerifier || !groupId) {
		return redirectTo("/integrations/gitlab?error=missing_flow_state");
	}

	// Re-verify membership at callback time (defense-in-depth, like github).
	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});
	if (!membership) {
		console.error("[gitlab/callback] Membership verification failed");
		return redirectTo("/integrations/gitlab?error=unauthorized");
	}

	if (!env.GITLAB_CLIENT_ID || !env.GITLAB_CLIENT_SECRET) {
		return redirectTo("/integrations/gitlab?error=not_configured");
	}

	try {
		const origin = await assertSafeGitLabHost(host);

		const tokens = await exchangeCodeForToken({
			origin,
			clientId: env.GITLAB_CLIENT_ID,
			clientSecret: env.GITLAB_CLIENT_SECRET,
			code,
			redirectUri: `${env.NEXT_PUBLIC_API_URL}/api/gitlab/callback`,
			codeVerifier,
		});

		// Confirm the token can actually read the chosen group before persisting.
		const client = await GitLabClient.create(host, tokens.access_token);
		const group = await client.getGroup(groupId);

		const config: GitLabConfig = {
			provider: "gitlab",
			host,
			authMode: "oauth",
			groupPath: group.full_path,
		};

		const [connection] = await db
			.insert(integrationConnections)
			.values({
				organizationId,
				connectedByUserId: userId,
				provider: "gitlab",
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token ?? null,
				tokenExpiresAt: tokens.expires_in
					? new Date(Date.now() + tokens.expires_in * 1000)
					: null,
				externalOrgId: String(group.id),
				externalOrgName: group.name,
				config,
			})
			.onConflictDoUpdate({
				target: [
					integrationConnections.organizationId,
					integrationConnections.provider,
				],
				set: {
					connectedByUserId: userId,
					accessToken: tokens.access_token,
					refreshToken: tokens.refresh_token ?? null,
					tokenExpiresAt: tokens.expires_in
						? new Date(Date.now() + tokens.expires_in * 1000)
						: null,
					externalOrgId: String(group.id),
					externalOrgName: group.name,
					config,
					disconnectedAt: null,
					disconnectReason: null,
					updatedAt: new Date(),
				},
			})
			.returning();

		if (!connection) {
			return redirectTo("/integrations/gitlab?error=save_failed");
		}

		try {
			await qstash.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}/api/gitlab/jobs/initial-sync`,
				body: { connectionId: connection.id, organizationId },
				retries: 3,
			});
		} catch (error) {
			console.error("[gitlab/callback] Failed to queue initial sync:", error);
			return redirectTo("/integrations/gitlab?warning=sync_queue_failed");
		}

		return redirectTo("/integrations/gitlab?success=gitlab_connected");
	} catch (error) {
		console.error("[gitlab/callback] Unexpected error:", error);
		return redirectTo("/integrations/gitlab?error=unexpected");
	}
}
