import type {
	EntityWebhookPayloadWithIssueData,
	LinearWebhookPayload,
} from "@linear/sdk/webhooks";
import {
	LINEAR_WEBHOOK_SIGNATURE_HEADER,
	LinearWebhookClient,
} from "@linear/sdk/webhooks";
import { db } from "@superset/db/client";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import {
	integrationConnections,
	members,
	taskStatuses,
	tasks,
	users,
	webhookEvents,
} from "@superset/db/schema";
import {
	getLinearClient,
	isLinearAuthError,
	mapPriorityFromLinear,
} from "@superset/trpc/integrations/linear";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { env } from "@/env";
import { ingestAutomationEvent } from "@/lib/automations/ingestAutomationEvent";
import { recordWebhookDelivery } from "@/lib/ingest/recordWebhookDelivery";
import { stripNullChars } from "@/lib/strip-null-chars";
import { verifyHookdeckDelivery } from "@/lib/webhooks/hookdeck";
import {
	type LinearDelivery,
	matchableFrom,
	normalizeLinearDelivery,
} from "./normalizeLinearDelivery";

const webhookClient = new LinearWebhookClient(env.LINEAR_WEBHOOK_SECRET);

export async function POST(request: Request) {
	const body = await request.text();

	// Both paths stay live through a cutover: traffic still arriving straight
	// from Linear verifies as it always has, and rolling back is repointing the
	// URL rather than shipping a deploy.
	const hookdeck = verifyHookdeckDelivery(request, body);
	if (hookdeck instanceof Response) return hookdeck;

	let payload: LinearWebhookPayload;
	if (hookdeck === "verified") {
		// Deliberately not re-checking Linear's signature. Hookdeck verified it
		// at ingest, and Linear's covers a timestamp inside a ±60s replay window
		// that Hookdeck preserves on retry — so checking it here would reject
		// every retry, which is the delivery the gateway exists to save.
		try {
			payload = JSON.parse(body) as LinearWebhookPayload;
		} catch {
			return Response.json({ error: "Malformed payload" }, { status: 400 });
		}
	} else {
		const signature = request.headers.get(LINEAR_WEBHOOK_SIGNATURE_HEADER);
		if (!signature) {
			return Response.json({ error: "Missing signature" }, { status: 401 });
		}
		try {
			payload = parseVerifiedPayload(body, signature);
		} catch (error) {
			console.warn(
				"[linear/webhook] rejected delivery:",
				error instanceof Error ? error.message : error,
			);
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}
	const deliveryId = request.headers.get("linear-delivery");

	const connections = await db.query.integrationConnections.findMany({
		where: and(
			eq(integrationConnections.externalOrgId, payload.organizationId),
			eq(integrationConnections.provider, "linear"),
			isNull(integrationConnections.disconnectedAt),
		),
		orderBy: [asc(integrationConnections.id)],
	});

	if (connections.length === 0) {
		console.log(
			"[linear/webhook] No active connections for Linear org:",
			payload.organizationId,
		);
		return Response.json({ success: true, status: "no_subscribers" });
	}

	const results = await Promise.all(
		connections.map((connection) =>
			processForConnection(payload, deliveryId, connection).catch((error) => ({
				connectionId: connection.id,
				outcome: "failed" as const,
				error: error instanceof Error ? error.message : "Unknown error",
			})),
		),
	);

	const anyFailed = results.some((r) => r.outcome === "failed");
	const allFailed = results.every((r) => r.outcome === "failed");
	if (anyFailed) {
		console.error("[linear/webhook] processing failures:", results);
	}
	return Response.json(
		{
			success: !allFailed,
			status: allFailed
				? "failed"
				: anyFailed
					? "partial_failure"
					: "processed",
		},
		{ status: allFailed ? 500 : 200 },
	);
}

// The SDK only enforces Linear's ±60s replay window when handed the
// timestamp, and the timestamp lives inside the body being verified.
function parseVerifiedPayload(
	body: string,
	signature: string,
): LinearWebhookPayload {
	const { webhookTimestamp } = JSON.parse(body) as {
		webhookTimestamp?: unknown;
	};
	return webhookClient.parseData(
		Buffer.from(body),
		signature,
		typeof webhookTimestamp === "number" ? webhookTimestamp : undefined,
	);
}

async function processForConnection(
	payload: LinearWebhookPayload,
	deliveryId: string | null,
	connection: SelectIntegrationConnection,
): Promise<{
	connectionId: string;
	outcome: "processed" | "skipped" | "failed";
	error?: string;
}> {
	// One webhookEvents row per (Linear event × Superset connection) so each
	// tenant's processing status is independently retryable. Linear's delivery
	// id is stable across its retries; without the header, the timestamp alone
	// collides for bulk edits landing in the same millisecond.
	const entityId = (payload as { data?: { id?: unknown } }).data?.id;
	const eventId = deliveryId
		? `${connection.id}-${deliveryId}`
		: `${connection.id}-${payload.organizationId}-${payload.webhookTimestamp}-${payload.type}-${entityId ?? payload.action}`;

	const webhookEvent = await recordWebhookDelivery({
		provider: "linear",
		eventId,
		eventType: `${payload.type}.${payload.action}`,
		payload: stripNullChars(payload),
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

	// The task mirror and the automation event run independently so a failure
	// in one never suppresses the other. Either failing marks the row `failed`
	// so a redelivery re-runs both: the task upsert is idempotent and the
	// automation event dedupes on delivery id.
	let outcome: "processed" | "skipped" = "processed";
	const failures: string[] = [];

	if (payload.type === "Issue") {
		try {
			outcome = await processIssueEvent(
				payload as EntityWebhookPayloadWithIssueData,
				connection,
			);
		} catch (error) {
			console.error("[linear/webhook] task sync failed:", error);
			failures.push(errorMessage(error));
		}
	}

	if (isEntityDelivery(payload)) {
		try {
			await ingest(payload, deliveryId, connection, webhookEvent.id);
		} catch (error) {
			console.error("[linear/webhook] automation event failed:", error);
			failures.push(errorMessage(error));
		}
	}

	if (failures.length > 0) {
		const message = failures.join("; ");
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

	await db
		.update(webhookEvents)
		.set({ status: outcome, processedAt: new Date() })
		.where(eq(webhookEvents.id, webhookEvent.id));

	return { connectionId: connection.id, outcome };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}

/** Entity deliveries carry `data`; OAuth and notification payloads do not. */
function isEntityDelivery(payload: unknown): payload is LinearDelivery {
	const data = (payload as { data?: { id?: unknown } }).data;
	return typeof data?.id === "string";
}

async function ingest(
	delivery: LinearDelivery,
	deliveryHeader: string | null,
	connection: SelectIntegrationConnection,
	webhookEventId: string,
): Promise<void> {
	const event = matchableFrom(delivery);
	// Nothing in the product names this delivery, so there is nothing to record.
	if (event.names.length === 0) return;

	// Linear's per-delivery id is stable across its retries. The payload itself
	// carries no such id, so without the header the entity and send time stand
	// in for one.
	const deliveryId =
		deliveryHeader ??
		`${delivery.type}:${delivery.data.id}:${delivery.webhookTimestamp}`;

	await ingestAutomationEvent(
		db,
		normalizeLinearDelivery({
			delivery,
			event,
			deliveryId,
			connection,
			webhookEventId,
		}),
	);
}

// `branchName` is derived by Linear from the identifier + title and is not
// part of the webhook payload, so it needs its own fetch. Returns null when
// there is no usable connection or value; transient request failures are
// rethrown so the webhook-event retry path re-runs the sync instead of
// recording a processed event with a stale branch.
async function fetchIssueBranchName(
	organizationId: string,
	issueId: string,
): Promise<string | null> {
	const client = await getLinearClient(organizationId);
	if (!client) return null;
	try {
		const response = await client.client.request<
			{ issue: { branchName: string } | null },
			{ id: string }
		>(`query IssueBranchName($id: String!) { issue(id: $id) { branchName } }`, {
			id: issueId,
		});
		return response.issue?.branchName || null;
	} catch (error) {
		// A broken connection won't heal on retry — sync the rest of the
		// event without the branch rather than failing it forever.
		if (isLinearAuthError(error)) {
			console.warn(
				`[linear/webhook] auth error fetching branchName for issue ${issueId}, skipping branch:`,
				error,
			);
			return null;
		}
		throw error;
	}
}

async function processIssueEvent(
	payload: EntityWebhookPayloadWithIssueData,
	connection: SelectIntegrationConnection,
): Promise<"processed" | "skipped"> {
	const issue = payload.data;

	if (payload.action === "create" || payload.action === "update") {
		const externalUpdatedAt = new Date(issue.updatedAt);

		const [taskStatus, existing] = await Promise.all([
			db.query.taskStatuses.findFirst({
				where: and(
					eq(taskStatuses.organizationId, connection.organizationId),
					eq(taskStatuses.externalProvider, "linear"),
					eq(taskStatuses.externalId, issue.state.id),
				),
			}),
			db.query.tasks.findFirst({
				where: and(
					eq(tasks.organizationId, connection.organizationId),
					eq(tasks.externalProvider, "linear"),
					eq(tasks.externalId, issue.id),
				),
				columns: { externalUpdatedAt: true },
			}),
		]);

		// Either our own write coming back through Linear, or a redelivery that
		// a later edit has already overtaken. Applying it would revert whatever
		// the newer write left behind. Checked here, ahead of the branchName
		// fetch below, so an echo costs no Linear API call; the upsert's
		// setWhere is what makes the decision atomic.
		if (
			existing?.externalUpdatedAt &&
			existing.externalUpdatedAt >= externalUpdatedAt
		) {
			return "processed";
		}

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

		const branchName = await fetchIssueBranchName(
			connection.organizationId,
			issue.id,
		);

		const taskData = {
			slug: issue.identifier,
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
			...(branchName ? { branch: branchName } : {}),
			startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
			completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
			externalProvider: "linear" as const,
			externalId: issue.id,
			externalKey: issue.identifier,
			externalUrl: issue.url,
			...(issue.project !== undefined
				? {
						externalProjectId: issue.project?.id ?? null,
						externalProjectName: issue.project?.name ?? null,
					}
				: {}),
			...(issue.cycle !== undefined
				? {
						externalCycleId: issue.cycle?.id ?? null,
						externalCycleName: issue.cycle?.name ?? null,
					}
				: {}),
			externalUpdatedAt,
			lastSyncedAt: new Date(),
		};

		await db
			.insert(tasks)
			.values({
				...taskData,
				organizationId: connection.organizationId,
				creatorId: connection.connectedByUserId,
				createdAt: new Date(issue.createdAt),
			})
			.onConflictDoUpdate({
				target: [
					tasks.organizationId,
					tasks.externalProvider,
					tasks.externalId,
				],
				set: { ...taskData, syncError: null },
				// The read above can go stale before this runs, and two deliveries
				// for one issue can race here.
				setWhere: sql`${tasks.externalUpdatedAt} IS NULL OR ${tasks.externalUpdatedAt} < excluded.external_updated_at`,
			});
	} else if (payload.action === "remove") {
		await db
			.update(tasks)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(tasks.organizationId, connection.organizationId),
					eq(tasks.externalProvider, "linear"),
					eq(tasks.externalId, issue.id),
				),
			);
	}

	return "processed";
}
