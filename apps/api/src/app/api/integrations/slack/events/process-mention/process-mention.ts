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

	try {
		const result = await runSlackAgent({
			prompt: event.text,
			channelId: event.channel,
			threadTs,
			organizationId: connection.organizationId,
			slackToken: connection.accessToken,
			slackTeamId: teamId,
		});

		// Format actions as text with URLs (enables Slack unfurling)
		const hasActions = result.actions.length > 0;
		const responseText = hasActions
			? formatActionsAsText(result.actions)
			: result.text;

		await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: threadTs,
			text: responseText,
		});
	} catch (err) {
		console.error("[slack/process-mention] Agent error:", err);

		await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: threadTs,
			text: `Sorry, something went wrong: ${err instanceof Error ? err.message : "Unknown error"}`,
		});
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
