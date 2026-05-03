import type { EntityWebhookPayloadWithIssueData } from "@linear/sdk/webhooks";
import {
	LINEAR_WEBHOOK_SIGNATURE_HEADER,
	LinearWebhookClient,
} from "@linear/sdk/webhooks";
import { db, dbWs } from "@superset/db/client";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import {
	integrationConnections,
	members,
	taskStatuses,
	tasks,
	teamKeys,
	teams,
	users,
	webhookEvents,
} from "@superset/db/schema";
import { allocateNextTaskNumber } from "@superset/db/teams";
import { mapPriorityFromLinear } from "@superset/trpc/integrations/linear";
import { and, eq, isNull, sql } from "drizzle-orm";
import { env } from "@/env";

const webhookClient = new LinearWebhookClient(env.LINEAR_WEBHOOK_SECRET);

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get(LINEAR_WEBHOOK_SIGNATURE_HEADER);

	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const payload = webhookClient.parseData(Buffer.from(body), signature);

	// Store event with idempotent handling
	const eventId = `${payload.organizationId}-${payload.webhookTimestamp}`;

	const [webhookEvent] = await db
		.insert(webhookEvents)
		.values({
			provider: "linear",
			eventId,
			eventType: `${payload.type}.${payload.action}`,
			payload,
			status: "pending",
		})
		.onConflictDoUpdate({
			target: [webhookEvents.provider, webhookEvents.eventId],
			set: {
				// Reset for reprocessing only if previously failed
				status: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN 'pending' ELSE ${webhookEvents.status} END`,
				retryCount: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN ${webhookEvents.retryCount} + 1 ELSE ${webhookEvents.retryCount} END`,
				error: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN NULL ELSE ${webhookEvents.error} END`,
			},
		})
		.returning();

	if (!webhookEvent) {
		return Response.json({ error: "Failed to store event" }, { status: 500 });
	}

	// Idempotent: skip if already processed or not ready for processing
	if (webhookEvent.status === "processed") {
		console.log("[linear/webhook] Event already processed:", eventId);
		return Response.json({ success: true, message: "Already processed" });
	}
	if (webhookEvent.status !== "pending") {
		console.log(
			`[linear/webhook] Event in ${webhookEvent.status} state:`,
			eventId,
		);
		return Response.json({ success: true, message: "Event not ready" });
	}

	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.externalOrgId, payload.organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	if (!connection) {
		await db
			.update(webhookEvents)
			.set({ status: "skipped", error: "No connection found" })
			.where(eq(webhookEvents.id, webhookEvent.id));
		return Response.json({ error: "Unknown organization" }, { status: 404 });
	}

	try {
		let status: "processed" | "skipped" = "processed";

		if (payload.type === "Issue") {
			status = await processIssueEvent(
				payload as EntityWebhookPayloadWithIssueData,
				connection,
			);
		}

		await db
			.update(webhookEvents)
			.set({
				status,
				processedAt: new Date(),
			})
			.where(eq(webhookEvents.id, webhookEvent.id));

		return Response.json({ success: true });
	} catch (error) {
		await db
			.update(webhookEvents)
			.set({
				status: "failed",
				error: error instanceof Error ? error.message : "Unknown error",
				retryCount: webhookEvent.retryCount + 1,
			})
			.where(eq(webhookEvents.id, webhookEvent.id));

		return Response.json({ error: "Processing failed" }, { status: 500 });
	}
}

async function processIssueEvent(
	payload: EntityWebhookPayloadWithIssueData,
	connection: SelectIntegrationConnection,
): Promise<"processed" | "skipped"> {
	const issue = payload.data;

	if (payload.action === "create" || payload.action === "update") {
		if (!issue.team?.id) {
			console.warn(
				`[webhook] Issue ${issue.identifier} arrived without a team payload — skipping`,
			);
			return "skipped";
		}

		const linkedTeam = await db
			.select({ id: teams.id })
			.from(teams)
			.where(
				and(
					eq(teams.organizationId, connection.organizationId),
					eq(teams.externalProvider, "linear"),
					eq(teams.externalId, issue.team.id),
				),
			)
			.limit(1)
			.then((rows) => rows[0]);

		if (!linkedTeam) {
			console.log(
				`[webhook] Issue ${issue.identifier} from Linear team ${issue.team.id} is not linked to any Superset team — skipping`,
			);
			return "skipped";
		}

		const taskStatus = await db.query.taskStatuses.findFirst({
			where: and(
				eq(taskStatuses.organizationId, connection.organizationId),
				eq(taskStatuses.externalProvider, "linear"),
				eq(taskStatuses.externalId, issue.state.id),
			),
		});

		if (!taskStatus) {
			// TODO(SUPER-237): Handle new workflow states in webhooks by triggering syncWorkflowStates
			// Currently webhooks silently fail when Linear has new statuses that aren't synced yet.
			// Should either: (1) trigger workflow state sync and retry, (2) queue for retry, or (3) keep periodic sync only
			console.warn(
				`[webhook] Status not found for state ${issue.state.id}, skipping update`,
			);
			return "skipped";
		}

		let assigneeId: string | null = null;
		if (issue.assignee?.email) {
			const matchedMember = await db
				.select({ userId: users.id })
				.from(users)
				.innerJoin(members, eq(members.userId, users.id))
				.where(
					and(
						eq(users.email, issue.assignee.email),
						eq(members.organizationId, connection.organizationId),
					),
				)
				.limit(1)
				.then((rows) => rows[0]);
			assigneeId = matchedMember?.userId ?? null;
		}

		let assigneeExternalId: string | null = null;
		let assigneeDisplayName: string | null = null;
		let assigneeAvatarUrl: string | null = null;

		if (issue.assignee && !assigneeId) {
			assigneeExternalId = issue.assignee.id;
			assigneeDisplayName = issue.assignee.name ?? null;
			assigneeAvatarUrl = issue.assignee.avatarUrl ?? null;
		}

		const updateableTaskData = {
			title: issue.title,
			description: issue.description ?? null,
			statusId: taskStatus.id,
			priority: mapPriorityFromLinear(issue.priority),
			assigneeId,
			assigneeExternalId,
			assigneeDisplayName,
			assigneeAvatarUrl,
			estimate: issue.estimate ?? null,
			dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
			labels: issue.labels.map((l) => l.name),
			startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
			completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
			externalProvider: "linear" as const,
			externalId: issue.id,
			externalKey: issue.identifier,
			externalUrl: issue.url,
			lastSyncedAt: new Date(),
		};

		await dbWs.transaction(async (tx) => {
			const [existing] = await tx
				.select({ id: tasks.id })
				.from(tasks)
				.where(
					and(
						eq(tasks.organizationId, connection.organizationId),
						eq(tasks.externalProvider, "linear"),
						eq(tasks.externalId, issue.id),
					),
				)
				.limit(1);

			if (existing) {
				await tx
					.update(tasks)
					.set({ ...updateableTaskData, syncError: null })
					.where(eq(tasks.id, existing.id));
				return;
			}

			const number = await allocateNextTaskNumber(linkedTeam.id, tx);
			const [teamKey] = await tx
				.select({ key: teamKeys.key })
				.from(teamKeys)
				.where(
					and(eq(teamKeys.teamId, linkedTeam.id), isNull(teamKeys.retiredAt)),
				)
				.limit(1);
			if (!teamKey) {
				throw new Error(`No current key for team ${linkedTeam.id}`);
			}

			await tx.insert(tasks).values({
				...updateableTaskData,
				slug: `${teamKey.key}-${number}`,
				teamId: linkedTeam.id,
				number,
				organizationId: connection.organizationId,
				creatorId: connection.connectedByUserId,
				createdAt: new Date(issue.createdAt),
			});
		});
	} else if (payload.action === "remove") {
		await db
			.update(tasks)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(tasks.externalProvider, "linear"),
					eq(tasks.externalId, issue.id),
				),
			);
	}

	return "processed";
}
