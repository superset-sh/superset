import { db } from "@superset/db/client";
import { webhookEvents } from "@superset/db/schema";
import { and, eq, lt } from "drizzle-orm";

/**
 * A reservation older than this with no outcome belongs to a worker that was
 * killed (the job route's maxDuration is 300s). Replaying it could duplicate a
 * workspace or task, so the next delivery tells the user instead of retrying.
 */
export const STALE_DELIVERY_MS = 6 * 60_000;

export type AgentDeliveryClaim =
	| { status: "claimed"; id: string }
	| { status: "duplicate" }
	| { status: "stale" };

function deliveryKey({
	teamId,
	channelId,
	messageTs,
	handoff,
}: {
	teamId: string;
	channelId: string;
	messageTs: string;
	handoff?: string;
}): string {
	const key = `slack-agent:${teamId}:${channelId}:${messageTs}`;
	return handoff ? `${key}:${handoff}` : key;
}

/**
 * Reserve execution independently of QStash's publish deduplication. Key by
 * message so app_mention and message deliveries cannot both execute its tools.
 * No Slack content is retained here. Durable result/outbox recovery belongs to
 * the persistent-session phase.
 */
export async function claimAgentDelivery(params: {
	teamId: string;
	channelId: string;
	messageTs: string;
	/**
	 * A message handed back from the queue is a new delivery: its original
	 * claim may still be mid-release, and it may be handed back more than
	 * once before a turn is free to run it.
	 */
	handoff?: string;
}): Promise<AgentDeliveryClaim> {
	const eventId = deliveryKey(params);
	const [delivery] = await db
		.insert(webhookEvents)
		.values({
			provider: "slack",
			eventId,
			eventType: "slack_agent_message",
			status: "pending",
		})
		.onConflictDoNothing({
			target: [webhookEvents.provider, webhookEvents.eventId],
		})
		.returning({ id: webhookEvents.id });
	if (delivery) return { status: "claimed", id: delivery.id };

	// Whoever flips the stale row to failed owns the one "lost track" notice.
	const [stale] = await db
		.update(webhookEvents)
		.set({
			status: "failed",
			processedAt: new Date(),
			error: "Slack agent worker did not finish; user notified, not replayed",
		})
		.where(
			and(
				eq(webhookEvents.provider, "slack"),
				eq(webhookEvents.eventId, eventId),
				eq(webhookEvents.status, "pending"),
				lt(webhookEvents.receivedAt, new Date(Date.now() - STALE_DELIVERY_MS)),
			),
		)
		.returning({ id: webhookEvents.id });
	return stale ? { status: "stale" } : { status: "duplicate" };
}

/** A message that was queued behind a running turn is re-delivered later. */
export async function releaseAgentDelivery(id: string): Promise<void> {
	await db.delete(webhookEvents).where(eq(webhookEvents.id, id));
}

export async function finishAgentDelivery(
	id: string,
	succeeded: boolean,
): Promise<void> {
	await db
		.update(webhookEvents)
		.set({
			status: succeeded ? "processed" : "failed",
			processedAt: new Date(),
			// Do not retain user content, tool arguments or provider error bodies.
			error: succeeded
				? null
				: "Slack agent delivery failed; inspect before replaying potentially completed actions",
		})
		.where(eq(webhookEvents.id, id));
}
