import { describe, expect, test } from "bun:test";
import type { ServerComment, ServerThread } from "../../types";
import {
	appendComment,
	editCommentBody,
	insertThread,
	removeThread,
	replaceComment,
	replaceThread,
	setThreadResolved,
} from "./threadRows";

function comment(overrides: Partial<ServerComment> = {}): ServerComment {
	return {
		id: "comment-1",
		body: "Looks good",
		authorKind: "human",
		authorUserId: "user-1",
		authorName: "Sarah",
		authorImage: null,
		createdAt: new Date("2026-09-11T00:00:00Z"),
		...overrides,
	};
}

function thread(overrides: Partial<ServerThread> = {}): ServerThread {
	return {
		id: "thread-1",
		anchorKind: "element",
		anchor: { path: "p:nth-of-type(1)", tag: "p" },
		anchorText: "A build-level description",
		intent: null,
		resolved: false,
		createdAt: new Date("2026-09-11T00:00:00Z"),
		version: 3,
		createdByUserId: "user-1",
		comments: [comment()],
		...overrides,
	};
}

describe("replaceThread", () => {
	test("swaps the placeholder for the server row", () => {
		const rows = [thread({ id: "optimistic-abc" })];
		const saved = thread({ id: "thread-real" });

		expect(replaceThread(rows, "optimistic-abc", saved)).toEqual([saved]);
	});

	test("leaves other threads untouched", () => {
		const other = thread({ id: "thread-other" });
		const rows = [other, thread({ id: "optimistic-abc" })];
		const saved = thread({ id: "thread-real" });

		expect(replaceThread(rows, "optimistic-abc", saved)).toEqual([
			other,
			saved,
		]);
	});

	test("is a no-op when the placeholder already went away", () => {
		const rows = [thread({ id: "thread-other" })];

		expect(replaceThread(rows, "optimistic-abc", thread())).toEqual(rows);
	});
});

describe("replaceComment", () => {
	test("swaps the placeholder reply for the server row", () => {
		const placeholder = comment({ id: "optimistic-xyz", body: "typing" });
		const rows = [thread({ comments: [comment(), placeholder] })];
		const saved = comment({ id: "comment-real", body: "typing" });

		const next = replaceComment(rows, "thread-1", "optimistic-xyz", saved);

		expect(next[0]?.comments).toEqual([comment(), saved]);
	});

	test("does not touch a different thread", () => {
		const placeholder = comment({ id: "optimistic-xyz" });
		const rows = [
			thread({ id: "thread-other", comments: [placeholder] }),
			thread({ comments: [placeholder] }),
		];

		const next = replaceComment(rows, "thread-1", "optimistic-xyz", comment());

		expect(next[0]?.comments).toEqual([placeholder]);
	});
});

describe("appendComment", () => {
	test("adds the reply to its own thread only", () => {
		const rows = [thread(), thread({ id: "thread-other", comments: [] })];
		const added = comment({ id: "comment-2" });

		const next = appendComment(rows, "thread-1", added);

		expect(next[0]?.comments).toHaveLength(2);
		expect(next[1]?.comments).toHaveLength(0);
	});
});

describe("setThreadResolved", () => {
	test("flips only the named thread", () => {
		const rows = [thread(), thread({ id: "thread-other" })];

		const next = setThreadResolved(rows, "thread-1", true);

		expect(next[0]?.resolved).toBe(true);
		expect(next[1]?.resolved).toBe(false);
	});
});

describe("editCommentBody", () => {
	test("rewrites the matching comment across threads", () => {
		const rows = [thread(), thread({ id: "thread-other", comments: [] })];

		const next = editCommentBody(rows, "comment-1", "Edited");

		expect(next[0]?.comments[0]?.body).toBe("Edited");
	});
});

describe("insertThread and removeThread", () => {
	test("appends a new thread", () => {
		const added = thread({ id: "thread-2" });

		expect(insertThread([thread()], added)).toHaveLength(2);
	});

	test("drops the named thread", () => {
		const rows = [thread(), thread({ id: "thread-2" })];

		expect(removeThread(rows, "thread-1")).toEqual([
			thread({ id: "thread-2" }),
		]);
	});
});
