/**
 * Pure selectors over ChatStoreData. React-agnostic; composed into
 * Zustand subscriptions in the Timeline components.
 *
 * `selectTurns` groups messages into (user + assistant[]) turns by
 * `parentID`. Results are WeakMap-cached on the messages+parts pair so
 * turn object identity holds across renders when inputs are unchanged
 * — important for React memo in Turn.tsx. Pattern ported from t3code's
 * threadDerivation.ts.
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §2.1.
 */

import type {
	AssistantMessage,
	Message,
	Part,
	SessionStatus,
	Turn,
	UserMessage,
} from "@superset/chat/shared";
import type { ChatStoreData } from "./chatStore.logic";

// ---------------------------------------------------------------------------
// selectMessages / selectParts / selectStatus — thin wrappers for Zustand
// ---------------------------------------------------------------------------

export function selectMessages(
	state: ChatStoreData,
	sessionID: string,
): Message[] {
	return state.messages[sessionID] ?? EMPTY_MESSAGES;
}

export function selectStatus(
	state: ChatStoreData,
	sessionID: string,
): SessionStatus {
	return state.status[sessionID] ?? IDLE;
}

const EMPTY_MESSAGES: Message[] = [];
const IDLE: SessionStatus = { type: "idle" };

// ---------------------------------------------------------------------------
// Turn derivation with WeakMap caching
// ---------------------------------------------------------------------------

const turnCache = new WeakMap<Message[], TurnCacheEntry>();

interface TurnCacheEntry {
	/** partsRef — we key on identity to keep the cache cheap. */
	partsRef: Record<string, Part[]>;
	activeMessageID: string | undefined;
	result: Turn[];
}

/**
 * Group the session's messages into turns.
 *
 * Invariants:
 * - Output is ordered by user-message id (which corresponds to creation).
 * - Each turn contains exactly one user message and 0+ assistant messages
 *   whose `parentID` equals the user id.
 * - `active` is true for the turn whose user id equals `activeMessageID`.
 */
export function selectTurns(
	state: ChatStoreData,
	sessionID: string,
	activeMessageID: string | undefined = undefined,
): Turn[] {
	const messages = selectMessages(state, sessionID);
	if (messages.length === 0) return EMPTY_TURNS;

	const cached = turnCache.get(messages);
	if (
		cached &&
		cached.partsRef === state.parts &&
		cached.activeMessageID === activeMessageID
	) {
		return cached.result;
	}

	const result = deriveTurns(messages, state.parts, activeMessageID);
	turnCache.set(messages, {
		partsRef: state.parts,
		activeMessageID,
		result,
	});
	return result;
}

const EMPTY_TURNS: Turn[] = [];

function deriveTurns(
	messages: Message[],
	parts: Record<string, Part[]>,
	activeMessageID: string | undefined,
): Turn[] {
	// Pass 1: bucket assistants by parentID.
	const assistantsByParent = new Map<string, AssistantMessage[]>();
	for (const m of messages) {
		if (m.role !== "assistant") continue;
		const list = assistantsByParent.get(m.parentID) ?? [];
		list.push(m);
		assistantsByParent.set(m.parentID, list);
	}

	// Pass 2: one Turn per user message.
	const turns: Turn[] = [];
	for (const m of messages) {
		if (m.role !== "user") continue;
		const user = m as UserMessage;
		const assistants = assistantsByParent.get(user.id) ?? [];
		const turnParts: Record<string, Part[]> = {};
		const userParts = parts[user.id];
		if (userParts) turnParts[user.id] = userParts;
		for (const a of assistants) {
			const p = parts[a.id];
			if (p) turnParts[a.id] = p;
		}
		turns.push({
			user,
			assistant: assistants,
			parts: turnParts,
			active: activeMessageID === user.id,
		});
	}

	return turns;
}

/**
 * The turn that contains the currently-streaming assistant message, or
 * the last turn when the session is busy but no active message id has
 * been set yet.
 */
export function selectActiveTurn(
	state: ChatStoreData,
	sessionID: string,
	activeMessageID: string | undefined,
): Turn | undefined {
	const turns = selectTurns(state, sessionID, activeMessageID);
	if (turns.length === 0) return undefined;
	if (activeMessageID) {
		const hit = turns.find((t) => t.user.id === activeMessageID);
		if (hit) return hit;
	}
	const status = selectStatus(state, sessionID);
	if (status.type !== "idle") return turns[turns.length - 1];
	return undefined;
}
