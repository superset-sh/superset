import { describe, expect, test } from "bun:test";
import type { ServerThread } from "../../types";
import { toThreads } from "./toThreads";

function row(overrides: Partial<ServerThread> = {}): ServerThread {
	return {
		id: "thread-1",
		anchorKind: "element",
		anchor: { path: "p:nth-of-type(1)", tag: "p", offsetX: 0.5, offsetY: 0.25 },
		anchorText: "A build-level description",
		intent: null,
		resolved: false,
		createdAt: new Date("2026-09-11T00:00:00Z"),
		version: 3,
		createdByUserId: "user-1",
		comments: [
			{
				id: "comment-1",
				body: "Looks good",
				authorKind: "human",
				authorUserId: "user-1",
				authorName: "Sarah",
				authorImage: null,
				createdAt: new Date("2026-09-11T01:00:00Z"),
			},
		],
		...overrides,
	};
}

describe("toThreads", () => {
	test("carries the anchor and its click point across", () => {
		const [thread] = toThreads([row()]);

		expect(thread?.anchor).toEqual({
			path: "p:nth-of-type(1)",
			tag: "p",
			text: "A build-level description",
			offsetX: 0.5,
			offsetY: 0.25,
		});
	});

	test("drops a thread with no anchor", () => {
		expect(toThreads([row({ anchor: null })])).toEqual([]);
	});

	test("falls back to empty anchor text", () => {
		const [thread] = toThreads([row({ anchorText: null })]);

		expect(thread?.anchor.text).toBe("");
	});

	test("converts comment timestamps to epoch millis", () => {
		const [thread] = toThreads([row()]);

		expect(thread?.comments[0]?.createdAt).toBe(
			new Date("2026-09-11T01:00:00Z").getTime(),
		);
	});
});
