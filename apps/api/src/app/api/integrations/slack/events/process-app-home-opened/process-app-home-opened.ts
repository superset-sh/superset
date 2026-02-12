import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { createSlackClient } from "../utils/slack-client";

interface ProcessAppHomeOpenedParams {
	event: { user: string; tab: string };
	teamId: string;
	eventId: string;
}

export async function processAppHomeOpened({
	event,
	teamId,
	eventId,
}: ProcessAppHomeOpenedParams): Promise<void> {
	console.log("[slack/process-app-home-opened] Publishing home tab:", {
		eventId,
		teamId,
		user: event.user,
	});

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

	const slack = createSlackClient(connection.accessToken);

	await slack.views.publish({
		user_id: event.user,
		view: {
			type: "home",
			blocks: [
				{
					type: "header",
					text: {
						type: "plain_text",
						text: "Welcome to Superset",
						emoji: true,
					},
				},
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: "Superset is your AI coding assistant - spin up cloud agents, plan tasks, do code reviews, and more, all without leaving Slack.",
					},
				},
				{
					type: "divider",
				},
				{
					type: "header",
					text: {
						type: "plain_text",
						text: "Getting Started",
						emoji: true,
					},
				},
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: "*DM the bot* — Start a direct message with Superset for instant access to AI assistance.\n\n*@mention in channels* — Mention <@superset> in any channel to get help in context.\n\n*Link unfurling* — Paste a Superset task link and it will automatically preview in the conversation.",
					},
				},
				{
					type: "divider",
				},
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "Open Superset",
								emoji: true,
							},
							url: "https://app.superset.sh",
							style: "primary",
						},
					],
				},
			],
		},
	});
}
