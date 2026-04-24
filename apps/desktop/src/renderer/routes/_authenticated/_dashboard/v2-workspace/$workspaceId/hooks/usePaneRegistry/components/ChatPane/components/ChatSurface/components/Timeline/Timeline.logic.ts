/**
 * Pure derivation of the Timeline's renderable row list.
 *
 * Takes a list of Turns (derived from the store) + the session status
 * and emits a flat row list the Timeline.tsx maps over. Grouping
 * decisions (e.g. showing a "Thinking…" indicator after the last
 * assistant part while the session is busy) live here so they are
 * testable in Node without React.
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §2.1.
 */

import type {
	AssistantMessage,
	Part,
	SessionStatus,
	Turn,
	UserMessage,
} from "@superset/chat/shared";

export type TimelineRow =
	| { kind: "turn-user"; turnIndex: number; user: UserMessage; parts: Part[] }
	| {
			kind: "turn-assistant";
			turnIndex: number;
			message: AssistantMessage;
			parts: Part[];
			/** True for the trailing assistant message of the active turn. */
			streaming: boolean;
	  }
	| { kind: "thinking"; turnIndex: number }
	| { kind: "load-earlier"; loading: boolean }
	| { kind: "empty" };

export interface TimelineDerivationInput {
	turns: Turn[];
	status: SessionStatus;
	/** Whether more history is available from the server. */
	historyMore?: boolean;
	/** Whether a loadHistory call is in flight. */
	historyLoading?: boolean;
}

export function deriveTimelineRows(
	input: TimelineDerivationInput,
): TimelineRow[] {
	const rows: TimelineRow[] = [];

	if (input.historyMore || input.historyLoading) {
		rows.push({
			kind: "load-earlier",
			loading: input.historyLoading === true,
		});
	}

	if (input.turns.length === 0) {
		if (rows.length === 0) rows.push({ kind: "empty" });
		return rows;
	}

	input.turns.forEach((turn, turnIndex) => {
		rows.push({
			kind: "turn-user",
			turnIndex,
			user: turn.user,
			parts: turn.parts[turn.user.id] ?? [],
		});

		const lastAssistantIdx = turn.assistant.length - 1;
		turn.assistant.forEach((message, i) => {
			rows.push({
				kind: "turn-assistant",
				turnIndex,
				message,
				parts: turn.parts[message.id] ?? [],
				streaming:
					turn.active &&
					i === lastAssistantIdx &&
					message.time.completed === undefined,
			});
		});

		// Show "Thinking…" indicator when:
		//   - this is the active turn
		//   - session status is busy
		//   - the turn has no assistant messages yet, or the last one has no
		//     visible text/reasoning parts
		if (turn.active && input.status.type === "busy") {
			const hasVisibleAssistantContent = turn.assistant.some((a) =>
				(turn.parts[a.id] ?? []).some(
					(p) => p.type === "text" || p.type === "reasoning",
				),
			);
			if (!hasVisibleAssistantContent) {
				rows.push({ kind: "thinking", turnIndex });
			}
		}
	});

	return rows;
}
