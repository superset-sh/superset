import { msg } from "@lingui/core/macro";
import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import type { TriggerMenuEntry } from "../types";

export type CirclebackConfig = Extract<
	TriggerConfigInput,
	{ kind: "circleback" }
>;

/**
 * The one sentence a Circleback trigger reads as. Circleback sends one webhook
 * per finished meeting, so there is one event and three optional narrowings —
 * then the two chips Circleback's side needs: where to post, and what it signs
 * with.
 */
export type Slot =
	| "tags"
	| "attendees"
	| "nameFilter"
	| "endpoint"
	| "signingSecret";

export type SentencePart = { text: string } | { slot: Slot };

export const CIRCLEBACK_SENTENCE: SentencePart[] = [
	{ text: "Meeting ended tagged" },
	{ slot: "tags" },
	{ text: "with attendee" },
	{ slot: "attendees" },
	{ text: "named like" },
	{ slot: "nameFilter" },
	{ slot: "endpoint" },
	{ slot: "signingSecret" },
];

export const CIRCLEBACK_MENU: TriggerMenuEntry<CirclebackConfig>[] = [
	{
		label: msg({
			id: "dashboard.automations.providers.circleback.menuMeetingEnded",
			message: "Meeting ended",
		}),
		create: createCirclebackConfig,
	},
];

/** A new trigger: every narrowing wide open. */
export function createCirclebackConfig(): CirclebackConfig {
	return {
		kind: "circleback",
		event: "meeting.completed",
		tags: { mode: "any" },
		attendees: { mode: "any" },
		nameFilter: null,
	};
}
