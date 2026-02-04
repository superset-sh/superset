import type { AppMentionEvent } from "@slack/types";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { formatErrorForSlack, runSlackAgent } from "../utils/run-agent";
import { formatSideEffectsMessage } from "../utils/slack-blocks";
import { createSlackClient } from "../utils/slack-client";

interface ProcessMentionParams {
	event: AppMentionEvent;
	teamId: string;
	eventId: string;
}

export async function processSlackMention({
	event,
	teamId,
	eventId,
}: ProcessMentionParams): Promise<void> {
	console.log("[slack/process-mention] Processing mention:", {
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
			"[slack/process-mention] No connection found for team:",
			teamId,
		);
		return;
	}

	const slack = createSlackClient(connection.accessToken);

	try {
		await slack.reactions.add({
			channel: event.channel,
			timestamp: event.ts,
			name: "eyes",
		});
	} catch (err) {
		console.warn("[slack/process-mention] Failed to add reaction:", err);
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
			"[slack/process-mention] Failed to post initial message:",
			err,
		);
	}

	try {
		const result = await runSlackAgent({
			prompt: event.text,
			channelId: event.channel,
			threadTs,
			organizationId: connection.organizationId,
			slackToken: connection.accessToken,
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
					"[slack/process-mention] Failed to post side effects:",
					err,
				);
			}
		}
	} catch (err) {
		console.error("[slack/process-mention] Agent error:", err);

		const errorText = await formatErrorForSlack(err);
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
	} finally {
		try {
			await slack.reactions.remove({
				channel: event.channel,
				timestamp: event.ts,
				name: "eyes",
			});
		} catch {}
	}
}
