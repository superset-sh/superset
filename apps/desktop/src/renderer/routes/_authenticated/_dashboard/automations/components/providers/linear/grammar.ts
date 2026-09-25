import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	LinearTriggerEvent,
	TriggerConfigInput,
} from "@superset/shared/automation-triggers";
import type { TriggerMenuEntry } from "../types";

export type LinearConfig = Extract<TriggerConfigInput, { kind: "linear" }>;

/**
 * The sentence a Linear trigger reads as. Same shape as GitHub's grammar: the
 * words and slots per event as data, so the row renders one way and every
 * event describes itself.
 */

export type Slot = "teams" | "projects" | "labels" | "toStatus" | "assignee";

export type SentencePart = { text: string } | { slot: Slot };

export const LINEAR_SENTENCES: Record<LinearTriggerEvent, SentencePart[]> = {
	"issue.created": [
		{ text: "Issue created in" },
		{ slot: "teams" },
		{ text: "in" },
		{ slot: "projects" },
		{ text: "with label" },
		{ slot: "labels" },
	],
	"issue.status_changed": [
		{ text: "Issue moved to" },
		{ slot: "toStatus" },
		{ text: "in" },
		{ slot: "teams" },
		{ text: "in" },
		{ slot: "projects" },
		{ text: "with label" },
		{ slot: "labels" },
		{ text: "assigned to" },
		{ slot: "assignee" },
	],
	"issue.assigned": [
		{ text: "Issue assigned to" },
		{ slot: "assignee" },
		{ text: "in" },
		{ slot: "teams" },
		{ text: "in" },
		{ slot: "projects" },
		{ text: "with label" },
		{ slot: "labels" },
	],
	"cycle.ended": [{ text: "Cycle ended in" }, { slot: "teams" }],
};

export const LINEAR_MENU: TriggerMenuEntry<LinearConfig>[] = [
	{
		label: msg({
			message: "Issue…",
		}),
		children: [
			leaf(
				msg({
					message: "Created",
				}),
				"issue.created",
			),
			leaf(
				msg({
					message: "Status changed",
				}),
				"issue.status_changed",
			),
			leaf(
				msg({
					message: "Assigned",
				}),
				"issue.assigned",
			),
		],
	},
	leaf(
		msg({
			message: "Cycle ended",
		}),
		"cycle.ended",
	),
];

function leaf(label: MessageDescriptor, event: LinearTriggerEvent) {
	return { label, create: () => createLinearConfig(event) };
}

/**
 * A new trigger of this event: the team still to be chosen, every optional
 * filter wide open. An empty team list matches nothing, so an unfinished
 * trigger cannot fire on every team; the optional narrowings start at "any"
 * because an empty list would read as "Any project" while matching nothing.
 */
export function createLinearConfig(event: LinearTriggerEvent): LinearConfig {
	return {
		kind: "linear",
		event,
		teams: { mode: "list", ids: [] },
		projects: { mode: "any" },
		labels: { mode: "any" },
		toStatus: { mode: "any" },
		assignee: { mode: "any" },
	};
}
