import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

import { runSlackAgent } from "@/lib/slack-agent/run-agent";
import { formatActionsAsText } from "@/lib/slack-agent/slack-blocks";
import { createSlackClient } from "@/lib/slack-agent/slack-client";

interface SlackMessageImEvent {
	type: "message";
	channel_type: "im";
	user?: string;
	text: string;
	ts: string;
	channel: string;
	event_ts: string;
	thread_ts?: string;
	bot_id?: string;
	subtype?: string;
}

interface ProcessAssistantMessageParams {
	event: SlackMessageImEvent;
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

	// Find connection by Slack team ID
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

	const slack = createSlackClient(connection.accessToken);

	// Use thread_ts if in a thread, otherwise use message ts
	const threadTs = event.thread_ts ?? event.ts;

	// Set "thinking" status using assistant API
	try {
		await slack.assistant.threads.setStatus({
			channel_id: event.channel,
			thread_ts: threadTs,
			status: "Thinking...",
		});
	} catch (err) {
		console.warn(
			"[slack/process-assistant-message] Failed to set status:",
			err,
		);
	}

	try {
		// Run the AI agent
		const result = await runSlackAgent({
			prompt: event.text,
			channelId: event.channel,
			threadTs,
			organizationId: connection.organizationId,
			slackToken: connection.accessToken,
			slackTeamId: teamId,
		});

		// If we have actions, format them as text with URLs (enables unfurling)
		// If no actions, use agent's text response
		const hasActions = result.actions.length > 0;
		const responseText = hasActions
			? formatActionsAsText(result.actions)
			: result.text;

		await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: threadTs,
			text: responseText,
		});

		console.log(
			"[slack/process-assistant-message] Response posted successfully",
			{
				hasActions,
				actionCount: result.actions.length,
			},
		);
	} catch (err) {
		console.error("[slack/process-assistant-message] Agent error:", err);

		await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: threadTs,
			text: `Sorry, something went wrong: ${err instanceof Error ? err.message : "Unknown error"}`,
		});
	} finally {
		// Clear the status
		try {
			await slack.assistant.threads.setStatus({
				channel_id: event.channel,
				thread_ts: threadTs,
				status: "",
			});
		} catch {
			// Ignore errors clearing status
		}
	}
}
