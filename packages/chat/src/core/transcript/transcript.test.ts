import { describe, expect, test } from "bun:test";
import type { Turn } from "../../protocol/envelope";
import type { Item } from "../../protocol/items";
import {
	runningTurnId,
	toolRunKey,
	transcriptItemKey,
	userMessageText,
} from "./transcript";

describe("transcriptItemKey", () => {
	test("a user message is keyed by its client id, others by id", () => {
		expect(
			transcriptItemKey({
				id: "i1",
				kind: "user_message",
				clientId: "c1",
			} as unknown as Item),
		).toBe("c1");
		expect(
			transcriptItemKey({ id: "i2", kind: "agent_message" } as unknown as Item),
		).toBe("i2");
	});
});

describe("toolRunKey", () => {
	test("keys a run by its first tool, else its position", () => {
		expect(toolRunKey("t1", [{ id: "x" }] as never, 3)).toBe("tools:t1:x");
		expect(toolRunKey("t1", [], 3)).toBe("tools:t1:3");
	});
});

describe("runningTurnId", () => {
	test("the running turn, or null", () => {
		const turns = new Map([
			["a", { id: "a", status: "completed" }],
			["b", { id: "b", status: "running" }],
		]) as unknown as Map<string, Turn>;
		expect(runningTurnId(turns)).toBe("b");
		expect(runningTurnId(new Map())).toBeNull();
	});
});

describe("userMessageText", () => {
	test("joins the text parts and skips attachments", () => {
		const message = {
			content: [
				{ type: "text" as const, text: "a" },
				{
					type: "attachment" as const,
					attachmentId: "f",
					name: "f",
					mimeType: "image/png",
				},
				{ type: "text" as const, text: "b" },
			],
		};
		expect(userMessageText(message)).toBe("a\nb");
		expect(userMessageText(message, " ")).toBe("a b");
	});
});
