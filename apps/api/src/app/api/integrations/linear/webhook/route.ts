import crypto from "node:crypto";
import { db } from "@superset/db/client";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import {
	integrationConnections,
	tasks,
	users,
	webhookEvents,
} from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";
import { mapLinearPriority } from "@/lib/integrations/linear/utils";

interface LinearWebhookPayload {
	action: "create" | "update" | "remove";
	type: "Issue" | "Comment" | "Project";
	createdAt: string;
	organizationId: string;
	webhookId: string;
	webhookTimestamp: number;
	data: LinearIssueData | Record<string, unknown>;
	url?: string;
}

interface LinearIssueData {
	id: string;
	identifier: string;
	title: string;
	description?: string;
	priority: number;
	priorityLabel: string;
	state: {
		id: string;
		name: string;
		type: string;
		color: string;
		position: number;
	};
	team: {
		id: string;
		key: string;
		name: string;
	};
	assignee?: {
		id: string;
		name: string;
		email: string;
	};
	creator?: {
		id: string;
		name: string;
		email: string;
	};
	estimate?: number;
	dueDate?: string;
	branchName?: string;
	startedAt?: string;
	completedAt?: string;
	labels: Array<{
		id: string;
		name: string;
	}>;
	url: string;
	createdAt: string;
	updatedAt: string;
}

function verifyWebhookSignature(
	body: string,
	signature: string,
	secret: string,
): boolean {
	const hmac = crypto.createHmac("sha256", secret);
	hmac.update(body);
	const expectedSignature = hmac.digest("hex");
	return crypto.timingSafeEqual(
		Buffer.from(signature),
		Buffer.from(expectedSignature),
	);
}

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("linear-signature");

	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	let payload: LinearWebhookPayload;
	try {
		payload = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

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

	const isValid = verifyWebhookSignature(
		body,
		signature,
		env.LINEAR_WEBHOOK_SECRET,
	);
	if (!isValid) {
		await db
			.update(webhookEvents)
			.set({ status: "failed", error: "Invalid signature" })
			.where(eq(webhookEvents.id, webhookEvent.id));
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	try {
		if (payload.type === "Issue") {
			await processIssueEvent(payload, connection);
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
	payload: LinearWebhookPayload,
	connection: SelectIntegrationConnection,
) {
	const issue = payload.data as LinearIssueData;

	if (payload.action === "create") {
		const existing = await db.query.tasks.findFirst({
			where: and(
				eq(tasks.externalProvider, "linear"),
				eq(tasks.externalId, issue.id),
			),
		});

		if (existing) return;

		let assigneeId: string | null = null;
		if (issue.assignee?.email) {
			const matchedUser = await db.query.users.findFirst({
				where: eq(users.email, issue.assignee.email),
			});
			assigneeId = matchedUser?.id ?? null;
		}

		await db.insert(tasks).values({
			slug: issue.identifier,
			title: issue.title,
			description: issue.description ?? null,
			status: issue.state.name,
			statusColor: issue.state.color,
			statusType: issue.state.type,
			statusPosition: issue.state.position,
			priority: mapLinearPriority(issue.priority),
			organizationId: connection.organizationId,
			creatorId: connection.connectedByUserId,
			assigneeId,
			estimate: issue.estimate ?? null,
			dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
			labels: issue.labels.map((l) => l.name),
			branch: issue.branchName ?? null,
			startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
			completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
			externalProvider: "linear",
			externalId: issue.id,
			externalKey: issue.identifier,
			externalUrl: issue.url,
			lastSyncedAt: new Date(),
		});
	} else if (payload.action === "update") {
		const existingTask = await db.query.tasks.findFirst({
			where: and(
				eq(tasks.externalProvider, "linear"),
				eq(tasks.externalId, issue.id),
			),
		});

		if (!existingTask) return;

		await db
			.update(tasks)
			.set({
				title: issue.title,
				description: issue.description ?? null,
				status: issue.state.name,
				statusColor: issue.state.color,
				statusType: issue.state.type,
				statusPosition: issue.state.position,
				priority: mapLinearPriority(issue.priority),
				estimate: issue.estimate ?? null,
				dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
				labels: issue.labels.map((l) => l.name),
				branch: issue.branchName ?? null,
				startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
				completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
				externalKey: issue.identifier,
				externalUrl: issue.url,
				lastSyncedAt: new Date(),
				syncError: null,
			})
			.where(eq(tasks.id, existingTask.id));
	} else if (payload.action === "remove") {
		const existingTask = await db.query.tasks.findFirst({
			where: and(
				eq(tasks.externalProvider, "linear"),
				eq(tasks.externalId, issue.id),
			),
		});

		if (!existingTask) return;

		await db
			.update(tasks)
			.set({ deletedAt: new Date() })
			.where(eq(tasks.id, existingTask.id));
	}
}
