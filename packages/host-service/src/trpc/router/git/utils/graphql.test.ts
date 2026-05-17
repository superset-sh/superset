import { describe, expect, test } from "bun:test";
import { type GraphQLThreadsResult, parseGraphQLThreads } from "./graphql";

function makeResult(
	thread: GraphQLThreadsResult["repository"]["pullRequest"]["reviewThreads"]["nodes"][number],
): GraphQLThreadsResult {
	return {
		repository: {
			pullRequest: {
				reviewThreads: {
					nodes: [thread],
				},
			},
		},
	};
}

describe("parseGraphQLThreads", () => {
	test("uses the thread-level current diff anchor", () => {
		const [thread] = parseGraphQLThreads(
			makeResult({
				id: "thread-1",
				isResolved: false,
				isOutdated: false,
				diffSide: "RIGHT",
				path: "src/current.ts",
				line: 42,
				originalLine: 21,
				comments: {
					nodes: [
						{
							id: "comment-1",
							databaseId: 1,
							author: { login: "octocat", avatarUrl: "" },
							body: "comment",
							createdAt: "2026-05-17T00:00:00Z",
							path: "src/old-comment-path.ts",
							line: 7,
							originalLine: 6,
						},
					],
				},
			}),
		);

		expect(thread).toMatchObject({
			path: "src/current.ts",
			line: 42,
			originalLine: 21,
			isOutdated: false,
		});
	});

	test("keeps outdated original-only anchors out of current diff lines", () => {
		const [thread] = parseGraphQLThreads(
			makeResult({
				id: "thread-2",
				isResolved: false,
				isOutdated: true,
				diffSide: "LEFT",
				path: "src/file.ts",
				line: null,
				originalLine: 12,
				comments: {
					nodes: [
						{
							id: "comment-2",
							databaseId: 2,
							author: null,
							body: "outdated",
							createdAt: "2026-05-17T00:00:00Z",
							path: "src/file.ts",
							line: null,
							originalLine: 12,
						},
					],
				},
			}),
		);

		expect(thread).toMatchObject({
			path: "src/file.ts",
			line: null,
			originalLine: 12,
			isOutdated: true,
		});
	});
});
