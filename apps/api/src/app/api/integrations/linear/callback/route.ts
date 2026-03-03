import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import { integrationConnections, members } from "@superset/db/schema";
import { Client } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { verifySignedState } from "@/lib/oauth-state";
import { getLinearPublicApiUrl } from "../lib/public-api-url";

const qstash = new Client({ token: env.QSTASH_TOKEN });

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");

	if (error) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=oauth_denied`,
		);
	}

	if (!code || !state) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=missing_params`,
		);
	}

	// Verify signed state (prevents forgery)
	const stateData = verifySignedState(state);
	if (!stateData) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=invalid_state`,
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
		console.error("[linear/callback] Membership verification failed:", {
			organizationId,
			userId,
		});
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=unauthorized`,
		);
	}

	const tokenResponse = await fetch("https://api.linear.app/oauth/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: env.LINEAR_CLIENT_ID,
			client_secret: env.LINEAR_CLIENT_SECRET,
			redirect_uri: `${getLinearPublicApiUrl()}/api/integrations/linear/callback`,
			code,
		}),
	});

	if (!tokenResponse.ok) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=token_exchange_failed`,
		);
	}

	const tokenData: { access_token: string; expires_in?: number } =
		await tokenResponse.json();

	const linearClient = new LinearClient({
		accessToken: tokenData.access_token,
	});
	const viewer = await linearClient.viewer;
	const linearOrg = await viewer.organization;

	const tokenExpiresAt = tokenData.expires_in
		? new Date(Date.now() + tokenData.expires_in * 1000)
		: null;

	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "linear",
			accessToken: tokenData.access_token,
			tokenExpiresAt,
			externalOrgId: linearOrg.id,
			externalOrgName: linearOrg.name,
		})
		.onConflictDoUpdate({
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
			],
			set: {
				accessToken: tokenData.access_token,
				tokenExpiresAt,
				externalOrgId: linearOrg.id,
				externalOrgName: linearOrg.name,
				connectedByUserId: userId,
				updatedAt: new Date(),
			},
		});

	try {
		await qstash.publishJSON({
			url: `${getLinearPublicApiUrl()}/api/integrations/linear/jobs/initial-sync`,
			body: { organizationId, creatorUserId: userId },
			retries: 3,
		});
	} catch (error) {
		console.error("Failed to queue initial sync job:", error);
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?warning=sync_queued_failed`,
		);
	}

	return Response.redirect(`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear`);
}
