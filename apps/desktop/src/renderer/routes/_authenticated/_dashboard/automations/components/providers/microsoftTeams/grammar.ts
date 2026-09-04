import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	MicrosoftTeamsTriggerEvent,
	TriggerConfigInput,
} from "@superset/shared/automation-triggers";
import type { TriggerMenuEntry } from "../types";

export type MicrosoftTeamsConfig = Extract<
	TriggerConfigInput,
	{ kind: "microsoft_teams" }
>;

/**
 * The sentence a Teams trigger reads as. Same shape as GitHub's grammar: each
 * event names its words and slots, the renderer knows only slots.
 */
export type Slot =
	| "teams"
	| "channels"
	| "actor"
	| "messageFilter"
	| "nameFilter";

export type SentencePart = { text: string } | { slot: Slot };

export const TEAMS_SENTENCES: Record<
	MicrosoftTeamsTriggerEvent,
	SentencePart[]
> = {
	message_in_channel: [
		{ slot: "messageFilter" },
		{ text: "in" },
		{ slot: "teams" },
		{ text: "›" },
		{ slot: "channels" },
		{ text: "by" },
		{ slot: "actor" },
	],
	channel_created: [
		{ text: "Channel created in" },
		{ slot: "teams" },
		{ slot: "nameFilter" },
	],
};

export const TEAMS_MENU: TriggerMenuEntry<MicrosoftTeamsConfig>[] = [
	leaf(
		msg({
			message: "Message in channel",
		}),
		"message_in_channel",
	),
	leaf(
		msg({
			message: "Channel created",
		}),
		"channel_created",
	),
];

function leaf(label: MessageDescriptor, event: MicrosoftTeamsTriggerEvent) {
	return { label, create: () => createTeamsConfig(event) };
}

/**
 * A new trigger of this event: the team still to be chosen, and for a message
 * the channel too. Empty lists for both, so a half-built trigger matches
 * nothing until someone picks — the same safety property as GitHub's
 * repositories.
 */
export function createTeamsConfig(
	event: MicrosoftTeamsTriggerEvent,
): MicrosoftTeamsConfig {
	return {
		kind: "microsoft_teams",
		event,
		teams: { mode: "list", ids: [] },
		// A created channel has no channel to filter on; the slot is absent from
		// its sentence and the matcher ignores the field.
		channels:
			event === "message_in_channel"
				? { mode: "list", ids: [] }
				: { mode: "any" },
		actor: { mode: "any" },
		messageFilter: null,
	};
}
