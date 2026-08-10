import { describe, expect, test } from "bun:test";
import type { DurableEnvelope, Envelope } from "../../protocol/envelope";
import type { Item } from "../../protocol/items";
import { displayText, emptySnapshot, reduce, reduceMany } from "./reducer";

let seqCounter = 0;

function durable(
	event: DurableEnvelope["event"],
	epoch = "e1",
): DurableEnvelope {
	seqCounter += 1;
	return {
		v: 1,
		sessionId: "s1",
		ts: 1000 + seqCounter,
		cursor: { epoch, seq: seqCounter },
		event,
	};
}

function itemEvent(item: Item, turnId = "t1", epoch = "e1"): DurableEnvelope {
	return durable({ type: "item", item, turnId }, epoch);
}

function agentMessage(id: string, text: string): Item {
	return { kind: "agent_message", id, text, startedAtMs: 1 };
}

function toolCall(id: string, status: "running" | "completed"): Item {
	return {
		kind: "tool_call",
		id,
		title: `run ${id}`,
		toolKind: "execute",
		toolName: "bash",
		status,
		content: [],
		startedAtMs: 2,
	};
}

function textDelta(itemId: string, append: string): Envelope {
	return {
		v: 1,
		sessionId: "s1",
		ts: 1,
		delta: { type: "text", itemId, append },
	};
}

function seededShuffle<T>(input: readonly T[], seed: number): T[] {
	const result = [...input];
	let state = seed;
	for (let i = result.length - 1; i > 0; i--) {
		state = (state * 1103515245 + 12345) % 2147483648;
		const j = state % (i + 1);
		const a = result[i] as T;
		result[i] = result[j] as T;
		result[j] = a;
	}
	return result;
}

describe("reduce", () => {
	test("upserts items by id and never shrinks", () => {
		seqCounter = 0;
		const running = itemEvent(toolCall("tc1", "running"));
		const done = itemEvent(toolCall("tc1", "completed"));
		const snapshot = reduceMany(emptySnapshot(), [running, done]);
		expect(snapshot.items.size).toBe(1);
		expect((snapshot.items.get("tc1")?.item as { status: string }).status).toBe(
			"completed",
		);
	});

	test("duplicated and re-delivered events converge to the same snapshot", () => {
		seqCounter = 0;
		const events = [
			itemEvent(agentMessage("m1", "hello")),
			itemEvent(toolCall("tc1", "running")),
			itemEvent(toolCall("tc1", "completed")),
			durable({
				type: "turn",
				turn: { id: "t1", status: "completed", startedAtMs: 1 },
			}),
		];
		const clean = reduceMany(emptySnapshot(), events);
		const withDupes = reduceMany(emptySnapshot(), [...events, ...events]);
		expect(withDupes.items).toEqual(clean.items);
		expect(withDupes.turns).toEqual(clean.turns);
		expect(withDupes.cursor).toEqual(clean.cursor);
	});

	test("replay of the full spine equals incremental live application", () => {
		seqCounter = 0;
		const events = [
			itemEvent(agentMessage("m1", "partial")),
			itemEvent(toolCall("tc1", "running")),
			itemEvent(toolCall("tc1", "completed")),
			itemEvent(agentMessage("m1", "partial plus final")),
			durable({
				type: "session",
				session: { status: "idle", harness: "claude-code" },
			}),
		];
		const replayed = reduceMany(emptySnapshot(), events);
		let live = emptySnapshot();
		for (const event of events) live = reduce(live, event);
		expect(live.items).toEqual(replayed.items);
		expect(live.session).toEqual(replayed.session);
		expect(live.cursor).toEqual(replayed.cursor);
	});

	test("spine-only shuffle converges on latest-snapshot-wins per item", () => {
		seqCounter = 0;
		const finalItems = [
			itemEvent(agentMessage("m1", "final text")),
			itemEvent(toolCall("tc1", "completed")),
		];
		const ordered = reduceMany(emptySnapshot(), finalItems);
		for (let seed = 1; seed <= 5; seed++) {
			const shuffled = reduceMany(
				emptySnapshot(),
				seededShuffle(finalItems, seed),
			);
			expect(shuffled.items.get("m1")).toEqual(ordered.items.get("m1"));
			expect(shuffled.items.get("tc1")).toEqual(ordered.items.get("tc1"));
		}
	});

	test("deltas accumulate and the next snapshot supersedes them", () => {
		seqCounter = 0;
		let snapshot = reduceMany(emptySnapshot(), [
			itemEvent(agentMessage("m1", "")),
		]);
		snapshot = reduceMany(snapshot, [
			textDelta("m1", "hel"),
			textDelta("m1", "lo"),
		]);
		expect(displayText(snapshot, "m1")).toBe("hello");
		snapshot = reduce(snapshot, itemEvent(agentMessage("m1", "authoritative")));
		expect(displayText(snapshot, "m1")).toBe("authoritative");
	});

	test("dropping all deltas still converges via snapshots", () => {
		seqCounter = 0;
		const withDeltas = reduceMany(emptySnapshot(), [
			itemEvent(agentMessage("m1", "")),
			textDelta("m1", "hel"),
			textDelta("m1", "lo"),
			itemEvent(agentMessage("m1", "hello")),
		]);
		seqCounter = 0;
		const spineOnly = reduceMany(emptySnapshot(), [
			itemEvent(agentMessage("m1", "")),
			itemEvent(agentMessage("m1", "hello")),
		]);
		expect(displayText(withDeltas, "m1")).toBe(displayText(spineOnly, "m1"));
		expect(withDeltas.items).toEqual(spineOnly.items);
	});

	test("cross-epoch durable events flag a pending reset and are not applied", () => {
		seqCounter = 0;
		const first = reduceMany(emptySnapshot(), [
			itemEvent(agentMessage("m1", "old")),
		]);
		seqCounter = 0;
		const next = reduce(
			first,
			itemEvent(agentMessage("m2", "new"), "t1", "e2"),
		);
		expect(next.pendingReset).toBe("epoch_changed");
		expect(next.items.has("m2")).toBe(false);
		expect(next.items.has("m1")).toBe(true);
	});

	test("reset envelopes set pendingReset", () => {
		const snapshot = reduce(emptySnapshot(), {
			v: 1,
			sessionId: "s1",
			ts: 1,
			reset: { reason: "journal_missing" },
		});
		expect(snapshot.pendingReset).toBe("journal_missing");
	});
});
