import { WebClient } from "@slack/web-api";
import type { SlackConfig } from "@superset/db/schema";

import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { upsertConnection } from "@/lib/integrations/upsertConnection";

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

		const config: SlackConfig = {
			provider: "slack",
		};

		const result = await upsertConnection({
			organizationId,
			userId,
			provider: "slack",
			accessToken: tokenData.access_token,
			externalOrgId: tokenData.team.id,
			externalOrgName: tokenData.team.name,
			config,
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
