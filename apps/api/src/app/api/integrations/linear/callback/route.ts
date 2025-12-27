import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { Client } from "@upstash/qstash";
import { z } from "zod";
import { env } from "@/env";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const stateSchema = z.object({
	organizationId: z.string().min(1),
	userId: z.string().min(1),
});

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

	const parsed = stateSchema.safeParse(
		JSON.parse(Buffer.from(state, "base64url").toString("utf-8")),
	);

	if (!parsed.success) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=invalid_state`,
		);
	}

	const { organizationId, userId } = parsed.data;

	const tokenResponse = await fetch("https://api.linear.app/oauth/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: env.LINEAR_CLIENT_ID,
			client_secret: env.LINEAR_CLIENT_SECRET,
			redirect_uri: `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/callback`,
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

	await qstash.publishJSON({
		url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/jobs/initial-sync`,
		body: { organizationId, creatorUserId: userId },
		retries: 3,
	});

	return Response.redirect(`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear`);
}
