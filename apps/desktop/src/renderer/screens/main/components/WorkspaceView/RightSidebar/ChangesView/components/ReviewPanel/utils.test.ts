import { describe, expect, test } from "bun:test";
import type { PullRequestComment } from "@superset/local-db";
import {
	countOpenPullRequestComments,
	splitPullRequestComments,
} from "./utils";

describe("splitPullRequestComments", () => {
	test("separates resolved comments while keeping original order", () => {
		const comments: PullRequestComment[] = [
			{
				id: "conversation-1",
				authorLogin: "hubot",
				body: "Top-level comment",
				kind: "conversation",
				isResolved: false,
			},
			{
				id: "review-2",
				authorLogin: "octocat",
				body: "Inline resolved comment",
				kind: "review",
				isResolved: true,
			},
			{
				id: "review-3",
				authorLogin: "monalisa",
				body: "Inline unresolved comment",
				kind: "review",
				isResolved: false,
			},
		];

		expect(splitPullRequestComments(comments)).toEqual({
			active: [comments[0], comments[2]],
			resolved: [comments[1]],
		});
	});
});

describe("countOpenPullRequestComments", () => {
	test("counts only unresolved comments", () => {
		const comments: PullRequestComment[] = [
			{
				id: "conversation-1",
				authorLogin: "hubot",
				body: "Top-level comment",
				kind: "conversation",
				isResolved: false,
			},
			{
				id: "review-2",
				authorLogin: "octocat",
				body: "Inline resolved comment",
				kind: "review",
				isResolved: true,
			},
			{
				id: "review-3",
				authorLogin: "monalisa",
				body: "Inline unresolved comment",
				kind: "review",
			},
		];

		expect(countOpenPullRequestComments(comments)).toBe(2);
	});
});
