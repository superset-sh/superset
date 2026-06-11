import {
	type ChatHistoryMessage,
	hasMatchingUserMessage,
} from "../optimisticUserMessage";

export type PendingUserTurn =
	| {
			kind: "append";
			sessionId?: string | null;
			message: ChatHistoryMessage;
	  }
	| {
			kind: "restart";
			sessionId?: string | null;
			message: ChatHistoryMessage;
			prefixMessages: ChatHistoryMessage[];
	  };

export function shouldClearPendingUserTurn({
	messages,
	pendingUserTurn,
	isAwaitingAssistant,
}: {
	messages: ChatHistoryMessage[];
	pendingUserTurn: PendingUserTurn | null;
	isAwaitingAssistant: boolean;
}): boolean {
	if (!pendingUserTurn) return false;
	if (isAwaitingAssistant) return false;
	if (
		!hasMatchingUserMessage({
			messages,
			candidate: pendingUserTurn.message,
		})
	) {
		return false;
	}

	return true;
}

export function shouldRetainPendingUserTurnForSession({
	pendingUserTurn,
	sessionId,
}: {
	pendingUserTurn: PendingUserTurn | null;
	sessionId: string | null;
}): boolean {
	return Boolean(
		pendingUserTurn?.sessionId && pendingUserTurn.sessionId === sessionId,
	);
}

export function bindPendingUserTurnToSession({
	pendingUserTurn,
	messageId,
	sessionId,
}: {
	pendingUserTurn: PendingUserTurn | null;
	messageId: string;
	sessionId: string;
}): PendingUserTurn | null {
	if (!pendingUserTurn) return null;
	if (pendingUserTurn.message.id !== messageId) return pendingUserTurn;
	return { ...pendingUserTurn, sessionId };
}

export function getVisibleMessagesWithPendingUserTurn({
	messages,
	pendingUserTurn,
	isAwaitingAssistant,
}: {
	messages: ChatHistoryMessage[];
	pendingUserTurn: PendingUserTurn | null;
	isAwaitingAssistant: boolean;
}): ChatHistoryMessage[] {
	if (!pendingUserTurn) return messages;

	const hasPersistedMessage = hasMatchingUserMessage({
		messages,
		candidate: pendingUserTurn.message,
	});

	if (pendingUserTurn.kind === "restart") {
		if (isAwaitingAssistant || !hasPersistedMessage) {
			return [...pendingUserTurn.prefixMessages, pendingUserTurn.message];
		}
		return messages;
	}

	if (hasPersistedMessage) {
		return messages;
	}

	return [...messages, pendingUserTurn.message];
}
