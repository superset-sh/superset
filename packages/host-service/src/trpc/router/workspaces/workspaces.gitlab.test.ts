import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { spawnSync as runIsolatedTest } from "node:child_process";
import { mkdtempSync as makeTestCwd, rmSync as removeTestCwd } from "node:fs";
import type { HostServiceContext } from "../../../types";

if (process.env.SUPERSET_HOST_GITLAB_MOCK_FIXTURE !== "workspaces-checkout") {
	test("workspaces-checkout runs with isolated owned module boundaries", () => {
		const cwd = makeTestCwd("/tmp/superset-host-workspaces-checkout-");
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
						SUPERSET_HOST_GITLAB_MOCK_FIXTURE: "workspaces-checkout",
						...(process.env.SUPERSET_GITLAB_CHECKOUT_NATIVE_TEST === "1"
							? {
									SUPERSET_GITLAB_CHECKOUT_NATIVE_TEST: "1",
									SUPERSET_GITLAB_CHECKOUT_NODE:
										process.env.SUPERSET_GITLAB_CHECKOUT_NODE,
								}
							: {}),
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
	const dotenvModule: string = "dotenv";
	const dotenvFixture = { config: () => ({ parsed: {} }) };
	mock.module(dotenvModule, () => dotenvFixture);
	expect(
		Object.is((await import(dotenvModule)).config, dotenvFixture.config),
	).toBe(true);
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Unexpected outbound transport in owned GitLab test");
		},
		{ preconnect: () => {} },
	);
	const { z } = await import("zod");
	const root = "/virtual/project",
		host = "gl.example.test:8443",
		sha = "a".repeat(40);
	let nativeFixture = false,
		nativeWorktrees = "",
		nativeSha = sha,
		nativeFork = false,
		nativeDeletedFork = false;
	let useRealDb = false;
	let provenAbsence = false,
		absenceMutation: (() => void) | undefined,
		workspaceLookupReads = 0,
		missingWorkspace = false;
	let recordedMarker = "",
		registeredWorkspace = true;
	let localRepoPath = root,
		selectedRemote = "gitlab",
		metadataMutation: (() => void) | undefined,
		credentialMutation: (() => void) | undefined,
		gitEnvBindings = 0;
	let responseStatus = 200,
		failFetch = false;
	let observeAssociation = false;
	let observeExpectedDelivery = false;
	const expectedBinding = {
		provider: "gitlab" as const,
		projectId: "project",
		host,
		owner: "Team",
		repo: "Widget",
		pullNumber: 7,
		expectedUrl: `https://${host}/Team/Widget/-/merge_requests/7`,
	};
	let provider = "gitlab",
		token: string | null = "FAKE_NATIVE_TOKEN",
		badUrl = false;
	const calls: string[] = [],
		gitCalls: string[][] = [];
	const row = {
		id: "workspace",
		projectId: "project",
		name: "Feature",
		branch: "Feature",
		type: "worktree",
		worktreePath: "/virtual/worktrees/Feature",
		archivedAt: null,
		pullRequestId: null as string | null,
		createdAt: 10,
		taskId: null,
	};
	const fixtureModule0 = {
		requireLocalProject: (ctx: HostServiceContext) =>
			ctx.db.query.projects.findFirst().sync(),
		requireProjectRepoPath: () => root,
		getProjectWorktreesFolder: () => "/virtual/worktrees",
	};
	mock.module(
		"../workspace-creation/shared/local-project",
		() => fixtureModule0,
	);
	const importedModule0 = await import(
		"../workspace-creation/shared/local-project"
	);
	for (const [name, value] of Object.entries(fixtureModule0))
		expect(Reflect.get(importedModule0, name)).toBe(value);
	const projectHelpers = await import(
		"../workspace-creation/shared/project-helpers"
	);
	const fixtureModule1 = {
		...projectHelpers,
		resolveRepo: async (ctx: HostServiceContext) => {
			if (provenAbsence) {
				absenceMutation?.();
				return null;
			}
			const project = ctx.db.query.projects.findFirst().sync();
			if (!project?.repoUrl) throw Error("FIXTURE_MISSING_PROJECT");
			return {
				provider: project.repoProvider,
				host: new URL(project.repoUrl).host,
				owner: project.repoOwner,
				name: project.repoName,
				repoPath: project.repoPath,
				remoteName: project.remoteName,
				url: project.repoUrl,
			};
		},
		projectNotSetupError: () => Error("FAKE_NOT_SETUP"),
	};
	mock.module(
		"../workspace-creation/shared/project-helpers",
		() => fixtureModule1,
	);
	const importedModule1 = await import(
		"../workspace-creation/shared/project-helpers"
	);
	for (const [name, value] of Object.entries(fixtureModule1))
		expect(Reflect.get(importedModule1, name)).toBe(value);
	const workspaceStore = await import(
		"../../../workspaces/local-workspace-store"
	);
	const genuineWorkspaceLookup = workspaceStore.getLocalWorkspace;
	const genuineWorkspaceShape = workspaceStore.toCloudShape;
	const fixtureModule2 = {
		...workspaceStore,
		getLocalWorkspace: (
			db: Parameters<typeof genuineWorkspaceLookup>[0],
			id: string,
		) => {
			if (useRealDb) return genuineWorkspaceLookup(db, id);
			workspaceLookupReads++;
			return missingWorkspace ? undefined : row;
		},
		toCloudShape: (...args: Parameters<typeof genuineWorkspaceShape>) =>
			useRealDb
				? genuineWorkspaceShape(...args)
				: { ...row, organizationId: "org" },
		insertLocalWorkspace: () => row,
	};
	mock.module(
		"../../../workspaces/local-workspace-store",
		() => fixtureModule2,
	);
	const importedModule2 = await import(
		"../../../workspaces/local-workspace-store"
	);
	for (const [name, value] of Object.entries(fixtureModule2))
		expect(Reflect.get(importedModule2, name)).toBe(value);
	const fixtureModule3 = {
		agentLaunchSchema: z.object({ agent: z.string(), prompt: z.string() }),
		dispatchSugarAgents: async (
			_ctx: unknown,
			_workspace: string,
			_launches: unknown,
			bound?: { expectedPullRequest: unknown; initialWorkspace: unknown },
		) => {
			if (observeExpectedDelivery) {
				expect(bound?.expectedPullRequest).toEqual(expectedBinding);
				expect(bound?.initialWorkspace).toEqual({
					id: row.id,
					projectId: row.projectId,
					createdAtMs: 10,
					type: "worktree",
					worktreePath: row.worktreePath,
					branch: "Feature",
					pullRequestId: "verified-pr",
				});
			}
			if (observeAssociation) {
				calls.push("dispatch");
				expect(row.pullRequestId).toBe("verified-pr");
			}
			return [];
		},
	};
	mock.module(
		"../workspace-creation/shared/dispatch-agents",
		() => fixtureModule3,
	);
	const importedModule3 = await import(
		"../workspace-creation/shared/dispatch-agents"
	);
	for (const [name, value] of Object.entries(fixtureModule3))
		expect(Reflect.get(importedModule3, name)).toBe(value);
	const git = {
		env: () => {
			gitEnvBindings++;
			return git;
		},
		raw: async (args: string[]) => {
			gitCalls.push(args);
			if (args.includes("--show-toplevel")) return root;
			if (
				args[0] === "config" &&
				args.at(-1)?.endsWith(".supersetGitlabCheckout")
			)
				return recordedMarker;
			if (!registeredWorkspace && args[0] === "worktree")
				return `worktree ${row.worktreePath}\nHEAD ${sha}\nbranch refs/heads/Feature\n\n`;
			if (args[0] === "config" && args.at(-1) === "remote.gitlab.url")
				return `https://${host}/Team/Widget.git`;
			if (args.includes("--git-common-dir")) return `${root}/.git`;
			if (args[0] === "remote") return `https://${host}/Team/Widget.git`;
			if (args[0] === "rev-parse") return sha;
			if (args.includes("rev-parse")) return sha;
			if (args.includes("symbolic-ref")) return "Feature";
			if (args[0] === "status" || args.includes("status")) return "";
			return "";
		},
	};
	const workerPoolFixture = {
		getHostWorkerPool: () => ({
			assertMutationScopeHealthy: () => {},
			acquireMutationScope: async () => ({ release: () => {} }),
			run: async (
				task: { type: string },
				input: { argv?: string[]; gitEnv?: Record<string, string> },
			) => {
				if (task.type === "git/resolveRepository")
					return {
						repoPath: root,
						remotes: [],
						storage: { commonDir: `${root}/.git`, device: 1, inode: 1 },
					};
				if (task.type === "git/gitlabRaw" && input.argv) {
					if (input.gitEnv) git.env();
					return git.raw(input.argv);
				}
				throw new Error(`Unexpected fake worker task ${task.type}`);
			},
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
	const ctx = {
		isAuthenticated: true,
		organizationId: "org",
		clientMachineId: "machine",
		runtime: {
			pullRequests: {
				linkWorkspaceToCheckoutPullRequest: async (input: {
					workspaceId: string;
					projectId: string;
					pullRequest: { number: number };
					verifiedCheckout?: unknown;
				}) => {
					if (observeAssociation) {
						calls.push("association");
						expect(input.verifiedCheckout).toBeDefined();
						expect(input.pullRequest.number).toBe(7);
						row.pullRequestId = "verified-pr";
					}
					return "verified-pr";
				},
			},
		},
		git: async () => git,
		credentials: {
			getToken: async (requested: string) => {
				calls.push(`token:${requested}`);
				return token;
			},
			getCredentials: async (url: string | null) => {
				calls.push(`git-env:${url}`);
				if (credentialMutation) {
					const mutate = credentialMutation;
					credentialMutation = undefined;
					mutate();
				}
				return { env: { GIT_TERMINAL_PROMPT: "0" } };
			},
			credentialRemedy: () => "FAKE_NATIVE_CREDENTIAL_REMEDY",
		},
		execGh: async () => {
			calls.push("gh");
			return {
				number: 7,
				url: "https://github.com/Team/Widget/pull/7",
				title: "Feature",
				headRefName: "Feature",
				headRefOid: sha,
				baseRefName: "main",
				headRepositoryOwner: { login: "Team" },
				headRepository: { name: "Widget" },
				isCrossRepository: false,
				state: "OPEN",
			};
		},
		db: {
			select: () => ({
				from: () => ({
					where: () => ({
						get: () => ({ projectId: "project", repoProvider: "gitlab" }),
						all: () => [],
					}),
				}),
			}),
			query: {
				projects: {
					findFirst: () => ({
						sync: () => ({
							id: "project",
							name: "Project",
							repoPath: localRepoPath,
							remoteName: selectedRemote,
							repoProvider: provider,
							repoOwner: "Team",
							repoName: "Widget",
							repoUrl: `https://${host}/Team/Widget`,
							worktreeBaseDir: "/virtual/worktrees",
							sparseCheckoutPaths: null,
						}),
					}),
				},
				workspaces: {
					findFirst: () => ({ sync: () => (registeredWorkspace ? row : null) }),
				},
			},
		},
	} as unknown as HostServiceContext;
	const fixtureModule4 = {
		getHostId: () => "FAKE_HOST_ID",
		getMachineId: () => "FAKE_MACHINE_ID",
		getHostName: () => "FAKE_HOST_NAME",
	};
	mock.module("@superset/shared/host-info", () => fixtureModule4);
	const importedModule4 = await import("@superset/shared/host-info");
	for (const [name, value] of Object.entries(fixtureModule4))
		expect(Reflect.get(importedModule4, name)).toBe(value);
	const originalFetch = globalThis.fetch;
	beforeEach(() => {
		observeAssociation = false;
		observeExpectedDelivery = false;
		provenAbsence = false;
		absenceMutation = undefined;
		workspaceLookupReads = 0;
		missingWorkspace = false;
		row.pullRequestId = null;
		row.createdAt = 10;
		row.projectId = "project";
		nativeFixture = false;
		localRepoPath = root;
		selectedRemote = "gitlab";
		metadataMutation = undefined;
		credentialMutation = undefined;
		gitEnvBindings = 0;
		nativeFork = false;
		nativeDeletedFork = false;
		provider = "gitlab";
		token = "FAKE_NATIVE_TOKEN";
		badUrl = false;
		recordedMarker = "";
		registeredWorkspace = true;
		responseStatus = 200;
		failFetch = false;
		calls.length = 0;
		gitCalls.length = 0;
		globalThis.fetch = Object.assign(
			async (input: string | URL | Request, init?: RequestInit) => {
				const url = String(input);
				if (metadataMutation) {
					const mutate = metadataMutation;
					metadataMutation = undefined;
					mutate();
				}
				calls.push(url);
				if (failFetch) throw Error("FIXTURE_UNREACHABLE");
				if (responseStatus !== 200)
					return Response.json(
						{ message: "FIXTURE_PRIVATE_ERROR" },
						{ status: responseStatus },
					);
				expect(new Headers(init?.headers).get("authorization")).toBe(
					"Bearer FAKE_NATIVE_TOKEN",
				);
				if (url.endsWith("/projects/8"))
					return Response.json({
						id: 8,
						path_with_namespace: "People/Fork",
						http_url_to_repo: `https://${host}/People/Fork.git`,
					});
				if (url.endsWith("/projects/Team%2FWidget"))
					return Response.json({
						id: 7,
						path_with_namespace: "Team/Widget",
						http_url_to_repo: `https://${host}/Team/Widget.git`,
					});
				return Response.json({
					iid: 7,
					project_id: 7,
					source_project_id: nativeDeletedFork ? null : nativeFork ? 8 : 7,
					target_project_id: 7,
					source_branch: "Feature",
					target_branch: "main",
					sha: nativeFixture ? nativeSha : sha,
					title: "Feature",
					state: "opened",
					web_url: `https://${badUrl ? "other.test" : host}/Team/Widget/-/merge_requests/7`,
				});
			},
			{ preconnect: originalFetch.preconnect },
		);
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});
	const { workspacesRouter } = await import("./workspaces");
	function create() {
		return workspacesRouter
			.createCaller(ctx)
			.create({ projectId: "project", pr: 7, runSetup: false });
	}
	test("bound create rejects foreign selected host before metadata and credentials", async () => {
		await expect(
			workspacesRouter.createCaller(ctx).create({
				projectId: "project",
				pr: 7,
				runSetup: false,
				...{
					expectedPullRequest: {
						...expectedBinding,
						host: "other.test",
						expectedUrl: "https://other.test/Team/Widget/-/merge_requests/7",
					},
				},
			}),
		).rejects.toThrow();
		expect(calls).not.toContain("metadata");
		expect(gitEnvBindings).toBe(0);
	});
	test("bound create carries exact original linked generation into early dispatch", async () => {
		observeAssociation = true;
		observeExpectedDelivery = true;
		await workspacesRouter.createCaller(ctx).create({
			projectId: "project",
			pr: 7,
			runSetup: false,
			agents: [{ agent: "fixture", prompt: "bound" }],
			...{ expectedPullRequest: expectedBinding },
		});
		expect(calls.indexOf("association")).toBeLessThan(
			calls.indexOf("dispatch"),
		);
	});
	for (const mode of ["reused", "adopted", "id-retry"] as const)
		test(`default GitLab ${mode} commits verified association before dispatch/result`, async () => {
			observeAssociation = true;
			registeredWorkspace = mode !== "adopted";
			const outcome = await workspacesRouter.createCaller(ctx).create({
				projectId: "project",
				pr: 7,
				runSetup: false,
				agents: [{ agent: "fixture", prompt: "owned prompt" }],
				...(mode === "id-retry"
					? { id: "00000000-0000-4000-8000-000000000001" }
					: {}),
			});
			expect(outcome.workspace.id).toBe("workspace");
			expect(calls).toContain("association");
			if (mode === "id-retry") expect(calls).not.toContain("dispatch");
			else
				expect(calls.indexOf("association")).toBeLessThan(
					calls.indexOf("dispatch"),
				);
		});
	for (const mode of [
		"fresh",
		"fresh-pointer",
		"missing-current-workspace",
		"replaced-project",
		"replaced-worktree",
	] as const)
		test(`ID retry proven absence uses fresh current pointer: ${mode}`, async () => {
			provider = "github";
			provenAbsence = true;
			const originalPath = row.worktreePath;
			absenceMutation = () => {
				if (mode === "fresh-pointer") row.pullRequestId = "current-gl-link";
				if (mode === "missing-current-workspace") missingWorkspace = true;
				if (mode === "replaced-project") row.projectId = "other";
				if (mode === "replaced-worktree") row.worktreePath = "/other/worktree";
			};
			try {
				const outcome = workspacesRouter.createCaller(ctx).create({
					id: "00000000-0000-4000-8000-000000000001",
					projectId: "project",
					pr: 7,
					runSetup: false,
				});
				if (mode === "fresh") {
					expect((await outcome).alreadyExists).toBe(true);
					expect(workspaceLookupReads).toBeGreaterThanOrEqual(2);
				} else
					await expect(outcome).rejects.toMatchObject({ code: "CONFLICT" });
				expect(calls).toEqual([]);
				expect(gitCalls).toEqual([]);
			} finally {
				row.worktreePath = originalPath;
				row.projectId = "project";
			}
		});
	const { Database } = await import("bun:sqlite");
	const { drizzle } = await import("drizzle-orm/bun-sqlite");
	const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
	const ownedSchema = await import("../../../db/schema");
	const { applyRepoSchema } = await import("../../../db/repo-schema");
	const { PullRequestRuntimeManager } = await import(
		"../../../runtime/pull-requests/pull-requests"
	);
	for (const phase of [
		"metadata",
		"credentials",
		"normal-before-selection",
		"normal-after-selection",
	] as const)
		test(`actual SQLite selected GitLab generation boundary: ${phase}`, async () => {
			const sqlite = new Database(":memory:");
			const db = drizzle(sqlite, { schema: ownedSchema });
			const originalDb = ctx.db,
				originalRuntime = ctx.runtime;
			try {
				migrate(db, {
					migrationsFolder: new URL("../../../../drizzle", import.meta.url)
						.pathname,
				});
				applyRepoSchema(sqlite);
				ctx.db = db as unknown as HostServiceContext["db"];
				useRealDb = true;
				db.insert(ownedSchema.projects)
					.values({
						id: "project",
						repoPath: root,
						repoProvider: "gitlab",
						repoOwner: "Team",
						repoName: "Widget",
						repoUrl: `https://${host}/Team/Widget`,
						remoteName: "gitlab",
						createdAt: 1,
					})
					.run();
				const initial = {
					id: "00000000-0000-4000-8000-000000000001",
					projectId: "project",
					type: "worktree" as const,
					branch: "Feature",
					worktreePath: row.worktreePath,
					createdAt: 10,
				};
				db.insert(ownedSchema.workspaces).values(initial).run();
				ctx.runtime = {
					...originalRuntime,
					pullRequests: new PullRequestRuntimeManager({
						db: ctx.db,
						git: ctx.git,
						execGh: ctx.execGh,
						github: async () => {
							throw Error("GL must not use GitHub");
						},
						gitWatcher: { onChanged: () => () => {} } as never,
					}),
				};
				const replace = () => {
					db.delete(ownedSchema.workspaces).run();
					db.insert(ownedSchema.workspaces)
						.values({ ...initial, createdAt: 20 })
						.run();
				};
				if (phase === "metadata" || phase === "normal-before-selection")
					metadataMutation = replace;
				else if (phase === "normal-after-selection")
					credentialMutation = () => {
						credentialMutation = replace;
					};
				else credentialMutation = replace;
				const outcome = workspacesRouter.createCaller(ctx).create({
					...(phase === "metadata" || phase === "credentials"
						? { id: initial.id }
						: {}),
					projectId: "project",
					pr: 7,
					runSetup: false,
				});
				if (phase === "normal-before-selection") {
					expect((await outcome).workspace.id).toBe(initial.id);
					expect(db.select().from(ownedSchema.pullRequests).all()).toHaveLength(
						1,
					);
					expect(
						db.select().from(ownedSchema.workspacePullRequests).all(),
					).toHaveLength(1);
				} else {
					await expect(outcome).rejects.toMatchObject({ code: "CONFLICT" });
					expect(db.select().from(ownedSchema.pullRequests).all()).toEqual([]);
					expect(
						db.select().from(ownedSchema.workspacePullRequests).all(),
					).toEqual([]);
				}
				expect(db.select().from(ownedSchema.workspaces).get()?.createdAt).toBe(
					20,
				);
			} finally {
				ctx.db = originalDb;
				ctx.runtime = originalRuntime;
				useRealDb = false;
				sqlite.close();
			}
		});
	for (const mode of [
		"retained-gh",
		"updated-at-only",
		"cleared-initial-gl",
		"replaced-same-fields",
		"archived",
		"changed-branch",
		"project-marker-race",
	] as const)
		test(`actual SQLite retry preserves initial pointer and creation identity: ${mode}`, async () => {
			const sql = new Database(":memory:");
			const db = drizzle(sql, { schema: ownedSchema });
			const originalDb = ctx.db;
			try {
				migrate(db, {
					migrationsFolder: new URL("../../../../drizzle", import.meta.url)
						.pathname,
				});
				applyRepoSchema(sql);
				useRealDb = true;
				ctx.db = db as unknown as HostServiceContext["db"];
				provider = "github";
				provenAbsence = true;
				const initialProvider =
					mode === "cleared-initial-gl" ? "gitlab" : "github";
				db.insert(ownedSchema.projects)
					.values({
						id: "project",
						repoPath: root,
						repoProvider: "github",
						remoteName: "gitlab",
					})
					.run();
				db.insert(ownedSchema.pullRequests)
					.values({
						id: "initial-link",
						projectId: "project",
						repoProvider: initialProvider,
						repoHost: initialProvider === "gitlab" ? host : "github.com",
						repoOwner: "Team",
						repoName: "Widget",
						prNumber: 7,
						url:
							initialProvider === "gitlab"
								? `https://${host}/Team/Widget/-/merge_requests/7`
								: "https://github.com/Team/Widget/pull/7",
						title: "Feature",
						state: "open",
						headBranch: "Feature",
						headSha: sha,
					})
					.run();
				const initial = {
					id: "00000000-0000-4000-8000-000000000001",
					projectId: "project",
					type: "worktree" as const,
					branch: "Feature",
					worktreePath: "/virtual/worktrees/Feature",
					createdAt: 10,
					updatedAt: 10,
					pullRequestId: "initial-link",
				};
				db.insert(ownedSchema.workspaces).values(initial).run();
				absenceMutation = () => {
					if (mode === "updated-at-only")
						sql
							.query("UPDATE workspaces SET updated_at=20 WHERE id=?")
							.run(initial.id);
					if (mode === "cleared-initial-gl")
						sql
							.query("UPDATE workspaces SET pull_request_id=NULL WHERE id=?")
							.run(initial.id);
					if (mode === "replaced-same-fields") {
						db.delete(ownedSchema.workspaces).run();
						db.insert(ownedSchema.workspaces)
							.values({ ...initial, createdAt: 20, updatedAt: 20 })
							.run();
					}
					if (mode === "archived")
						sql
							.query("UPDATE workspaces SET archived_at=20 WHERE id=?")
							.run(initial.id);
					if (mode === "changed-branch")
						sql
							.query("UPDATE workspaces SET branch='other' WHERE id=?")
							.run(initial.id);
					if (mode === "project-marker-race")
						sql
							.query(
								"UPDATE projects SET repo_provider='gitlab' WHERE id='project'",
							)
							.run();
				};
				const outcome = workspacesRouter.createCaller(ctx).create({
					id: initial.id,
					projectId: "project",
					pr: 7,
					runSetup: false,
				});
				if (mode === "retained-gh" || mode === "updated-at-only")
					expect((await outcome).alreadyExists).toBe(true);
				else await expect(outcome).rejects.toMatchObject({ code: "CONFLICT" });
				expect(calls).toEqual([]);
				expect(gitCalls).toEqual([]);
			} finally {
				ctx.db = originalDb;
				useRealDb = false;
				sql.close();
			}
		});
	test("actual create caller resolves GitLab MR through exact native authority and refreshes existing head", async () => {
		const result = await create();
		expect(result.alreadyExists).toBe(true);
		expect(calls).not.toContain("gh");
		expect(calls).toContain(`token:${host}`);
		expect(
			gitCalls.some((args) =>
				args.some((arg) => arg.includes("refs/merge-requests/7/head")),
			),
		).toBe(true);
	});
	test("GitLab missing credentials, foreign metadata and unknown current provider never call gh", async () => {
		token = null;
		await expect(create()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(calls).not.toContain("gh");
		token = "FAKE_NATIVE_TOKEN";
		badUrl = true;
		await expect(create()).rejects.toMatchObject({ code: "BAD_GATEWAY" });
		expect(calls).not.toContain("gh");
		badUrl = false;
		provider = "unknown";
		await expect(create()).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(calls).not.toContain("gh");
	});
	test("actual caller retains auth/transient error distinctions without GitHub fallback", async () => {
		for (const [status, code] of [
			[401, "UNAUTHORIZED"],
			[403, "FORBIDDEN"],
			[404, "NOT_FOUND"],
			[503, "BAD_GATEWAY"],
		] as const) {
			responseStatus = status;
			await expect(create()).rejects.toMatchObject({ code });
			expect(calls).not.toContain("gh");
		}
		responseStatus = 200;
		failFetch = true;
		await expect(create()).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	});
	test("ID reuse must still verify current GitLab metadata but retains original GitHub shortcut", async () => {
		const id = "00000000-0000-4000-8000-000000000001";
		const gl = await workspacesRouter
			.createCaller(ctx)
			.create({ id, projectId: "project", pr: 7, runSetup: false });
		expect(gl.alreadyExists).toBe(true);
		expect(calls).toContain(`token:${host}`);
		token = null;
		await expect(
			workspacesRouter
				.createCaller(ctx)
				.create({ id, projectId: "project", pr: 7, runSetup: false }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		provider = "github";
		calls.length = 0;
		const gh = await workspacesRouter
			.createCaller(ctx)
			.create({ id, projectId: "project", pr: 7, runSetup: false });
		expect(gh.alreadyExists).toBe(true);
		expect(calls).toEqual([]);
	});
	test("new GitLab materialization conflicts expose the code while retaining diagnostics as cause", async () => {
		registeredWorkspace = false;
		recordedMarker = JSON.stringify([
			"other-org",
			`https://${host}/Team/Widget.git`,
			"7",
			7,
		]);
		try {
			await create();
			throw Error("Expected conflict");
		} catch (error) {
			expect(error).toMatchObject({
				code: "CONFLICT",
				message: "CONFLICT",
				cause: { message: "Local branch belongs to another GitLab checkout" },
			});
		}
	});
	test("GitHub retains original gh metadata and reuse without GitLab provider calls", async () => {
		provider = "github";
		const result = await create();
		expect(result.alreadyExists).toBe(true);
		expect(calls).toEqual(["gh"]);
	});

	for (const retry of [false, true]) {
		test.each([
			"repoPath",
			"remoteName",
			"provider",
		] as const)(`current local selection changes during provider lookup reject ${retry ? "ID retry" : "normal create"}: %s`, async (change) => {
			metadataMutation = () => {
				if (change === "repoPath") localRepoPath = "/virtual/other-project";
				if (change === "remoteName") selectedRemote = "new-remote";
				if (change === "provider") provider = "github";
			};
			await expect(
				workspacesRouter.createCaller(ctx).create({
					projectId: "project",
					pr: 7,
					runSetup: false,
					...(retry ? { id: "00000000-0000-4000-8000-000000000001" } : {}),
				}),
			).rejects.toMatchObject({ code: "CONFLICT" });
			expect(calls.some((value) => value.startsWith("git-env:"))).toBe(false);
			expect(gitCalls.some((args) => args.includes("fetch"))).toBe(false);
		});
	}

	test.each([
		"repoPath",
		"remoteName",
		"provider",
	] as const)("selection changes while getting native credentials never bind/fetch: %s", async (change) => {
		credentialMutation = () => {
			if (change === "repoPath") localRepoPath = "/virtual/other-project";
			if (change === "remoteName") selectedRemote = "new-remote";
			if (change === "provider") provider = "github";
		};
		await expect(create()).rejects.toMatchObject({ code: "CONFLICT" });
		expect(calls.filter((value) => value.startsWith("git-env:"))).toHaveLength(
			1,
		);
		expect(gitEnvBindings).toBe(0);
		expect(gitCalls.some((args) => args.includes("fetch"))).toBe(false);
	});

	const migrationFolder = new URL("../../../../drizzle", import.meta.url)
		.pathname;
	async function nativeCheckoutProof() {
		const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } =
			await import("node:fs");
		const { join } = await import("node:path");
		const { execFileSync } = await import("node:child_process");
		const { eq } = await import("drizzle-orm");
		const { createDb } = await import("../../../db");
		const { projects, workspaces, pullRequests } = await import(
			"../../../db/schema"
		);
		const { createUserSimpleGit } = await import(
			"../../../runtime/git/simple-git"
		);
		const { workspacesRouter } = await import("./workspaces");
		const temp = mkdtempSync("/tmp/superset-gitlab-checkout-native-");
		const local = join(temp, "local"),
			source = join(temp, "source"),
			bare = join(temp, "target.git");
		nativeWorktrees = join(temp, "worktrees");
		let db: ReturnType<typeof createDb> | undefined;
		const command = (cwd: string, ...args: string[]) =>
			execFileSync("git", args, {
				cwd,
				encoding: "utf8",
				env: {
					PATH: process.env.PATH,
					GIT_CONFIG_GLOBAL: "/dev/null",
					GIT_CONFIG_NOSYSTEM: "1",
					GIT_TERMINAL_PROMPT: "0",
				},
			}).trim();
		try {
			mkdirSync(source);
			command(source, "init", "-b", "main");
			command(source, "config", "user.name", "Fixture User");
			command(source, "config", "user.email", "fixture@example.test");
			writeFileSync(join(source, "file.txt"), "base\n");
			command(source, "add", ".");
			command(source, "commit", "-m", "base");
			command(source, "switch", "-c", "Feature");
			writeFileSync(join(source, "file.txt"), "first\n");
			command(source, "commit", "-am", "first");
			nativeSha = command(source, "rev-parse", "HEAD");
			command(temp, "clone", "--bare", source, bare);
			command(bare, "update-ref", "refs/merge-requests/7/head", nativeSha);
			command(temp, "clone", "--branch", "main", bare, local);
			command(local, "remote", "rename", "origin", "gitlab");
			command(
				local,
				"remote",
				"set-url",
				"gitlab",
				`https://${host}/Team/Widget.git`,
			);
			command(
				local,
				"config",
				`url.${bare}.insteadOf`,
				`https://${host}/Team/Widget.git`,
			);
			command(local, "config", "protocol.file.allow", "always");
			command(local, "config", "user.name", "Fixture User");
			command(local, "config", "user.email", "fixture@example.test");
			db = createDb(join(temp, "host.db"), migrationFolder);
			db.insert(projects)
				.values({
					id: "project",
					name: "Project",
					repoPath: local,
					repoProvider: "gitlab",
					repoUrl: `https://${host}/Team/Widget`,
					remoteName: "gitlab",
					worktreeBaseDir: nativeWorktrees,
				})
				.run();
			const authority: string[] = [];
			const nativeCtx = {
				isAuthenticated: true,
				organizationId: "org",
				clientMachineId: "fixture",
				userId: "fixture",
				db,
				runtime: {
					pullRequests: new (
						await import("../../../runtime/pull-requests/pull-requests")
					).PullRequestRuntimeManager({
						db,
						git: async (path: string) => createUserSimpleGit(path),
						execGh: async () => {
							throw Error("Native GL association must not call gh");
						},
						github: async () => {
							throw Error("Native GL association must not call GitHub");
						},
						gitWatcher: { onChanged: () => () => {} } as never,
					}),
				},
				git: async (path: string) => createUserSimpleGit(path),
				eventBus: { broadcastWorkspaceChanged: () => {} },
				api: {
					v2Workspace: { trackCreated: { mutate: async () => {} } },
					analytics: { captureEvent: { mutate: async () => {} } },
				},
				credentials: {
					credentialRemedy: () => "FAKE_NATIVE_CREDENTIAL_REMEDY",
					getToken: async (requested: string) => {
						authority.push(`token:${requested}`);
						return requested === host ? "FAKE_NATIVE_TOKEN" : null;
					},
					getCredentials: async (requested: string | null) => {
						authority.push(`git:${requested}`);
						return {
							env: {
								PATH: process.env.PATH ?? "/usr/bin:/bin",
								GIT_CONFIG_GLOBAL: "/dev/null",
								GIT_CONFIG_NOSYSTEM: "1",
							},
						};
					},
				},
			} as unknown as HostServiceContext;
			nativeFixture = true;
			const caller = workspacesRouter.createCaller(nativeCtx);
			const createNative = (id?: string) =>
				caller.create({
					projectId: "project",
					pr: 7,
					runSetup: false,
					...(id ? { id } : {}),
				});
			const created = await createNative();
			expect(created.alreadyExists).toBe(false);
			const workspace = db.query.workspaces
				.findFirst({ where: eq(workspaces.id, created.workspace.id) })
				.sync();
			expect(workspace).toBeDefined();
			if (!workspace) throw Error("Fixture workspace missing");
			const path = workspace.worktreePath;
			expect(command(path, "rev-parse", "HEAD")).toBe(nativeSha);
			expect(command(local, "config", "branch.Feature.remote")).toBe("gitlab");
			expect(
				command(local, "config", "branch.Feature.supersetGitlabCheckout"),
			).toBe(
				JSON.stringify(["org", `https://${host}/Team/Widget.git`, "7", 7]),
			);
			expect(
				authority.every(
					(value) =>
						value === `token:${host}` ||
						value === `git:https://${host}/Team/Widget.git`,
				),
			).toBe(true);
			const concurrent = await Promise.all([
				createNative(),
				createNative(created.workspace.id),
			]);
			expect(
				concurrent.every(
					(result) =>
						result.workspace.id === created.workspace.id &&
						result.alreadyExists,
				),
			).toBe(true);
			writeFileSync(join(source, "file.txt"), "second\n");
			command(source, "commit", "-am", "second");
			nativeSha = command(source, "rev-parse", "HEAD");
			command(source, "push", bare, `HEAD:refs/merge-requests/7/head`);
			await createNative();
			expect(command(path, "rev-parse", "HEAD")).toBe(nativeSha);
			writeFileSync(join(path, "untracked.txt"), "keep\n");
			await createNative();
			expect(existsSync(join(path, "untracked.txt"))).toBe(true);
			writeFileSync(join(source, "file.txt"), "third\n");
			command(source, "commit", "-am", "third");
			const cleanHead = nativeSha;
			nativeSha = command(source, "rev-parse", "HEAD");
			command(source, "push", bare, `HEAD:refs/merge-requests/7/head`);
			await expect(createNative()).rejects.toMatchObject({ code: "CONFLICT" });
			expect(command(path, "rev-parse", "HEAD")).toBe(cleanHead);
			expect(existsSync(join(path, "untracked.txt"))).toBe(true);
			rmSync(join(path, "untracked.txt"));
			await createNative();
			expect(command(path, "rev-parse", "HEAD")).toBe(nativeSha);
			writeFileSync(join(path, "local.txt"), "user commit\n");
			command(path, "add", "local.txt");
			command(path, "commit", "-m", "user");
			const userHead = command(path, "rev-parse", "HEAD");
			await expect(createNative()).rejects.toMatchObject({ code: "CONFLICT" });
			expect(command(path, "rev-parse", "HEAD")).toBe(userHead);
			command(path, "reset", "--hard", nativeSha);
			command(source, "reset", "--hard", "main");
			writeFileSync(join(source, "file.txt"), "rewritten\n");
			command(source, "commit", "-am", "rewrite");
			const previousHead = nativeSha;
			nativeSha = command(source, "rev-parse", "HEAD");
			command(
				source,
				"push",
				"--force",
				bare,
				`HEAD:refs/merge-requests/7/head`,
			);
			await expect(createNative()).rejects.toMatchObject({ code: "CONFLICT" });
			expect(command(path, "rev-parse", "HEAD")).toBe(previousHead);
			command(
				local,
				"remote",
				"set-url",
				"gitlab",
				"https://other.test/Team/Widget.git",
			);
			authority.length = 0;
			await expect(createNative()).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
			expect(authority).not.toContain(`git:https://${host}/Team/Widget.git`);
			command(
				local,
				"remote",
				"set-url",
				"gitlab",
				`https://${host}/Team/Widget.git`,
			);
			db.insert(pullRequests)
				.values({
					id: "wrong-link",
					projectId: "project",
					repoProvider: "gitlab",
					repoHost: "other.test",
					repoOwner: "Team",
					repoName: "Widget",
					prNumber: 7,
					url: "https://other.test/Team/Widget/-/merge_requests/7",
					title: "Other",
					state: "open",
					headBranch: "Feature",
					headSha: previousHead,
				})
				.run();
			db.update(workspaces)
				.set({ pullRequestId: "wrong-link" })
				.where(eq(workspaces.id, workspace.id))
				.run();
			authority.length = 0;
			await expect(createNative()).rejects.toMatchObject({ code: "CONFLICT" });
			expect(authority.some((value) => value.startsWith("git:"))).toBe(true);
			expect(
				db.query.pullRequests
					.findFirst({ where: eq(pullRequests.id, "wrong-link") })
					.sync()?.id,
			).toBe("wrong-link");
			db.update(workspaces)
				.set({ pullRequestId: null })
				.where(eq(workspaces.id, workspace.id))
				.run();
			nativeFork = true;
			const fork = await createNative();
			expect(fork.alreadyExists).toBe(false);
			expect(fork.workspace.branch).toBe("people/Feature");
			expect(
				command(local, "config", `branch.${fork.workspace.branch}.remote`),
			).toBe("superset-pr-7");
			expect(command(local, "config", "remote.superset-pr-7.url")).toBe(
				`https://${host}/People/Fork.git`,
			);
			nativeDeletedFork = true;
			const deleted = await createNative();
			expect(deleted.workspace.branch).toBe("pr/7");
			expect(command(local, "config", "branch.pr/7.merge")).toBe(
				"refs/merge-requests/7/head",
			);
			expect(command(local, "config", "branch.pr/7.remote")).toBe("gitlab");
		} finally {
			nativeFixture = false;
			db?.$client.close();
			rmSync(temp, { recursive: true, force: true });
			expect(existsSync(temp)).toBe(false);
		}
	}

	test.skipIf(process.env.SUPERSET_GITLAB_CHECKOUT_NATIVE_TEST !== "1")(
		"owned Git + genuine SQLite router proof (explicit fixture driver)",
		async () => {
			const { mkdtempSync, symlinkSync, rmSync, existsSync, readFileSync } =
				await import("node:fs");
			const { join } = await import("node:path");
			const temp = mkdtempSync("/tmp/superset-gitlab-checkout-node-");
			try {
				const buildScript = `import {linguiMacroPlugin} from ${JSON.stringify(Bun.resolveSync("@superset/i18n/bun-plugin", import.meta.dir))}; const result=await Bun.build({entrypoints:[${JSON.stringify(new URL("../../../workers/host-worker.ts", import.meta.url).pathname)}],plugins:[linguiMacroPlugin],target:"node",format:"esm",outdir:${JSON.stringify(temp)},naming:"host-worker.js",define:{"process.env.NODE_ENV":JSON.stringify("production")}}); if(!result.success)throw new AggregateError(result.logs,"Owned production worker build failed");`;
				const builder = runIsolatedTest(
					process.execPath,
					["--no-env-file", "-e", buildScript],
					{
						cwd: temp,
						env: { PATH: process.env.PATH, TMPDIR: "/tmp", HOME: temp },
						stdio: "pipe",
						timeout: 15000,
					},
				);
				if (builder.error) throw builder.error;
				if (builder.status !== 0)
					throw new Error(
						`Owned production worker builder failed: ${builder.stderr.toString()}`,
					);
				const guard = join(temp, "deny.cjs");
				await Bun.write(
					guard,
					`const fs=require("node:fs"),path=require("node:path"),threads=require("node:worker_threads");const deny=()=>{throw new Error("Owned fixture denied network");};globalThis.fetch=deny;for(const name of ["node:http","node:https"]){const mod=require(name);mod.request=deny;mod.get=deny;}for(const name of ["node:net","node:tls"]){const mod=require(name);mod.connect=deny;mod.createConnection=deny;}function check(file){if(typeof file==="string"&&path.basename(file).startsWith(".env"))throw new Error("Owned fixture denied dotenv filesystem read");}for(const name of ["readFileSync","readFile"]){const original=fs[name];fs[name]=function(file,...args){check(file);return original.call(this,file,...args);};}const original=fs.promises.readFile;fs.promises.readFile=async function(file,...args){check(file);return original.call(this,file,...args);};if(process.env.SUPERSET_OWNED_PRELOAD_LOG)fs.appendFileSync(process.env.SUPERSET_OWNED_PRELOAD_LOG,(threads.isMainThread?"main:":"worker:")+threads.threadId+"\\n");require("node:module").syncBuiltinESMExports();`,
				);
				symlinkSync(
					new URL("../../../../node_modules", import.meta.url).pathname,
					join(temp, "node_modules"),
					"dir",
				);
				const fixture = `import assert from "node:assert/strict";
let nativeFixture = true, nativeWorktrees = "", nativeSha = "", nativeFork = false, nativeDeletedFork = false;
const host = "gl.example.test:8443", migrationFolder = ${JSON.stringify(new URL("../../../../drizzle", import.meta.url).pathname)};
let assertions = 0;
function expect(value) { return { toBe: wanted => {assertions++;assert.equal(value,wanted);}, toBeDefined: () => {assertions++;assert.notEqual(value,undefined);}, not:{toContain:wanted => {assertions++;assert.equal(value.includes(wanted),false);}}, rejects:{toMatchObject: async wanted => {assertions++;await assert.rejects(value,error => Object.entries(wanted).every(([key,entry])=>error[key]===entry));}} }; }
globalThis.fetch = async (input, init) => { const url = new URL(String(input)); if (url.host !== host) return Response.json({}, {status:404}); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer FAKE_NATIVE_TOKEN"); if (url.pathname.endsWith("/projects/8")) return Response.json({id:8,path_with_namespace:"People/Fork",http_url_to_repo:"https://"+host+"/People/Fork.git"}); if (url.pathname.endsWith("/projects/Team%2FWidget")) return Response.json({id:7,path_with_namespace:"Team/Widget",http_url_to_repo:"https://"+host+"/Team/Widget.git"}); return Response.json({iid:7,project_id:7,source_project_id:nativeDeletedFork?null:nativeFork?8:7,target_project_id:7,source_branch:"Feature",target_branch:"main",sha:nativeSha,title:"Feature",state:"opened",web_url:"https://"+host+"/Team/Widget/-/merge_requests/7"}); };
${nativeCheckoutProof.toString()}
const {getHostWorkerPool}=await import("../../../workers/host-worker-pool");
try {await nativeCheckoutProof(); assert.equal(getHostWorkerPool().getMode(),"worker"); console.log(JSON.stringify({proof:"native-checkout",assertions,mode:"worker",version:process.version,abi:process.versions.modules}));} finally {await getHostWorkerPool().dispose();}`;
				const nativeNode = process.env.SUPERSET_GITLAB_CHECKOUT_NODE;
				const built = await Bun.build({
					entrypoints: [import.meta.path],
					target: nativeNode ? "node" : "bun",
					format: "esm",
					external: nativeNode ? ["better-sqlite3"] : [],
					plugins: [
						{
							name: "owned-native-fixture",
							setup(build) {
								build.onResolve({ filter: /^@sentry\/(?:node|bun)$/ }, () => ({
									path: "sentry-fixture",
									namespace: "owned-checkout",
								}));
								build.onLoad(
									{ filter: /.*/, namespace: "owned-checkout" },
									() => ({
										contents:
											"export const captureException=()=>{};export const captureMessage=()=>{};export const init=()=>{};export const flush=async()=>true;export const onUncaughtExceptionIntegration=()=>({});",
										loader: "js",
									}),
								);
								if (!nativeNode)
									build.onLoad(
										{ filter: /host-service[/]src[/]db[/]db\.ts$/ },
										() => ({
											contents: `import {Database} from "bun:sqlite";import {drizzle} from "drizzle-orm/bun-sqlite";import {runMigrations} from "@superset/shared/sqlite-migrations";import * as schema from "./schema.ts";import {applyRepoSchema} from "./repo-schema.ts";export function createDb(path,folder){const sqlite=new Database(path);const db=drizzle(sqlite,{schema});runMigrations(db,folder);applyRepoSchema(sqlite);sqlite.exec("PRAGMA foreign_keys=ON");return db;}`,
											loader: "ts",
										}),
									);
								build.onLoad(
									{ filter: /workspaces\.gitlab\.test\.ts$/ },
									() => ({
										contents: fixture,
										loader: "ts",
									}),
								);
								build.onLoad({ filter: /[/]dispatch-agents\.ts$/ }, () => ({
									contents:
										'import {z} from "zod"; export const agentLaunchSchema=z.object({agent:z.string(),prompt:z.string()}); export async function dispatchSugarAgents(){return [];}',
									loader: "ts",
								}));
								build.onLoad(
									{ filter: /[/]dotenv[/](?:lib[/])?main\.js$/ },
									() => ({
										contents:
											"export function config(){return {parsed:{}}};export default {config};",
										loader: "js",
									}),
								);
								build.onLoad({ filter: /[/]host-info\.ts$/ }, () => ({
									contents:
										'export const getHostId=()=>"FAKE_HOST";export const getMachineId=()=>"FAKE_MACHINE";export const getHostName=()=>"FAKE_HOST_NAME";',
									loader: "ts",
								}));
								build.onLoad(
									{ filter: /[/](?:trpc|db|api)[/]src[/]env\.ts$/ },
									() => ({ contents: "export const env={};", loader: "ts" }),
								);
							},
						},
					],
				});
				if (!built.success)
					throw new AggregateError(built.logs, "Native fixture bundle failed");
				const bundle = join(temp, "proof.mjs");
				const output = built.outputs[0];
				if (!output) throw Error("Native fixture bundle produced no output");
				await Bun.write(bundle, output);
				const child = runIsolatedTest(
					nativeNode ?? process.execPath,
					nativeNode ? ["--require", guard, bundle] : ["--no-env-file", bundle],
					{
						env: {
							ELECTRON_RUN_AS_NODE: "1",
							PATH: process.env.PATH ?? "/usr/bin:/bin",
							TMPDIR: "/tmp",
							GIT_CONFIG_GLOBAL: "/dev/null",
							GIT_CONFIG_NOSYSTEM: "1",
							GIT_TERMINAL_PROMPT: "0",
							HOME: temp,
							SUPERSET_OWNED_PRELOAD_LOG: join(temp, "preload.log"),
						},
						stdio: "pipe",
						timeout: 25000,
					},
				);
				const stdout = child.stdout.toString(),
					stderr = child.stderr.toString(),
					code = child.status;
				console.log(stdout);
				if (stderr) console.error(stderr);
				if (child.error) throw child.error;
				if (code !== 0)
					throw Error(`Owned native fixture exited ${code}: ${stderr}`);
				expect(stdout).toContain('"proof":"native-checkout"');
				if (nativeNode)
					expect(readFileSync(join(temp, "preload.log"), "utf8")).toContain(
						"worker:",
					);
			} finally {
				rmSync(temp, { recursive: true, force: true });
				expect(existsSync(temp)).toBe(false);
			}
		},
		30_000,
	);
}
