import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projects, pullRequests, workspaces } from "../src/db/schema";
import { createTestHost } from "./helpers/createTestHost";

describe("GitLab request feature parity", () => {
	test.each([
		"gitlab.com",
		"gitlab.example.com",
	])("routes request operations to %s", async (hostName) => {
		const repoPath = mkdtempSync(join(tmpdir(), "gitlab-parity-"));
		const git = (...args: string[]) =>
			execFileSync("git", ["-C", repoPath, ...args], { stdio: "pipe" });
		git("init", "-b", "main");
		git(
			"-c",
			"user.name=Test",
			"-c",
			"user.email=test@example.com",
			"-c",
			"commit.gpgsign=false",
			"-c",
			"core.hooksPath=/dev/null",
			"commit",
			"--allow-empty",
			"-m",
			"initial",
		);
		git("checkout", "-b", "feature");
		git("config", "branch.feature.base", "main");
		git(
			"remote",
			"add",
			"origin",
			`https://${hostName}/group/subgroup/app.git`,
		);
		git("remote", "add", "github", "https://github.com/example/app.git");
		const calls: Array<{ args: string[]; cwd?: string; hostname?: string }> =
			[];
		let graphqlError = false;
		const mr = {
			iid: 42,
			title: "Change",
			description: "Description",
			web_url: `https://${hostName}/group/subgroup/app/-/merge_requests/42`,
			state: "opened",
			source_branch: "feature",
			target_branch: "main",
			sha: "abc123",
			source_project_id: 1,
			target_project_id: 1,
			draft: false,
			author: { username: "alex" },
		};
		const discussion = {
			id: "thread",
			notes: [
				{
					id: 12,
					body: "Please fix",
					author: { username: "reviewer" },
					position: { new_path: "file.ts", new_line: 3 },
					resolvable: true,
					resolved: false,
				},
			],
		};
		const host = await createTestHost({
			execGh: async (args) => {
				if (args.includes("search/issues"))
					return {
						total_count: 1,
						items: [
							{
								number: 7,
								title: "GitHub change",
								html_url: "https://github.com/example/app/pull/7",
								repository_url: "https://api.github.com/repos/example/app",
								state: "open",
								updated_at: "2026-09-26T12:00:00Z",
								user: { login: "github-author" },
								pull_request: {},
							},
						],
					};
				return { data: { repository: {} } };
			},
			githubFactory: async () => {
				throw new Error("GitLab must not call GitHub");
			},
			execGlab: async (args, options) => {
				calls.push({
					args,
					cwd: (options as { cwd?: string } | undefined)?.cwd,
					hostname: (options as { hostname?: string } | undefined)?.hostname,
				});
				if (args[0] !== "api") return {};
				if (args.includes("graphql")) {
					if (graphqlError)
						return { errors: [{ message: "GitLab search denied" }] };
					const query = args.find((arg) => arg.startsWith("query=")) ?? "";
					return {
						data: {
							project: {
								mergeRequests: {
									count: 2,
									pageInfo: {
										hasNextPage: !query.includes('after: "next"'),
										endCursor: "next",
									},
									nodes: [
										{
											iid: query.includes('after: "next"') ? "43" : "42",
											title: mr.title,
											webUrl: mr.web_url,
											state: "opened",
											draft: false,
											diffHeadSha: mr.sha,
											updatedAt: "2026-09-27T12:00:00Z",
											sourceBranch: "feature",
											author: {
												username: "alex.clay",
												avatarUrl: `https://${hostName}/avatar.png`,
											},
											diffStatsSummary: { additions: 3, deletions: 1 },
										},
									],
								},
							},
						},
					};
				}
				if (args.includes("user")) return { username: "alex.clay" };
				const path = args.find((arg) => arg.startsWith("projects/")) ?? "";
				if (path.endsWith("/members/all"))
					return [
						{
							username: "alex.clay",
							avatar_url: `https://${hostName}/avatar.png`,
						},
					];
				if (path.endsWith("/raw_diffs"))
					return "diff --git a/file.ts b/file.ts\n";
				if (path.endsWith("/discussions")) return [discussion];
				if (path.endsWith("/notes")) return { id: 13 };
				if (path.endsWith("/statuses"))
					return [{ name: "test", status: "success" }];
				if (path.endsWith("/approvals"))
					return {
						approved: true,
						approved_by: [{ user: { username: "reviewer" } }],
					};
				if (path.endsWith("/merge_requests"))
					return args.includes("POST") ? mr : [mr];
				return mr;
			},
		});
		try {
			host.db
				.insert(projects)
				.values({
					id: "project",
					name: "GitLab",
					repoPath,
					repoProvider: "gitlab",
					repoOwner: "group/subgroup",
					repoName: "app",
					repoUrl: `https://${hostName}/group/subgroup/app`,
					remoteName: "origin",
				})
				.run();
			host.db
				.insert(pullRequests)
				.values({
					id: "mr",
					headBranch: "feature",
					headSha: "abc123",
					projectId: "project",
					repoProvider: "gitlab",
					repoOwner: "group/subgroup",
					repoName: "app",
					prNumber: 42,
					title: mr.title,
					url: mr.web_url,
					state: "open",
				})
				.run();
			host.db
				.insert(workspaces)
				.values({
					id: "workspace",
					projectId: "project",
					worktreePath: repoPath,
					branch: "feature",
					pullRequestId: "mr",
				})
				.run();
			host.db
				.insert(projects)
				.values({
					id: "github-project",
					name: "GitHub",
					repoPath,
					repoProvider: "github",
					repoOwner: "example",
					repoName: "app",
					repoUrl: "https://github.com/example/app",
					remoteName: "github",
				})
				.run();
			const input = { projectId: "project", prNumber: 42 };
			const listInput = { projectId: "project" };
			const mixed = await host.trpc.workspaceCreation.searchPullRequests.query({
				...listInput,
				projectIds: ["project", "github-project"],
			});
			expect(mixed.totalCount).toBe(3);
			expect(mixed.pullRequests.map((pr) => pr.projectId)).toEqual([
				"project",
				"github-project",
			]);

			expect(
				await host.trpc.workspaceCreation.searchPullRequests.query({
					...listInput,
					review: "team-review-requested",
				}),
			).toMatchObject({ pullRequests: [], totalCount: 0 });
			const firstPage =
				await host.trpc.workspaceCreation.searchPullRequests.query(listInput);
			expect(firstPage).toMatchObject({
				totalCount: 2,
				hasNextPage: true,
				page: 1,
				pullRequests: [
					{
						prNumber: 42,
						repoProvider: "gitlab",
						authorLogin: "alex.clay",
						authorAvatarUrl: `https://${hostName}/avatar.png`,
						additions: 3,
						deletions: 1,
						checksStatus: "success",
					},
				],
			});
			const secondPage =
				await host.trpc.workspaceCreation.searchPullRequests.query({
					...listInput,
					page: 2,
				});
			expect(secondPage).toMatchObject({
				hasNextPage: false,
				page: 2,
				pullRequests: [{ prNumber: 43 }],
			});
			const cases = [
				[{ query: "#42" }, 'iids: ["42"]'],
				[{ query: mr.web_url }, 'iids: ["42"]'],
				[
					{ query: 'fix "quotes"' },
					`search: ${JSON.stringify('fix "quotes"')}`,
				],
				[{ mergedOnly: true }, "state: merged"],
				[{ author: "alex.clay" }, 'authorUsername: "alex.clay"'],
				[{ review: "changes-requested" }, "reviewState: REQUESTED_CHANGES"],
				[{ review: "approved" }, "reviewState: APPROVED"],
				[{ review: "required" }, "reviewStates: [UNREVIEWED, REVIEW_STARTED]"],
				[{ review: "reviewed-by-me" }, 'reviewerUsername: "alex.clay"'],
				[
					{ review: "not-reviewed-by-me" },
					'not: { reviewerUsername: "alex.clay"',
				],
				[{ viewerRelationship: "authored" }, 'authorUsername: "alex.clay"'],
				[
					{ viewerRelationship: "needs-review" },
					"reviewStates: [UNREVIEWED, REVIEW_STARTED]",
				],
				[
					{ viewerRelationship: "reviewed" },
					"reviewStates: [REVIEWED, APPROVED, REQUESTED_CHANGES, UNAPPROVED]",
				],
			] as const;
			for (const [filter, expected] of cases) {
				await host.trpc.workspaceCreation.searchPullRequests.query({
					...listInput,
					...filter,
				});
				const queryCall = calls.findLast((call) =>
					call.args.includes("graphql"),
				);
				expect(
					queryCall?.args.find((arg) => arg.startsWith("query=")),
				).toContain(expected);
			}
			expect(
				await host.trpc.workspaceCreation.searchPullRequests.query({
					...listInput,
					query: "https://wrong.example/group/subgroup/app/-/merge_requests/42",
				}),
			).toMatchObject({ totalCount: 0, repoMismatch: "group/subgroup/app" });
			expect(
				await host.trpc.workspaceCreation.getRepoContributors.query(listInput),
			).toEqual([
				{
					login: "alex.clay",
					avatarUrl: `https://${hostName}/avatar.png`,
					repoProvider: "gitlab",
				},
			]);

			graphqlError = true;
			await expect(
				host.trpc.workspaceCreation.searchPullRequests.query(listInput),
			).rejects.toThrow("GitLab search denied");
			const partial =
				await host.trpc.workspaceCreation.searchPullRequests.query({
					...listInput,
					projectIds: ["project", "github-project"],
				});
			expect(partial.pullRequests.map((pr) => pr.projectId)).toEqual([
				"github-project",
			]);
			graphqlError = false;
			const content = await host.trpc.pullRequests.getContent.query(input);
			expect(content).toMatchObject({
				number: 42,
				body: "Description",
				state: "open",
				branch: "feature",
				baseBranch: "main",
				author: "alex",
				checksStatus: "success",
			});
			expect(await host.trpc.pullRequests.getDiff.query(input)).toEqual({
				patch: "diff --git a/file.ts b/file.ts\n",
			});
			expect(
				(await host.trpc.pullRequests.getThreads.query(input)).reviewThreads[0]
					?.id,
			).toBe("thread");
			await host.trpc.pullRequests.setState.mutate({
				...input,
				state: "closed",
			});
			await host.trpc.pullRequests.setState.mutate({ ...input, state: "open" });
			await host.trpc.pullRequests.markReady.mutate({
				workspaceId: "workspace",
				prNumber: 42,
			});
			await host.trpc.pullRequests.mergePR.mutate({
				...input,
				mergeMethod: "squash",
			});
			await host.trpc.pullRequests.setThreadResolution.mutate({
				...input,
				threadId: "thread",
				resolved: true,
			});
			expect(
				await host.trpc.pullRequests.replyToThread.mutate({
					...input,
					commentId: 12,
					body: "Fixed",
				}),
			).toEqual({ id: 13 });
			expect(
				await host.trpc.git.replyToReviewThread.mutate({
					workspaceId: "workspace",
					commentId: 12,
					body: "Fixed in workspace",
				}),
			).toEqual({ id: 13 });
			await expect(
				host.trpc.pullRequests.replyToThread.mutate({
					...input,
					commentId: 999,
					body: "Wrong thread",
				}),
			).rejects.toThrow("does not belong");
			expect(
				await host.trpc.pullRequests.createForWorkspace.mutate({
					workspaceId: "workspace",
					title: "New change",
					body: "New body",
					draft: true,
				}),
			).toEqual({ number: 42, url: mr.web_url });
			expect(calls.some(({ args }) => args.includes("state_event=close"))).toBe(
				true,
			);
			expect(
				calls.some(({ args }) => args.includes("state_event=reopen")),
			).toBe(true);
			expect(
				calls.some(
					({ args }) =>
						args.includes("--ready") &&
						args.includes(`https://${hostName}/group/subgroup/app`),
				),
			).toBe(true);
			expect(
				calls.some(
					({ args }) =>
						args.includes("title=Draft: New change") &&
						args.includes("source_branch=feature") &&
						args.includes("target_branch=main"),
				),
			).toBe(true);
			expect(
				calls
					.filter((call) => call.args[0] === "api")
					.every((call) => call.hostname === hostName),
			).toBe(true);
			git("remote", "remove", "origin");
			await expect(
				host.trpc.pullRequests.setState.mutate({ ...input, state: "closed" }),
			).rejects.toThrow("Configured GitLab remote");
		} finally {
			await host.dispose();
			rmSync(repoPath, { recursive: true, force: true });
		}
	}, 30_000);
});
