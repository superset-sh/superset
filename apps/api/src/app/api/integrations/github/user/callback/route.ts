import { db } from "@superset/db/client";
import {
	integrationConnections,
	members,
	userIdentities,
} from "@superset/db/schema";
import { githubUserTokenResponseSchema } from "@superset/trpc/integrations/github";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { verifySignedState } from "@/lib/oauth-state";

const GITHUB_CALL_TIMEOUT_MS = 10 * 1000;

const githubUserSchema = z.object({
	id: z.number(),
	login: z.string().min(1),
	avatar_url: z.string().optional(),
});

function fail(reason: string): Response {
	return Response.redirect(
		`${env.NEXT_PUBLIC_WEB_URL}/integrations/github?error=${reason}`,
	);
}

export async function GET(request: Request) {
	if (!env.GH_APP_CLIENT_ID || !env.GH_APP_CLIENT_SECRET) {
		return fail("not_configured");
	}

	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	if (url.searchParams.get("error")) return fail("oauth_denied");
	if (!code || !state) return fail("missing_params");

	const stateData = verifySignedState(state);
	if (!stateData) return fail("invalid_state");
	const { organizationId, userId } = stateData;

	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});
	if (!membership) {
		console.error("[github/user/callback] membership verification failed", {
			organizationId,
			userId,
		});
		return fail("unauthorized");
	}

	const tokenResponse = await fetch(
		"https://github.com/login/oauth/access_token",
		{
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			signal: AbortSignal.timeout(GITHUB_CALL_TIMEOUT_MS),
			body: new URLSearchParams({
				client_id: env.GH_APP_CLIENT_ID,
				client_secret: env.GH_APP_CLIENT_SECRET,
				redirect_uri: `${env.NEXT_PUBLIC_API_URL}/api/integrations/github/user/callback`,
				code,
			}),
		},
	);
	const parsedTokens = githubUserTokenResponseSchema.safeParse(
		await tokenResponse.json().catch(() => null),
	);
	if (!tokenResponse.ok || !parsedTokens.success) {
		console.error(
			"[github/user/callback] token exchange failed",
			tokenResponse.status,
		);
		return fail("token_exchange_failed");
	}
	if ("error" in parsedTokens.data) {
		console.error(
			"[github/user/callback] token exchange refused",
			parsedTokens.data.error,
		);
		return fail("token_exchange_failed");
	}
	const tokens = parsedTokens.data;

	const userResponse = await fetch("https://api.github.com/user", {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${tokens.access_token}`,
		},
		signal: AbortSignal.timeout(GITHUB_CALL_TIMEOUT_MS),
	});
	if (!userResponse.ok) return fail("userinfo_failed");
	const parsedUser = githubUserSchema.safeParse(
		await userResponse.json().catch(() => null),
	);
	if (!parsedUser.success) return fail("userinfo_failed");
	const account = parsedUser.data;
	const githubUserId = String(account.id);

	// Absent expiry means the App has token expiry off; the row then carries
	// no expiry and the token is used as-is (see user-connection.ts).
	const tokenExpiresAt = tokens.expires_in
		? new Date(Date.now() + tokens.expires_in * 1000)
		: null;
	const config = {
		provider: "github" as const,
		login: account.login,
		githubUserId,
		...(account.avatar_url ? { avatarUrl: account.avatar_url } : {}),
	};

	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "github",
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token ?? null,
			tokenExpiresAt,
			// The account, not an organization: this connection is one person's.
			externalOrgId: githubUserId,
			externalOrgName: account.login,
			config,
		})
		.onConflictDoUpdate({
			// One GitHub connection per member: the partial index on
			// (org, provider, connected_by_user_id) WHERE provider = 'github'.
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
				integrationConnections.connectedByUserId,
			],
			targetWhere: sql`${integrationConnections.provider} = 'github'`,
			set: {
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token ?? null,
				tokenExpiresAt,
				disconnectedAt: null,
				disconnectReason: null,
				externalOrgId: githubUserId,
				externalOrgName: account.login,
				config,
				updatedAt: new Date(),
			},
		});

	// Sign-in only ever knows this person's GitHub id; connecting is where the
	// handle becomes known, and the automation matcher labels people by it.
	await db
		.insert(userIdentities)
		.values({
			provider: "github",
			externalId: githubUserId,
			externalScopeId: null,
			userId,
			organizationId,
			handle: account.login,
			displayName: account.login,
			metadata: { provider: "github" },
		})
		.onConflictDoUpdate({
			target: [
				userIdentities.organizationId,
				userIdentities.provider,
				userIdentities.externalScopeId,
				userIdentities.externalId,
			],
			set: { userId, handle: account.login, displayName: account.login },
		});

	return Response.redirect(`${env.NEXT_PUBLIC_WEB_URL}/integrations/github`);
}
