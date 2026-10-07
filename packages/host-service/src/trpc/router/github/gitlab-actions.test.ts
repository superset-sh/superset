import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { spawnSync as runIsolatedTest } from "node:child_process";
import { mkdtempSync as makeTestCwd, rmSync as removeTestCwd } from "node:fs";
import type { HostServiceContext } from "../../../types";

if (process.env.SUPERSET_HOST_GITLAB_MOCK_FIXTURE !== "github-actions") {
	test("github-actions runs with isolated owned module boundaries", () => {
		const cwd = makeTestCwd("/tmp/superset-host-github-actions-");
		try {
			const child = runIsolatedTest(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						GIT_CONFIG_GLOBAL: "/dev/null",
						GIT_CONFIG_NOSYSTEM: "1",
						GIT_TERMINAL_PROMPT: "0",
						SUPERSET_HOST_GITLAB_MOCK_FIXTURE: "github-actions",
					},
					stdio: "pipe",
					timeout: 60000,
				},
			);
			if (child.stdout) process.stdout.write(child.stdout);
			if (child.stderr) process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			removeTestCwd(cwd, { recursive: true, force: true });
		}
	}, 65000);
} else {
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Unexpected outbound transport in owned GitLab test");
		},
		{ preconnect: () => {} },
	);
	const fixtureModule0 = { config: () => ({ parsed: {} }) };
	const fixtureModuleName0: string = "dotenv";
	mock.module(fixtureModuleName0, () => fixtureModule0);
	const importedModule0 = await import(fixtureModuleName0);
	for (const [name, value] of Object.entries(fixtureModule0))
		expect(Reflect.get(importedModule0, name)).toBe(value);
	const { Octokit } = await import("@octokit/rest");
	let remote = "";
	const fixtureModule1 = {
		createUserSimpleGit: () => ({
			revparse: async () => "/owned/fake-checkout",
			raw: async () => `remote.origin.url ${remote}`,
		}),
	};
	mock.module("../../../runtime/git/simple-git", () => fixtureModule1);
	const importedModule1 = await import("../../../runtime/git/simple-git");
	for (const [name, value] of Object.entries(fixtureModule1))
		expect(Reflect.get(importedModule1, name)).toBe(value);

	const workerPoolFixture = {
		getHostWorkerPool: () => ({
			run: <T, R>(
				task: import("../../../workers/define-worker-task").WorkerTaskDefinition<
					T,
					R
				>,
				input: T,
			) => task.handler(input),
		}),
	};
	mock.module("../../../workers/host-worker-pool", () => workerPoolFixture);
	const importedWorkerPool = await import("../../../workers/host-worker-pool");
	expect(
		Object.is(
			importedWorkerPool.getHostWorkerPool,
			workerPoolFixture.getHostWorkerPool,
		),
	).toBe(true);

	const { githubRouter } = await import("./github");
	const { gitRouter } = await import("../git/git");
	const originalFetch = globalThis.fetch;
	const HOST = "git.example.invalid:8443";
	const OWNER = "group/sub";
	const NAME = "app";
	const URL = `https://${HOST}/${OWNER}/${NAME}/-/merge_requests/42`;
	const THREAD = `gitlab:git.example.invalid%3A8443:group/sub/app:42:discussion`;
	let tokenHosts: string[];
	let requests: { path: string; method: string; body: unknown }[];
	let respond: (url: globalThis.URL, init?: RequestInit) => Response;

	function mr() {
		return {
			id: 100,
			iid: 42,
			title: "Draft: change",
			description: "description",
			web_url: URL,
			state: "opened",
			draft: true,
			source_branch: "feature",
			target_branch: "main",
			source_project_id: 1,
			target_project_id: 1,
			sha: "abc123",
			author: { id: 7, username: "author" },
			created_at: "2026-01-01T00:00:00Z",
			updated_at: "2026-01-02T00:00:00Z",
			merged_at: null,
			merged_by: null,
			reviewers: [{ username: "reviewer", avatar_url: "avatar" }],
			detailed_merge_status: "not_approved",
			blocking_discussions_resolved: false,
			has_conflicts: false,
			user: { can_merge: true },
			rebase_in_progress: false,
			changes_count: "1",
		};
	}

	function context(): HostServiceContext {
		return {
			isAuthenticated: true,
			db: {
				query: {
					projects: {
						findFirst: () => ({
							sync: () => ({
								repoPath: "/owned/fake-checkout",
								repoProvider: "gitlab",
								repoUrl: `https://${HOST}/${OWNER}/${NAME}`,
							}),
						}),
					},
					workspaces: {
						findFirst: () => ({
							sync: () => ({
								id: "workspace",
								projectId: "project",
								pullRequestId: "pr",
							}),
						}),
					},
					pullRequests: {
						findFirst: () => ({
							sync: () => ({
								projectId: "project",
								repoProvider: "gitlab",
								repoHost: HOST,
								repoOwner: OWNER,
								repoName: NAME,
								prNumber: 42,
								url: URL,
								checksJson: "[]",
								reviewStateJson: '{"provider":"gitlab"}',
							}),
						}),
					},
				},
			},
			credentials: {
				getToken: async (host?: string) => {
					tokenHosts.push(host ?? "");
					return "fake-token";
				},
				getCredentials: async () => ({ env: {} }),
				credentialRemedy: () => "",
			},
			github: async () => {
				throw new Error("GitHub must not run for GitLab");
			},
		} as unknown as HostServiceContext;
	}
	const input = () => ({
		owner: OWNER,
		repo: NAME,
		pullNumber: 42,
		provider: "gitlab" as const,
		host: HOST,
		projectId: "project",
		expectedUrl: URL,
	});

	beforeEach(() => {
		remote = `https://${HOST}/${OWNER}/${NAME}.git`;
		tokenHosts = [];
		requests = [];
		respond = (url, init) => {
			if (url.pathname.endsWith("/diffs"))
				return Response.json([
					{
						old_path: "a",
						new_path: "a",
						diff: "@@ -1 +1,2 @@\n-old\n+new\n+++literal\n",
					},
				]);
			if (url.pathname.endsWith("/approvals"))
				return Response.json({
					approvals_required: 2,
					approvals_left: 1,
					approved_by: [{ user: { username: "approved" } }],
				});
			if (url.pathname.endsWith("/discussions"))
				return Response.json([
					{
						id: "discussion",
						notes: [
							{
								id: 9,
								body: "review",
								author: { username: "reviewer", avatar_url: "avatar" },
								created_at: "now",
								system: false,
								resolvable: true,
								resolved: false,
								position: { new_path: "a", new_line: 1 },
							},
						],
					},
				]);
			if (url.pathname.endsWith("/notes")) return Response.json({ id: 91 });
			if (url.pathname.endsWith("/trace")) return new Response("job output");
			if (
				url.pathname.endsWith("/pipelines") ||
				url.pathname.endsWith("/statuses")
			)
				return Response.json([]);
			if (url.pathname.endsWith("/user"))
				return Response.json({ id: 7, username: "author" });
			if (url.pathname.endsWith("/projects/group%2Fsub%2Fapp"))
				return Response.json({
					id: 1,
					merge_method: "merge",
					squash_option: "default_on",
					permissions: { project_access: { access_level: 30 } },
				});
			if (url.pathname.endsWith("/merge"))
				return Response.json({
					...mr(),
					state: "merged",
					merge_commit_sha: "merged",
				});
			if (init?.method === "PUT" && url.pathname.endsWith("/rebase"))
				return Response.json({ rebase_in_progress: false });
			return Response.json(mr());
		};
		globalThis.fetch = Object.assign(
			async (value: string | URL | Request, init?: RequestInit) => {
				const url = new globalThis.URL(String(value));
				expect(url.origin).toBe(`https://${HOST}`);
				expect(new Headers(init?.headers).get("authorization")).toBe(
					"Bearer fake-token",
				);
				requests.push({
					path: url.pathname,
					method: init?.method ?? "GET",
					body: init?.body ? JSON.parse(String(init.body)) : null,
				});
				return respond(url, init);
			},
			{ preconnect: originalFetch.preconnect },
		);
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("GitLab detail carries live review policy and complete diff counts without GitHub", async () => {
		const result = await githubRouter
			.createCaller(context())
			.getPullRequestDetail(input());
		expect(result.pullRequest.title).toBe("Draft: change");
		expect([
			result.pullRequest.additions,
			result.pullRequest.deletions,
			result.pullRequest.changedFiles,
		]).toEqual([2, 1, 1]);
		expect(result.pullRequest).toMatchObject({ diffStatsComplete: true });
		expect(result.mergeability.requiredApprovals).toBe(2);
		expect(result.mergeability.unresolvedThreads).toBe(1);
		expect(result.capabilities.dequeue).toBe(false);
		expect(tokenHosts.every((host) => host === HOST)).toBe(true);
	});

	test("GitLab merge uses scoped adapter and preserves the selected squash option", async () => {
		const result = await githubRouter
			.createCaller(context())
			.mergePR({ ...input(), mergeMethod: "merge", squash: false });
		expect(result).toEqual({
			sha: "merged",
			merged: true,
			message: "Draft: change",
		});
		expect(
			requests.find(
				(request) =>
					request.method === "PUT" && request.path.endsWith("/merge"),
			)?.body,
		).toEqual({ squash: false });
	});

	test("GitLab mutations reject a repointed remote before obtaining credentials", async () => {
		remote = "https://other.example.invalid:8443/group/sub/app.git";
		await expect(
			githubRouter.createCaller(context()).mergePR(input()),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("GitLab workspace reviews resolve and reply using exact host/project/MR identity", async () => {
		const caller = gitRouter.createCaller(context());
		const threads = await caller.getPullRequestThreads({
			workspaceId: "workspace",
		});
		expect(threads.reviewThreads[0]?.id).toBe(THREAD);
		expect(
			await caller.setReviewThreadResolution({
				workspaceId: "workspace",
				threadId: THREAD,
				resolved: true,
			}),
		).toEqual({ threadId: THREAD, isResolved: true });
		expect(
			await caller.replyToReviewThread({
				workspaceId: "workspace",
				commentId: 9,
				threadId: THREAD,
				body: " reply ",
			}),
		).toEqual({ id: 91 });
		expect(
			requests
				.filter((request) => request.method !== "GET")
				.map((request) => [request.method, request.path, request.body]),
		).toEqual([
			[
				"PUT",
				"/api/v4/projects/group%2Fsub%2Fapp/merge_requests/42/discussions/discussion",
				{ resolved: true },
			],
			[
				"POST",
				"/api/v4/projects/group%2Fsub%2Fapp/merge_requests/42/discussions/discussion/notes",
				{ body: "reply" },
			],
		]);
	});

	test("GitLab thread context cannot target another host or MR before credential lookup", async () => {
		const caller = gitRouter.createCaller(context());
		await expect(
			caller.setReviewThreadResolution({
				workspaceId: "workspace",
				threadId: THREAD.replace(":42:", ":43:"),
				resolved: true,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("GitLab job trace URL must match selected host and project", async () => {
		const caller = gitRouter.createCaller(context());
		expect(
			await caller.getCheckJobLogs({
				workspaceId: "workspace",
				detailsUrl: `https://${HOST}/${OWNER}/${NAME}/-/jobs/8`,
			}),
		).toEqual({ logs: "job output" });
		expect(requests.at(-1)?.path).toBe(
			"/api/v4/projects/group%2Fsub%2Fapp/jobs/8/trace",
		);
		requests = [];
		tokenHosts = [];
		await expect(
			caller.getCheckJobLogs({
				workspaceId: "workspace",
				detailsUrl: `https://${HOST}/${OWNER}/other/-/jobs/8`,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
	});

	test("legacy GitHub status retains actual Octokit response fields and request defaults", async () => {
		let request: unknown;
		const octokit = new Octokit({
			request: {
				fetch: async (_url: string | URL | Request) => {
					request = String(_url);
					return new Response(
						JSON.stringify([
							{
								number: 12,
								draft: true,
								head: { ref: "topic" },
								extra: "retained",
							},
						]),
						{ headers: { "content-type": "application/json" } },
					);
				},
			},
		});
		const ctx = context();
		ctx.github = async () => octokit;
		const result = await githubRouter
			.createCaller(ctx)
			.getPRStatus({ owner: "owner", repo: "repo", branch: "topic" });
		expect(result).toMatchObject({
			number: 12,
			draft: true,
			head: { ref: "topic" },
			extra: "retained",
		});
		expect(String(request)).toContain("head=owner%3Atopic&state=open");
	});

	test("GitLab ready, branch rebase and reopen retain adapter request methods and bodies", async () => {
		const caller = githubRouter.createCaller(context());
		await caller.markPullRequestReady(input());
		await caller.updatePullRequestBranch(input());
		await caller.reopenPullRequest(input());
		expect(
			requests
				.filter((request) => request.method === "PUT")
				.map((request) => [request.path, request.body]),
		).toEqual([
			[
				"/api/v4/projects/group%2Fsub%2Fapp/merge_requests/42",
				{ title: "change" },
			],
			["/api/v4/projects/group%2Fsub%2Fapp/merge_requests/42/rebase", {}],
			[
				"/api/v4/projects/group%2Fsub%2Fapp/merge_requests/42",
				{ state_event: "reopen" },
			],
		]);
	});

	test("GitLab explicit identity rejects host, repo, MR URL and workspace contradictions before credentials", async () => {
		const caller = githubRouter.createCaller(context());
		for (const changed of [
			{ host: "other.invalid:8443" },
			{ repo: "other" },
			{ expectedUrl: URL.replace("/42", "/43") },
			{ expectedUrl: `${URL}?private_token=unsafe` },
			{ expectedUrl: `${URL}#fragment` },
			{ projectId: "different", workspaceId: "workspace" },
			{ pullNumber: 0 },
			{ pullNumber: 42.5 },
		])
			await expect(
				caller.mergePR({ ...input(), ...changed }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("GitLab replies require the comment to belong to the selected discussion", async () => {
		await expect(
			gitRouter.createCaller(context()).replyToReviewThread({
				workspaceId: "workspace",
				commentId: 99,
				threadId: THREAD,
				body: "reply",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(requests.some((request) => request.method === "POST")).toBe(false);
	});

	test("GitLab job log rejects foreign origins, ports, query auth and noncanonical job paths", async () => {
		const caller = gitRouter.createCaller(context());
		for (const detailsUrl of [
			`http://${HOST}/${OWNER}/${NAME}/-/jobs/8`,
			`https://git.example.invalid/${OWNER}/${NAME}/-/jobs/8`,
			`https://user:pass@${HOST}/${OWNER}/${NAME}/-/jobs/8`,
			`https://${HOST}/${OWNER}/${NAME}/-/jobs/8?private_token=unsafe`,
			`https://${HOST}/${OWNER}/${NAME}/-/jobs/8/trace`,
			`https://${HOST}/${OWNER}/${NAME}/-/jobs/9007199254740992`,
		])
			await expect(
				caller.getCheckJobLogs({ workspaceId: "workspace", detailsUrl }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("GitLab remote refusal preserves meaningful action error codes without raw bodies", async () => {
		respond = () => new Response("sensitive upstream body", { status: 409 });
		await expect(
			githubRouter.createCaller(context()).mergePR(input()),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	test("GitLab detail retains metadata and actions when diff data is unavailable", async () => {
		const ordinary = respond;
		for (const flag of ["too_large", "collapsed"]) {
			respond = (url, init) =>
				url.pathname.endsWith("/diffs")
					? Response.json([{ [flag]: true }])
					: ordinary(url, init);
			const result = await githubRouter
				.createCaller(context())
				.getPullRequestDetail(input());
			expect(result.pullRequest).toMatchObject({
				title: "Draft: change",
				additions: 0,
				deletions: 0,
				changedFiles: 0,
				diffStatsComplete: false,
			});
			expect(result.mergeability.requiredApprovals).toBe(2);
			expect(result.capabilities.markReady).toBe(true);
		}
	});

	test("GitLab partial diff counts carry an honest completeness marker", async () => {
		const ordinary = respond;
		for (const changes_count of [
			"1000+",
			"",
			undefined,
			"2",
			"9007199254740992",
		]) {
			respond = (url, init) =>
				url.pathname.endsWith("/merge_requests/42")
					? Response.json({ ...mr(), changes_count })
					: ordinary(url, init);
			const result = await githubRouter
				.createCaller(context())
				.getPullRequestDetail(input());
			expect(result.pullRequest).toMatchObject({
				additions: 2,
				deletions: 1,
				changedFiles: 1,
				diffStatsComplete: false,
			});
			expect(result.mergeability.requiredApprovals).toBe(2);
		}
	});

	test("GitLab unavailable-diff handling does not swallow authentication failures", async () => {
		const ordinary = respond;
		respond = (url, init) =>
			url.pathname.endsWith("/diffs")
				? new Response("private provider message", { status: 401 })
				: ordinary(url, init);
		await expect(
			githubRouter.createCaller(context()).getPullRequestDetail(input()),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	test("legacy GitHub merge retains complete Octokit result and merge-method default", async () => {
		let sent: unknown;
		const octokit = new Octokit({
			request: {
				fetch: async (_url: string | URL | Request, init?: RequestInit) => {
					sent = JSON.parse(String(init?.body));
					return Response.json({
						sha: "github-sha",
						merged: true,
						message: "merged",
						extra: "retained",
					});
				},
			},
		});
		const ctx = context();
		ctx.github = async () => octokit;
		expect(
			await githubRouter
				.createCaller(ctx)
				.mergePR({ owner: "owner", repo: "repo", pullNumber: 5 }),
		).toMatchObject({ sha: "github-sha", extra: "retained" });
		expect(sent).toEqual({ merge_method: "merge" });
	});

	test("GitLab job URLs reject raw traversal before URL normalization can erase it", async () => {
		const caller = gitRouter.createCaller(context());
		await expect(
			caller.getCheckJobLogs({
				workspaceId: "workspace",
				detailsUrl: `https://${HOST}/${OWNER}/${NAME}/-/jobs/9/%2e%2e/8`,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("GitLab still-computing mergeability stays unknown instead of a final blocked verdict", async () => {
		const ordinary = respond;
		respond = (url, init) =>
			url.pathname.endsWith("/merge_requests/42")
				? Response.json({ ...mr(), detailed_merge_status: "checking" })
				: ordinary(url, init);
		const detail = await githubRouter
			.createCaller(context())
			.getPullRequestDetail(input());
		expect(detail.mergeability.mergeStateStatus).toBe("UNKNOWN");
	});
}
