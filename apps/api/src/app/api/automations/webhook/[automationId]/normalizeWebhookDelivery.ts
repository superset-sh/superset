import { randomUUID } from "node:crypto";

import type { NormalizedDelivery } from "@/lib/automations/ingestAutomationEvent";

export const EVENT_TYPE = "webhook.received";

/**
 * Every authenticated delivery is its own event — there is no dedupe — and
 * fires every enabled webhook trigger on the one automation the URL names.
 */
export function normalizeWebhookDelivery(params: {
	organizationId: string;
	automationId: string;
	payload: Record<string, unknown> | unknown[];
}): NormalizedDelivery {
	return {
		event: {
			organizationId: params.organizationId,
			integrationConnectionId: null,
			provider: "webhook",
			eventType: EVENT_TYPE,
			externalEventId: randomUUID(),
			title: "Webhook",
			payload: params.payload,
		},
		dispatch: {
			automationId: params.automationId,
			event: {
				provider: "webhook",
				eventType: EVENT_TYPE,
				actorId: null,
				actorLogin: null,
				body: null,
			},
		},
	};
}
