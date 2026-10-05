import { describe, expect, it } from "bun:test";
import type { SessionSnapshot, TurnGroup } from "@superset/chat/core";
import { buildChatHandoffTranscript } from "./chatHandoffTranscript";

function userItem(id: string, text: string) {
	return {
		kind: "item" as const,
		item: {
			id,
			kind: "user_message" as const,
			startedAtMs: 0,
			content: [{ type: "text" as const, text }],
		},
	};
}

function agentItem(id: string) {
	return {
		kind: "item" as const,
		item: { id, kind: "agent_message" as const, startedAtMs: 1 },
	};
}

function toolItem(id: string) {
	return {
		kind: "item" as const,
		item: {
			id,
			kind: "tool_call" as const,
			startedAtMs: 2,
			status: "completed",
			title: "Read file",
		},
	};
}

function snapshotWith(texts: Record<string, string>): SessionSnapshot {
	return {
		items: new Map(
			Object.entries(texts).map(([id, text]) => [
				id,
				{ item: { id, kind: "agent_message", startedAtMs: 1, text } },
			]),
		),
		liveStreams: new Map(),
		turns: new Map(),
		session: null,
	} as unknown as SessionSnapshot;
}

describe("buildChatHandoffTranscript", () => {
	const groups = [
		{
			turnId: "t1",
			turn: null,
			entries: [userItem("u1", "add a test"), agentItem("a1")],
		},
	] as unknown as TurnGroup[];

	it("names each speaker", () => {
		const text = buildChatHandoffTranscript(
			groups,
			snapshotWith({ a1: "Done." }),
			"Claude",
		);
		expect(text).toBe("User: add a test\n\nClaude: Done.");
	});

	it("leaves out the agent's working", () => {
		const withTool = [
			{
				turnId: "t1",
				turn: null,
				entries: [
					userItem("u1", "add a test"),
					toolItem("x1"),
					agentItem("a1"),
				],
			},
		] as unknown as TurnGroup[];
		const text = buildChatHandoffTranscript(
			withTool,
			snapshotWith({ a1: "Done." }),
			"Claude",
		);
		expect(text).not.toContain("Read file");
	});

	it("skips a message that is still empty", () => {
		const text = buildChatHandoffTranscript(
			groups,
			snapshotWith({ a1: "   " }),
			"Claude",
		);
		expect(text).toBe("User: add a test");
	});
});
