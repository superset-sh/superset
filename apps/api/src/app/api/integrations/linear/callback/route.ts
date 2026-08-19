import { LinearClient } from "@linear/sdk";
import { linearTokenResponseSchema } from "@superset/trpc/integrations/linear";
import { Client } from "@upstash/qstash";

import { env } from "@/env";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { upsertConnection } from "@/lib/integrations/upsertConnection";
import { upsertIdentity } from "@/lib/integrations/upsertIdentity";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const settingsUrl = `${env.NEXT_PUBLIC_WEB_URL}/integrations/linear`;

export async function GET(request: Request) {
	const callback = await resolveCallback(request, {
		params: ["code"],
		redirect: (error) => Response.redirect(`${settingsUrl}?error=${error}`),
	});
	if (callback instanceof Response) return callback;
	const { organizationId, userId, params } = callback;

	const tokenResponse = await fetch("https://api.linear.app/oauth/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: env.LINEAR_CLIENT_ID,
			client_secret: env.LINEAR_CLIENT_SECRET,
			redirect_uri: `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/callback`,
			code: params.code,
		}),
	});

	if (!tokenResponse.ok) {
		return Response.redirect(`${settingsUrl}?error=token_exchange_failed`);
	}

	const tokenData = linearTokenResponseSchema.parse(await tokenResponse.json());

	const linearClient = new LinearClient({
		accessToken: tokenData.access_token,
	});
	const viewer = await linearClient.viewer;
	const linearOrg = await viewer.organization;

	const result = await upsertConnection({
		organizationId,
		userId,
		provider: "linear",
		accessToken: tokenData.access_token,
		refreshToken: tokenData.refresh_token,
		tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
		externalOrgId: linearOrg.id,
		externalOrgName: linearOrg.name,
	});
	if (result.conflict) {
		return Response.redirect(`${settingsUrl}?error=workspace_already_linked`);
	}

	// The person who connected is the one Linear account we know for certain
	// belongs to a Superset user, so link it. Linear user ids are scoped to
	// the Linear workspace.
	await upsertIdentity({
		userId,
		organizationId,
		provider: "linear",
		externalId: viewer.id,
		externalScopeId: linearOrg.id,
		handle: viewer.displayName,
		displayName: viewer.name,
	});

	try {
		await qstash.publishJSON({
			url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/jobs/initial-sync`,
			body: { organizationId, creatorUserId: userId },
			retries: 3,
		});
	} catch (error) {
		console.error("Failed to queue initial sync job:", error);
		return Response.redirect(`${settingsUrl}?warning=sync_queued_failed`);
	}

	return Response.redirect(settingsUrl);
}
