import {
	type ChatHistoryMessage,
	hasMatchingUserMessage,
} from "../optimisticUserMessage";

export type PendingUserTurn =
	| {
			kind: "append";
			message: ChatHistoryMessage;
	  }
	| {
			kind: "restart";
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
	if (
		!hasMatchingUserMessage({
			messages,
			candidate: pendingUserTurn.message,
		})
	) {
		return false;
	}

	if (pendingUserTurn.kind === "restart" && isAwaitingAssistant) {
		return false;
	}

	return true;
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
