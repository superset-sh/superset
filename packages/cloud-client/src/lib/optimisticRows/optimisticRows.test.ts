import { describe, expect, test } from "bun:test";
import { optimisticComment, optimisticThread } from "./optimisticRows";

const user = { id: "u1", name: "Ada", image: "https://example.test/a.png" };

describe("optimisticComment", () => {
	test("attributes the row to the acting user as a human author", () => {
		const comment = optimisticComment({ body: "hello", user });
		expect(comment.body).toBe("hello");
		expect(comment.authorKind).toBe("human");
		expect(comment.authorUserId).toBe("u1");
		expect(comment.authorName).toBe("Ada");
		expect(comment.authorImage).toBe("https://example.test/a.png");
		expect(comment.createdAt).toBeInstanceOf(Date);
	});

	test("gives every row a distinct id so placeholders never collide", () => {
		const first = optimisticComment({ body: "a", user });
		const second = optimisticComment({ body: "b", user });
		expect(first.id).not.toBe(second.id);
	});
});

describe("optimisticThread", () => {
	test("defaults anchor, anchorText and intent to null when omitted", () => {
		const thread = optimisticThread({
			input: { body: "hi" },
			user,
			version: 3,
		});
		expect(thread.anchor).toBeNull();
		expect(thread.anchorText).toBeNull();
		expect(thread.intent).toBeNull();
		expect(thread.anchorKind).toBe("element");
		expect(thread.resolved).toBe(false);
		expect(thread.version).toBe(3);
		expect(thread.createdByUserId).toBe("u1");
	});

	test("carries the body through as its single first comment", () => {
		const thread = optimisticThread({
			input: { body: "hi" },
			user,
			version: 1,
		});
		expect(thread.comments).toHaveLength(1);
		expect(thread.comments[0]?.body).toBe("hi");
		expect(thread.comments[0]?.authorUserId).toBe("u1");
	});

	test("preserves a supplied anchor, anchorText and intent", () => {
		const anchor = { path: "p", tag: "p", offsetX: 0.5, offsetY: 0.25 };
		const thread = optimisticThread({
			input: { anchor, anchorText: "quoted", body: "x", intent: "delete" },
			user,
			version: 2,
		});
		expect(thread.anchor).toEqual(anchor);
		expect(thread.anchorText).toBe("quoted");
		expect(thread.intent).toBe("delete");
	});
});
