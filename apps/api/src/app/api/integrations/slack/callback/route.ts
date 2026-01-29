import { db } from "@superset/db/client";
import type { SlackConfig } from "@superset/db/schema";
import { integrationConnections, members } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { verifySignedState } from "@/lib/oauth-state";

interface SlackOAuthResponse {
	ok: boolean;
	error?: string;
	access_token: string;
	token_type: string;
	scope: string;
	bot_user_id: string;
	app_id: string;
	team: {
		id: string;
		name: string;
	};
	authed_user: {
		id: string;
	};
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");

	if (error) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/slack?error=oauth_denied`,
		);
	}

	if (!code || !state) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/slack?error=missing_params`,
		);
	}

	// Verify signed state (prevents forgery)
	const stateData = verifySignedState(state);
	if (!stateData) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/slack?error=invalid_state`,
		);
	}

	const { organizationId, userId } = stateData;

	// Re-verify membership at callback time (defense-in-depth)
	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});

	if (!membership) {
		console.error("[slack/callback] Membership verification failed:", {
			organizationId,
			userId,
		});
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/slack?error=unauthorized`,
		);
	}

	// Exchange code for token (redirect_uri must match connect route)
	const redirectUri = `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/callback`;

	const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: env.SLACK_CLIENT_ID,
			client_secret: env.SLACK_CLIENT_SECRET,
			redirect_uri: redirectUri,
			code,
		}),
	});

	if (!tokenResponse.ok) {
		console.error("[slack/callback] Token exchange HTTP error:", {
			status: tokenResponse.status,
		});
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/slack?error=token_exchange_failed`,
		);
	}

	const tokenData: SlackOAuthResponse = await tokenResponse.json();

	if (!tokenData.ok) {
		console.error("[slack/callback] Slack API error:", tokenData.error);
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/slack?error=slack_api_error`,
		);
	}

	const config: SlackConfig = {
		provider: "slack",
		botUserId: tokenData.bot_user_id,
	};

	// Slack bot tokens don't expire, so no tokenExpiresAt
	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "slack",
			accessToken: tokenData.access_token,
			externalOrgId: tokenData.team.id,
			externalOrgName: tokenData.team.name,
			config,
		})
		.onConflictDoUpdate({
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
			],
			set: {
				accessToken: tokenData.access_token,
				externalOrgId: tokenData.team.id,
				externalOrgName: tokenData.team.name,
				connectedByUserId: userId,
				config,
				updatedAt: new Date(),
			},
		});

	console.log("[slack/callback] Connected workspace:", {
		organizationId,
		teamId: tokenData.team.id,
		teamName: tokenData.team.name,
	});

	return Response.redirect(`${env.NEXT_PUBLIC_WEB_URL}/integrations/slack`);
}
