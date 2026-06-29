import { describe, expect, it } from "bun:test";
import type { Octokit } from "@octokit/rest";
import type { GraphQLThreadsResult } from "../../../trpc/router/git/utils/graphql";
import {
	fetchReviewThreadsGitHub,
	setReviewThreadResolutionGitHub,
} from "./github-review";

const repo = { owner: "acme", name: "widget" };
const prNumber = 42;

/** Minimal GraphQLThreadsResult with no threads. */
const emptyGraphQLResult: GraphQLThreadsResult = {
	repository: {
		pullRequest: {
			reviewThreads: {
				nodes: [],
			},
		},
	},
};

/** A minimal GraphQLThreadsResult with one thread and one comment. */
const oneThreadGraphQLResult: GraphQLThreadsResult = {
	repository: {
		pullRequest: {
			reviewThreads: {
				nodes: [
					{
						id: "thread-1",
						isResolved: false,
						diffSide: "RIGHT",
						comments: {
							nodes: [
								{
									id: "comment-1",
									databaseId: 101,
									author: {
										login: "alice",
										avatarUrl: "https://example.com/alice.png",
									},
									body: "Nice work",
									createdAt: "2024-01-01T00:00:00Z",
									path: "src/foo.ts",
									line: 10,
									originalLine: 10,
								},
							],
						},
					},
				],
			},
		},
	},
};

function makeListCommentsResponse(
	count: number,
	startId = 1,
): {
	data: Array<{
		id: number;
		body: string;
		user: { login: string; avatar_url: string };
		created_at: string;
		html_url: string;
	}>;
} {
	return {
		data: Array.from({ length: count }, (_, i) => ({
			id: startId + i,
			body: `Comment ${startId + i}`,
			user: { login: "alice", avatar_url: "https://example.com/alice.png" },
			created_at: "2024-01-01T00:00:00Z",
			html_url: `https://github.com/acme/widget/issues/${prNumber}#issuecomment-${startId + i}`,
		})),
	};
}

function makeOctokit(
	graphql: (mutation: string, vars?: unknown) => Promise<unknown>,
	listComments: (params: unknown) => Promise<unknown>,
): Octokit {
	return {
		graphql,
		issues: { listComments },
	} as unknown as Octokit;
}

describe("fetchReviewThreadsGitHub", () => {
	it("returns parsed threads + comments on success", async () => {
		const octokit = makeOctokit(
			async () => oneThreadGraphQLResult,
			async () => makeListCommentsResponse(1),
		);

		const result = await fetchReviewThreadsGitHub(
			{ github: async () => octokit },
			repo,
			prNumber,
		);

		expect(result.reviewThreads).toHaveLength(1);
		expect(result.reviewThreads[0]?.id).toBe("thread-1");
		expect(result.reviewThreads[0]?.isResolved).toBe(false);
		expect(result.reviewThreads[0]?.path).toBe("src/foo.ts");

		expect(result.conversationComments).toHaveLength(1);
		expect(result.conversationComments[0]?.id).toBe(1);
		expect(result.conversationComments[0]?.body).toBe("Comment 1");
		expect(result.conversationComments[0]?.user.login).toBe("alice");
	});

	it("graphql throws → reviewThreads is [] but comments still returned", async () => {
		const octokit = makeOctokit(
			async () => {
				throw new Error("GraphQL network error");
			},
			async () => makeListCommentsResponse(2),
		);

		const result = await fetchReviewThreadsGitHub(
			{ github: async () => octokit },
			repo,
			prNumber,
		);

		expect(result.reviewThreads).toEqual([]);
		expect(result.conversationComments).toHaveLength(2);
	});

	it("listComments throws → conversationComments is [] but threads still returned", async () => {
		const octokit = makeOctokit(
			async () => oneThreadGraphQLResult,
			async () => {
				throw new Error("REST API error");
			},
		);

		const result = await fetchReviewThreadsGitHub(
			{ github: async () => octokit },
			repo,
			prNumber,
		);

		expect(result.reviewThreads).toHaveLength(1);
		expect(result.conversationComments).toEqual([]);
	});

	it("pagination: listComments returns 100 then <100 → loops twice, stops", async () => {
		let callCount = 0;
		const octokit = makeOctokit(
			async () => emptyGraphQLResult,
			async () => {
				callCount++;
				if (callCount === 1) return makeListCommentsResponse(100, 1);
				return makeListCommentsResponse(3, 101);
			},
		);

		const result = await fetchReviewThreadsGitHub(
			{ github: async () => octokit },
			repo,
			prNumber,
		);

		expect(callCount).toBe(2);
		expect(result.conversationComments).toHaveLength(103);
	});

	it("empty-body comments are skipped", async () => {
		const octokit = makeOctokit(
			async () => emptyGraphQLResult,
			async () => ({
				data: [
					{
						id: 1,
						body: "Valid comment",
						user: { login: "alice", avatar_url: "" },
						created_at: "2024-01-01T00:00:00Z",
						html_url: "https://example.com",
					},
					{
						id: 2,
						body: "   ",
						user: { login: "bob", avatar_url: "" },
						created_at: "2024-01-01T00:00:00Z",
						html_url: "https://example.com",
					},
					{
						id: 3,
						body: null,
						user: { login: "carol", avatar_url: "" },
						created_at: "2024-01-01T00:00:00Z",
						html_url: "https://example.com",
					},
					{
						id: 4,
						body: "",
						user: { login: "dave", avatar_url: "" },
						created_at: "2024-01-01T00:00:00Z",
						html_url: "https://example.com",
					},
				],
			}),
		);

		const result = await fetchReviewThreadsGitHub(
			{ github: async () => octokit },
			repo,
			prNumber,
		);

		expect(result.conversationComments).toHaveLength(1);
		expect(result.conversationComments[0]?.id).toBe(1);
		expect(result.conversationComments[0]?.body).toBe("Valid comment");
	});
});

describe("setReviewThreadResolutionGitHub", () => {
	it("resolved=true calls graphql with resolveReviewThread mutation", async () => {
		let capturedMutation = "";
		const octokit = makeOctokit(
			async (mutation: string) => {
				capturedMutation = mutation;
				return {};
			},
			async () => ({}),
		);

		await setReviewThreadResolutionGitHub(
			{ github: async () => octokit },
			"thread-abc",
			true,
		);

		expect(capturedMutation).toContain("resolveReviewThread");
		expect(capturedMutation).not.toContain("unresolveReviewThread");
	});

	it("resolved=false calls graphql with unresolveReviewThread mutation", async () => {
		let capturedMutation = "";
		const octokit = makeOctokit(
			async (mutation: string) => {
				capturedMutation = mutation;
				return {};
			},
			async () => ({}),
		);

		await setReviewThreadResolutionGitHub(
			{ github: async () => octokit },
			"thread-abc",
			false,
		);

		// The mutation must call unresolveReviewThread (not resolveReviewThread).
		// Note: "unresolveReviewThread" contains "resolveReviewThread" as a substring,
		// so check for the bare mutation name with word boundary via regex.
		expect(capturedMutation).toMatch(/unresolveReviewThread/);
		expect(capturedMutation).not.toMatch(/(?<!un)resolveReviewThread/);
	});

	it("graphql throw propagates (rejects)", async () => {
		const octokit = makeOctokit(
			async () => {
				throw new Error("Mutation failed");
			},
			async () => ({}),
		);

		await expect(
			setReviewThreadResolutionGitHub(
				{ github: async () => octokit },
				"thread-abc",
				true,
			),
		).rejects.toThrow("Mutation failed");
	});
});
