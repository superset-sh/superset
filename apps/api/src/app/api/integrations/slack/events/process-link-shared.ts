import type { EntityMetadata, LinkSharedEvent } from "@slack/types";
import { db } from "@superset/db/client";
import { integrationConnections, tasks } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { createSlackClient } from "@/lib/slack-agent/slack-client";
import {
	createTaskWorkObject,
	parseTaskSlugFromUrl,
} from "@/lib/slack-agent/work-objects";

interface ProcessLinkSharedParams {
	event: LinkSharedEvent;
	teamId: string;
	eventId: string;
}

export async function processLinkShared({
	event,
	teamId,
	eventId,
}: ProcessLinkSharedParams): Promise<void> {
	console.log("[slack/process-link-shared] Processing links:", {
		eventId,
		teamId,
		linkCount: event.links.length,
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
			"[slack/process-link-shared] No connection found for team:",
			teamId,
		);
		return;
	}

	const slack = createSlackClient(connection.accessToken);

	// Build Work Object entities for each link
	const entities: EntityMetadata[] = [];

	for (const link of event.links) {
		const taskSlug = parseTaskSlugFromUrl(link.url);
		if (!taskSlug) {
			console.log(
				"[slack/process-link-shared] Could not parse task slug from URL:",
				link.url,
			);
			continue;
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
			},
		});

		if (task) {
			const entity = createTaskWorkObject(task);
			// Ensure app_unfurl_url matches the exact URL from the message
			entity.app_unfurl_url = link.url;
			entities.push(entity);
			console.log(
				"[slack/process-link-shared] Built Work Object for task:",
				task.slug,
			);
		} else {
			console.log("[slack/process-link-shared] Task not found:", taskSlug);
		}
	}

	// Send unfurls to Slack using Work Objects metadata format
	if (entities.length > 0) {
		try {
			await slack.chat.unfurl({
				channel: event.channel,
				ts: event.message_ts,
				// Work Objects use metadata instead of unfurls
				metadata: {
					entities,
				},
			});

			console.log(
				"[slack/process-link-shared] Work Objects unfurls sent successfully",
			);
		} catch (err) {
			console.error("[slack/process-link-shared] Failed to send unfurls:", err);
		}
	}
}
