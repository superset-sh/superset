import type { SlackEvent } from "@slack/types";
import { db } from "@superset/db/client";
import { integrationConnections, tasks } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { createSlackClient } from "../utils/slack-client";
import {
	createTaskFlexpaneObject,
	parseTaskSlugFromUrl,
} from "../utils/work-objects";

type EntityDetailsRequestedEvent = Extract<
	SlackEvent,
	{ type: "entity_details_requested" }
>;

interface ProcessEntityDetailsParams {
	event: EntityDetailsRequestedEvent;
	teamId: string;
	eventId: string;
}

/** Populates the flexpane when a user clicks an unfurled Work Object. */
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

	const taskSlug = parseTaskSlugFromUrl(event.entity_url);

	if (!taskSlug) {
		console.error(
			"[slack/process-entity-details] Could not parse task slug from URL:",
			event.entity_url,
		);

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

	const entity = createTaskFlexpaneObject(task);

	try {
		await slack.entity.presentDetails({
			trigger_id: event.trigger_id,
			metadata: entity,
		});
	} catch (err) {
		console.error(
			"[slack/process-entity-details] Failed to present details:",
			err,
		);
	}
}
