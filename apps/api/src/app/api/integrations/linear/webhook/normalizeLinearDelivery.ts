import {
	type LinearMatchableEvent,
	linearEventNames,
} from "@superset/shared/automation-matching";
import type { NormalizedDelivery } from "@/lib/automations/ingestAutomationEvent";

/**
 * Normalizes a Linear delivery into the `automation_events` row for one
 * connection.
 *
 * Only deliveries a trigger could name are recorded. Linear sends every
 * attachment and comment edit to the same webhook, and most `Issue.update`
 * deliveries touch nothing a trigger filters on; keeping a payload copy of all
 * of them would be the bulk of the table for nothing anyone can match.
 */

/** The parts of a Linear webhook payload matching and prompting read. */
export type LinearDelivery = {
	type: string;
	action: string;
	actor?: { id?: string; name?: string; type?: string } | null;
	organizationId: string;
	webhookTimestamp: number;
	/** Previous values of every property an update touched. */
	updatedFrom?: Record<string, unknown> | null;
	url?: string | null;
	data: {
		id: string;
		title?: string;
		identifier?: string;
		name?: string;
		number?: number;
		url?: string;
		teamId?: string | null;
		projectId?: string | null;
		stateId?: string | null;
		assigneeId?: string | null;
		labelIds?: string[];
		completedAt?: string | null;
	};
};

/**
 * Normalizes a Linear delivery into what Linear triggers filter on. The
 * columns on `automation_events` are what every provider shares; this is what
 * Linear adds, all of it read off the entity in the payload.
 */
export function matchableFrom(delivery: LinearDelivery): LinearMatchableEvent {
	const { data } = delivery;
	return {
		provider: "linear",
		eventType: `${delivery.type}.${delivery.action}`,
		names: linearEventNames({
			type: delivery.type,
			action: delivery.action,
			updatedFrom: delivery.updatedFrom ?? null,
			assigneeId: data.assigneeId ?? null,
			completedAt: data.completedAt ?? null,
		}),
		actorId: delivery.actor?.id ?? null,
		actorLogin: delivery.actor?.name ?? null,
		body: null,
		teamId: data.teamId ?? null,
		projectId: data.projectId ?? null,
		stateId: data.stateId ?? null,
		assigneeId: data.assigneeId ?? null,
		labelIds: data.labelIds ?? [],
	};
}

/** Linear ids are stable across renames, so the entity id is the key. */
export function resourceKeyFor(delivery: LinearDelivery): string {
	return `linear:${delivery.type.toLowerCase()}:${delivery.data.id}`;
}

export function titleFor(delivery: LinearDelivery): string {
	const { data } = delivery;
	if (data.title) {
		return data.identifier ? `${data.identifier} ${data.title}` : data.title;
	}
	if (data.name) return data.name;
	if (data.number !== undefined) return `${delivery.type} ${data.number}`;
	return `${delivery.type}.${delivery.action}`;
}

export function normalizeLinearDelivery(params: {
	delivery: LinearDelivery;
	event: LinearMatchableEvent;
	/** Linear's delivery id when the header carried one; a redelivery reuses it. */
	deliveryId: string;
	connection: { id: string; organizationId: string };
	webhookEventId: string;
}): NormalizedDelivery {
	const { delivery, event, connection } = params;
	return {
		event: {
			organizationId: connection.organizationId,
			integrationConnectionId: connection.id,
			provider: "linear",
			eventType: event.eventType,
			externalEventId: params.deliveryId,
			resourceKey: resourceKeyFor(delivery),
			title: titleFor(delivery),
			url: delivery.url ?? delivery.data.url ?? null,
			actorLogin: delivery.actor?.name ?? null,
			payload: delivery,
			webhookEventId: params.webhookEventId,
		},
		dispatch: { event },
	};
}
