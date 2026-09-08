import { describe, expect, it } from "bun:test";
import type { FrameRect } from "@superset/shared/page-comments-runtime";
import type { CommentThread } from "../../../../providers/CommentProvider";
import { groupByDay, groupThreads, newestActivity } from "./groupThreads";

const rect: FrameRect = { top: 0, left: 0, width: 10, height: 10 };

function thread(over: Partial<CommentThread> = {}): CommentThread {
	return {
		id: over.id ?? "t1",
		anchor: { path: "div > p", tag: "p", text: "axis" },
		resolved: over.resolved ?? false,
		version: over.version ?? 1,
		comments: over.comments ?? [],
	};
}

describe("groupThreads", () => {
	it("separates threads whose anchor still resolves from those that do not", () => {
		const result = groupThreads({
			threads: [thread({ id: "here" }), thread({ id: "gone" })],
			rects: { here: rect, gone: null },
			rectsReady: true,
			showResolved: true,
		});

		expect(result.anchored.map((t) => t.id)).toEqual(["here"]);
		expect(result.unanchored.map((t) => t.id)).toEqual(["gone"]);
	});

	it("treats a thread with no rect entry at all as unanchored", () => {
		const result = groupThreads({
			threads: [thread({ id: "unknown" })],
			rects: {},
			rectsReady: true,
			showResolved: true,
		});

		expect(result.unanchored.map((t) => t.id)).toEqual(["unknown"]);
	});

	it("holds every thread as anchored until the frame reports its rects", () => {
		const result = groupThreads({
			threads: [thread({ id: "a" }), thread({ id: "b" })],
			rects: {},
			rectsReady: false,
			showResolved: true,
		});

		expect(result.anchored.map((t) => t.id)).toEqual(["a", "b"]);
		expect(result.unanchored).toEqual([]);
	});

	it("hides resolved threads unless asked for them", () => {
		const threads = [
			thread({ id: "open" }),
			thread({ id: "done", resolved: true }),
		];
		const rects = { open: rect, done: rect };

		expect(
			groupThreads({
				threads,
				rects,
				rectsReady: true,
				showResolved: false,
			}).anchored.map((t) => t.id),
		).toEqual(["open"]);
		expect(
			groupThreads({
				threads,
				rects,
				rectsReady: true,
				showResolved: true,
			}).anchored.map((t) => t.id),
		).toEqual(["open", "done"]);
	});

	it("counts open threads regardless of the resolved filter", () => {
		const threads = [
			thread({ id: "a" }),
			thread({ id: "b" }),
			thread({ id: "c", resolved: true }),
		];
		const rects = { a: rect, b: null, c: rect };

		expect(
			groupThreads({ threads, rects, rectsReady: true, showResolved: false })
				.openCount,
		).toBe(2);
		expect(
			groupThreads({ threads, rects, rectsReady: true, showResolved: true })
				.openCount,
		).toBe(2);
	});
});

describe("newestActivity", () => {
	it("returns the most recent comment time", () => {
		const t = thread({
			comments: [
				{
					id: "c1",
					body: "a",
					authorName: "Sarah",
					authorImage: null,
					authorKind: "human",
					createdAt: 100,
				},
				{
					id: "c2",
					body: "b",
					authorName: "claude",
					authorImage: null,
					authorKind: "agent",
					createdAt: 300,
				},
			],
		});
		expect(newestActivity(t)).toBe(300);
	});

	it("returns zero for a thread with no comments", () => {
		expect(newestActivity(thread())).toBe(0);
	});
});

describe("groupByDay", () => {
	const at = (id: string, createdAt: number) =>
		thread({
			id,
			comments: [
				{
					id: `${id}-c`,
					body: "hi",
					authorName: "Sarah",
					authorImage: null,
					authorKind: "human",
					createdAt,
				},
			],
		});

	const noon = new Date(2026, 8, 8, 12).getTime();
	const evening = new Date(2026, 8, 8, 22).getTime();
	const yesterday = new Date(2026, 8, 7, 9).getTime();

	it("collects a day's threads under one group, newest day first", () => {
		const groups = groupByDay([at("old", yesterday), at("new", noon)]);

		expect(groups.map((group) => group.threads.map((t) => t.id))).toEqual([
			["new"],
			["old"],
		]);
		expect(groups[0]?.day).toBe(new Date(2026, 8, 8).getTime());
	});

	it("keeps threads from the same day together, newest first", () => {
		const groups = groupByDay([at("noon", noon), at("evening", evening)]);

		expect(groups).toHaveLength(1);
		expect(groups[0]?.threads.map((t) => t.id)).toEqual(["evening", "noon"]);
	});

	it("groups by the thread's newest reply, not by when it was started", () => {
		const stale = thread({
			id: "revived",
			comments: [
				{
					id: "c1",
					body: "opened long ago",
					authorName: "Sarah",
					authorImage: null,
					authorKind: "human",
					createdAt: yesterday,
				},
				{
					id: "c2",
					body: "replied today",
					authorName: "Sarah",
					authorImage: null,
					authorKind: "human",
					createdAt: noon,
				},
			],
		});

		expect(groupByDay([stale, at("today", evening)])).toHaveLength(1);
	});
});
