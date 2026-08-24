import { buildConflictUpdateColumns, db } from "@superset/db";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import {
	integrationConnections,
	members,
	tasks,
	users,
	webhookEvents,
} from "@superset/db/schema";
import {
	callPlain,
	ensurePlainStatuses,
	fetchThread,
	mapThreadToTask,
} from "@superset/trpc/integrations/plain";
import { and, asc, eq, isNull } from "drizzle-orm";
import { recordWebhookDelivery } from "@/lib/ingest/recordWebhookDelivery";
import { stripNullChars } from "@/lib/strip-null-chars";
import { verifyPlainSignature } from "./verify-signature";

const PLAIN_SIGNATURE_HEADER = "plain-request-signature";

/**
 * Thread lifecycle events that change fields we sync. Message-level events
 * (email_received, chat_received, ...) are deliberately ignored.
 */
const THREAD_SYNC_EVENT_TYPES = new Set([
	"thread.thread_created",
	"thread.thread_status_transitioned",
	"thread.thread_priority_changed",
	"thread.thread_assignment_transitioned",
	"thread.thread_labels_changed",
]);

interface PlainWebhookEnvelope {
	id: string;
	type: string;
	timestamp: string;
	workspaceId: string;
	payload: { eventType?: string; thread?: { id: string } };
}

function parseEnvelope(body: string): PlainWebhookEnvelope | null {
	try {
		const parsed = JSON.parse(body) as Partial<PlainWebhookEnvelope>;
		if (
			typeof parsed.id !== "string" ||
			typeof parsed.type !== "string" ||
			typeof parsed.workspaceId !== "string" ||
			typeof parsed.payload !== "object" ||
			parsed.payload === null
		) {
			return null;
		}
		return parsed as PlainWebhookEnvelope;
	} catch {
		return null;
	}
}

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get(PLAIN_SIGNATURE_HEADER);

	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const envelope = parseEnvelope(body);
	if (!envelope) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const connections = await db.query.integrationConnections.findMany({
		where: and(
			eq(integrationConnections.externalOrgId, envelope.workspaceId),
			eq(integrationConnections.provider, "plain"),
			isNull(integrationConnections.disconnectedAt),
		),
		orderBy: [asc(integrationConnections.id)],
	});

	if (connections.length === 0) {
		console.log(
			"[plain/webhook] No active connections for Plain workspace:",
			envelope.workspaceId,
		);
		return Response.json({ success: true, status: "no_subscribers" });
	}

	// Plain's request-signing secret is workspace-global, so verification is
	// per connection: a connection whose stored secret doesn't match is stale
	// (rotated secret) and must not receive the event.
	const verifiedConnections = connections.filter(
		(connection) =>
			connection.webhookSecret &&
			verifyPlainSignature(body, signature, connection.webhookSecret),
	);

	if (verifiedConnections.length === 0) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	if (!THREAD_SYNC_EVENT_TYPES.has(envelope.type)) {
		return Response.json({ success: true, status: "ignored" });
	}

	const results = await Promise.all(
		verifiedConnections.map((connection) =>
			processForConnection(envelope, connection).catch((error) => ({
				connectionId: connection.id,
				outcome: "failed" as const,
				error: error instanceof Error ? error.message : "Unknown error",
			})),
		),
	);

	const anyFailed = results.some((r) => r.outcome === "failed");
	const allFailed = results.every((r) => r.outcome === "failed");
	if (anyFailed) {
		console.error("[plain/webhook] processing failures:", results);
	}
	// Any failure returns 500 so Plain redelivers; per-connection rows in
	// webhookEvents make redelivery a no-op for the connections that succeeded.
	return Response.json(
		{
			success: !anyFailed,
			status: allFailed
				? "failed"
				: anyFailed
					? "partial_failure"
					: "processed",
		},
		{ status: anyFailed ? 500 : 200 },
	);
}

async function processForConnection(
	envelope: PlainWebhookEnvelope,
	connection: SelectIntegrationConnection,
): Promise<{
	connectionId: string;
	outcome: "processed" | "skipped" | "failed";
	error?: string;
}> {
	// One webhookEvents row per (Plain event × Superset connection) so each
	// tenant's processing status is independently retryable.
	const eventId = `${connection.id}-${envelope.id}`;

	const webhookEvent = await recordWebhookDelivery({
		provider: "plain",
		eventId,
		eventType: envelope.type,
		payload: stripNullChars(envelope),
	});

	if (!webhookEvent) {
		return {
			connectionId: connection.id,
			outcome: "failed",
			error: "Failed to store event",
		};
	}

	if (webhookEvent.status === "processed") {
		return { connectionId: connection.id, outcome: "processed" };
	}
	if (webhookEvent.status !== "pending") {
		return { connectionId: connection.id, outcome: "skipped" };
	}

	try {
		const outcome = await syncThreadForConnection(envelope, connection);

		await db
			.update(webhookEvents)
			.set({ status: outcome, processedAt: new Date() })
			.where(eq(webhookEvents.id, webhookEvent.id));

		return { connectionId: connection.id, outcome };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await db
			.update(webhookEvents)
			.set({
				status: "failed",
				error: message,
				retryCount: webhookEvent.retryCount + 1,
			})
			.where(eq(webhookEvents.id, webhookEvent.id));

		return { connectionId: connection.id, outcome: "failed", error: message };
	}
}

async function syncThreadForConnection(
	envelope: PlainWebhookEnvelope,
	connection: SelectIntegrationConnection,
): Promise<"processed" | "skipped"> {
	const threadId = envelope.payload.thread?.id;
	if (!threadId) {
		console.warn(
			`[plain/webhook] Event ${envelope.type} has no thread id, skipping`,
		);
		return "skipped";
	}

	// Webhook thread payloads lack `ref` and `description`, so the thread is
	// refetched instead of trusting the (possibly stale, retried) payload.
	// callPlain marks the connection disconnected when the key was revoked.
	const thread = await callPlain(connection.organizationId, (client) =>
		fetchThread(client, threadId),
	);
	if (thread === null) {
		// Distinguish "no usable connection" (final) from "thread not readable
		// yet" (retryable): a thrown error keeps the event row failed so
		// Plain's redelivery re-drives it.
		const stillConnected = await db.query.integrationConnections.findFirst({
			where: and(
				eq(integrationConnections.id, connection.id),
				isNull(integrationConnections.disconnectedAt),
			),
			columns: { id: true },
		});
		if (!stillConnected) {
			return "skipped";
		}
		throw new Error(`Thread ${threadId} not readable yet`);
	}

	const statusByExternalId = await ensurePlainStatuses(
		connection.organizationId,
	);

	const userByEmail = new Map<string, string>();
	const assignee = thread.assignedTo;
	if (assignee?.__typename === "User" && assignee.email) {
		const matchedMember = await db
			.select({ userId: users.id, email: users.email })
			.from(users)
			.innerJoin(members, eq(members.userId, users.id))
			.where(
				and(
					eq(users.email, assignee.email),
					eq(members.organizationId, connection.organizationId),
				),
			)
			.limit(1)
			.then((rows) => rows[0]);
		if (matchedMember) {
			userByEmail.set(matchedMember.email, matchedMember.userId);
		}
	}

	const taskValues = mapThreadToTask(
		thread,
		connection.organizationId,
		connection.connectedByUserId,
		userByEmail,
		statusByExternalId,
	);
	if (!taskValues) {
		return "skipped";
	}

	await db
		.insert(tasks)
		.values(taskValues)
		.onConflictDoUpdate({
			target: [tasks.organizationId, tasks.externalProvider, tasks.externalId],
			set: {
				...buildConflictUpdateColumns(tasks, [
					"slug",
					"title",
					"description",
					"statusId",
					"priority",
					"assigneeId",
					"assigneeExternalId",
					"assigneeDisplayName",
					"assigneeAvatarUrl",
					"labels",
					"completedAt",
					"externalKey",
					"lastSyncedAt",
				]),
				syncError: null,
			},
		});

	return "processed";
}
