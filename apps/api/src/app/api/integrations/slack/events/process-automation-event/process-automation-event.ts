import type { SlackEvent } from "@slack/types";
import { db } from "@superset/db/client";
import { accountConnections } from "@superset/trpc/connectors";

import {
	type IngestOutcome,
	ingestAutomationEvent,
} from "@/lib/automations/ingestAutomationEvent";
import {
	isChannelMessage,
	isMessageReaction,
	normalizeSlackDelivery,
	type SlackAutomationEnvelope,
} from "./normalizeSlackDelivery";
import { recordForEachConnection } from "./recordForEachConnection";

export type { SlackAutomationEnvelope } from "./normalizeSlackDelivery";

/**
 * Whether this delivery is one triggers can name. Narrows the envelope so the
 * route can hand it over without re-checking the event type.
 */
export function isAutomationEvent(envelope: {
	team_id: string;
	event_id: string;
	api_app_id?: string;
	authorizations?: SlackAutomationEnvelope["authorizations"];
	event: SlackEvent;
}): envelope is SlackAutomationEnvelope {
	const { event } = envelope;
	switch (event.type) {
		case "message":
			return isChannelMessage(event, envelope);
		case "reaction_added":
			return isMessageReaction(event, envelope);
		case "channel_created":
			return true;
		default:
			return false;
	}
}

/**
 * Records a Slack event and enqueues a run for every trigger it satisfies,
 * once per connection on the workspace.
 *
 * One workspace can be connected by several people, and each of those is a
 * separate account a trigger may be pinned to. Resolving to a single
 * connection bound every delivery to whichever row was touched last, so a
 * trigger pinned to any other one silently stopped matching.
 *
 * Sequential rather than concurrent, for the reason Linear's fan-out
 * documents: neon-http opens a connection per query, and asking for all of
 * them at one instant starves the proxy's pool. The work per connection is a
 * handful of indexed reads and one insert, which is what keeps this inside
 * Slack's three-second window while it stays awaited on the request path.
 */
export async function processAutomationEvent(
	envelope: SlackAutomationEnvelope,
): Promise<IngestOutcome[]> {
	const subscribers = await accountConnections("slack", envelope.team_id);
	if (subscribers.length === 0) {
		return [{ status: "skipped", reason: "unknown workspace" }];
	}

	return recordForEachConnection(subscribers, (connection) =>
		ingestAutomationEvent(
			db,
			normalizeSlackDelivery({
				organizationId: connection.organizationId,
				connectionId: connection.id,
				envelope,
			}),
		),
	);
}
