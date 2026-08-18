import { db } from "@superset/db/client";
import {
	integrationConnections,
	members,
	userIdentities,
} from "@superset/db/schema";
import { NOTION_VERSION } from "@superset/trpc/integrations/notion";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { verifySignedState } from "@/lib/oauth-state";

/**
 * What Notion returns for an authorization code. `owner` is the person who
 * clicked through — the only Notion identity the connection can vouch for.
 */
const tokenResponseSchema = z.object({
	access_token: z.string().min(1),
	refresh_token: z.string().nullish(),
	bot_id: z.string(),
	workspace_id: z.string().min(1),
	workspace_name: z.string().nullish(),
	owner: z.object({
		type: z.string(),
		user: z
			.object({
				id: z.string().min(1),
				name: z.string().nullish(),
			})
			.optional(),
	}),
});

const settingsUrl = `${env.NEXT_PUBLIC_WEB_URL}/integrations/notion`;

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");

	if (error) {
		return Response.redirect(`${settingsUrl}?error=oauth_denied`);
	}
	if (!code || !state) {
		return Response.redirect(`${settingsUrl}?error=missing_params`);
	}
	if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET) {
		return Response.redirect(`${settingsUrl}?error=not_configured`);
	}

	const stateData = verifySignedState(state);
	if (!stateData) {
		return Response.redirect(`${settingsUrl}?error=invalid_state`);
	}
	const { organizationId, userId } = stateData;

	// Re-verify membership at callback time (state was signed earlier).
	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});
	if (!membership) {
		console.error("[notion/callback] Membership verification failed:", {
			organizationId,
			userId,
		});
		return Response.redirect(`${settingsUrl}?error=unauthorized`);
	}

	const basic = Buffer.from(
		`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`,
	).toString("base64");
	const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${basic}`,
			"Content-Type": "application/json",
			"Notion-Version": NOTION_VERSION,
		},
		body: JSON.stringify({
			grant_type: "authorization_code",
			code,
			redirect_uri: `${env.NEXT_PUBLIC_API_URL}/api/integrations/notion/callback`,
		}),
		signal: AbortSignal.timeout(15_000),
	}).catch((error: unknown) => {
		console.error("[notion/callback] Token exchange request failed:", error);
		return null;
	});
	if (!tokenResponse?.ok) {
		if (tokenResponse) {
			console.error(
				"[notion/callback] Token exchange failed:",
				tokenResponse.status,
				await tokenResponse.text().catch(() => ""),
			);
		}
		return Response.redirect(`${settingsUrl}?error=token_exchange_failed`);
	}

	const parsed = tokenResponseSchema.safeParse(await tokenResponse.json());
	if (!parsed.success) {
		console.error("[notion/callback] Unexpected token response:", parsed.error);
		return Response.redirect(`${settingsUrl}?error=token_exchange_failed`);
	}
	const token = parsed.data;

	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "notion",
			accessToken: token.access_token,
			refreshToken: token.refresh_token ?? null,
			externalOrgId: token.workspace_id,
			externalOrgName: token.workspace_name ?? null,
		})
		.onConflictDoUpdate({
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
			],
			// The org-scoped uniqueness is a partial index (Google connections
			// are per user); Postgres only infers it when the predicate is named.
			targetWhere: sql`${integrationConnections.provider}<> 'google'`,
			set: {
				accessToken: token.access_token,
				refreshToken: token.refresh_token ?? null,
				externalOrgId: token.workspace_id,
				externalOrgName: token.workspace_name ?? null,
				connectedByUserId: userId,
				disconnectedAt: null,
				disconnectReason: null,
				updatedAt: new Date(),
			},
		});

	// The authorizing member's Notion user id, so `me` in a mention trigger
	// resolves for them. Notion user ids are per workspace, hence the scope.
	if (token.owner.user) {
		await db
			.insert(userIdentities)
			.values({
				userId,
				organizationId,
				provider: "notion",
				externalId: token.owner.user.id,
				externalScopeId: token.workspace_id,
				displayName: token.owner.user.name ?? null,
			})
			.onConflictDoUpdate({
				target: [
					userIdentities.organizationId,
					userIdentities.provider,
					userIdentities.externalScopeId,
					userIdentities.externalId,
				],
				set: { userId, displayName: token.owner.user.name ?? null },
			});
	}

	return Response.redirect(settingsUrl);
}
