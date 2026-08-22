import { z } from "zod";

import type { NormalizedDelivery } from "@/lib/automations/ingestAutomationEvent";

export const EVENT_TYPE = "meeting.completed";

/**
 * The fields matching and the row need. Everything else — notes, action items,
 * transcript, insights — rides along in `payload` for the prompt.
 */
export const meetingSchema = z
	.object({
		id: z.union([z.string().min(1), z.number()]).transform(String),
		name: z.string().default(""),
		tags: z.array(z.string()).default([]),
		attendees: z
			.array(z.object({ email: z.string().nullable().optional() }))
			.default([]),
	})
	.passthrough();

export type CirclebackMeeting = z.infer<typeof meetingSchema>;

/**
 * A Circleback delivery is addressed: the user configured this trigger's URL
 * in Circleback, so only this trigger is a candidate — every other Circleback
 * trigger in the organization has its own URL and gets its own delivery of
 * the same meeting. That is why the dedupe key carries the trigger id and the
 * dispatch is narrowed to the one trigger.
 */
export function normalizeCirclebackDelivery(params: {
	organizationId: string;
	automationId: string;
	triggerId: string;
	meeting: CirclebackMeeting;
	payload: unknown;
}): NormalizedDelivery {
	const { meeting, triggerId } = params;
	return {
		event: {
			organizationId: params.organizationId,
			integrationConnectionId: null,
			provider: "circleback",
			eventType: EVENT_TYPE,
			externalEventId: `${triggerId}:${meeting.id}`,
			resourceKey: `circleback:${meeting.id}`,
			title: meeting.name || meeting.id,
			url: `https://circleback.ai/meetings/${meeting.id}`,
			payload: params.payload,
		},
		dispatch: {
			automationId: params.automationId,
			triggerId,
			event: {
				provider: "circleback",
				eventType: EVENT_TYPE,
				actorId: null,
				actorLogin: null,
				body: null,
				name: meeting.name || null,
				tags: meeting.tags,
				attendeeEmails: meeting.attendees.flatMap((a) =>
					a.email ? [a.email] : [],
				),
			},
		},
	};
}
