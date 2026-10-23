import { describe, expect, mock, test } from "bun:test";
import type { NormalizedComment } from "../../../../../../components/CommentsSection/types";

mock.module("../../components/PullRequestCommentCard", () => ({
	PullRequestCommentCard: () => null,
}));
const { buildReviewThreadEntries } = await import("./buildReviewThreadEntries");

function comment(
	id: string,
	overrides: Partial<NormalizedComment> = {},
): NormalizedComment {
	return {
		id,
		authorLogin: "reviewer",
		body: id,
		kind: "review",
		isResolved: false,
		createdAt: "2026-10-03T10:00:00Z",
		...overrides,
	};
}

describe("review thread entries", () => {
	test("one entry per thread, keyed by its root with the replies folded in", () => {
		const entries = buildReviewThreadEntries({
			target: {
				organizationId: "org",
				repoFullName: "owner/repo",
				prNumber: 1,
			},
			comments: [
				comment("a1", { threadId: "A", authorLogin: "maya", avatarUrl: "x" }),
				comment("b1", { threadId: "B", createdAt: "2026-10-03T11:00:00Z" }),
				comment("a2", { threadId: "A", createdAt: "2026-10-03T12:00:00Z" }),
				comment("c1", { createdAt: undefined }),
			],
		});
		expect(
			entries.map(({ id, createdAt, author }) => ({ id, createdAt, author })),
		).toEqual([
			{
				id: "a1",
				createdAt: "2026-10-03T10:00:00Z",
				author: { login: "maya", avatarUrl: "x" },
			},
			{
				id: "b1",
				createdAt: "2026-10-03T11:00:00Z",
				author: { login: "reviewer", avatarUrl: undefined },
			},
			{
				id: "c1",
				createdAt: null,
				author: { login: "reviewer", avatarUrl: undefined },
			},
		]);
		const card = entries[0]?.card as {
			props: { replies: NormalizedComment[] };
		};
		expect(card.props.replies.map((reply) => reply.id)).toEqual(["a2"]);
	});
});
