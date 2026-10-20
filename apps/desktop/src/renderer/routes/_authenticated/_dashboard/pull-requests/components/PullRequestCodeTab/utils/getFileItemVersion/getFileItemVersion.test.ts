import { describe, expect, test } from "bun:test";
import { getFileItemVersion } from "./getFileItemVersion";

const thread = {
	side: "additions",
	lineNumber: 4,
	metadata: { kind: "thread", threadId: "t1", comments: [{ body: "hi" }] },
};

describe("getFileItemVersion", () => {
	test("is stable for identical data from a new fetch", () => {
		const first = getFileItemVersion({
			contentKey: "abc",
			annotations: [thread],
			collapsed: false,
		});
		const refetched = getFileItemVersion({
			contentKey: "abc",
			annotations: [structuredClone(thread)],
			collapsed: false,
		});
		expect(refetched).toBe(first);
	});

	test("changes when the file's patch changes", () => {
		const base = { annotations: [thread], collapsed: false };
		expect(getFileItemVersion({ ...base, contentKey: "abc" })).not.toBe(
			getFileItemVersion({ ...base, contentKey: "abd" }),
		);
	});

	test("changes when a thread on the file changes", () => {
		const edited = {
			...thread,
			metadata: { ...thread.metadata, comments: [{ body: "hi, edited" }] },
		};
		const base = { contentKey: "abc", collapsed: false };
		expect(getFileItemVersion({ ...base, annotations: [thread] })).not.toBe(
			getFileItemVersion({ ...base, annotations: [edited] }),
		);
		expect(getFileItemVersion({ ...base, annotations: [thread] })).not.toBe(
			getFileItemVersion({ ...base, annotations: undefined }),
		);
	});

	test("changes when the file collapses", () => {
		const base = { contentKey: "abc", annotations: undefined };
		expect(getFileItemVersion({ ...base, collapsed: false })).not.toBe(
			getFileItemVersion({ ...base, collapsed: true }),
		);
	});
});
