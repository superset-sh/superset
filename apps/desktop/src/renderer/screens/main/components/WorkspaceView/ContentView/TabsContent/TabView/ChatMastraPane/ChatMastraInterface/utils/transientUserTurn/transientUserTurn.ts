import {
	hasMatchingUserMessage,
	type MastraHistoryMessage,
} from "../optimisticUserMessage";

export type PendingUserTurn =
	| {
			kind: "append";
			message: MastraHistoryMessage;
	  }
	| {
			kind: "restart";
			message: MastraHistoryMessage;
			prefixMessages: MastraHistoryMessage[];
	  };

export function shouldClearPendingUserTurn({
	messages,
	pendingUserTurn,
	isAwaitingAssistant,
}: {
	messages: MastraHistoryMessage[];
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
	messages: MastraHistoryMessage[];
	pendingUserTurn: PendingUserTurn | null;
	isAwaitingAssistant: boolean;
}): MastraHistoryMessage[] {
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
