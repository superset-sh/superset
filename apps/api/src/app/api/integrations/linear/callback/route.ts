import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import { organizations } from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import {
	connectorMethod,
	requireConnector,
	upsertConnection,
} from "@superset/trpc/connectors";
import { linearTokenResponseSchema } from "@superset/trpc/integrations/linear";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { STATE_COOKIES } from "@/lib/integrations/oauthFlow";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { upsertIdentity } from "@/lib/integrations/upsertIdentity";
import { linearStateSchema, verifySignedState } from "@/lib/oauth-state";

const settingsUrl = `${env.NEXT_PUBLIC_WEB_URL}/integrations/linear`;

export async function GET(request: Request) {
	const callback = await resolveCallback(request, {
		params: ["code"],
		redirect: (error) => `${settingsUrl}?error=${error}`,
		cookie: STATE_COOKIES.linear,
	});
	if (callback instanceof Response) return callback;
	const { organizationId, userId, params, state, exit, fail } = callback;

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
	if (result.conflict) {
		const owner = result.conflict.ownerEmail
			? `&owner=${encodeURIComponent(result.conflict.ownerEmail)}`
			: "";
		return exit(`${settingsUrl}?error=workspace_already_linked${owner}`);
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

	if (verifySignedState(state, linearStateSchema)?.trackTasksInLinear) {
		const membership = await findOrgMembership({ userId, organizationId });
		if (membership?.role === "owner") {
			await db
				.update(organizations)
				.set({ taskTracker: "linear" })
				.where(eq(organizations.id, organizationId));
		}
	}

	return exit(settingsUrl);
}
