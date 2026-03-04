import { db } from "@superset/db/client";
import { integrationConnections, usersSlackUsers } from "@superset/db/schema";
import { decryptOAuthToken } from "@superset/shared/oauth-token-crypto";
import { and, eq } from "drizzle-orm";
import { generateConnectUrl } from "../utils/generate-connect-url";
import { createSlackClient } from "../utils/slack-client";
import { buildHomeView } from "./build-home-view";

interface ProcessAppHomeOpenedParams {
	event: { user: string; tab: string };
	teamId: string;
	eventId: string;
}

export async function processAppHomeOpened({
	event,
	teamId,
}: ProcessAppHomeOpenedParams): Promise<void> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.provider, "slack"),
			eq(integrationConnections.externalOrgId, teamId),
		),
	});

	if (!connection) {
		console.error(
			"[slack/process-app-home-opened] No connection found for team:",
			teamId,
		);
		return;
	}

	const slackUserLink = await db.query.usersSlackUsers.findFirst({
		where: and(
			eq(usersSlackUsers.slackUserId, event.user),
			eq(usersSlackUsers.teamId, teamId),
		),
		with: { user: true },
	});

	const isUserLinked = !!slackUserLink;
	const userName = slackUserLink?.user?.name;

	const connectUrl = isUserLinked
		? undefined
		: generateConnectUrl({ slackUserId: event.user, teamId });

	const slack = createSlackClient(decryptOAuthToken(connection.accessToken));

	await slack.views.publish({
		user_id: event.user,
		view: buildHomeView({
			modelPreference: slackUserLink?.modelPreference ?? undefined,
			externalOrgName: connection.externalOrgName ?? undefined,
			isUserLinked,
			userName: userName ?? undefined,
			connectUrl,
		}),
	});
}
