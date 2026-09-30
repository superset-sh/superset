import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { projects, pullRequests } from "../../src/db/schema";
import { GitLabError } from "../../src/source-control/gitlab/exec-glab";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { seedPullRequest, seedWorkspace } from "../helpers/seed";

const instance = "https://gitlab.com";
const repoPath = "group/subgroup/project";
const headSha = "a".repeat(40);
const projectNumericId = 11;
const mergeRequest = {
	iid: 42,
	title: "Improve parser",
	description: "Review the parser changes",
	web_url: `${instance}/${repoPath}/-/merge_requests/42`,
	state: "opened",
	draft: false,
	sha: headSha,
	source_branch: "feature/parser",
	target_branch: "main",
	source_project_id: projectNumericId,
	target_project_id: projectNumericId,
	author: { username: "alice.name_1", avatar_url: `${instance}/avatar.png` },
	created_at: "2026-09-01T00:00:00Z",
	updated_at: "2026-09-02T00:00:00Z",
	head_pipeline: { id: 55, status: "success" },
	user: { can_merge: true },
	detailed_merge_status: "mergeable",
	diff_refs: {
		base_sha: "b".repeat(40),
		start_sha: "c".repeat(40),
		head_sha: headSha,
	},
};

describe("GitLab merge request host routes", () => {
	let host: TestHost;
	let localRepoPath: string;
	let projectId: string;
	let mergeConflict: boolean;
	let diffRefsReady: boolean;
	let calls: Array<{
		endpoint: string;
		method: string;
		fields?: Record<string, unknown>;
	}>;

	beforeEach(async () => {
		projectId = randomUUID();
		mergeConflict = false;
		diffRefsReady = true;
		calls = [];
		host = await createTestHost({
			execGlab: async ({ endpoint, method, fields }) => {
				const path = endpoint.replace(/^\/+/, "");
				calls.push({ endpoint: path, method: method ?? "GET", fields });
				if (path === `projects/${encodeURIComponent(repoPath)}`) {
					return {
						id: projectNumericId,
						path_with_namespace: repoPath,
						web_url: `${instance}/${repoPath}`,
					};
				}
				if (path === `projects/${projectNumericId}`) {
					return { merge_method: "merge", squash_option: "default_off" };
				}
				if (path === "user") return { username: "alice.name_1" };
				if (path === `projects/${projectNumericId}/merge_requests/42`) {
					return {
						...mergeRequest,
						diff_refs: diffRefsReady ? mergeRequest.diff_refs : null,
					};
				}
				if (path.startsWith(`projects/${projectNumericId}/merge_requests?`)) {
					return [mergeRequest];
				}
				if (
					path === `projects/${projectNumericId}/pipelines/55/jobs?per_page=100`
				) {
					return [
						{ id: 77, name: "test", status: "success", allow_failure: false },
					];
				}
				if (path === `projects/${projectNumericId}/jobs/77`) {
					return { id: 77, pipeline: { id: 55 } };
				}
				if (path === `projects/${projectNumericId}/jobs/77/trace`) {
					return "test job passed\n";
				}
				if (
					path === `projects/${projectNumericId}/merge_requests/42/raw_diffs`
				) {
					return "diff --git a/src/a.ts b/src/a.ts\n";
				}
				if (
					path ===
					`projects/${projectNumericId}/merge_requests/42/discussions?per_page=100`
				) {
					return [
						{
							id: "discussion-1",
							notes: [
								{
									id: 123,
									body: "Please add a test",
									created_at: "2026-09-02T00:00:00Z",
									resolvable: true,
									resolved: false,
									author: { username: "reviewer_1" },
									position: { new_path: "src/a.ts", new_line: 3 },
								},
							],
						},
					];
				}
				if (path === `projects/${projectNumericId}/merge_requests/42/merge`) {
					if (mergeConflict) throw new GitLabError("CONFLICT", instance, 409);
					return { state: "merged" };
				}
				if (
					path ===
						`projects/${projectNumericId}/merge_requests/42/discussions` &&
					method === "POST"
				) {
					return { id: "new-discussion", notes: [{ id: 124 }] };
				}
				if (
					path === `projects/${projectNumericId}/merge_requests/42/notes` &&
					method === "POST"
				) {
					return { id: 125 };
				}
				if (method === "PUT" || method === "POST") return { ok: true };
				throw new Error(`Unexpected GitLab request: ${path}`);
			},
		});
		localRepoPath = mkdtempSync(join(tmpdir(), "gitlab-mr-route-"));
		const git = simpleGit(localRepoPath);
		await git.init(["--initial-branch=main"]);
		await git.addRemote("origin", `${instance}/${repoPath}.git`);
		host.db
			.insert(projects)
			.values({
				id: projectId,
				repoPath: localRepoPath,
				repoProvider: "gitlab",
				repoInstance: instance,
				remoteName: "origin",
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		rmSync(localRepoPath, { recursive: true, force: true });
	});

	test("search and detail retain identity, checks, diffs, and discussions", async () => {
		const search =
			await host.trpc.workspaceCreation.searchGitLabMergeRequests.query({
				projectId,
				query: "",
			});
		expect(search.pullRequests[0]).toMatchObject({
			provider: "gitlab",
			instance,
			repoPath,
			prNumber: 42,
			authorLogin: "alice.name_1",
		});
		const target = {
			projectId,
			prNumber: 42,
			provider: "gitlab" as const,
			instance,
			repoPath,
		};
		const content = await host.trpc.pullRequests.getContent.query(target);
		expect(content).toMatchObject({
			headSha,
			checksStatus: "success",
			capabilities: { canMerge: true, mergeMethods: ["merge", "squash"] },
		});
		const diff = await host.trpc.pullRequests.getDiff.query(target);
		expect(diff.patch).toContain("diff --git");
		const threads = await host.trpc.pullRequests.getThreads.query(target);
		expect(threads.reviewThreads[0]).toMatchObject({
			id: "discussion-1",
			path: "src/a.ts",
			isResolved: false,
		});
		await expect(
			host.trpc.pullRequests.getContent.query({
				...target,
				instance: "https://other.example.com",
			}),
		).rejects.toThrow("different GitLab repository");
	});

	test("mutations target the MR and reject a changed head", async () => {
		const target = {
			projectId,
			prNumber: 42,
			provider: "gitlab" as const,
			instance,
			repoPath,
		};
		await host.trpc.pullRequests.replyToThread.mutate({
			...target,
			discussionId: "discussion-1",
			body: "Added a test",
		});
		await host.trpc.pullRequests.setThreadResolution.mutate({
			...target,
			threadId: "discussion-1",
			resolved: true,
		});
		await host.trpc.pullRequests.setState.mutate({
			...target,
			state: "closed",
		});
		await host.trpc.pullRequests.markReady.mutate(target);
		await host.trpc.pullRequests.mergePR.mutate({
			...target,
			headSha,
			mergeMethod: "squash",
		});
		expect(calls).toContainEqual(
			expect.objectContaining({
				endpoint: `projects/${projectNumericId}/merge_requests/42/merge`,
				method: "PUT",
				fields: { sha: headSha, squash: true },
			}),
		);
		expect(
			calls.some((call) => call.endpoint.includes("discussion-1/notes")),
		).toBe(true);
		expect(
			calls.some(
				(call) =>
					call.endpoint.endsWith("discussion-1") &&
					call.fields?.resolved === true,
			),
		).toBe(true);
		mergeConflict = true;
		await expect(
			host.trpc.pullRequests.mergePR.mutate({ ...target, headSha }),
		).rejects.toThrow("changed since it was reviewed");
	});

	test("posts general and positioned comments to the selected MR", async () => {
		const target = {
			projectId,
			prNumber: 42,
			provider: "gitlab" as const,
			instance,
			repoPath,
		};
		const general = await host.trpc.pullRequests.addComment.mutate({
			...target,
			body: "Looks good",
		});
		expect(general.url).toBe(`${mergeRequest.web_url}#note_125`);
		const positioned = await host.trpc.pullRequests.addComment.mutate({
			...target,
			body: "Please check this line",
			position: {
				path: "src/b.ts",
				oldPath: "src/a.ts",
				line: 3,
				side: "RIGHT",
				headSha,
			},
		});
		expect(positioned.url).toBe(`${mergeRequest.web_url}#note_124`);
		expect(calls).toContainEqual(
			expect.objectContaining({
				endpoint: `projects/${projectNumericId}/merge_requests/42/discussions`,
				method: "POST",
				fields: expect.objectContaining({
					position: expect.objectContaining({
						head_sha: headSha,
						new_line: 3,
						old_path: "src/a.ts",
						new_path: "src/b.ts",
					}),
				}),
			}),
		);
		await expect(
			host.trpc.pullRequests.addComment.mutate({
				...target,
				body: "Stale comment",
				position: {
					path: "src/a.ts",
					line: 3,
					side: "RIGHT",
					headSha: "d".repeat(40),
				},
			}),
		).rejects.toThrow("changed since it was reviewed");
		diffRefsReady = false;
		await expect(
			host.trpc.pullRequests.addComment.mutate({
				...target,
				body: "Diff not ready",
				position: { path: "src/a.ts", line: 3, side: "RIGHT", headSha },
			}),
		).rejects.toThrow("diff positions are not ready");
	});

	test("reads only job traces from the linked MR pipeline and instance", async () => {
		const { id: pullRequestId } = seedPullRequest(host, {
			projectId,
			repoProvider: "gitlab",
			repoOwner: "group/subgroup",
			repoName: "project",
			prNumber: 42,
			headBranch: "feature/parser",
			url: mergeRequest.web_url,
		});
		host.db
			.update(pullRequests)
			.set({ repoInstance: instance })
			.where(eq(pullRequests.id, pullRequestId))
			.run();
		const { id: workspaceId } = seedWorkspace(host, {
			projectId,
			worktreePath: localRepoPath,
			branch: "feature/parser",
			pullRequestId,
		});
		const detailsUrl = `${instance}/${repoPath}/-/jobs/77`;
		const result = await host.trpc.git.getCheckJobLogs.query({
			workspaceId,
			detailsUrl,
			acceptedProviders: ["github", "gitlab"],
		});
		expect(result.logs).toBe("test job passed\n");
		await expect(
			host.trpc.git.getCheckJobLogs.query({
				workspaceId,
				detailsUrl:
					"https://other.example.com/group/subgroup/project/-/jobs/77",
				acceptedProviders: ["github", "gitlab"],
			}),
		).rejects.toThrow("does not belong");
	});
});
