import { expect, test } from "bun:test";
import { normalizeThreadsToComments } from "./normalizeThreadsToComments";

test("retains replies, thread locations, and individual GitHub links in chronological order", () => {
	const author = { login: "reviewer", avatarUrl: "" };
	const result = normalizeThreadsToComments(
		{
			reviewThreads: [
				{
					id: "thread",
					path: "src/app.ts",
					line: 42,
					diffSide: "LEFT",
					isResolved: true,
					isOutdated: false,
					comments: [
						{
							id: "first",
							databaseId: 11,
							author,
							body: "Question",
							createdAt: "2026-09-12T00:00:00Z",
						},
						{
							id: "reply",
							databaseId: 12,
							author,
							body: "Answer",
							createdAt: "2026-09-12T02:00:00Z",
						},
					],
				},
			],
			conversationComments: [
				{
					id: 13,
					user: author,
					body: "Discussion",
					createdAt: "2026-09-12T01:00:00Z",
					htmlUrl: "https://github.com/example/repo/pull/1#issuecomment-13",
				},
			],
		},
		"https://github.com/example/repo/pull/1",
	);
	expect(result.map((comment) => comment.id)).toEqual(["first", "13", "reply"]);
	expect(result[0]?.url).toBe(
		"https://github.com/example/repo/pull/1#discussion_r11",
	);
	expect(result[1]?.url).toBe(
		"https://github.com/example/repo/pull/1#issuecomment-13",
	);
	expect(result[2]).toMatchObject({
		body: "Answer",
		url: "https://github.com/example/repo/pull/1#discussion_r12",
		path: "src/app.ts",
		line: 42,
		diffSide: "LEFT",
		threadId: "thread",
		isResolved: true,
	});
});
