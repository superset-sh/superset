import { WebClient } from "@slack/web-api";
import {
	connectorMethod,
	requireConnector,
	upsertConnection,
} from "@superset/trpc/connectors";

import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import { resolveCallback } from "@/lib/integrations/resolveCallback";

const settingsUrl = `${env.NEXT_PUBLIC_WEB_URL}/integrations/slack`;

export async function GET(request: Request) {
	const callback = await resolveCallback(request, {
		params: ["code"],
		redirect: (error) => Response.redirect(`${settingsUrl}?error=${error}`),
	});
	if (callback instanceof Response) return callback;
	const { organizationId, userId, params } = callback;

	const redirectUri = `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/callback`;
	const client = new WebClient();

	try {
		const tokenData = await client.oauth.v2.access({
			client_id: env.SLACK_CLIENT_ID,
			client_secret: env.SLACK_CLIENT_SECRET,
			redirect_uri: redirectUri,
			code: params.code,
		});

		if (!tokenData.ok || !tokenData.access_token || !tokenData.team?.id) {
			console.error("[slack/callback] Slack API error:", tokenData.error);
			return Response.redirect(`${settingsUrl}?error=slack_api_error`);
		}

		// This flow asks for bot scopes only, so `access_token` is the workspace
		// bot token. It is stored in both places: `config.bot_token` is where
		// everything that posts as the app reads it, and the access token is
		// what a connector-shaped caller binds.
		const botToken = tokenData.access_token;
		const connector = requireConnector("slack");
		const result = await upsertConnection({
			connector,
			slug: "slack",
			authMethod: connectorMethod(connector, "oauth2").type,
			organizationId,
			userId,
			tokens: {
				accessToken: botToken,
				refreshToken: null,
				expiresAt: null,
				scopes: tokenData.scope ? tokenData.scope.split(",") : null,
				stored: {
					bot_token: botToken,
					bot_user_id: tokenData.bot_user_id ?? null,
					slack_user_id: tokenData.authed_user?.id ?? null,
				},
				raw: tokenData as unknown as Record<string, unknown>,
			},
			identity: {
				account: { id: tokenData.team.id, label: tokenData.team.name ?? null },
				user: {
					id: tokenData.authed_user?.id ?? tokenData.bot_user_id ?? userId,
					label: null,
				},
			},
			state: { provider: "slack" },
		});
		if (result.conflict) {
			const owner = result.conflict.ownerEmail
				? `&owner=${encodeURIComponent(result.conflict.ownerEmail)}`
				: "";
			return Response.redirect(
				`${settingsUrl}?error=workspace_already_linked${owner}`,
			);
		}

		console.log("[slack/callback] Connected workspace:", {
			organizationId,
			teamId: tokenData.team.id,
			teamName: tokenData.team.name,
		});

		posthog.capture({
			distinctId: userId,
			event: "slack_connected",
			properties: { team_id: tokenData.team.id },
		});

		return Response.redirect(settingsUrl);
	} catch (error) {
		console.error("[slack/callback] Token exchange failed:", error);
		return Response.redirect(`${settingsUrl}?error=token_exchange_failed`);
	}
}
