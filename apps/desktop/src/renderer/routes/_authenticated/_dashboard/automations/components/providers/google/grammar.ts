import { msg } from "@lingui/core/macro";
import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import type { TriggerMenuEntry } from "../types";

export type GmailConfig = Extract<TriggerConfigInput, { kind: "gmail" }>;

/**
 * The sentence a Gmail trigger reads as, as data. Same shape as GitHub's:
 * the event names its own words and slots, and one renderer walks them.
 */

export type GmailSlot =
	| "from"
	| "to"
	| "subjectFilter"
	| "labels"
	| "hasAttachment";

type SentencePart<Slot extends string> = { text: string } | { slot: Slot };

export const GMAIL_SENTENCE: SentencePart<GmailSlot>[] = [
	{ text: "Email received from" },
	{ slot: "from" },
	{ text: "to" },
	{ slot: "to" },
	{ text: "with subject" },
	{ slot: "subjectFilter" },
	{ text: "labeled" },
	{ slot: "labels" },
	{ slot: "hasAttachment" },
];

export const ATTACHMENT_OPTIONS = [
	{
		value: "any",
		label: msg({
			message: "with or without attachments",
		}),
	},
	{
		value: "attachment",
		label: msg({
			message: "with an attachment",
		}),
	},
] as const;

// One leaf, so the Add Trigger menu shows the provider row itself; the label
// only surfaces in search, where "gmail" has to find it.
export const GMAIL_MENU: TriggerMenuEntry<GmailConfig>[] = [
	{
		label: msg({
			message: "Email received in Gmail",
		}),
		create: createGmailConfig,
	},
];

/**
 * The sender is the primary scope and starts unchosen for the same reason a
 * GitHub repository does; the rest default to "any".
 */
function createGmailConfig(): GmailConfig {
	return {
		kind: "gmail",
		event: "message.received",
		from: { mode: "list", ids: [] },
		to: { mode: "any" },
		subjectFilter: null,
		labels: { mode: "any" },
		hasAttachment: false,
	};
}
