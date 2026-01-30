import type { GenericMessageEvent } from "@slack/types";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { runSlackAgent } from "../utils/run-agent";
import { formatActionsAsText } from "../utils/slack-blocks";
import { createSlackClient } from "../utils/slack-client";

interface ProcessAssistantMessageParams {
	event: GenericMessageEvent;
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

	const slack = createSlackClient(connection.accessToken);

	const threadTs = event.thread_ts ?? event.ts;

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
		const result = await runSlackAgent({
			prompt: event.text ?? "",
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
		console.error("[slack/process-assistant-message] Agent error:", err);

		await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: threadTs,
			text: `Sorry, something went wrong: ${err instanceof Error ? err.message : "Unknown error"}`,
		});
	} finally {
		try {
			await slack.assistant.threads.setStatus({
				channel_id: event.channel,
				thread_ts: threadTs,
				status: "",
			});
		} catch {}
	}
}
