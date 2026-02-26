import { describe, expect, it } from "bun:test";
import { dedupeMessages, type MastraMessage } from "./message-dedupe";

function userMessage(id: string, text: string): MastraMessage {
	return {
		id,
		role: "user",
		content: [{ type: "text", text }],
		createdAt: new Date("2026-02-25T00:00:00.000Z"),
	} as unknown as MastraMessage;
}

function assistantWithDuplicateToolParts(id: string): MastraMessage {
	return {
		id,
		role: "assistant",
		content: [
			{
				type: "tool_call",
				id: "tc_1",
				name: "read_file",
				args: { path: "a.ts" },
			},
			{
				type: "tool_call",
				id: "tc_1",
				name: "read_file",
				args: { path: "b.ts" },
			},
			{
				type: "tool_result",
				id: "tc_1",
				name: "read_file",
				result: { content: "old" },
				isError: false,
			},
			{
				type: "tool_result",
				id: "tc_1",
				name: "read_file",
				result: { content: "new" },
				isError: false,
			},
			{ type: "text", text: "done" },
		],
		createdAt: new Date("2026-02-25T00:00:00.000Z"),
	} as unknown as MastraMessage;
}

function assistantWithResolvedAndExecutingDuplicateToolCall(
	id: string,
): MastraMessage {
	return {
		id,
		role: "assistant",
		content: [
			{
				type: "tool_call",
				id: "tc_complete",
				name: "read_file",
				args: { path: "a.ts" },
			},
			{
				type: "tool_result",
				id: "tc_complete",
				name: "read_file",
				result: { content: "contents" },
				isError: false,
			},
			{
				type: "tool_call",
				id: "tc_executing",
				name: "read_file",
				args: { path: "a.ts" },
			},
			{ type: "text", text: "done" },
		],
		createdAt: new Date("2026-02-25T00:00:00.000Z"),
	} as unknown as MastraMessage;
}

describe("dedupeMessages", () => {
	it("dedupes duplicate message IDs and keeps the latest payload", () => {
		const oldMessage = userMessage("m_1", "old");
		const replacementMessage = userMessage("m_1", "new");
		const distinctMessage = userMessage("m_2", "other");

		const messages = dedupeMessages([
			distinctMessage,
			oldMessage,
			replacementMessage,
		]);

		expect(messages).toHaveLength(2);
		expect(messages[0]?.id).toBe("m_2");
		expect(messages[1]?.id).toBe("m_1");
		expect(messages[1]?.content[0]).toMatchObject({
			type: "text",
			text: "new",
		});
	});

	it("dedupes duplicate tool_call/tool_result parts by ID within a message", () => {
		const assistantMessage = assistantWithDuplicateToolParts("a_1");

		const messages = dedupeMessages([assistantMessage]);
		const deduped = messages[0];

		expect(deduped?.content).toHaveLength(3);
		expect(deduped?.content[0]).toMatchObject({
			type: "tool_call",
			id: "tc_1",
			args: { path: "b.ts" },
		});
		expect(deduped?.content[1]).toMatchObject({
			type: "tool_result",
			id: "tc_1",
			result: { content: "new" },
		});
		expect(deduped?.content[2]).toMatchObject({ type: "text", text: "done" });
	});

	it("prefers resolved tool calls over matching executing duplicates", () => {
		const assistantMessage =
			assistantWithResolvedAndExecutingDuplicateToolCall("a_2");

		const messages = dedupeMessages([assistantMessage]);
		const deduped = messages[0];

		expect(deduped?.content).toHaveLength(3);
		expect(deduped?.content[0]).toMatchObject({
			type: "tool_call",
			id: "tc_complete",
			name: "read_file",
			args: { path: "a.ts" },
		});
		expect(deduped?.content[1]).toMatchObject({
			type: "tool_result",
			id: "tc_complete",
			result: { content: "contents" },
		});
		expect(deduped?.content[2]).toMatchObject({ type: "text", text: "done" });
	});
});
