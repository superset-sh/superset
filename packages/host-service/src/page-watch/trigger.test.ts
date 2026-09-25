import { describe, expect, it } from "bun:test";
import {
	agentIsBusy,
	MAX_PINGS_PER_THREAD,
	selectThreadsToDeliver,
} from "./trigger.ts";
import type { WatchedThread } from "./types.ts";

function thread(id: string, ids = [id]): WatchedThread {
	return {
		id,
		anchorKind: "page",
		anchor: null,
		anchorText: null,
		resolved: false,
		version: 1,
		comments: ids.map((id) => ({
			id,
			body: id,
			authorKind: "human",
			authorName: "Human",
			createdAt: new Date(0),
		})),
	};
}
const entry = (ids: string[] = [], pings = new Map<string, number>()) => ({
	seenCommentIds: new Set(ids),
	pings,
});
describe("selectThreadsToDeliver", () => {
	it("deduplicates IDs, not timestamps or host wall clocks", () => {
		const result = selectThreadsToDeliver(
			[thread("thread", ["seen", "new"])],
			entry(["seen"]),
		);
		expect(result.commentIds).toEqual(["new"]);
		expect(result.fired).toHaveLength(1);
	});
	it("does not deliver already acknowledged comments", () => {
		expect(
			selectThreadsToDeliver([thread("seen")], entry(["seen"])).fired,
		).toEqual([]);
	});
	it("does not react to agent replies", () => {
		const t = thread("agent");
		for (const c of t.comments) c.authorKind = "agent";
		expect(selectThreadsToDeliver([t], entry()).fired).toEqual([]);
	});
	it("retains unseen resolved comments for later reopening", () => {
		const t = thread("resolved");
		t.resolved = true;
		expect(selectThreadsToDeliver([t], entry()).commentIds).toEqual([]);
		t.resolved = false;
		expect(selectThreadsToDeliver([t], entry()).commentIds).toEqual([
			"resolved",
		]);
	});
	it("preserves ping ceiling and separately acknowledges suppressed IDs", () => {
		const result = selectThreadsToDeliver(
			[thread("capped"), thread("live")],
			entry([], new Map([["capped", MAX_PINGS_PER_THREAD]])),
		);
		expect(result.fired.map((t) => t.id)).toEqual(["live"]);
		expect(result.suppressed).toEqual(["capped"]);
		expect(result.commentIds).toEqual(["capped", "live"]);
		expect([...result.pings]).toEqual([["live", 1]]);
	});
	it("bounds a large thread batch without accidentally acknowledging unsent comments", () => {
		const t = thread(
			"large",
			Array.from({ length: 1001 }, (_, i) => `${i}`),
		);
		const first = selectThreadsToDeliver([t], entry());
		expect(first.commentIds).toHaveLength(1000);
		expect(first.fired[0]?.comments).toHaveLength(1000);
		const second = selectThreadsToDeliver(
			[t],
			entry(first.commentIds, first.pings),
		);
		expect(second.commentIds).toEqual(["1000"]);
	});
	it("bounds page batches while leaving excess threads for later", () => {
		const threads = Array.from({ length: 1001 }, (_, i) => thread(`${i}`));
		const result = selectThreadsToDeliver(threads, entry());
		expect(result.commentIds).toHaveLength(1000);
		expect(result.pings.size).toBe(1000);
	});
});
describe("agentIsBusy", () => {
	for (const type of ["Start", "PermissionRequest"])
		it(`holds ${type}`, () => expect(agentIsBusy(type)).toBe(true));
	for (const type of ["Stop", "Failed", "Attached", undefined])
		it(`allows ${type}`, () => expect(agentIsBusy(type)).toBe(false));
});
