import { describe, expect, test } from "bun:test";
import type { ExecGlab } from "../../workspace-creation/utils/exec-glab";
import {
	fetchPullRequestDiscussionsFromGlab,
	parseGitLabDiscussions,
	setPullRequestDiscussionResolutionFromGlab,
} from "./gitlab-discussions";

describe("parseGitLabDiscussions", () => {
	test("separates diff discussions from conversation notes", () => {
		const result = parseGitLabDiscussions(
			[
				{
					id: "discussion-1",
					notes: [
						{
							id: 10,
							body: "Please rename this",
							author: { username: "marius", avatar_url: "avatar" },
							created_at: "2026-08-21T10:00:00Z",
							resolvable: true,
							resolved: false,
							position: { new_path: "src/a.ts", new_line: 12 },
						},
					],
				},
				{
					id: "discussion-2",
					notes: [
						{
							id: 11,
							body: "Looks good",
							author: { username: "alexander" },
						},
					],
				},
			],
			"https://gitlab.com/acme/app/-/merge_requests/42",
		);

		expect(result.reviewThreads[0]).toMatchObject({
			id: "discussion-1",
			path: "src/a.ts",
			line: 12,
			diffSide: "RIGHT",
			isResolved: false,
		});
		expect(result.conversationComments[0]).toMatchObject({
			id: 11,
			body: "Looks good",
			htmlUrl: "https://gitlab.com/acme/app/-/merge_requests/42#note_11",
		});
	});
});

describe("GitLab discussion requests", () => {
	test("fetches discussions for the explicit repository through glab", async () => {
		const calls: string[][] = [];
		const execGlab: ExecGlab = async (args) => {
			calls.push(args);
			return [];
		};

		await fetchPullRequestDiscussionsFromGlab(
			execGlab,
			{ owner: "acme/platform", name: "app" },
			42,
			"https://gitlab.com/acme/platform/app/-/merge_requests/42",
			"/repo",
		);

		expect(calls[0]).toContain(
			"projects/acme%2Fplatform%2Fapp/merge_requests/42/discussions",
		);
	});

	test("updates discussion resolution through the matching glab helper", async () => {
		const calls: string[][] = [];
		const execGlab: ExecGlab = async (args) => {
			calls.push(args);
			return {};
		};

		await setPullRequestDiscussionResolutionFromGlab(
			execGlab,
			{ owner: "acme", name: "app" },
			42,
			"discussion-1",
			true,
			"/repo",
		);

		expect(calls[0]).toContain(
			"projects/acme%2Fapp/merge_requests/42/discussions/discussion-1",
		);
		expect(calls[0]).toContain("resolved=true");
	});
});
