import { db } from "@superset/db/client";
import { integrationConnections, tasks } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

import { createSlackClient } from "@/lib/slack-agent/slack-client";
import {
	createTaskFlexpaneObject,
	parseTaskSlugFromUrl,
} from "@/lib/slack-agent/work-objects";

interface SlackEntityDetailsRequestedEvent {
	type: "entity_details_requested";
	user: string;
	channel: string;
	message_ts: string;
	thread_ts?: string;
	trigger_id: string;
	user_locale: string;
	entity_url: string;
	app_unfurl_url: string;
	external_ref: {
		id: string;
		type?: string;
	};
	event_ts: string;
}

interface ProcessEntityDetailsParams {
	event: SlackEntityDetailsRequestedEvent;
	teamId: string;
	eventId: string;
}

/**
 * Handles the entity_details_requested event.
 *
 * This event fires when a user clicks on an unfurled Work Object to open
 * the flexpane (side panel). We respond with entity.presentDetails to
 * populate the flexpane with task details.
 */
export async function processEntityDetails({
	event,
	teamId,
	eventId,
}: ProcessEntityDetailsParams): Promise<void> {
	console.log("[slack/process-entity-details] Processing entity details:", {
		eventId,
		teamId,
		entityUrl: event.entity_url,
		externalRef: event.external_ref,
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
			"[slack/process-entity-details] No connection found for team:",
			teamId,
		);
		return;
	}

	const slack = createSlackClient(connection.accessToken);

	// Parse the task slug from the URL
	const taskSlug = parseTaskSlugFromUrl(event.entity_url);

	if (!taskSlug) {
		console.error(
			"[slack/process-entity-details] Could not parse task slug from URL:",
			event.entity_url,
		);

		// Respond with an error
		try {
			await slack.entity.presentDetails({
				trigger_id: event.trigger_id,
				error: {
					status: "not_found",
					custom_message: "Could not find the requested task.",
				},
			});
		} catch (err) {
			console.error(
				"[slack/process-entity-details] Failed to send error response:",
				err,
			);
		}
		return;
	}

	// Fetch the task from the database with full relations for flexpane
	const task = await db.query.tasks.findFirst({
		where: and(
			eq(tasks.organizationId, connection.organizationId),
			eq(tasks.slug, taskSlug),
		),
		with: {
			status: true,
			assignee: true,
			creator: true,
			organization: true,
		},
	});

	if (!task) {
		console.error("[slack/process-entity-details] Task not found:", taskSlug);

		try {
			await slack.entity.presentDetails({
				trigger_id: event.trigger_id,
				error: {
					status: "not_found",
					custom_message: `Task "${taskSlug}" was not found.`,
				},
			});
		} catch (err) {
			console.error(
				"[slack/process-entity-details] Failed to send error response:",
				err,
			);
		}
		return;
	}

	// Create the Work Object metadata for the flexpane
	const entity = createTaskFlexpaneObject(task);

	try {
		await slack.entity.presentDetails({
			trigger_id: event.trigger_id,
			metadata: entity,
		});

		console.log(
			"[slack/process-entity-details] Flexpane populated successfully for task:",
			task.slug,
		);
	} catch (err) {
		console.error(
			"[slack/process-entity-details] Failed to present details:",
			err,
		);
	}
}
