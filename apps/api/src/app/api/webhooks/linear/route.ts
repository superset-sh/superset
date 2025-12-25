import crypto from "node:crypto";
import { db } from "@superset/db/client";
import {
	integrationConnections,
	tasks,
	webhookEvents,
} from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";

/**
 * Linear webhook payload structure
 */
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

/**
 * Verify webhook signature from Linear
 */
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

/**
 * Map Linear priority (0-4) to our priority enum
 */
function mapLinearPriority(
	linearPriority: number,
): "urgent" | "high" | "medium" | "low" | "none" {
	switch (linearPriority) {
		case 1:
			return "urgent";
		case 2:
			return "high";
		case 3:
			return "medium";
		case 4:
			return "low";
		default:
			return "none";
	}
}

/**
 * Handle Linear webhook
 *
 * POST /api/webhooks/linear
 */
export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("linear-signature");

	if (!signature) {
		console.error("[webhook/linear] Missing signature");
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	let payload: LinearWebhookPayload;
	try {
		payload = JSON.parse(body);
	} catch {
		console.error("[webhook/linear] Invalid JSON payload");
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	// Store the raw webhook event for debugging/replay
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
		console.error("[webhook/linear] Failed to store webhook event");
		return Response.json({ error: "Failed to store event" }, { status: 500 });
	}

	// Find the integration connection to verify the webhook
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.externalOrgId, payload.organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	if (!connection) {
		console.error(
			"[webhook/linear] No connection found for org:",
			payload.organizationId,
		);
		await db
			.update(webhookEvents)
			.set({ status: "skipped", error: "No connection found" })
			.where(eq(webhookEvents.id, webhookEvent.id));
		return Response.json({ error: "Unknown organization" }, { status: 404 });
	}

	// Verify webhook signature using app-level secret from env
	const isValid = verifyWebhookSignature(
		body,
		signature,
		env.LINEAR_WEBHOOK_SECRET,
	);
	if (!isValid) {
		console.error("[webhook/linear] Invalid signature");
		await db
			.update(webhookEvents)
			.set({ status: "failed", error: "Invalid signature" })
			.where(eq(webhookEvents.id, webhookEvent.id));
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	// Check if sync is enabled
	if (!connection.syncEnabled) {
		await db
			.update(webhookEvents)
			.set({ status: "skipped", error: "Sync disabled" })
			.where(eq(webhookEvents.id, webhookEvent.id));
		return Response.json({ message: "Sync disabled, event skipped" });
	}

	// Process the webhook based on type
	try {
		if (payload.type === "Issue") {
			await processIssueEvent(payload, connection.organizationId);
		}
		// Add Comment, Project handling here as needed

		await db
			.update(webhookEvents)
			.set({ status: "processed", processedAt: new Date() })
			.where(eq(webhookEvents.id, webhookEvent.id));

		return Response.json({ success: true });
	} catch (error) {
		console.error("[webhook/linear] Processing error:", error);
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

/**
 * Process Linear Issue events
 */
async function processIssueEvent(
	payload: LinearWebhookPayload,
	_supersetOrgId: string,
) {
	const issue = payload.data as LinearIssueData;

	if (payload.action === "create") {
		// Check if task already exists (idempotency)
		const existing = await db.query.tasks.findFirst({
			where: and(
				eq(tasks.externalProvider, "linear"),
				eq(tasks.externalId, issue.id),
			),
		});

		if (existing) {
			console.log("[webhook/linear] Task already exists:", issue.identifier);
			return;
		}

		// Create new task from Linear issue
		// Note: We need a creator - for now we'll skip tasks without a valid internal creator
		// In a future version, we could create a "system" user or map Linear users
		console.log("[webhook/linear] Creating task from issue:", issue.identifier);

		// For MVP, we'll skip creating tasks from Linear since we don't have user mapping
		// Tasks created in Superset will sync TO Linear, but Linear-created tasks won't sync back
		// This is intentional per the plan - we're not mapping users yet
		console.log(
			"[webhook/linear] Skipping task creation - no user mapping for MVP",
		);
	} else if (payload.action === "update") {
		// Find and update existing task
		const existingTask = await db.query.tasks.findFirst({
			where: and(
				eq(tasks.externalProvider, "linear"),
				eq(tasks.externalId, issue.id),
			),
		});

		if (!existingTask) {
			console.log(
				"[webhook/linear] Task not found for update:",
				issue.identifier,
			);
			return;
		}

		// Update task with Linear data
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

		console.log("[webhook/linear] Updated task:", existingTask.slug);
	} else if (payload.action === "remove") {
		// We don't delete tasks when they're removed from Linear
		// Instead, we could mark them as archived or update their status
		console.log("[webhook/linear] Issue removed:", issue.id);
	}
}
