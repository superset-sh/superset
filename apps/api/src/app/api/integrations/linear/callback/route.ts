import { LinearClient } from "@linear/sdk";
import {
	connectorMethod,
	requireConnector,
	upsertConnection,
} from "@superset/trpc/connectors";
import { linearTokenResponseSchema } from "@superset/trpc/integrations/linear";
import { Client } from "@upstash/qstash";

import { env } from "@/env";
import { STATE_COOKIES } from "@/lib/integrations/oauthFlow";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { upsertIdentity } from "@/lib/integrations/upsertIdentity";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const settingsUrl = `${env.NEXT_PUBLIC_WEB_URL}/integrations/linear`;

export async function GET(request: Request) {
	const callback = await resolveCallback(request, {
		params: ["code"],
		redirect: (error) => `${settingsUrl}?error=${error}`,
		cookie: STATE_COOKIES.linear,
	});
	if (callback instanceof Response) return callback;
	const { organizationId, userId, params, exit, fail } = callback;

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

	if (!tokenResponse.ok) return fail("token_exchange_failed");

	const tokenData = linearTokenResponseSchema.parse(await tokenResponse.json());

	const linearClient = new LinearClient({
		accessToken: tokenData.access_token,
	});
	const viewer = await linearClient.viewer;
	const linearOrg = await viewer.organization;

	const connector = requireConnector("linear");
	const result = await upsertConnection({
		connector,
		slug: "linear",
		authMethod: connectorMethod(connector, "oauth2").type,
		organizationId,
		userId,
		tokens: {
			accessToken: tokenData.access_token,
			refreshToken: tokenData.refresh_token,
			expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
			scopes: tokenData.scope ? tokenData.scope.split(",") : null,
			stored: {},
			raw: tokenData as unknown as Record<string, unknown>,
		},
		identity: {
			account: { id: linearOrg.id, label: linearOrg.name },
			user: { id: viewer.id, label: viewer.displayName },
		},
	});
	if (result.conflict) return fail("workspace_already_linked");

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
		return exit(`${settingsUrl}?warning=sync_queued_failed`);
	}

	return exit(settingsUrl);
}
