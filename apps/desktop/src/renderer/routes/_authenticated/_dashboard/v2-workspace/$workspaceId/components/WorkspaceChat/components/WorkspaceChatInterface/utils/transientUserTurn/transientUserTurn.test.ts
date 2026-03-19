import { describe, expect, it } from "bun:test";
import {
	getVisibleMessagesWithPendingUserTurn,
	type PendingUserTurn,
	shouldClearPendingUserTurn,
} from "./transientUserTurn";

type TestMessage = {
	id: string;
	role: "user" | "assistant";
	content: Array<{ type: "text"; text: string }>;
	createdAt: Date;
};

function message(
	id: string,
	role: TestMessage["role"],
	text: string,
	createdAt = "2026-03-07T01:00:00.000Z",
): TestMessage {
	return {
		id,
		role,
		content: [{ type: "text", text }],
		createdAt: new Date(createdAt),
	};
}

describe("getVisibleMessagesWithPendingUserTurn", () => {
	it("appends a pending composer send until it is persisted", () => {
		const messages = [message("u1", "user", "hello")] as TestMessage[];
		const pendingUserTurn: PendingUserTurn = {
			kind: "append",
			message: message("optimistic-1", "user", "follow up"),
		};

		expect(
			getVisibleMessagesWithPendingUserTurn({
				messages: messages as never,
				pendingUserTurn: pendingUserTurn as never,
				isAwaitingAssistant: true,
			}),
		).toHaveLength(2);
	});

	it("keeps the rendered prefix while a restarted turn is streaming", () => {
		const persistedMessages = [
			message("u1", "user", "hey bos"),
			message("a1", "assistant", "Hey! What can I help you with today?"),
			message("u2", "user", "whats your model?"),
		] as TestMessage[];
		const pendingUserTurn: PendingUserTurn = {
			kind: "restart",
			prefixMessages: persistedMessages.slice(0, 2) as never,
			message: message("optimistic-2", "user", "whats your model?"),
		};

		expect(
			getVisibleMessagesWithPendingUserTurn({
				messages: persistedMessages as never,
				pendingUserTurn: pendingUserTurn as never,
				isAwaitingAssistant: true,
			}),
		).toEqual([
			persistedMessages[0],
			persistedMessages[1],
			pendingUserTurn.message,
		]);
	});
});

describe("shouldClearPendingUserTurn", () => {
	it("does not clear a restart overlay while the assistant is still pending", () => {
		const messages = [message("u1", "user", "hello")] as TestMessage[];
		const pendingUserTurn: PendingUserTurn = {
			kind: "restart",
			prefixMessages: [],
			message: message("optimistic-1", "user", "hello"),
		};

		expect(
			shouldClearPendingUserTurn({
				messages: messages as never,
				pendingUserTurn: pendingUserTurn as never,
				isAwaitingAssistant: true,
			}),
		).toBe(false);
	});

	it("clears a restart overlay once the restarted user message is persisted and streaming is done", () => {
		const messages = [message("u1", "user", "hello")] as TestMessage[];
		const pendingUserTurn: PendingUserTurn = {
			kind: "restart",
			prefixMessages: [],
			message: message("optimistic-1", "user", "hello"),
		};

		expect(
			shouldClearPendingUserTurn({
				messages: messages as never,
				pendingUserTurn: pendingUserTurn as never,
				isAwaitingAssistant: false,
			}),
		).toBe(true);
	});
});
