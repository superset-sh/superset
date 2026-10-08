import { describe, expect, test } from "bun:test";
import type { Item } from "@superset/chat/protocol";
import type { TranscriptRow } from "../transcriptRows";
import { lastReplyKeys } from "./lastReplyKeys";

function item(
	id: string,
	kind: Item["kind"],
	groupStart = false,
): TranscriptRow {
	return {
		kind: "item",
		key: id,
		groupStart,
		item: { id, kind, startedAtMs: 0 } as Item,
	};
}

describe("lastReplyKeys", () => {
	test("picks the turn's last reply even when a tool call or status follows it", () => {
		const rows: TranscriptRow[] = [
			item("prompt-1", "user_message", true),
			item("reply-1", "agent_message"),
			item("tool-1", "tool_call"),
			item("reply-2", "agent_message"),
			item("tool-2", "tool_call"),
			{
				kind: "turn_status",
				key: "status:t1",
				groupStart: false,
				status: "interrupted",
				message: undefined,
			},
			item("prompt-2", "user_message", true),
			item("reply-3", "agent_message"),
		];
		expect([...lastReplyKeys(rows)]).toEqual(["reply-2", "reply-3"]);
	});

	test("leaves a running turn without a last reply", () => {
		const working = (turnId: string, running: boolean): TranscriptRow => ({
			kind: "working",
			key: `working:${turnId}`,
			groupStart: false,
			startedAtMs: 0,
			completedAtMs: running ? undefined : 1,
			running,
		});
		const rows: TranscriptRow[] = [
			item("prompt-1", "user_message", true),
			working("t1", false),
			item("reply-1", "agent_message"),
			item("prompt-2", "user_message", true),
			working("t2", true),
			item("reply-2", "agent_message"),
			item("tool-1", "tool_call"),
		];
		expect([...lastReplyKeys(rows)]).toEqual(["reply-1"]);
	});
});
