import type { AppMentionEvent } from "@slack/types";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { runSlackAgent } from "../utils/run-agent";
import { formatActionsAsText } from "../utils/slack-blocks";
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

	// Find connection by Slack team ID
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

	// React with eyes to show we're processing
	try {
		await slack.reactions.add({
			channel: event.channel,
			timestamp: event.ts,
			name: "eyes",
		});
	} catch (err) {
		console.warn("[slack/process-mention] Failed to add reaction:", err);
	}

	// Determine the thread timestamp (reply in thread if it's a threaded message)
	const threadTs = event.thread_ts ?? event.ts;

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

		console.log("[slack/process-mention] Response posted successfully", {
			hasActions,
			actionCount: result.actions.length,
			actionTypes: result.actions.map((a) => a.type),
		});
	} catch (err) {
		console.error("[slack/process-mention] Agent error:", err);

		// Post error message to the channel
		await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: threadTs,
			text: `Sorry, something went wrong: ${err instanceof Error ? err.message : "Unknown error"}`,
		});
	} finally {
		// Remove the eyes reaction
		try {
			await slack.reactions.remove({
				channel: event.channel,
				timestamp: event.ts,
				name: "eyes",
			});
		} catch {
			// Ignore errors removing reaction
		}
	}
}
