import { describe, expect, it } from "bun:test";
import type { CommentThread } from "../../../../providers/CommentProvider";
import type { FrameRect } from "../../../../utils/commentRuntime";
import { groupThreads, newestActivity } from "./groupThreads";

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
