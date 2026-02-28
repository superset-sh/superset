import { describe, expect, it } from "bun:test";
import type { inferRouterOutputs } from "@trpc/server";
import type { ChatMastraServiceRouter } from "../../../server/trpc";
import {
	resolveChatErrorMessage,
	withoutActiveTurnAssistantHistory,
} from "./use-mastra-chat-display";

type RouterOutputs = inferRouterOutputs<ChatMastraServiceRouter>;
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
): ListMessagesOutput[number] {
	return {
		id,
		role: "assistant",
		content: [{ type: "text", text }],
		createdAt: new Date("2026-02-26T00:00:00.000Z"),
	} as unknown as ListMessagesOutput[number];
}

function assistantErrorMessage(
	id: string,
	error: unknown,
): ListMessagesOutput[number] {
	return {
		id,
		role: "assistant",
		content: [{ type: "error", text: "request failed" }],
		error,
		createdAt: new Date("2026-02-26T00:00:00.000Z"),
	} as unknown as ListMessagesOutput[number];
}

function asCurrentMessage(
	message: ListMessagesOutput[number],
): DisplayStateOutput["currentMessage"] {
	return message as unknown as DisplayStateOutput["currentMessage"];
}

function makeDisplayState(errorMessage?: unknown): DisplayStateOutput {
	return {
		isRunning: false,
		currentMessage: null,
		errorMessage,
	} as unknown as DisplayStateOutput;
}

describe("withoutActiveTurnAssistantHistory", () => {
	it("drops active-turn assistant history while streaming an assistant currentMessage", () => {
		const messages = withoutActiveTurnAssistantHistory({
			messages: [
				userMessage("u_1", "edit readme"),
				assistantMessage("a_hist", "Let me start by reading..."),
			],
			currentMessage: asCurrentMessage(
				assistantMessage("a_current", "\n\nLet me start by reading..."),
			),
			isRunning: true,
		});

		expect(messages.map((message) => message.id)).toEqual(["u_1"]);
	});

	it("preserves completed turns and only removes assistant messages in the active turn", () => {
		const messages = withoutActiveTurnAssistantHistory({
			messages: [
				userMessage("u_1", "first"),
				assistantMessage("a_1", "done"),
				userMessage("u_2", "second"),
				assistantMessage("a_2", "in-progress"),
			],
			currentMessage: asCurrentMessage(
				assistantMessage("a_current", "new stream"),
			),
			isRunning: true,
		});

		expect(messages.map((message) => message.id)).toEqual([
			"u_1",
			"a_1",
			"u_2",
		]);
	});

	it("does not change messages when not running", () => {
		const messages = withoutActiveTurnAssistantHistory({
			messages: [userMessage("u_1", "hello"), assistantMessage("a_1", "hi")],
			currentMessage: asCurrentMessage(assistantMessage("a_current", "stream")),
			isRunning: false,
		});

		expect(messages.map((message) => message.id)).toEqual(["u_1", "a_1"]);
	});
});

describe("resolveChatErrorMessage", () => {
	it("prefers runtime displayState errorMessage over history", () => {
		const message = resolveChatErrorMessage({
			displayState: makeDisplayState("Runtime request failed"),
			messages: [assistantErrorMessage("a_1", "Older assistant failure")],
		});

		expect(message).toBe("Runtime request failed");
	});

	it("falls back to latest assistant error when runtime errorMessage is absent", () => {
		const message = resolveChatErrorMessage({
			displayState: makeDisplayState(undefined),
			messages: [
				userMessage("u_1", "hello"),
				assistantErrorMessage("a_1", {
					message: "AI_APICallError2: Upstream provider timed out",
				}),
			],
		});

		expect(message).toBe("Upstream provider timed out");
	});

	it("does not surface stale assistant error after a later successful assistant reply", () => {
		const message = resolveChatErrorMessage({
			displayState: makeDisplayState(undefined),
			messages: [
				userMessage("u_1", "first"),
				assistantErrorMessage("a_error", "Temporary failure"),
				userMessage("u_2", "retry"),
				assistantMessage("a_success", "Done."),
			],
		});

		expect(message).toBeNull();
	});
});
