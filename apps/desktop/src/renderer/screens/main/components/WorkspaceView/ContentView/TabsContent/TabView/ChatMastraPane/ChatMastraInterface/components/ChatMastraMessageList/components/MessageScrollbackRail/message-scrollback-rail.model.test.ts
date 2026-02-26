import { describe, expect, it } from "bun:test";
import {
	buildPreview,
	buildUserMessageEntries,
	findActiveMessageId,
	type MastraMessage,
	truncatePreview,
	type UserMessageEntry,
} from "./message-scrollback-rail.model";

function createMessage(input: {
	id: string;
	role: MastraMessage["role"];
	content: MastraMessage["content"];
}): MastraMessage {
	return {
		...input,
		createdAt: new Date(),
	} as MastraMessage;
}

describe("message scrollback rail model", () => {
	it("truncates long preview text", () => {
		const longText = "a".repeat(100);
		expect(truncatePreview(longText)).toBe(`${"a".repeat(77)}...`);
	});

	it("builds normalized preview text from text parts", () => {
		const message = createMessage({
			id: "user-1",
			role: "user",
			content: [{ type: "text", text: "  hello\n\n   world  " }],
		});

		expect(buildPreview(message)).toBe("hello world");
	});

	it("falls back to attachment summaries when no text is present", () => {
		const singleAttachmentMessage = createMessage({
			id: "user-1",
			role: "user",
			content: [{ type: "image", data: "base64-data", mimeType: "image/png" }],
		});
		const multiAttachmentMessage = createMessage({
			id: "user-2",
			role: "user",
			content: [
				{ type: "image", data: "base64-data-1", mimeType: "image/png" },
				{ type: "image", data: "base64-data-2", mimeType: "image/jpeg" },
			],
		});

		expect(buildPreview(singleAttachmentMessage)).toBe("Sent 1 attachment");
		expect(buildPreview(multiAttachmentMessage)).toBe("Sent 2 attachments");
	});

	it("returns an empty-message fallback when no text or attachments exist", () => {
		const message = createMessage({
			id: "user-1",
			role: "user",
			content: [{ type: "thinking", thinking: "reasoning here" }],
		});

		expect(buildPreview(message)).toBe("(empty message)");
	});

	it("builds entries only for user messages and marks the latest user message", () => {
		const messages: MastraMessage[] = [
			createMessage({
				id: "assistant-1",
				role: "assistant",
				content: [{ type: "text", text: "hello" }],
			}),
			createMessage({
				id: "user-1",
				role: "user",
				content: [{ type: "text", text: "first" }],
			}),
			createMessage({
				id: "assistant-2",
				role: "assistant",
				content: [{ type: "text", text: "reply" }],
			}),
			createMessage({
				id: "user-2",
				role: "user",
				content: [{ type: "text", text: "second" }],
			}),
		];

		expect(buildUserMessageEntries(messages)).toEqual([
			{ id: "user-1", preview: "first", isLatest: false },
			{ id: "user-2", preview: "second", isLatest: true },
		]);
	});

	it("finds the active marker from scroll position", () => {
		const entries: UserMessageEntry[] = [
			{ id: "user-1", preview: "a", top: 0, isLatest: false },
			{ id: "user-2", preview: "b", top: 120, isLatest: false },
			{ id: "user-3", preview: "c", top: 280, isLatest: true },
		];

		expect(findActiveMessageId(entries, 0)).toBe("user-1");
		expect(findActiveMessageId(entries, 130)).toBe("user-2");
		expect(findActiveMessageId(entries, 350)).toBe("user-3");
	});

	it("returns null when no entries are available", () => {
		expect(findActiveMessageId([], 0)).toBeNull();
	});
});
