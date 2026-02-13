import { createHmac } from "node:crypto";
import { db } from "@superset/db/client";
import { integrationConnections, usersSlackUsers } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";
import { createSlackClient } from "../utils/slack-client";
import { buildHomeView } from "./build-home-view";

interface ProcessAppHomeOpenedParams {
	event: { user: string; tab: string };
	teamId: string;
	eventId: string;
}

function generateConnectUrl({
	slackUserId,
	teamId,
}: {
	slackUserId: string;
	teamId: string;
}): string {
	const payload = JSON.stringify({
		slackUserId,
		teamId,
		exp: Date.now() + 10 * 60 * 1000,
	});
	const signature = createHmac("sha256", env.SLACK_SIGNING_SECRET)
		.update(payload)
		.digest("hex");
	const token = Buffer.from(payload).toString("base64url");
	return `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/link?token=${token}&sig=${signature}`;
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

	const slack = createSlackClient(connection.accessToken);

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
