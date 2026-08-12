import { describe, expect, test } from "bun:test";
import {
	agentMessage,
	turn,
	userMessage,
} from "@superset/chat-runtime/testing";
import type { SessionSnapshot, TurnGroup } from "../../core";
import { emptySnapshot, reduceMany } from "../../core";
import type { DurableEvent } from "../../protocol/envelope";
import { registerDom } from "../../testing/registerDom";
import { useTimeline } from "./useTimeline";

registerDom();
const { render } = await import("@testing-library/react");

function envelope(seq: number, event: DurableEvent) {
	return {
		v: 1 as const,
		sessionId: "session-1",
		cursor: { epoch: "e1", seq },
		ts: seq,
		event,
	};
}

function buildSnapshot(): SessionSnapshot {
	return reduceMany(emptySnapshot(), [
		envelope(1, { type: "turn", turn: turn("t1") }),
		envelope(2, {
			type: "item",
			item: userMessage("u1", "hello", { startedAtMs: 0 }),
			turnId: "t1",
		}),
		envelope(3, {
			type: "item",
			item: agentMessage("a1", "done"),
			turnId: "t1",
		}),
		envelope(4, {
			type: "turn",
			turn: turn("t1", { status: "completed", completedAtMs: 2 }),
		}),
	]);
}

let results: TurnGroup[][] = [];

function Probe(props: { snapshot: SessionSnapshot }) {
	results.push(useTimeline(props.snapshot));
	return null;
}

describe("useTimeline", () => {
	test("derives turn groups and memoizes on snapshot identity", () => {
		results = [];
		const snapshot = buildSnapshot();
		const view = render(<Probe snapshot={snapshot} />);
		const first = results.at(-1);
		expect(first).toHaveLength(1);
		expect(first?.[0]?.turnId).toBe("t1");
		expect(first?.[0]?.turn?.status).toBe("completed");
		expect(
			first?.[0]?.entries.map((entry) =>
				entry.kind === "item" ? entry.item.id : entry.items.map((i) => i.id),
			),
		).toEqual(["u1", "a1"]);

		view.rerender(<Probe snapshot={snapshot} />);
		expect(results.at(-1)).toBe(first);

		const changed = reduceMany(snapshot, [
			envelope(5, {
				type: "item",
				item: agentMessage("a2", "more"),
				turnId: "t1",
			}),
		]);
		view.rerender(<Probe snapshot={changed} />);
		expect(results.at(-1)).not.toBe(first);
		expect(results.at(-1)?.[0]?.entries).toHaveLength(3);
		view.unmount();
	});
});
