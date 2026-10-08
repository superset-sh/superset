import { describe, expect, test } from "bun:test";
import type { AgentMessage, ToolCall } from "../../protocol/items";
import { emptySnapshot, type SessionSnapshot } from "../reducer/reducer";
import {
	hasOmittedBody,
	OUTLINE_TITLE_CHARS,
	outlineSnapshot,
	snapshotFromOutline,
	withItemBodies,
} from "./outline";

const toolCall: ToolCall = {
	id: "tool-1",
	kind: "tool_call",
	startedAtMs: 1,
	title: "x".repeat(OUTLINE_TITLE_CHARS + 50),
	toolKind: "execute",
	toolName: "Bash",
	status: "completed",
	content: [{ type: "text", text: "output" }],
	rawInput: { command: "ls" },
	rawOutput: { stdout: "a\nb" },
};

const agentMessage: AgentMessage = {
	id: "agent-1",
	kind: "agent_message",
	startedAtMs: 2,
	text: "y".repeat(OUTLINE_TITLE_CHARS + 50),
};

const snapshot: SessionSnapshot = {
	...emptySnapshot(),
	turns: new Map([["t1", { id: "t1", status: "completed", startedAtMs: 0 }]]),
	items: new Map([
		[toolCall.id, { item: toolCall, turnId: "t1" }],
		[agentMessage.id, { item: agentMessage, turnId: "t1" }],
	]),
	cursor: { epoch: 1, seq: 9 },
};

describe("outline", () => {
	test("strips tool call bodies and round-trips the rest in order", () => {
		const restored = snapshotFromOutline(outlineSnapshot(snapshot));
		const [tool, agent] = [...restored.items.values()];
		const outlined = tool?.item as ToolCall;

		expect(hasOmittedBody(outlined)).toBe(true);
		expect(outlined.content).toEqual([]);
		expect(outlined.rawInput).toBeUndefined();
		expect(outlined.rawOutput).toBeUndefined();
		expect(outlined.title).toHaveLength(OUTLINE_TITLE_CHARS + 1);
		expect(agent?.item).toBe(agentMessage);
		expect([...restored.turns.keys()]).toEqual(["t1"]);
		expect(restored.cursor).toEqual({ epoch: 1, seq: 9 });
	});

	test("fills a body only while the row still waits for one", () => {
		const outlined = snapshotFromOutline(outlineSnapshot(snapshot));
		const filled = withItemBodies(outlined, [{ item: toolCall, turnId: "t1" }]);
		expect(filled.items.get(toolCall.id)?.item).toBe(toolCall);

		const live = { ...toolCall, status: "failed" as const };
		const updated: SessionSnapshot = {
			...outlined,
			items: new Map(outlined.items).set(toolCall.id, {
				item: live,
				turnId: "t1",
			}),
		};
		expect(
			withItemBodies(updated, [{ item: toolCall, turnId: "t1" }]).items.get(
				toolCall.id,
			)?.item,
		).toBe(live);
	});
});
