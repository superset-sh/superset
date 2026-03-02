import { describe, expect, it } from "bun:test";
import type { inferRouterOutputs } from "@trpc/server";
import type { ChatMastraServiceRouter } from "../../../server/trpc";
import {
	findLatestAssistantErrorMessage,
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

function asCurrentMessage(
	message: ListMessagesOutput[number],
): DisplayStateOutput["currentMessage"] {
	return message as unknown as DisplayStateOutput["currentMessage"];
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

describe("findLatestAssistantErrorMessage", () => {
	it("returns latest assistant error when the latest assistant message is an error", () => {
		const error = findLatestAssistantErrorMessage([
			userMessage("u_1", "first"),
			{
				...assistantMessage("a_1", "older error"),
				stopReason: "error",
				errorMessage: "older error",
			} as unknown as ListMessagesOutput[number],
			{
				...assistantMessage("a_2", "latest error"),
				stopReason: "error",
				errorMessage: "latest error",
			} as unknown as ListMessagesOutput[number],
		]);

		expect(error).toBe("latest error");
	});

	it("does not surface stale assistant error after a later successful assistant message", () => {
		const error = findLatestAssistantErrorMessage([
			userMessage("u_1", "first"),
			{
				...assistantMessage("a_1", "older error"),
				stopReason: "error",
				errorMessage: "older error",
			} as unknown as ListMessagesOutput[number],
			{
				...assistantMessage("a_2", "latest success"),
				stopReason: "stop",
			} as unknown as ListMessagesOutput[number],
		]);

		expect(error).toBeNull();
	});
});
