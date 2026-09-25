import {
	accountConnection,
	connectionBotToken,
} from "@superset/trpc/connectors";
import { findSlackUserLink } from "../../lib/find-slack-user-link";
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
	const connection = await accountConnection("slack", teamId);

	if (!connection) {
		console.error(
			"[slack/process-app-home-opened] No connection found for team:",
			teamId,
		);
		return;
	}

	const slackUserLink = await findSlackUserLink({
		organizationId: connection.organizationId,
		slackUserId: event.user,
		teamId,
	});

	const isUserLinked = !!slackUserLink;
	const userName = slackUserLink?.user?.name;

	const connectUrl = isUserLinked
		? undefined
		: generateConnectUrl({ slackUserId: event.user, teamId });

	const slack = createSlackClient(await connectionBotToken(connection));

	await slack.views.publish({
		user_id: event.user,
		view: buildHomeView({
			modelPreference: slackUserLink?.modelPreference ?? undefined,
			externalOrgName: connection.externalAccountLabel ?? undefined,
			isUserLinked,
			userName: userName ?? undefined,
			connectUrl,
		}),
	});
}
