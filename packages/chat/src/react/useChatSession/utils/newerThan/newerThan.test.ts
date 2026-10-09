import { describe, expect, test } from "bun:test";
import { emptySnapshot, type SessionSnapshot } from "../../../../core";
import type { Envelope } from "../../../../protocol/envelope";
import type { AgentMessage } from "../../../../protocol/items";
import { newerThan } from "./newerThan";

const base = { v: 1 as const, sessionId: "s1", ts: 1 };

function message(id: string, completedAtMs?: number): AgentMessage {
	return {
		id,
		kind: "agent_message",
		startedAtMs: 1,
		text: "hello",
		...(completedAtMs === undefined ? {} : { completedAtMs }),
	};
}

const snapshot: SessionSnapshot = {
	...emptySnapshot(),
	items: new Map([
		["done", { item: message("done", 2), turnId: "t1" }],
		["streaming", { item: message("streaming"), turnId: "t1" }],
	]),
	cursor: { epoch: "e1", seq: 10 },
};

function durable(epoch: string, seq: number): Envelope {
	return {
		...base,
		cursor: { epoch, seq },
		event: { type: "session", session: { status: "idle" } },
	} as Envelope;
}

function text(itemId: string): Envelope {
	return { ...base, delta: { type: "text", itemId, append: " world" } };
}

describe("newerThan", () => {
	test("keeps durable events past the outline cursor or from another epoch", () => {
		const kept = newerThan(snapshot, [
			durable("e1", 9),
			durable("e1", 10),
			durable("e1", 11),
			durable("e2", 12),
		]);
		expect(kept).toEqual([durable("e1", 11), durable("e2", 12)]);
	});

	test("drops text for items the outline already has as finished, and resets", () => {
		const reset = { ...base, reset: { reason: "invalid_cursor" } };
		expect(
			newerThan(snapshot, [text("done"), text("streaming"), reset]),
		).toEqual([text("streaming")]);
	});
});
