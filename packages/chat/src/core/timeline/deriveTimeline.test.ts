import { describe, expect, test } from "bun:test";
import type { DurableEnvelope } from "../../protocol/envelope";
import type { Item, ToolCall } from "../../protocol/items";
import { emptySnapshot, reduceMany } from "../reducer/reducer";
import {
	collapseWorkLog,
	derivePendingApprovals,
	deriveTimeline,
} from "./deriveTimeline";

function toolCall(
	id: string,
	status: ToolCall["status"],
	startedAtMs: number,
): ToolCall {
	return {
		kind: "tool_call",
		id,
		title: id,
		toolKind: "read",
		toolName: "Read",
		status,
		content: [],
		startedAtMs,
	};
}

function message(id: string, startedAtMs: number): Item {
	return { kind: "agent_message", id, text: id, startedAtMs };
}

let seq = 0;
function env(item: Item, turnId: string): DurableEnvelope {
	seq += 1;
	return {
		v: 1,
		sessionId: "s1",
		ts: seq,
		cursor: { epoch: "e1", seq },
		event: { type: "item", item, turnId },
	};
}

describe("collapseWorkLog", () => {
	test("collapses runs of settled tool calls and leaves singles inline", () => {
		const items: Item[] = [
			message("m1", 1),
			toolCall("tc1", "completed", 2),
			toolCall("tc2", "completed", 3),
			toolCall("tc3", "declined", 4),
			message("m2", 5),
			toolCall("tc4", "completed", 6),
		];
		const entries = collapseWorkLog(items);
		expect(entries.map((e) => e.kind)).toEqual([
			"item",
			"tool_run",
			"item",
			"item",
		]);
		const run = entries[1];
		if (run?.kind !== "tool_run") throw new Error("expected tool_run");
		expect(run.items.map((i) => i.id)).toEqual(["tc1", "tc2", "tc3"]);
	});

	test("running tool calls stay inline and break runs", () => {
		const entries = collapseWorkLog([
			toolCall("tc1", "completed", 1),
			toolCall("tc2", "running", 2),
			toolCall("tc3", "completed", 3),
		]);
		expect(entries.map((e) => e.kind)).toEqual(["item", "item", "item"]);
	});
});

describe("deriveTimeline", () => {
	test("groups by turn, sorts items, and orders turns by start", () => {
		seq = 0;
		const snapshot = reduceMany(emptySnapshot(), [
			env(message("m2", 20), "t2"),
			env(message("m1", 10), "t1"),
			env(toolCall("tc1", "completed", 11), "t1"),
			{
				v: 1,
				sessionId: "s1",
				ts: 99,
				cursor: { epoch: "e1", seq: 99 },
				event: {
					type: "turn",
					turn: { id: "t1", status: "completed", startedAtMs: 10 },
				},
			},
			{
				v: 1,
				sessionId: "s1",
				ts: 100,
				cursor: { epoch: "e1", seq: 100 },
				event: {
					type: "turn",
					turn: { id: "t2", status: "running", startedAtMs: 20 },
				},
			},
		]);
		const groups = deriveTimeline(snapshot);
		expect(groups.map((g) => g.turnId)).toEqual(["t1", "t2"]);
		const firstEntry = groups[0]?.entries[0];
		if (firstEntry?.kind !== "item") throw new Error("expected item entry");
		expect(firstEntry.item.id).toBe("m1");
	});
});

describe("derivePendingApprovals", () => {
	test("returns only pending approvals in order", () => {
		seq = 0;
		const approval = (
			id: string,
			status: "pending" | "answered",
			startedAtMs: number,
		): Item => ({
			kind: "approval_request",
			id,
			targetItemId: null,
			title: id,
			status,
			startedAtMs,
		});
		const snapshot = reduceMany(emptySnapshot(), [
			env(approval("a2", "pending", 2), "t1"),
			env(approval("a1", "pending", 1), "t1"),
			env(approval("a3", "answered", 3), "t1"),
		]);
		expect(derivePendingApprovals(snapshot).map((a) => a.id)).toEqual([
			"a1",
			"a2",
		]);
	});
});
