import { describe, expect, test } from "bun:test";
import type { TurnGroup } from "@superset/chat/core";
import {
	JUMP_TOP_OFFSET_PX,
	distanceFromBottom,
	isNearBottom,
	latestUserItemId,
	shouldScrollToLatest,
} from "./scrollLogic";

function group(turnId: string, ...entries: TurnGroup["entries"]): TurnGroup {
	return { turnId, turn: null, entries };
}

const userMessage = (id: string): TurnGroup["entries"][number] => ({
	kind: "item",
	item: { id, kind: "user_message", content: [], startedAtMs: 1 },
});

const agentMessage = (id: string): TurnGroup["entries"][number] => ({
	kind: "item",
	item: { id, kind: "agent_message", text: "hi", startedAtMs: 1 },
});

describe("latestUserItemId", () => {
	test("returns the most recent user message, scanning groups from the end", () => {
		expect(
			latestUserItemId([
				group("t1", userMessage("u1"), agentMessage("a1")),
				group("t2", agentMessage("a2"), userMessage("u2")),
			]),
		).toBe("u2");
	});

	test("finds a user message even when later groups contain none", () => {
		expect(
			latestUserItemId([
				group("t1", agentMessage("a0"), userMessage("u0")),
				group("t2", agentMessage("a1")),
			]),
		).toBe("u0");
	});

	test("returns null when there is no user message", () => {
		expect(latestUserItemId([group("t1", agentMessage("a1"))])).toBeNull();
		expect(latestUserItemId([])).toBeNull();
	});
});

describe("isNearBottom / JUMP_TOP_OFFSET_PX", () => {
	const scrollHeight = 1000;
	const clientHeight = 300;

	test("counts the bottom when the remaining distance is within the offset", () => {
		// scrollTop = 1000 - 300 - 8 => exactly on the threshold, still "bottom"
		expect(isNearBottom(scrollHeight, 692, clientHeight)).toBe(true);
		expect(isNearBottom(scrollHeight, 693, clientHeight)).toBe(true);
		expect(isNearBottom(scrollHeight, scrollHeight - clientHeight, clientHeight)).toBe(true);
	});

	test("no longer counts once the user scrolls up past the offset", () => {
		expect(isNearBottom(scrollHeight, 691, clientHeight)).toBe(false);
		expect(isNearBottom(scrollHeight, 0, clientHeight)).toBe(false);
	});

	test("distanceFromBottom decreases as the user scrolls down", () => {
		expect(distanceFromBottom(scrollHeight, 0, clientHeight)).toBe(700);
		expect(distanceFromBottom(scrollHeight, 692, clientHeight)).toBe(JUMP_TOP_OFFSET_PX);
	});
});

describe("shouldScrollToLatest (jump button / re-anchor gating)", () => {
	test("scrolls when near the bottom and the anchor is new", () => {
		expect(
			shouldScrollToLatest({ anchorItemId: "u2", lastAnchorItemId: "u1", nearBottom: true }),
		).toBe(true);
	});

	test("does NOT re-anchor when the anchor is unchanged even if back at the bottom", () => {
		expect(
			shouldScrollToLatest({ anchorItemId: "u2", lastAnchorItemId: "u2", nearBottom: true }),
		).toBe(false);
	});

	test("does NOT yank an already-scrolled-up user even when a new anchor arrives", () => {
		expect(
			shouldScrollToLatest({ anchorItemId: "u3", lastAnchorItemId: "u2", nearBottom: false }),
		).toBe(false);
	});

	test("does nothing when there is no anchor", () => {
		expect(
			shouldScrollToLatest({ anchorItemId: null, lastAnchorItemId: null, nearBottom: true }),
		).toBe(false);
		expect(
			shouldScrollToLatest({ anchorItemId: null, lastAnchorItemId: "u1", nearBottom: true }),
		).toBe(false);
	});
});
