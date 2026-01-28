import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { createSignedState } from "@/lib/oauth-state";

const SLACK_SCOPES = [
	// Core bot functionality
	"app_mentions:read",
	"chat:write",
	"reactions:write",
	// Read messages for context
	"channels:history",
	"groups:history",
	"im:history",
	"mpim:history",
	// User info for mapping
	"users:read",
].join(",");

export async function GET(request: Request) {
	const url = new URL(request.url);
	const organizationId = url.searchParams.get("organizationId");
	const isDev = env.NODE_ENV === "development";

	if (!organizationId) {
		return Response.json(
			{ error: "Missing organizationId parameter" },
			{ status: 400 },
		);
	}

	let userId: string;

	// In dev, allow passing userId directly (for ngrok testing where cookies don't work)
	const devUserId = url.searchParams.get("userId");
	if (isDev && devUserId) {
		userId = devUserId;
	} else {
		const session = await auth.api.getSession({
			headers: request.headers,
		});

		if (!session?.user) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}
		userId = session.user.id;

		const membership = await db.query.members.findFirst({
			where: and(
				eq(members.organizationId, organizationId),
				eq(members.userId, userId),
			),
		});

		if (!membership) {
			return Response.json(
				{ error: "User is not a member of this organization" },
				{ status: 403 },
			);
		}
	}

	const state = createSignedState({
		organizationId,
		userId,
	});

	// Use ngrok URL in dev for redirect_uri
	const redirectUri = isDev
		? "https://6b3ce1c0b374.ngrok-free.app/api/integrations/slack/callback"
		: `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/callback`;

	const slackAuthUrl = new URL("https://slack.com/oauth/v2/authorize");
	slackAuthUrl.searchParams.set("client_id", env.SLACK_CLIENT_ID);
	slackAuthUrl.searchParams.set("redirect_uri", redirectUri);
	slackAuthUrl.searchParams.set("scope", SLACK_SCOPES);
	slackAuthUrl.searchParams.set("state", state);

	return Response.redirect(slackAuthUrl.toString());
}
