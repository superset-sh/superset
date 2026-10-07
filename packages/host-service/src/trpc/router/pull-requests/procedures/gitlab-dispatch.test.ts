import type { Database as SqliteDatabase } from "bun:sqlite";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { spawnSync as runIsolatedTest } from "node:child_process";
import { mkdtempSync as makeTestCwd, rmSync as removeTestCwd } from "node:fs";
import type { SimpleGit } from "simple-git";
import type { HostDb } from "../../../../db/db";
import type { HostServiceContext } from "../../../../types";
import type { WorkerTaskDefinition } from "../../../../workers/define-worker-task";

if (process.env.SUPERSET_HOST_GITLAB_MOCK_FIXTURE !== "pr-dispatch") {
	test("pr-dispatch runs with isolated owned module boundaries", () => {
		const cwd = makeTestCwd("/tmp/superset-host-pr-dispatch-");
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
						SUPERSET_HOST_GITLAB_MOCK_FIXTURE: "pr-dispatch",
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
	const { Database } = await import("bun:sqlite");
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import(
		"node:fs"
	);
	const { tmpdir } = await import("node:os");
	const { join, resolve } = await import("node:path");
	const { Octokit } = await import("@octokit/rest");
	const { drizzle } = await import("drizzle-orm/bun-sqlite");
	const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
	const { applyRepoSchema } = await import("../../../../db/repo-schema");
	const schema = await import("../../../../db/schema");
	const { createUserSimpleGit } = await import(
		"../../../../runtime/git/simple-git"
	);
	const fixtureModule1 = {
		getHostWorkerPool: () => ({
			run: <T, R>(task: WorkerTaskDefinition<T, R>, input: T) =>
				task.handler(input),
		}),
	};
	mock.module("../../../../workers/host-worker-pool", () => fixtureModule1);
	const importedModule1 = await import("../../../../workers/host-worker-pool");
	for (const [name, value] of Object.entries(fixtureModule1))
		expect(Reflect.get(importedModule1, name)).toBe(value);
	let ghResponse: unknown;
	let ghFailure: Error | undefined;
	let ghInvocations: string[][] = [];
	const fixtureModule2 = {
		execGh: async (args: string[]) => {
			ghInvocations.push(args);
			if (ghFailure) throw ghFailure;
			return ghResponse;
		},
	};
	mock.module("../../workspace-creation/utils/exec-gh", () => fixtureModule2);
	const importedModule2 = await import(
		"../../workspace-creation/utils/exec-gh"
	);
	for (const [name, value] of Object.entries(fixtureModule2))
		expect(Reflect.get(importedModule2, name)).toBe(value);

	const { router } = await import("../../../index");
	const { createForWorkspace } = await import("./create-for-workspace");
	const { getContent } = await import("./get-content");
	const { getDiff } = await import("./get-diff");
	const { getLinkedWorkspace } = await import("./get-linked-workspace");
	const { getThreads } = await import("./get-threads");
	const { mergePR } = await import("./merge");
	const { replyToThread } = await import("./reply-to-thread");
	const { setState } = await import("./set-state");
	const { setThreadResolution } = await import("./set-thread-resolution");
	const testRouter = router({
		createForWorkspace,
		getContent,
		getDiff,
		getLinkedWorkspace,
		getThreads,
		mergePR,
		replyToThread,
		setState,
		setThreadResolution,
	});

	let directory: string;
	let sqlite: SqliteDatabase;
	let db: HostDb;
	let git: SimpleGit;
	let repoPath: string;
	let projectId: string;
	let serial = 0;
	let tokenHosts: string[];
	let requests: {
		url: URL;
		method: string;
		body: unknown;
		authorization: string | null;
	}[];
	let respond: (url: URL, init?: RequestInit) => Response | Promise<Response>;
	let refreshFailure = false;
	let refreshCalls: string[][] = [];
	const originalFetch = globalThis.fetch;
	const originalNow = Date.now;
	let HOST = "git.example.invalid:8443";
	const OWNER = "group/sub";
	const NAME = "app";
	const IID = 42;
	const threadId = (host = HOST, project = `${OWNER}/${NAME}`, iid = IID) =>
		`gitlab:${encodeURIComponent(host)}:${project}:${iid}:discussion`;

	function mr(host = HOST) {
		return {
			iid: IID,
			title: host,
			description: "body",
			web_url: `https://${host}/${OWNER}/${NAME}/-/merge_requests/${IID}`,
			state: "opened",
			source_branch: "feature",
			target_branch: "main",
			source_project_id: 1,
			target_project_id: 1,
			sha: "sha",
			draft: false,
			author: { username: "user" },
			created_at: "2026-01-01",
			updated_at: "2026-01-02",
		};
	}
	const json = (value: unknown, status = 200) =>
		Response.json(value, { status });

	function context(
		overrides: Partial<HostServiceContext> = {},
	): HostServiceContext {
		return {
			db,
			isAuthenticated: true,
			credentials: {
				getToken: async (host) => {
					tokenHosts.push(host ?? "");
					return `fake-${host}`;
				},
				getCredentials: async () => ({ env: {} }),
				credentialRemedy: () => "",
			},
			github: async () => {
				throw new Error("GitHub client must not run for GitLab");
			},
			runtime: {
				pullRequests: {
					refreshPullRequestsByWorkspaces: async (ids: string[]) => {
						refreshCalls.push(ids);
						if (refreshFailure) throw new Error("refresh unavailable");
					},
				},
			},
			...overrides,
		} as HostServiceContext;
	}
	const caller = (overrides?: Partial<HostServiceContext>) =>
		testRouter.createCaller(context(overrides));

	beforeEach(async () => {
		directory = mkdtempSync(join(tmpdir(), "superset-pr-dispatch-"));
		repoPath = join(directory, "repo");
		mkdirSync(repoPath);
		git = createUserSimpleGit(repoPath);
		await git.init();
		await git.addConfig("core.hooksPath", join(directory, "empty-hooks"));
		await git.addConfig("commit.gpgSign", "false");
		await git.addRemote("origin", `https://${HOST}/${OWNER}/${NAME}.git`);
		sqlite = new Database(":memory:");
		const testDb = drizzle(sqlite, { schema });
		migrate(testDb, {
			migrationsFolder: resolve(import.meta.dir, "../../../../../drizzle"),
		});
		applyRepoSchema(sqlite);
		db = testDb as unknown as HostDb;
		projectId = `project-${++serial}`;
		HOST = `git-${serial}.example.invalid:8443`;
		await git.remote([
			"set-url",
			"origin",
			`https://${HOST}/${OWNER}/${NAME}.git`,
		]);
		db.insert(schema.projects)
			.values({
				id: projectId,
				repoPath,
				repoProvider: "gitlab",
				repoUrl: `https://${HOST}/${OWNER}/${NAME}`,
			})
			.run();
		tokenHosts = [];
		requests = [];
		ghInvocations = [];
		ghFailure = undefined;
		refreshFailure = false;
		refreshCalls = [];
		respond = (url) => {
			if (url.pathname.endsWith("/diffs"))
				return json([
					{
						old_path: "a.txt",
						new_path: "a.txt",
						diff: "@@ -1 +1 @@\n-old\n+new\n",
					},
				]);
			if (url.pathname.endsWith("/discussions"))
				return json([
					{
						id: "discussion",
						notes: [
							{
								id: 9,
								body: "review",
								author: { username: "user", avatar_url: "avatar" },
								created_at: "now",
								resolvable: true,
								resolved: false,
								system: false,
								position: {
									new_path: "a.txt",
									old_path: "a.txt",
									new_line: 1,
									old_line: null,
								},
							},
						],
					},
				]);
			if (
				url.pathname.endsWith("/pipelines") ||
				url.pathname.endsWith("/statuses")
			)
				return json([]);
			return json(mr(url.host));
		};
		globalThis.fetch = Object.assign(
			async (input: string | URL | Request, init?: RequestInit) => {
				const url = new URL(
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url,
				);
				requests.push({
					url,
					method: init?.method ?? "GET",
					body: init?.body ? JSON.parse(String(init.body)) : undefined,
					authorization: new Headers(init?.headers).get("Authorization"),
				});
				return respond(url, init);
			},
			{ preconnect: originalFetch.preconnect },
		);
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
		Date.now = originalNow;
		sqlite?.close();
		rmSync(directory, { recursive: true, force: true });
	});

	test("GitLab content uses the live nested project and exact host credential, with neutral open state", async () => {
		const result = await caller().getContent({ projectId, prNumber: IID });
		expect(result).toMatchObject({
			title: HOST,
			state: "open",
			branch: "feature",
			baseBranch: "main",
			headRepositoryOwner: OWNER,
			checks: [],
		});
		expect(requests[0]?.url.pathname).toBe(
			"/api/v4/projects/group%2Fsub%2Fapp/merge_requests/42",
		);
		expect(
			requests.every(
				(request) =>
					request.url.host === HOST &&
					request.authorization === `Bearer fake-${HOST}`,
			),
		).toBe(true);
		expect(ghInvocations).toEqual([]);
	});

	test("GitLab content and diff caches coalesce callers, isolate instances and evict errors", async () => {
		const api = caller();
		await Promise.all([
			api.getContent({ projectId, prNumber: IID }),
			api.getContent({ projectId, prNumber: IID }),
		]);
		expect(
			requests.filter((r) => r.url.pathname.endsWith("/merge_requests/42")),
		).toHaveLength(1);
		const patches = await Promise.all([
			api.getDiff({ projectId, prNumber: IID }),
			api.getDiff({ projectId, prNumber: IID }),
		]);
		expect(patches[0]?.patch).toContain("diff --git a/a.txt b/a.txt");
		expect(
			requests.filter((r) => r.url.pathname.endsWith("/diffs")),
		).toHaveLength(1);
		await git.remote([
			"set-url",
			"origin",
			"https://other.invalid:9443/group/sub/app.git",
		]);
		db.update(schema.projects)
			.set({ repoUrl: "https://other.invalid:9443/group/sub/app" })
			.run();
		expect((await api.getContent({ projectId, prNumber: IID })).title).toBe(
			"other.invalid:9443",
		);
		respond = () => json({ message: "unavailable" }, 503);
		await expect(api.getDiff({ projectId, prNumber: 43 })).rejects.toThrow();
		respond = () => json([]);
		expect(await api.getDiff({ projectId, prNumber: 43 })).toEqual({
			patch: "",
		});
	});

	test("GitLab threads retain positions and encoded instance context", async () => {
		expect(
			await caller().getThreads({ projectId, prNumber: IID }),
		).toMatchObject({
			fetchFailed: false,
			reviewThreads: [
				{ id: threadId(), path: "a.txt", line: 1, diffSide: "RIGHT" },
			],
		});
	});

	test("GitLab state and merge writes dispatch to the selected instance", async () => {
		respond = (_url, init) =>
			json(
				init?.method === "PUT"
					? { ...mr(), state: "merged", merge_commit_sha: "merged-sha" }
					: mr(),
			);
		expect(
			await caller().setState({ projectId, prNumber: IID, state: "closed" }),
		).toEqual({ ok: true });
		expect(requests[0]?.body).toEqual({ state_event: "close" });
		expect(
			await caller().mergePR({
				projectId,
				prNumber: IID,
				mergeMethod: "squash",
				commitMessage: "message",
			}),
		).toEqual({ sha: "merged-sha", merged: true, message: HOST });
		expect(requests[1]?.body).toEqual({
			squash: true,
			squash_commit_message: "message",
		});
	});

	test("GitLab postwrite close and draft reopen update only the exact native row", async () => {
		seedReadCompatibilityPr("current-write", "gitlab");
		seedReadCompatibilityWorkspace("current-write-workspace", "current-write");
		sqlite
			.query("UPDATE pull_requests SET is_draft=1 WHERE id='current-write'")
			.run();
		for (const [id, provider, host, owner] of [
			["other-provider", "github", "github.com", OWNER],
			["other-host", "gitlab", "foreign.invalid:8443", OWNER],
			["other-port", "gitlab", HOST.replace(":8443", ":9443"), OWNER],
			["other-case", "gitlab", HOST, OWNER.toUpperCase()],
		] as const) {
			seedReadCompatibilityPr(id, provider, host, owner);
			seedReadCompatibilityWorkspace(`${id}-workspace`, id);
		}
		const api = caller();
		expect(
			await api.setState({ projectId, prNumber: IID, state: "closed" }),
		).toEqual({ ok: true });
		expect(
			sqlite
				.query(
					"SELECT state,merged_at FROM pull_requests WHERE id='current-write'",
				)
				.get(),
		).toEqual({ state: "closed", merged_at: null });
		expect(refreshCalls).toEqual([["current-write-workspace"]]);
		expect(
			sqlite
				.query(
					"SELECT id,state FROM pull_requests WHERE id<>'current-write' ORDER BY id",
				)
				.all(),
		).toEqual([
			{ id: "other-case", state: "open" },
			{ id: "other-host", state: "open" },
			{ id: "other-port", state: "open" },
			{ id: "other-provider", state: "open" },
		]);
		expect(
			await api.setState({ projectId, prNumber: IID, state: "open" }),
		).toEqual({ ok: true });
		expect(
			sqlite
				.query(
					"SELECT state,merged_at FROM pull_requests WHERE id='current-write'",
				)
				.get(),
		).toEqual({ state: "draft", merged_at: null });
		expect(refreshCalls).toEqual([
			["current-write-workspace"],
			["current-write-workspace"],
		]);
		expect(ghInvocations).toEqual([]);
	});

	for (const merged of [true, false])
		test(`GitLab postwrite merge result ${merged} is preserved and refreshes the exact current link`, async () => {
			seedReadCompatibilityPr("current-write", "gitlab");
			seedReadCompatibilityWorkspace(
				"current-write-workspace",
				"current-write",
			);
			seedReadCompatibilityWorkspace(
				"archived-write-workspace",
				"current-write",
				10,
				10,
				1,
			);
			respond = () =>
				json({
					...mr(),
					state: merged ? "merged" : "opened",
					merge_commit_sha: "native-write-sha",
				});
			const result = await caller().mergePR({
				projectId,
				prNumber: IID,
				expectedUrl: mr().web_url,
			});
			expect(result).toEqual({
				sha: "native-write-sha",
				merged,
				message: HOST,
			});
			expect(
				sqlite
					.query(
						"SELECT state,merged_at FROM pull_requests WHERE id='current-write'",
					)
					.get(),
			).toEqual({
				state: merged ? "merged" : "open",
				merged_at: merged ? expect.any(Number) : null,
			});
			expect(refreshCalls).toEqual([["current-write-workspace"]]);
			expect(ghInvocations).toEqual([]);
		});

	for (const failure of ["DB", "refresh"])
		test(`GitLab postwrite ${failure} failure cannot turn an accepted provider mutation into a rejection`, async () => {
			seedReadCompatibilityPr("current-write", "gitlab");
			seedReadCompatibilityWorkspace(
				"current-write-workspace",
				"current-write",
			);
			if (failure === "DB")
				sqlite.exec(
					"CREATE TRIGGER reject_owned_postwrite BEFORE UPDATE ON pull_requests BEGIN SELECT RAISE(ABORT,'OWNED_SYNC_DB_FAILURE'); END",
				);
			else refreshFailure = true;
			expect(
				await caller().setState({ projectId, prNumber: IID, state: "closed" }),
			).toEqual({ ok: true });
			expect(
				sqlite
					.query("SELECT state FROM pull_requests WHERE id='current-write'")
					.get(),
			).toEqual({ state: failure === "DB" ? "open" : "closed" });
			expect(refreshCalls).toEqual(
				failure === "DB" ? [] : [["current-write-workspace"]],
			);
			expect(requests).toHaveLength(1);
		});

	test("GitLab postwrite provider rejection changes no cached host rows and refreshes nothing", async () => {
		seedReadCompatibilityPr("current-write", "gitlab");
		seedReadCompatibilityWorkspace("current-write-workspace", "current-write");
		respond = () => json({ message: "unauthorized" }, 401);
		await expect(
			caller().setState({ projectId, prNumber: IID, state: "closed" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(
			sqlite
				.query("SELECT state FROM pull_requests WHERE id='current-write'")
				.get(),
		).toEqual({ state: "open" });
		expect(refreshCalls).toEqual([]);
	});

	test("GitLab reply supplements legacy numeric commentId and returns the new note ID", async () => {
		respond = () => json({ id: 99 });
		const input = {
			projectId,
			prNumber: IID,
			commentId: 9,
			threadId: threadId(),
			body: "reply",
		};
		expect(await caller().replyToThread(input)).toEqual({ id: 99 });
		expect(requests[0]?.url.pathname).toEndWith(
			"/merge_requests/42/discussions/discussion/notes",
		);
		expect(requests[0]?.body).toEqual({ body: "reply" });
	});

	test.each([
		"host",
		"project",
		"iid",
		"encoding",
	])("rejects mismatched thread %s before credentials or HTTP", async (kind) => {
		await git.addRemote("github", "https://github.com/fallback/app.git");
		const github = async () => ({
			pulls: {
				createReplyForReviewComment: async () => ({ data: { id: 99 } }),
			},
		});
		const id =
			kind === "host"
				? threadId("wrong.invalid:8443")
				: kind === "project"
					? threadId(HOST, "other/app")
					: kind === "iid"
						? threadId(HOST, `${OWNER}/${NAME}`, 43)
						: "gitlab:%broken:group/sub/app:42:discussion";
		await expect(
			caller({ github: github as HostServiceContext["github"] }).replyToThread({
				projectId,
				prNumber: IID,
				commentId: 9,
				threadId: id,
				body: "reply",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("GitLab resolution requires project context and validates live remote before provider discovery", async () => {
		await expect(
			caller().setThreadResolution({ threadId: threadId(), resolved: true }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await git.remote([
			"set-url",
			"origin",
			"https://unrecognized.invalid/group/sub/app.git",
		]);
		await expect(
			caller().setThreadResolution({
				projectId,
				prNumber: IID,
				threadId: threadId(),
				resolved: true,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("GitLab resolution keeps the original response shape", async () => {
		expect(
			await caller().setThreadResolution({
				projectId,
				prNumber: IID,
				threadId: threadId(),
				resolved: true,
			}),
		).toEqual({ threadId: threadId(), isResolved: true });
		expect(requests[0]?.body).toEqual({ resolved: true });
	});

	test("reverse workspace lookup excludes historical other-instance, provider and namespace rows", async () => {
		for (const [id, provider, host, owner] of [
			["old", "gitlab", "other.invalid", OWNER],
			["github", "github", HOST, OWNER],
			["namespace", "gitlab", HOST, "other"],
			["current", "gitlab", HOST, OWNER],
		] as const) {
			db.insert(schema.pullRequests)
				.values({
					id: id,
					projectId,
					repoProvider: provider,
					repoHost: host,
					repoOwner: owner,
					repoName: NAME,
					prNumber: IID,
					url: `https://${host}/${owner}/${NAME}/-/merge_requests/${IID}`,
					title: "PR",
					state: "open",
					headBranch: "feature",
					headSha: "sha",
				})
				.run();
			db.insert(schema.workspaces)
				.values({
					id: `${id}-workspace`,
					projectId,
					worktreePath: repoPath,
					branch: "feature",
					pullRequestId: id,
					updatedAt: id === "current" ? 1 : 100,
				})
				.run();
		}
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: "current-workspace" });
		await git.remote([
			"set-url",
			"origin",
			"https://new.invalid/group/sub/app.git",
		]);
		db.update(schema.projects)
			.set({ repoUrl: "https://new.invalid/group/sub/app" })
			.run();
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: null });
	});

	async function prepareWorkspace() {
		await git.addConfig("user.email", "fixture@example.invalid");
		await git.addConfig("user.name", "Fixture");
		writeFileSync(join(repoPath, "file.txt"), "fixture");
		await git.add("file.txt");
		await git.commit("fixture");
		await git.checkoutLocalBranch("feature");
		await git.addConfig("branch.feature.base", "origin/main");
		db.insert(schema.workspaces)
			.values({
				id: "workspace",
				projectId,
				worktreePath: repoPath,
				branch: "feature",
			})
			.run();
	}

	test("GitLab creation resolves source push remote and target project, preserving refresh tolerance", async () => {
		await prepareWorkspace();
		await git.addRemote("fork", `https://${HOST}/user/fork.git`);
		await git.addConfig("branch.feature.pushRemote", "fork");
		refreshFailure = true;
		respond = (_url, init) =>
			json(
				init?.method === "POST"
					? {
							iid: 99,
							web_url: `https://${HOST}/group/sub/app/-/merge_requests/99`,
						}
					: { id: 123 },
			);
		expect(
			await caller().createForWorkspace({
				workspaceId: "workspace",
				title: "Title",
				body: "Body",
				draft: true,
			}),
		).toEqual({
			number: 99,
			url: `https://${HOST}/group/sub/app/-/merge_requests/99`,
		});
		expect(requests[0]?.url.pathname).toBe(
			"/api/v4/projects/group%2Fsub%2Fapp",
		);
		expect(requests[1]?.url.pathname).toBe(
			"/api/v4/projects/user%2Ffork/merge_requests",
		);
		expect(requests[1]?.body).toEqual({
			source_branch: "feature",
			target_branch: "main",
			target_project_id: 123,
			title: "Draft: Title",
			description: "Body",
		});
	});

	test("GitLab creation rejects a fork on another instance before API credentials", async () => {
		await prepareWorkspace();
		await git.addRemote("fork", "https://other.invalid:8443/user/fork.git");
		await git.addConfig("branch.feature.pushRemote", "fork");
		await git.addRemote("github", "https://github.com/fallback/app.git");
		const github = async () => ({
			pulls: {
				create: async () => ({
					data: {
						number: 99,
						html_url: "https://github.com/fallback/app/pull/99",
					},
				}),
			},
		});
		await expect(
			caller({
				github: github as HostServiceContext["github"],
			}).createForWorkspace({ workspaceId: "workspace", title: "Title" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("legacy global GitHub thread resolution does not require a project", async () => {
		const github = async () =>
			new Octokit({ request: { fetch: async () => json({ data: {} }) } });
		expect(
			await caller({
				github,
			}).setThreadResolution({ threadId: "GH-global-id", resolved: false }),
		).toEqual({ threadId: "GH-global-id", isResolved: false });
		expect(requests).toEqual([]);
	});

	test("legacy GitHub threads retain fetchFailed true on GraphQL failure", async () => {
		await git.remote(["set-url", "origin", "https://github.com/team/app.git"]);
		const github = async () =>
			new Octokit({
				request: {
					fetch: async () => {
						throw new Error("GraphQL unavailable");
					},
				},
			});
		expect(
			await caller({ github }).getThreads({ projectId, prNumber: IID }),
		).toEqual({ reviewThreads: [], fetchFailed: true });
	});

	test("legacy GitHub content preserves cached gh response and failed-fetch errors", async () => {
		await git.remote([
			"set-url",
			"origin",
			`https://github.com/team-${serial}/app.git`,
		]);
		ghResponse = {
			number: IID,
			title: "GitHub",
			url: "https://github.com/team/app/pull/42",
			state: "OPEN",
			headRefName: "feature",
			baseRefName: "main",
			headRepositoryOwner: { login: "team" },
			isCrossRepository: false,
			isDraft: false,
		};
		const api = caller();
		expect((await api.getContent({ projectId, prNumber: IID })).title).toBe(
			"GitHub",
		);
		await api.getContent({ projectId, prNumber: IID });
		expect(ghInvocations).toHaveLength(1);
		ghFailure = new Error("gh unavailable");
		await expect(
			api.getContent({ projectId, prNumber: 43 }),
		).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to fetch PR #43: gh unavailable",
		});
		ghFailure = undefined;
		expect((await api.getContent({ projectId, prNumber: 43 })).title).toBe(
			"GitHub",
		);
	});

	test("reverse lookup keeps empty-project null and matches GitHub identity without case sensitivity", async () => {
		expect(
			await caller().getLinkedWorkspace({
				projectId: "missing",
				prNumber: IID,
			}),
		).toEqual({ workspaceId: null });
		for (const [id, provider, host, owner] of [
			["gl", "gitlab", HOST, OWNER],
			["gh", "github", "github.com", "Team"],
		] as const) {
			db.insert(schema.pullRequests)
				.values({
					id,
					projectId,
					repoProvider: provider,
					repoHost: host,
					repoOwner: owner,
					repoName: "App",
					prNumber: IID,
					url: `https://${host}/${owner}/App/${provider === "github" ? "pull" : "-/merge_requests"}/${IID}`,
					title: "PR",
					state: "open",
					headBranch: "feature",
					headSha: "sha",
				})
				.run();
			db.insert(schema.workspaces)
				.values({
					id: `${id}-workspace`,
					projectId,
					worktreePath: repoPath,
					branch: "feature",
					pullRequestId: id,
				})
				.run();
		}
		await git.remote(["set-url", "origin", "https://github.com/team/app.git"]);
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: "gh-workspace" });
		await git.remote(["set-url", "origin", `https://${HOST}/${OWNER}/App.git`]);
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: "gl-workspace" });
	});

	test.each([
		null,
		1,
	])("GitHub reverse lookup selects the most active repository row with older archivedAt %s", async (archivedAt) => {
		await git.remote(["set-url", "origin", "https://github.com/team/app.git"]);
		for (const [id, owner, name, updatedAt, archived] of [
			["older", "Team", "App", 1, archivedAt],
			["newer", "team", "app", 100, null],
		] as const) {
			db.insert(schema.pullRequests)
				.values({
					id,
					projectId,
					repoProvider: "github",
					repoHost: "github.com",
					repoOwner: owner,
					repoName: name,
					prNumber: IID,
					url: "https://github.com/team/app/pull/42",
					title: "PR",
					state: "open",
					headBranch: "feature",
					headSha: "sha",
				})
				.run();
			db.insert(schema.workspaces)
				.values({
					id: `${id}-workspace`,
					projectId,
					worktreePath: repoPath,
					branch: "feature",
					pullRequestId: id,
					updatedAt,
					lastActivityAt: updatedAt,
					archivedAt: archived,
				})
				.run();
		}
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: "newer-workspace" });
	});

	test("legacy GitHub diff retains its wrapped setup errors", async () => {
		await expect(
			caller().getDiff({ projectId: "missing", prNumber: IID }),
		).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to fetch diff for PR #${IID}: Project is not set up on this host`,
		});
	});

	test("GitLab caches expire after 30 seconds and live namespace changes do not reuse content", async () => {
		let now = originalNow();
		Date.now = () => now;
		let version = 1;
		respond = (url) =>
			url.pathname.endsWith("/merge_requests/42")
				? json({ ...mr(), title: `version-${version}` })
				: json([]);
		const api = caller();
		expect((await api.getContent({ projectId, prNumber: IID })).title).toBe(
			"version-1",
		);
		version = 2;
		now += 29_999;
		expect((await api.getContent({ projectId, prNumber: IID })).title).toBe(
			"version-1",
		);
		now += 1;
		expect((await api.getContent({ projectId, prNumber: IID })).title).toBe(
			"version-2",
		);
		version = 3;
		await git.remote(["set-url", "origin", `https://${HOST}/new/sub/app.git`]);
		expect((await api.getContent({ projectId, prNumber: IID })).title).toBe(
			"version-3",
		);
		expect(
			requests.some(
				(request) =>
					request.url.pathname ===
					"/api/v4/projects/new%2Fsub%2Fapp/merge_requests/42",
			),
		).toBe(true);
	});

	test("GitLab failed content is retried and successful state changes invalidate content", async () => {
		const api = caller();
		respond = () => json({ message: "unavailable" }, 503);
		await expect(
			api.getContent({ projectId, prNumber: IID }),
		).rejects.toThrow();
		respond = (url) =>
			url.pathname.endsWith("/merge_requests/42") ? json(mr()) : json([]);
		expect((await api.getContent({ projectId, prNumber: IID })).state).toBe(
			"open",
		);
		respond = (url) =>
			url.pathname.endsWith("/merge_requests/42")
				? json({ ...mr(), state: "closed" })
				: json([]);
		await api.setState({ projectId, prNumber: IID, state: "closed" });
		expect((await api.getContent({ projectId, prNumber: IID })).state).toBe(
			"closed",
		);
	});

	test("GitLab API auth rejection stays on the GitLab path with its error code", async () => {
		respond = () => json({ message: "unauthorized" }, 401);
		await git.addRemote("github", "https://github.com/fallback/app.git");
		const github = async () => ({
			pulls: { merge: async () => ({ data: { merged: true } }) },
		});
		await expect(
			caller({ github: github as HostServiceContext["github"] }).mergePR({
				projectId,
				prNumber: IID,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(requests).toHaveLength(1);
		expect(requests[0]?.url.host).toBe(HOST);
	});

	test("GitLab reply requires its discussion context even with a GitHub fallback remote", async () => {
		await git.addRemote("github", "https://github.com/fallback/app.git");
		const github = async () => ({
			pulls: {
				createReplyForReviewComment: async () => ({ data: { id: 99 } }),
			},
		});
		await expect(
			caller({ github: github as HostServiceContext["github"] }).replyToThread({
				projectId,
				prNumber: IID,
				commentId: 9,
				body: "reply",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("GitLab creation uses push URL and remote.pushDefault without changing the worker head/base contract", async () => {
		await prepareWorkspace();
		await git.addRemote("fork", "https://other.invalid/user/fetch-only.git");
		await git.addConfig(
			"remote.fork.pushurl",
			`https://${HOST}/user/source.git`,
		);
		await git.addConfig("remote.pushDefault", "fork");
		respond = (_url, init) =>
			json(
				init?.method === "POST"
					? {
							iid: 99,
							web_url: `https://${HOST}/group/sub/app/-/merge_requests/99`,
						}
					: { id: 123 },
			);
		await caller().createForWorkspace({
			workspaceId: "workspace",
			title: "Title",
		});
		expect(requests[1]?.url.pathname).toBe(
			"/api/v4/projects/user%2Fsource/merge_requests",
		);
		expect(requests[1]?.body).toMatchObject({
			source_branch: "feature",
			target_branch: "main",
		});
	});

	test("GitHub fallback survives an unrecognized configured remote", async () => {
		await git.addRemote(
			"github",
			`https://github.com/fallback-${serial}/app.git`,
		);
		db.update(schema.projects).set({ repoProvider: null, repoUrl: null }).run();
		respond = () => json({ message: "not GitLab metadata" });
		ghResponse = {
			number: IID,
			title: "GitHub fallback",
			url: "https://github.com/fallback/app/pull/42",
			state: "OPEN",
			headRefName: "feature",
			baseRefName: "main",
			headRepositoryOwner: null,
			isCrossRepository: false,
			isDraft: false,
		};
		expect(
			(await caller().getContent({ projectId, prNumber: IID })).title,
		).toBe("GitHub fallback");
		expect(ghInvocations[0]).toContain(`fallback-${serial}/app`);
	});

	test("legacy GitHub diff retains coalescing and failed-request eviction", async () => {
		await git.remote([
			"set-url",
			"origin",
			`https://github.com/team-${serial}/app.git`,
		]);
		const api = caller();
		ghResponse = "original GitHub diff";
		const results = await Promise.all([
			api.getDiff({ projectId, prNumber: IID }),
			api.getDiff({ projectId, prNumber: IID }),
		]);
		expect(results).toEqual([
			{ patch: "original GitHub diff" },
			{ patch: "original GitHub diff" },
		]);
		expect(ghInvocations).toHaveLength(1);
		ghFailure = new Error("diff unavailable");
		await expect(
			api.getDiff({ projectId, prNumber: 43 }),
		).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to fetch diff for PR #43: diff unavailable",
		});
		ghFailure = undefined;
		expect(await api.getDiff({ projectId, prNumber: 43 })).toEqual({
			patch: "original GitHub diff",
		});
	});

	test("reverse lookup follows the existing GitHub fallback for an unrecognized selected remote", async () => {
		await git.addRemote("github", "https://github.com/fallback/app.git");
		db.update(schema.projects).set({ repoProvider: null, repoUrl: null }).run();
		db.insert(schema.pullRequests)
			.values({
				id: "fallback-pr",
				projectId,
				repoProvider: "github",
				repoHost: "github.com",
				repoOwner: "fallback",
				repoName: "app",
				prNumber: IID,
				url: "https://github.com/fallback/app/pull/42",
				title: "PR",
				state: "open",
				headBranch: "feature",
				headSha: "sha",
			})
			.run();
		db.insert(schema.workspaces)
			.values({
				id: "fallback-workspace",
				projectId,
				worktreePath: repoPath,
				branch: "feature",
				pullRequestId: "fallback-pr",
			})
			.run();
		respond = () => json({ message: "not GitLab metadata" });
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: "fallback-workspace" });
	});

	function seedReadCompatibilityPr(
		id: string,
		provider: "github" | "gitlab",
		host = provider === "github" ? "github.com" : HOST,
		owner = provider === "github" ? "Team" : OWNER,
		name = provider === "github" ? "App" : NAME,
	) {
		db.insert(schema.pullRequests)
			.values({
				id,
				projectId,
				repoProvider: provider,
				repoHost: host,
				repoOwner: owner,
				repoName: name,
				prNumber: IID,
				url: `https://${host}/${owner}/${name}/${provider === "github" ? "pull" : "-/merge_requests"}/${IID}`,
				title: "Read compatibility",
				state: "open",
				headBranch: "feature",
				headSha: "sha",
				reviewStateJson: '{"retained":"GitLab"}',
				checksJson:
					'[{"name":"CI","status":"queued","url":"https://checks.invalid/job"}]',
				updatedAt: 0,
			})
			.run();
	}

	function seedReadCompatibilityWorkspace(
		id: string,
		pullRequestId: string,
		updatedAt = 1,
		createdAt = 1,
		archivedAt: number | null = null,
		selectedProjectId = projectId,
	) {
		db.insert(schema.workspaces)
			.values({
				id,
				projectId: selectedProjectId,
				worktreePath: repoPath,
				branch: "feature",
				pullRequestId,
				updatedAt,
				createdAt,
				lastActivityAt: null,
				archivedAt,
			})
			.run();
	}

	test("tracked GitHub PR retains the exact original wire keys and defaults", async () => {
		seedReadCompatibilityPr("gh-read", "github");
		seedReadCompatibilityWorkspace("read-workspace", "gh-read");
		const { gitRouter } = await import("../../git/git");
		expect(
			await gitRouter.createCaller(context()).getPullRequest({
				workspaceId: "read-workspace",
			}),
		).toEqual({
			number: 42,
			url: "https://github.com/Team/App/pull/42",
			title: "Read compatibility",
			body: null,
			state: "open",
			isDraft: false,
			reviewDecision: null,
			mergeable: "unknown",
			headRefName: "feature",
			updatedAt: "",
			checks: [
				{
					name: "CI",
					status: "queued",
					conclusion: null,
					detailsUrl: "https://checks.invalid/job",
					startedAt: null,
					completedAt: null,
				},
			],
			repoOwner: "Team",
			repoName: "App",
		});
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
		expect(ghInvocations).toEqual([]);
	});

	test("tracked GitLab MR retains provider, exact port, local project and review state", async () => {
		seedReadCompatibilityPr("gl-read", "gitlab");
		seedReadCompatibilityWorkspace("read-workspace", "gl-read");
		const { gitRouter } = await import("../../git/git");
		expect(
			await gitRouter.createCaller(context()).getPullRequest({
				workspaceId: "read-workspace",
			}),
		).toMatchObject({
			provider: "gitlab",
			host: HOST,
			projectId,
			reviewStateJson: '{"retained":"GitLab"}',
		});
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("GitHub checkout-unavailable fallback retains its stored pointer without provider I/O", async () => {
		sqlite
			.query(
				"UPDATE projects SET repo_provider = NULL, repo_url = NULL WHERE id = ?",
			)
			.run(projectId);
		seedReadCompatibilityPr("gh-read", "github");
		seedReadCompatibilityWorkspace("read-workspace", "gh-read");
		sqlite
			.query("UPDATE projects SET repo_path = ? WHERE id = ?")
			.run(join(directory, "missing-checkout"), projectId);
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: "read-workspace" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
		expect(ghInvocations).toEqual([]);
	});

	test("GitHub-only pointer keeps latest active and created-at tie order without live remote matching", async () => {
		sqlite
			.query(
				"UPDATE projects SET repo_provider = NULL, repo_url = NULL WHERE id = ?",
			)
			.run(projectId);
		seedReadCompatibilityPr("gh-read", "github");
		seedReadCompatibilityWorkspace("older", "gh-read", 1, 100);
		seedReadCompatibilityWorkspace("latest-updated", "gh-read", 10, 1);
		seedReadCompatibilityWorkspace("latest-created", "gh-read", 10, 20);
		seedReadCompatibilityWorkspace("archived", "gh-read", 100, 100, 1);
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: "latest-created" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("GitHub checkout-unavailable fallback excludes its archived pointer", async () => {
		sqlite
			.query(
				"UPDATE projects SET repo_provider = NULL, repo_url = NULL WHERE id = ?",
			)
			.run(projectId);
		seedReadCompatibilityPr("gh-read", "github");
		seedReadCompatibilityWorkspace("archived", "gh-read", 1, 1, 1);
		sqlite
			.query("UPDATE projects SET repo_path = ? WHERE id = ?")
			.run(join(directory, "missing-checkout"), projectId);
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: null });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("a physical GitLab record prevents blind first-GitHub-pointer fallback", async () => {
		sqlite
			.query(
				"UPDATE projects SET repo_provider = NULL, repo_url = NULL WHERE id = ?",
			)
			.run(projectId);
		await git.remote([
			"set-url",
			"origin",
			`https://gitlab.com/${OWNER}/${NAME}.git`,
		]);
		seedReadCompatibilityPr("gh-first", "github");
		seedReadCompatibilityWorkspace("gh-first-workspace", "gh-first");
		seedReadCompatibilityPr("foreign-gl", "gitlab", "foreign.invalid:8443");
		seedReadCompatibilityWorkspace("foreign-gl-workspace", "foreign-gl");
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: null });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("unavailable native checkout never falls back to historical GH or foreign-host rows", async () => {
		seedReadCompatibilityPr("gh-history", "github");
		seedReadCompatibilityWorkspace("gh-history-workspace", "gh-history");
		seedReadCompatibilityPr("foreign-gl", "gitlab", "foreign.invalid:8443");
		seedReadCompatibilityWorkspace("foreign-gl-workspace", "foreign-gl", 1000);
		sqlite
			.query("UPDATE projects SET repo_path = ? WHERE id = ?")
			.run(join(directory, "missing-checkout"), projectId);
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: null });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
		expect(ghInvocations).toEqual([]);
	});

	test("mixed reverse lookup uses the exact live GitLab port and case-sensitive namespace", async () => {
		seedReadCompatibilityPr("gh-first", "github");
		seedReadCompatibilityWorkspace("gh-workspace", "gh-first", 1000);
		seedReadCompatibilityPr("old-port", "gitlab");
		seedReadCompatibilityWorkspace("old-port-workspace", "old-port", 1000);
		const selectedHost = HOST.replace(":8443", ":9443");
		seedReadCompatibilityPr("wrong-case", "gitlab", selectedHost, "Group/sub");
		seedReadCompatibilityWorkspace("wrong-case-workspace", "wrong-case", 1000);
		seedReadCompatibilityPr("current", "gitlab", selectedHost);
		seedReadCompatibilityWorkspace("current-workspace", "current", 1);
		await git.remote([
			"set-url",
			"origin",
			`https://${selectedHost}/${OWNER}/${NAME}.git`,
		]);
		sqlite
			.query("UPDATE projects SET repo_url = ? WHERE id = ?")
			.run(`https://${selectedHost}/${OWNER}/${NAME}`, projectId);
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: "current-workspace" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("GitLab reverse lookup refuses a linked workspace from another local project", async () => {
		seedReadCompatibilityPr("gl-read", "gitlab");
		db.insert(schema.projects)
			.values({ id: "foreign-project", repoPath })
			.run();
		seedReadCompatibilityWorkspace(
			"foreign-workspace",
			"gl-read",
			1,
			1,
			null,
			"foreign-project",
		);
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: null });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("a claimed GitLab project with only historical GitHub rows cannot reuse its first pointer", async () => {
		seedReadCompatibilityPr("gh-history", "github");
		seedReadCompatibilityWorkspace("gh-history-workspace", "gh-history");
		expect(
			await caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).toEqual({ workspaceId: null });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});

	test("a claimed GitLab project with no platform remote fails closed before a historical GitHub pointer", async () => {
		seedReadCompatibilityPr("gh-history", "github");
		seedReadCompatibilityWorkspace("gh-history-workspace", "gh-history");
		await git.remote([
			"set-url",
			"origin",
			join(directory, "local-only-remote"),
		]);
		await expect(
			caller().getLinkedWorkspace({ projectId, prNumber: IID }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});
	test("mixed provider content preserves legacy GitHub and explicit GitLab selection", async () => {
		await git.addRemote("github", `https://github.com/team-${serial}/app.git`);
		ghResponse = {
			number: IID,
			title: "GitHub legacy",
			url: "https://github.com/team/app/pull/42",
			state: "OPEN",
			headRefName: "feature",
			baseRefName: "main",
			headRepositoryOwner: { login: "team" },
			isCrossRepository: false,
			isDraft: false,
		};
		expect(
			(await caller().getContent({ projectId, prNumber: IID })).title,
		).toBe("GitHub legacy");
		respond = (url) =>
			url.pathname.endsWith("/merge_requests/42") ? json(mr()) : json([]);
		expect(
			(
				await caller().getContent({
					projectId,
					prNumber: IID,
					provider: "gitlab",
				})
			).title,
		).toBe(HOST);
		expect(ghInvocations).toHaveLength(1);
	});
	test("native diff failure retains PR context and the provider status cause", async () => {
		respond = () => json({ message: "unavailable" }, 401);
		await expect(
			caller().getDiff({ projectId, prNumber: IID, provider: "gitlab" }),
		).rejects.toMatchObject({
			message: expect.stringContaining(`Failed to fetch diff for PR #${IID}`),
			cause: { status: 401 },
		});
	});
}

if (process.env.SUPERSET_HOST_GITLAB_MOCK_FIXTURE === "expected-binding") {
	const { spyOn } = await import("bun:test");
	const deniedNative = () => {
		throw Error("OWNED_NATIVE_DENIED");
	};
	const socket = await import("node:net");
	spyOn(socket.Socket.prototype, "connect").mockImplementation(deniedNative);
	spyOn(Bun, "spawn").mockImplementation(deniedNative);
	spyOn(Bun, "spawnSync").mockImplementation(deniedNative);
	const deniedChild = {
		spawn: deniedNative,
		spawnSync: deniedNative,
		exec: deniedNative,
		execSync: deniedNative,
		execFile: deniedNative,
		execFileSync: deniedNative,
		fork: deniedNative,
	};
	mock.module("node:child_process", () => deniedChild);
	const threads = await import("node:worker_threads");
	mock.module("node:worker_threads", () => ({
		...threads,
		Worker: class {
			constructor() {
				deniedNative();
			}
		},
	}));
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("OWNED_FETCH_DENIED");
		},
		{ preconnect: () => {} },
	);
	const envBoundary = { config: () => ({ parsed: {} }) };
	const environmentModule = "dotenv";
	mock.module(environmentModule, () => envBoundary);
	expect((await import(environmentModule)).config).toBe(envBoundary.config);
	const { resolve } = await import("node:path");
	const { Database } = await import("bun:sqlite");
	const { drizzle } = await import("drizzle-orm/bun-sqlite");
	const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
	const { eq } = await import("drizzle-orm");
	const { parseGitRemote } = await import("@superset/shared/git-remote");
	const { applyRepoSchema } = await import("../../../../db/repo-schema");
	const tables = await import("../../../../db/schema");
	let live = "https://gitlab.com/group/sub/app.git";
	let workerReads = 0;
	let resolveHook: () => void = () => {};
	const worker = {
		getHostWorkerPool: () => ({
			run: async (task: { type: string }) => {
				expect(task.type).toBe("git/resolveRepository");
				workerReads++;
				const remote = parseGitRemote(live);
				resolveHook();
				return {
					repoPath: "/owned/repo",
					remotes: remote ? [["origin", remote]] : [],
				};
			},
		}),
	};
	mock.module("../../../../workers/host-worker-pool", () => worker);
	expect(
		Object.is(
			(await import("../../../../workers/host-worker-pool")).getHostWorkerPool,
			worker.getHostWorkerPool,
		),
	).toBe(true);
	let mrClients = 0;
	const providerBoundary = {
		gitLabClient: () => {
			mrClients++;
			throw Error("MR_CLIENT_MUST_NOT_BE_CONSTRUCTED");
		},
		invalidateGitLabReads: () => {
			throw Error("CACHE_WRITE_DENIED");
		},
	};
	mock.module("./gitlab-project", () => providerBoundary);
	expect((await import("./gitlab-project")).gitLabClient).toBe(
		providerBoundary.gitLabClient,
	);
	const { router } = await import("../../../index");
	const { getLinkedWorkspace } = await import("./get-linked-workspace");
	const shared = await import("../../git/gitlab-actions");
	const actualCaller = router({ getLinkedWorkspace });
	let sqlite: InstanceType<typeof Database>;
	let database: ReturnType<typeof drizzle<typeof tables>>;
	let credentials: string[];
	const organizationId = "00000000-0000-4000-8000-000000000001";
	const expected = () => ({
		provider: "gitlab" as const,
		projectId: "owned-project",
		host: "gitlab.com",
		owner: "group/sub",
		repo: "app",
		pullNumber: 42,
		expectedUrl: "https://gitlab.com/group/sub/app/-/merge_requests/42",
	});
	const ctx = () =>
		({
			db: database,
			isAuthenticated: true,
			organizationId,
			credentials: {
				getToken: async (host: string) => {
					credentials.push(host);
					return "owned-token";
				},
			},
		}) as unknown as HostServiceContext;
	const query = () => actualCaller.createCaller(ctx());
	beforeEach(() => {
		sqlite = new Database(":memory:");
		database = drizzle(sqlite, { schema: tables });
		migrate(database, {
			migrationsFolder: resolve(import.meta.dir, "../../../../../drizzle"),
		});
		applyRepoSchema(sqlite);
		database
			.insert(tables.projects)
			.values({
				id: "owned-project",
				repoPath: "/owned/repo",
				repoProvider: "github",
				repoUrl: "https://github.com/group/sub/app",
				createdAt: 1,
			})
			.run();
		live = "https://gitlab.com/group/sub/app.git";
		workerReads = 0;
		credentials = [];
		resolveHook = () => {};
		mrClients = 0;
	});
	afterEach(() => sqlite?.close());
	const seed = (
		provider: "github" | "gitlab" = "gitlab",
		url = expected().expectedUrl,
	) => {
		database
			.insert(tables.pullRequests)
			.values({
				id: "owned-pr",
				projectId: "owned-project",
				repoProvider: provider,
				repoHost: provider === "gitlab" ? "gitlab.com" : "github.com",
				repoOwner: "group/sub",
				repoName: "app",
				prNumber: 42,
				url,
				title: "owned",
				state: "open",
				headBranch: "feature",
				headSha: "abc",
			})
			.run();
		database
			.insert(tables.workspaces)
			.values({
				id: "owned-workspace",
				projectId: "owned-project",
				createdAt: 2,
				worktreePath: "/owned/worktree",
				branch: "feature",
				pullRequestId: "owned-pr",
			})
			.run();
	};
	const identity = () => ({
		id: "owned-workspace",
		projectId: "owned-project",
		createdAtMs: 2,
		type: "worktree",
		worktreePath: "/owned/worktree",
		branch: "feature",
		pullRequestId: "owned-pr",
	});
	const helper = (name: string) => {
		const fn = Reflect.get(shared, name);
		expect(typeof fn).toBe("function");
		return fn;
	};

	test("expected GL caller cannot receive a historical GH workspace", async () => {
		seed("github");
		const input = {
			projectId: "owned-project",
			prNumber: 42,
			expectedPullRequest: expected(),
		};
		expect(await query().getLinkedWorkspace(input)).toEqual({
			workspaceId: null,
			validatedPullRequest: expected(),
		});
		expect(workerReads).toBe(1);
		expect(credentials).toEqual([]);
	});
	test("expected GL no-cache selection has an explicit complete acknowledgement", async () => {
		const input = {
			projectId: "owned-project",
			prNumber: 42,
			expectedPullRequest: expected(),
		};
		expect(await query().getLinkedWorkspace(input)).toEqual({
			workspaceId: null,
			validatedPullRequest: expected(),
		});
		expect(workerReads).toBe(1);
	});
	test("expected GL existing link acknowledges only the exact active pointer", async () => {
		seed();
		const input = {
			projectId: "owned-project",
			prNumber: 42,
			expectedPullRequest: expected(),
		};
		expect(await query().getLinkedWorkspace(input)).toEqual({
			workspaceId: "owned-workspace",
			validatedPullRequest: expected(),
		});
	});
	test("expected GL malformed or contradictory input refuses before reads", async () => {
		for (const binding of [
			{ ...expected(), pullNumber: 41 },
			{
				...expected(),
				expectedUrl:
					"https://foreign.invalid/group/sub/app/-/merge_requests/42",
			},
			{ provider: "gitlab" },
		]) {
			await expect(
				Reflect.apply(query().getLinkedWorkspace, undefined, [
					{
						projectId: "owned-project",
						prNumber: 42,
						expectedPullRequest: binding,
					},
				]),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
		expect(workerReads).toBe(0);
		expect(credentials).toEqual([]);
	});
	test("expected GL cached foreign URL cannot select a workspace", async () => {
		seed("gitlab", "https://foreign.invalid/group/sub/app/-/merge_requests/42");
		expect(
			await query().getLinkedWorkspace({
				projectId: "owned-project",
				prNumber: 42,
				expectedPullRequest: expected(),
			}),
		).toEqual({ workspaceId: null, validatedPullRequest: expected() });
	});
	test("expected GL direct remote assertion rejects raw URL ambiguity", () => {
		for (const url of [
			"https://gitlab.com/group/../group/sub/app/-/merge_requests/42",
			"https://gitlab.com/group/sub/app/-/merge_requests/42?token=x",
			"https://user@gitlab.com/group/sub/app/-/merge_requests/42",
		]) {
			expect(() =>
				helper("assertExpectedGitlabRemote")(
					{ ...expected(), expectedUrl: url },
					parseGitRemote(live),
				),
			).toThrow();
		}
	});
	for (const [label, changed] of [
		["encoded host", { host: "%67itlab.com" }],
		[
			"encoded URL authority",
			{ expectedUrl: "https://%67itlab.com/group/sub/app/-/merge_requests/42" },
		],
		[
			"empty userinfo authority",
			{ expectedUrl: "https://@gitlab.com/group/sub/app/-/merge_requests/42" },
		],
	] as const) {
		test(`expected GL raw authority refuses ${label}`, () => {
			expect(() =>
				helper("assertExpectedGitlabRemote")(
					{ ...expected(), ...changed },
					parseGitRemote(live),
				),
			).toThrow();
		});
	}
	test("expected GL helper resolves without MR client or provider requests", async () => {
		const selection = await helper("resolveExpectedGitlabPullRequest")(
			ctx(),
			expected(),
		);
		expect(selection.expected).toEqual(expected());
		expect(selection.repo.owner).toBe("group/sub");
		expect(credentials).toEqual([]);
	});
	test("expected GL selection change during worker await refuses", async () => {
		resolveHook = () =>
			database
				.update(tables.projects)
				.set({ repoPath: "/changed" })
				.where(eq(tables.projects.id, "owned-project"))
				.run();
		await expect(
			helper("resolveExpectedGitlabPullRequest")(ctx(), expected()),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
	test("expected GL permit validates before and after current row changes", async () => {
		seed();
		const permit = await helper("acquireExpectedGitlabDelivery")(
			ctx(),
			"owned-workspace",
			expected(),
			identity(),
		);
		expect(permit?.isValid()).toBe(true);
		database
			.update(tables.workspaces)
			.set({ createdAt: 3 })
			.where(eq(tables.workspaces.id, "owned-workspace"))
			.run();
		expect(permit?.isValid()).toBe(false);
		expect(
			await helper("acquireExpectedGitlabDelivery")(
				ctx(),
				"owned-workspace",
				expected(),
				identity(),
			),
		).toBeNull();
	});
	test("expected GL pointer change during resolution cannot mint a fresh permit", async () => {
		seed();
		resolveHook = () =>
			database
				.update(tables.workspaces)
				.set({ pullRequestId: null })
				.where(eq(tables.workspaces.id, "owned-workspace"))
				.run();
		expect(
			await helper("acquireExpectedGitlabDelivery")(
				ctx(),
				"owned-workspace",
				expected(),
				identity(),
			),
		).toBeNull();
	});
	test("absent expected input retains GH checkout-unavailable fallback and no native reads", async () => {
		seed("github");
		expect(
			await query().getLinkedWorkspace({
				projectId: "owned-project",
				prNumber: 42,
			}),
		).toEqual({ workspaceId: "owned-workspace" });
		expect(workerReads).toBe(0);
	});
	test("expected GL mismatched selected host namespace and port precede discovery", async () => {
		for (const remote of [
			"https://foreign.invalid/group/sub/app.git",
			"https://gitlab.com/group/other/app.git",
			"https://gitlab.com:8443/group/sub/app.git",
			"https://github.com/group/sub/app.git",
		]) {
			live = remote;
			await expect(
				helper("resolveExpectedGitlabPullRequest")(ctx(), expected()),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
		expect(credentials).toEqual([]);
		expect(mrClients).toBe(0);
	});
	test("expected GL valid custom-host discovery remains after exact remote validation", async () => {
		const host = "custom.example.invalid:8443";
		live = `https://${host}/group/sub/app.git`;
		const calls: string[] = [];
		globalThis.fetch = Object.assign(
			async (input: string | URL | Request, init?: RequestInit) => {
				calls.push(String(input));
				expect(String(input)).toBe(`https://${host}/api/v4/version`);
				return init?.headers && new Headers(init.headers).has("authorization")
					? Response.json({ version: "17.2.1", revision: "abcdef0123" })
					: new Response("", { status: 401 });
			},
			{ preconnect: () => {} },
		);
		try {
			const binding = {
				...expected(),
				host,
				expectedUrl: `https://${host}/group/sub/app/-/merge_requests/42`,
			};
			const selected = await helper("resolveExpectedGitlabPullRequest")(
				ctx(),
				binding,
			);
			expect(selected.repo.provider).toBe("gitlab");
			expect(calls).toHaveLength(2);
			expect(credentials).toEqual([host]);
			expect(mrClients).toBe(0);
		} finally {
			globalThis.fetch = Object.assign(
				async () => {
					throw Error("OWNED_FETCH_DENIED");
				},
				{ preconnect: () => {} },
			);
		}
	});
	test("expected GL authenticated organization remains fixed across resolution", async () => {
		const current = ctx();
		resolveHook = () => {
			current.organizationId = "changed";
		};
		await expect(
			helper("resolveExpectedGitlabPullRequest")(current, expected()),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(credentials).toEqual([]);
		expect(mrClients).toBe(0);
	});
	for (const field of [
		"branch",
		"worktreePath",
		"type",
		"pullRequestId",
		"archivedAt",
	] as const) {
		test(`expected GL permit refuses later ${field} changes`, async () => {
			seed();
			const permit = await helper("acquireExpectedGitlabDelivery")(
				ctx(),
				"owned-workspace",
				expected(),
				identity(),
			);
			expect(permit?.isValid()).toBe(true);
			const change =
				field === "branch"
					? { branch: "other" }
					: field === "worktreePath"
						? { worktreePath: "/other" }
						: field === "type"
							? { type: "local" as const }
							: field === "pullRequestId"
								? { pullRequestId: null }
								: { archivedAt: 1 };
			database
				.update(tables.workspaces)
				.set(change)
				.where(eq(tables.workspaces.id, "owned-workspace"))
				.run();
			expect(permit?.isValid()).toBe(false);
		});
	}
	test("expected GL acknowledgement exposes only binding and workspace ID", async () => {
		seed();
		const result = await query().getLinkedWorkspace({
			projectId: "owned-project",
			prNumber: 42,
			expectedPullRequest: expected(),
		});
		expect(Object.keys(result).sort()).toEqual([
			"validatedPullRequest",
			"workspaceId",
		]);
		expect(mrClients).toBe(0);
	});
}

if (!process.env.SUPERSET_HOST_GITLAB_MOCK_FIXTURE) {
	test("expected GL bindings run in a cleared owned pure child", () => {
		const cwd = makeTestCwd("/tmp/superset-host-expected-binding-");
		try {
			const child = runIsolatedTest(
				process.execPath,
				[
					"--no-env-file",
					"test",
					"--test-name-pattern",
					"^expected GL",
					import.meta.path,
				],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_HOST_GITLAB_MOCK_FIXTURE: "expected-binding",
					},
					stdio: "pipe",
					timeout: 20000,
				},
			);
			if (child.stdout) process.stdout.write(child.stdout);
			if (child.stderr) process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			removeTestCwd(cwd, { recursive: true, force: true });
		}
	}, 25000);
}
