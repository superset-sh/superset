import type { SlackEvent } from "@slack/types";
import type { EntityPresentDetailsArguments } from "@slack/web-api";
import { db } from "@superset/db/client";
import {
	type SelectConnection,
	taskLabelAssignments,
	taskLabels,
	tasks,
} from "@superset/db/schema";
import {
	accountConnection,
	connectionBotToken,
} from "@superset/trpc/connectors";
import { pagePreview } from "@superset/trpc/page-preview";
import { and, asc, eq } from "drizzle-orm";
import { findSlackUserLink } from "../../lib/find-slack-user-link";
import { generateConnectUrl } from "../utils/generate-connect-url";
import {
	createPageWorkObject,
	parsePageSlugFromUrl,
} from "../utils/page-work-object";
import { createSlackClient } from "../utils/slack-client";
import {
	createTaskFlexpaneObject,
	parseTaskSlugFromUrl,
} from "../utils/work-objects";

type EntityDetailsRequestedEvent = Extract<
	SlackEvent,
	{ type: "entity_details_requested" }
>;

type EntityDetails = Omit<EntityPresentDetailsArguments, "trigger_id">;

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

	const connection = await accountConnection("slack", teamId);

	if (!connection) {
		console.error(
			"[slack/process-entity-details] No connection found for team:",
			teamId,
		);
		return;
	}

	const details = await resolveEntityDetails({ event, teamId, connection });
	const slack = createSlackClient(await connectionBotToken(connection));

	try {
		await slack.entity.presentDetails({
			trigger_id: event.trigger_id,
			...details,
		});
	} catch (err) {
		console.error(
			"[slack/process-entity-details] Failed to present details:",
			err,
		);
	}
}

async function resolveEntityDetails({
	event,
	teamId,
	connection,
}: {
	event: EntityDetailsRequestedEvent;
	teamId: string;
	connection: SelectConnection;
}): Promise<EntityDetails> {
	const taskSlug = parseTaskSlugFromUrl(event.entity_url);
	if (taskSlug) return taskDetails(taskSlug, connection.organizationId);

	const pageSlug = parsePageSlugFromUrl(event.entity_url);
	if (pageSlug) {
		return pageDetails({
			slug: pageSlug,
			organizationId: connection.organizationId,
			slackUserId: event.user,
			teamId,
		});
	}

	console.error(
		"[slack/process-entity-details] Unrecognized entity URL:",
		event.entity_url,
	);
	return { error: { status: "not_found" } };
}

async function taskDetails(
	slug: string,
	organizationId: string,
): Promise<EntityDetails> {
	const task = await db.query.tasks.findFirst({
		where: and(eq(tasks.organizationId, organizationId), eq(tasks.slug, slug)),
		with: {
			status: true,
			assignee: true,
			creator: true,
			organization: true,
		},
	});

	if (!task) {
		console.error("[slack/process-entity-details] Task not found:", slug);
		return {
			error: {
				status: "not_found",
				custom_message: `Task "${slug}" was not found.`,
			},
		};
	}

	const labels = await db
		.select({ name: taskLabels.name })
		.from(taskLabelAssignments)
		.innerJoin(taskLabels, eq(taskLabels.id, taskLabelAssignments.labelId))
		.where(eq(taskLabelAssignments.taskId, task.id))
		.orderBy(asc(taskLabels.name));
	return {
		metadata: createTaskFlexpaneObject({
			...task,
			labels: labels.map((label) => label.name),
		}),
	};
}

/** Pages open for the Slack user viewing them, not the one who posted the link. */
async function pageDetails({
	slug,
	organizationId,
	slackUserId,
	teamId,
}: {
	slug: string;
	organizationId: string;
	slackUserId: string;
	teamId: string;
}): Promise<EntityDetails> {
	const reader = await findSlackUserLink({
		organizationId,
		slackUserId,
		teamId,
	});
	const result = await pagePreview({
		slug,
		organizationId,
		userId: reader?.userId,
	});

	switch (result.status) {
		case "readable":
			return { metadata: createPageWorkObject(result.preview) };
		case "needs_user":
			return {
				user_auth_required: true,
				user_auth_url: generateConnectUrl({ slackUserId, teamId }),
			};
		case "missing":
			return { error: { status: "not_found" } };
	}
}
