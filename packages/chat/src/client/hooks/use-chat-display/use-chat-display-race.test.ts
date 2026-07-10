// This test proves the dual-poll race that causes the message flicker.
//
// The race: getDisplayState fires first (tick A), returns isRunning=true
// with currentMessage pointing at assistantId "a_current".
// listMessages fires second (tick B), returns history that already includes
// "a_current" with stopReason=undefined (still in-flight).
//
// Without the withoutActiveTurnAssistantHistory dedupe filter the message
// renders twice: once from currentMessage, once from historicalMessages.
// WITH the filter the message is supposed to be suppressed in history —
// but the filter only suppresses assistant messages that have NO stopReason.
//
// The BUG (M1 from the red-hat review): if the optimistic user message is
// appended AFTER history, findLastUserMessageIndex lands on the OPTIMISTIC
// message (the last user message), making activeTurnMessages = [] and the
// dedupe filter a no-op. In the flicker scenario, this means both the
// currentMessage slot AND the history slot render the same assistant text.

import { describe, expect, it } from "bun:test";
import type { inferRouterOutputs } from "@trpc/server";
import type { ChatRuntimeServiceRouter } from "../../../server/trpc";
import { withoutActiveTurnAssistantHistory } from "./use-chat-display";

type RouterOutputs = inferRouterOutputs<ChatRuntimeServiceRouter>;
type SessionOutputs = RouterOutputs["session"];
type ListMessagesOutput = SessionOutputs["listMessages"];
type DisplayStateOutput = SessionOutputs["getDisplayState"];

function userMessage(id: string, text: string): ListMessagesOutput[number] {
	return {
		id,
		role: "user",
		content: [{ type: "text", text }],
		createdAt: new Date("2026-02-26T00:00:00.000Z"),
	} as unknown as ListMessagesOutput[number];
}

function assistantMessage(
	id: string,
	text: string,
	stopReason?: string,
): ListMessagesOutput[number] {
	return {
		id,
		role: "assistant",
		stopReason,
		content: [{ type: "text", text }],
		createdAt: new Date("2026-02-26T00:00:00.000Z"),
	} as unknown as ListMessagesOutput[number];
}

function asCurrentMessage(
	message: ListMessagesOutput[number],
): DisplayStateOutput["currentMessage"] {
	return message as unknown as DisplayStateOutput["currentMessage"];
}

/**
 * Regression guard — proves dual-poll race causes duplicate message rendering.
 *
 * Scenario (matches the flicker UX exactly):
 *   1. User sends message U1.
 *   2. ChatPaneInterface injects an optimistic user message O1 and appends
 *      it to historicalMessages via setData (ChatPaneInterface.tsx:326).
 *   3. getDisplayState poll (tick A) returns: isRunning=true, currentMessage=A1.
 *   4. listMessages poll (tick B, different tick) returns: [U1, A1_in_history]
 *      where A1_in_history has no stopReason yet (still streaming).
 *   5. useChatDisplay.messages = withoutActiveTurnAssistantHistory(
 *        [...historicalMessages, O1_optimistic],  <-- O1 is LAST user message
 *        currentMessage=A1, isRunning=true)
 *
 * Expected: A1 is suppressed from history because it is still being streamed
 *           (no stopReason) and matches currentMessage id.
 *
 * Actual: findLastUserMessageIndex finds O1 (the optimistic message at the
 *         tail), so activeTurnMessages = [] (empty slice after O1), and the
 *         dedup filter has nothing to remove. A1 remains in history AND
 *         appears in currentMessage → the message renders TWICE.
 */
describe("dual-poll race — flicker reproduction", () => {
	it("suppresses in-flight assistant message from history when optimistic user message was appended after it", () => {
		// History from listMessages (tick B): contains committed U1 + in-flight A1
		const historicalMessagesFromListMessages: ListMessagesOutput = [
			userMessage("u_1", "edit readme"),
			assistantMessage("a_1", "Let me read the file..."), // no stopReason → in-flight
		];

		// ChatPaneInterface.tsx:326 appended an optimistic user message AFTER
		// the existing history via setData. This is what happens when sendMessage
		// fires and ChatPaneInterface injects the optimistic message into the
		// listMessages cache. In useChatDisplay, this arrives as historicalMessages
		// = [...existing, optimisticMessage] on the NEXT render cycle.
		const optimisticUserMessage = userMessage("optimistic-123", "edit readme");
		const historicalPlusOptimistic: ListMessagesOutput = [
			...historicalMessagesFromListMessages,
			optimisticUserMessage,
		];

		// currentMessage from getDisplayState (tick A): same a_1 still streaming
		const currentMessage = asCurrentMessage(
			assistantMessage("a_1", "Let me read the file..."),
		);

		// This is what useChatDisplay.messages actually computes (line 208-217):
		const result = withoutActiveTurnAssistantHistory({
			messages: historicalPlusOptimistic,
			currentMessage,
			isRunning: true,
		});

		// EXPECTED: a_1 should NOT appear in the message list because it is the
		// active-turn message being streamed (no stopReason, matches currentMessage id).
		// The only messages should be u_1 (the real user message). The optimistic
		// user message may or may not be present — that's a separate concern.
		const assistantIds = result
			.filter((m) => m.role === "assistant")
			.map((m) => m.id);

		// THIS ASSERTION FAILS because the filter uses findLastUserMessageIndex
		// which returns the index of "optimistic-123" (the last user message),
		// making activeTurnMessages = [] and dedup a no-op.
		expect(assistantIds).toEqual([]); // a_1 should be filtered out
	});

	// Multi-turn coverage: guards against findLastUserMessageIndex over-skipping
	// into prior turns. The turn boundary must anchor on u_2 (the latest real
	// user message), so previousTurns = [u_1, a_1] is preserved verbatim and
	// only a_2 (the in-flight assistant in the active turn) is deduped.
	it("preserves completed assistant messages from prior turns when optimistic user message tails a multi-turn history", () => {
		const historicalPlusOptimistic: ListMessagesOutput = [
			userMessage("u_1", "first prompt"),
			assistantMessage("a_1", "first reply.", "end_turn"), // completed prior turn
			userMessage("u_2", "second prompt"),
			assistantMessage("a_2", "thinking..."), // in-flight, no stopReason
			userMessage("optimistic-u_3", "third prompt"), // optimistic, must be skipped
		];

		const currentMessage = asCurrentMessage(
			assistantMessage("a_2", "thinking..."),
		);

		const result = withoutActiveTurnAssistantHistory({
			messages: historicalPlusOptimistic,
			currentMessage,
			isRunning: true,
		});

		// a_1 (completed, prior turn) MUST survive; a_2 (in-flight, active turn)
		// MUST be filtered. If the turn boundary lands on optimistic-u_3, then
		// activeTurnMessages = [] and a_2 leaks through alongside currentMessage,
		// reproducing the duplicate-render bug at turn 2 instead of turn 1.
		const assistantIds = result
			.filter((m) => m.role === "assistant")
			.map((m) => m.id);
		expect(assistantIds).toEqual(["a_1"]);

		// Prior-turn structure (u_1, a_1, u_2) must be preserved in order.
		const ids = result.map((m) => m.id);
		expect(ids.slice(0, 3)).toEqual(["u_1", "a_1", "u_2"]);
	});
});
