import type { EntityWebhookPayloadWithIssueData } from "@linear/sdk/webhooks";
import {
	LINEAR_WEBHOOK_SIGNATURE_HEADER,
	LinearWebhookClient,
} from "@linear/sdk/webhooks";
import { db } from "@superset/db/client";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import {
	integrationConnections,
	tasks,
	users,
	webhookEvents,
} from "@superset/db/schema";
import { mapPriorityFromLinear } from "@superset/trpc/integrations/linear";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";

const webhookClient = new LinearWebhookClient(env.LINEAR_WEBHOOK_SECRET);

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get(LINEAR_WEBHOOK_SIGNATURE_HEADER);

	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const payload = webhookClient.parseData(Buffer.from(body), signature);

	const [webhookEvent] = await db
		.insert(webhookEvents)
		.values({
			provider: "linear",
			eventId: `${payload.organizationId}-${payload.webhookTimestamp}`,
			eventType: `${payload.type}.${payload.action}`,
			payload: payload as unknown as Record<string, unknown>,
			status: "pending",
		})
		.returning();

	if (!webhookEvent) {
		return Response.json({ error: "Failed to store event" }, { status: 500 });
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
		if (payload.type === "Issue") {
			await processIssueEvent(
				payload as EntityWebhookPayloadWithIssueData,
				connection,
			);
		}

		await db
			.update(webhookEvents)
			.set({ status: "processed", processedAt: new Date() })
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
) {
	const issue = payload.data;

	if (payload.action === "create" || payload.action === "update") {
		let assigneeId: string | null = null;
		if (issue.assignee?.email) {
			const matchedUser = await db.query.users.findFirst({
				where: eq(users.email, issue.assignee.email),
			});
			assigneeId = matchedUser?.id ?? null;
		}

		const taskData = {
			slug: issue.identifier,
			title: issue.title,
			description: issue.description ?? null,
			status: issue.state.name,
			statusColor: issue.state.color,
			statusType: issue.state.type,
			priority: mapPriorityFromLinear(issue.priority),
			assigneeId,
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

		await db
			.insert(tasks)
			.values({
				...taskData,
				organizationId: connection.organizationId,
				creatorId: connection.connectedByUserId,
			})
			.onConflictDoUpdate({
				target: [tasks.externalProvider, tasks.externalId],
				set: { ...taskData, syncError: null },
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
}
