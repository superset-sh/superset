import { db } from "@superset/db/client";
import {
	integrationConnections,
	subscriptions,
	usersSlackUsers,
} from "@superset/db/schema";
import { decryptOAuthToken } from "@superset/shared/oauth-token-crypto";
import { and, eq } from "drizzle-orm";
import { generateConnectUrl } from "../utils/generate-connect-url";
import {
	formatErrorForSlack,
	resolveUserMentions,
	runSlackAgent,
} from "../utils/run-agent";
import { formatSideEffectsMessage } from "../utils/slack-blocks";
import { createSlackClient } from "../utils/slack-client";
import {
	extractSlackImageAssets,
	formatSlackImageAssetError,
	SlackImageAssetError,
} from "../utils/slack-image-assets";

interface SlackEventFile {
	id: string;
	name?: string;
	mimetype?: string;
	size?: number;
	url_private?: string;
	url_private_download?: string;
}

interface SlackAssistantMessageEvent {
	type: "message";
	user: string;
	text?: string;
	ts: string;
	channel: string;
	channel_type: "im";
	event_ts: string;
	thread_ts?: string;
	files?: SlackEventFile[];
}

interface ProcessAssistantMessageParams {
	event: SlackAssistantMessageEvent;
	teamId: string;
	eventId: string;
}

export async function processAssistantMessage({
	event,
	teamId,
	eventId,
}: ProcessAssistantMessageParams): Promise<void> {
	console.log("[slack/process-assistant-message] Processing message:", {
		eventId,
		teamId,
		channel: event.channel,
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
			"[slack/process-assistant-message] No connection found for team:",
			teamId,
		);
		return;
	}

	const slackToken = decryptOAuthToken(connection.accessToken);
	const slack = createSlackClient(slackToken);

	const [slackUserLink, activeSubscription] = await Promise.all([
		event.user
			? db.query.usersSlackUsers.findFirst({
					where: and(
						eq(usersSlackUsers.slackUserId, event.user),
						eq(usersSlackUsers.teamId, teamId),
					),
					columns: { userId: true, modelPreference: true },
				})
			: undefined,
		db.query.subscriptions.findFirst({
			where: and(
				eq(subscriptions.referenceId, connection.organizationId),
				eq(subscriptions.status, "active"),
			),
			columns: { id: true },
		}),
	]);

	if (!activeSubscription) {
		await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: event.thread_ts ?? event.ts,
			text: "The Superset Slack integration requires a Pro plan.",
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: "The Superset Slack integration requires a Pro plan.",
					},
				},
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: { type: "plain_text", text: "Upgrade to Pro", emoji: true },
							url: "https://app.superset.sh/settings/billing",
							style: "primary",
						},
					],
				},
			],
		});
		return;
	}

	if (!slackUserLink) {
		if (!event.user) return;
		const connectUrl = generateConnectUrl({
			slackUserId: event.user,
			teamId,
		});
		await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: event.thread_ts ?? event.ts,
			text: "To use Superset, you need to link your Slack account first.",
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: "To use Superset, you need to link your Slack account first.",
					},
				},
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "Connect Account",
								emoji: true,
							},
							url: connectUrl,
							style: "primary",
						},
					],
				},
			],
		});
		return;
	}

	const threadTs = event.thread_ts ?? event.ts;

	// Post an initial message that gets updated as the agent works
	let messageTs: string | undefined;
	try {
		const initialMsg = await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: threadTs,
			text: "Thinking...",
		});
		messageTs = initialMsg.ts;
	} catch (err) {
		console.error(
			"[slack/process-assistant-message] Failed to post initial message:",
			err,
		);
	}

	try {
			const imageAssets = await extractSlackImageAssets({
				eventFiles: event.files,
				slack,
				slackToken,
			});

		const resolve = await resolveUserMentions({
			texts: [event.text ?? ""],
			slack,
		});

			const result = await runSlackAgent({
			prompt: resolve(event.text ?? ""),
			channelId: event.channel,
			threadTs,
				organizationId: connection.organizationId,
				userId: slackUserLink.userId,
				slackToken,
				model: slackUserLink.modelPreference ?? undefined,
			images: imageAssets,
			onProgress: messageTs
				? async (status) => {
						try {
							await slack.chat.update({
								channel: event.channel,
								ts: messageTs,
								text: status,
							});
						} catch {
							// Non-critical: progress updates are best-effort
						}
					}
				: undefined,
		});

		// Update the message with Claude's final summary
		if (messageTs) {
			await slack.chat.update({
				channel: event.channel,
				ts: messageTs,
				text: result.text,
			});
		} else {
			await slack.chat.postMessage({
				channel: event.channel,
				thread_ts: threadTs,
				text: result.text,
			});
		}

		// Post side effects as a separate message
		if (result.actions.length > 0) {
			try {
				await slack.chat.postMessage({
					channel: event.channel,
					thread_ts: threadTs,
					text: formatSideEffectsMessage(result.actions),
				});
			} catch (err) {
				console.error(
					"[slack/process-assistant-message] Failed to post side effects:",
					err,
				);
			}
		}
	} catch (err) {
		console.error("[slack/process-assistant-message] Agent error:", err);

		const errorText =
			err instanceof SlackImageAssetError
				? formatSlackImageAssetError(err)
				: await formatErrorForSlack(err);
		if (messageTs) {
			await slack.chat.update({
				channel: event.channel,
				ts: messageTs,
				text: errorText,
			});
		} else {
			await slack.chat.postMessage({
				channel: event.channel,
				thread_ts: threadTs,
				text: errorText,
			});
		}
	}
}
