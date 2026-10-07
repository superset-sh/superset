import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { HostDb } from "../../../../db/db";
import type { HostServiceContext } from "../../../../types";

// Unmodified deployed caller snapshots constrain this one-release wire adapter.
const oldDetailMapper =
	'import type { HostServiceClient } from "@/lib/host-service/client";\nimport type {\n\tMergeableState,\n\tMergeMethod,\n\tMergeStateStatus,\n\tPullRequestCheck,\n\tPullRequestDetail,\n\tPullRequestReviewer,\n\tReviewDecision,\n\tReviewerState,\n} from "../../utils/pullRequest";\n\nexport type RawProviderDetail = Awaited<\n\tReturnType<HostServiceClient["pullRequests"]["getDetail"]["query"]>\n>;\nexport interface GitLabPullRequestDetail {\n\tprovider: "gitlab";\n\thost: string;\n\tpullRequest: Omit<RawProviderDetail["pullRequest"], "state"> & {\n\t\tstate: "open" | "closed" | "merged";\n\t\tadditions: null;\n\t\tdeletions: null;\n\t\tchangedFiles: null;\n\t};\n\tchecks: PullRequestCheck[];\n\treviewState: Extract<\n\t\tRawProviderDetail["reviewState"],\n\t\t{ provider: "gitlab" }\n\t>;\n\tcapabilities: RawProviderDetail["capabilities"];\n}\nexport type WorkspacePullRequestDetail =\n\t| (PullRequestDetail & { provider: "github"; host: string })\n\t| GitLabPullRequestDetail;\nexport function toProviderDetail(\n\traw: RawProviderDetail,\n): WorkspacePullRequestDetail {\n\tif (raw.provider === "github") {\n\t\tif (!raw.githubDetail) throw new Error("GitHub detail is unavailable");\n\t\treturn {\n\t\t\t...toGithubDetail(raw.githubDetail),\n\t\t\tprovider: "github",\n\t\t\thost: raw.host,\n\t\t};\n\t}\n\tif (\n\t\traw.reviewState.provider !== "gitlab" ||\n\t\traw.capabilities.mergePolicy.provider !== "gitlab"\n\t)\n\t\tthrow new Error("GitLab detail has an invalid provider state");\n\tconst state = raw.pullRequest.state;\n\tif (state !== "open" && state !== "closed" && state !== "merged")\n\t\tthrow new Error("GitLab detail has an invalid lifecycle state");\n\treturn {\n\t\tprovider: "gitlab",\n\t\thost: raw.host,\n\t\tpullRequest: {\n\t\t\t...raw.pullRequest,\n\t\t\tstate,\n\t\t\tadditions: null,\n\t\t\tdeletions: null,\n\t\t\tchangedFiles: null,\n\t\t},\n\t\treviewState: raw.reviewState,\n\t\tcapabilities: raw.capabilities,\n\t\tchecks: raw.pullRequest.checks.map((check) => ({\n\t\t\tname: check.name,\n\t\t\tstatus: check.status === "pending" ? "IN_PROGRESS" : "COMPLETED",\n\t\t\tconclusion:\n\t\t\t\tcheck.status === "pending"\n\t\t\t\t\t? null\n\t\t\t\t\t: check.status === "success"\n\t\t\t\t\t\t? "SUCCESS"\n\t\t\t\t\t\t: check.status === "skipped"\n\t\t\t\t\t\t\t? "SKIPPED"\n\t\t\t\t\t\t\t: check.status === "cancelled"\n\t\t\t\t\t\t\t\t? "CANCELLED"\n\t\t\t\t\t\t\t\t: "FAILURE",\n\t\t\tisRequired: false,\n\t\t\tstartedAt: null,\n\t\t\tcompletedAt: null,\n\t\t\tdetailsUrl: check.url,\n\t\t})),\n\t};\n}\nfunction at(value: string | null): Date | null {\n\treturn value ? new Date(value) : null;\n}\n\nfunction toGithubDetail(\n\traw: NonNullable<RawProviderDetail["githubDetail"]>,\n): PullRequestDetail {\n\treturn {\n\t\tpullRequest: {\n\t\t\t...raw.pullRequest,\n\t\t\tstate: raw.pullRequest.state as "open" | "closed" | "merged",\n\t\t\tmergedAt: at(raw.pullRequest.mergedAt),\n\t\t},\n\t\tchecks: raw.checks.map(\n\t\t\t(check): PullRequestCheck => ({\n\t\t\t\t...check,\n\t\t\t\tstatus: check.status as PullRequestCheck["status"],\n\t\t\t\tconclusion: check.conclusion as PullRequestCheck["conclusion"],\n\t\t\t\tstartedAt: at(check.startedAt),\n\t\t\t\tcompletedAt: at(check.completedAt),\n\t\t\t}),\n\t\t),\n\t\treviewers: raw.reviewers.map(\n\t\t\t(reviewer): PullRequestReviewer => ({\n\t\t\t\t...reviewer,\n\t\t\t\tstate: reviewer.state as ReviewerState,\n\t\t\t}),\n\t\t),\n\t\tmergeability: {\n\t\t\t...raw.mergeability,\n\t\t\tmergeable: raw.mergeability.mergeable as MergeableState,\n\t\t\tmergeStateStatus: raw.mergeability.mergeStateStatus as MergeStateStatus,\n\t\t\treviewDecision: raw.mergeability.reviewDecision as ReviewDecision,\n\t\t\tqueue: raw.mergeability.queue\n\t\t\t\t? {\n\t\t\t\t\t\tposition: raw.mergeability.queue.position,\n\t\t\t\t\t\tstate: raw.mergeability.queue.state as NonNullable<\n\t\t\t\t\t\t\tPullRequestDetail["mergeability"]["queue"]\n\t\t\t\t\t\t>["state"],\n\t\t\t\t\t}\n\t\t\t\t: null,\n\t\t\tallowedMergeMethods: raw.mergeability\n\t\t\t\t.allowedMergeMethods as MergeMethod[],\n\t\t},\n\t\tcapabilities: raw.capabilities,\n\t};\n}\n';
const oldActionCaller =
	'import type { HostServiceClient } from "@/lib/host-service/client";\nimport type { PlainActionId } from "../../utils/pullRequestState";\n\ntype Procedures = HostServiceClient["pullRequests"];\nexport interface ProjectActionClient {\n\tpullRequests: {\n\t\t[Key in "markReady" | "updateBranch" | "setState" | "dequeue"]: Pick<\n\t\t\tProcedures[Key],\n\t\t\t"mutate"\n\t\t>;\n\t};\n}\nexport async function runPullRequestAction(\n\tclient: ProjectActionClient,\n\tprojectId: string,\n\tprNumber: number,\n\taction: PlainActionId,\n\texpectedUrl: string,\n): Promise<unknown> {\n\tif (!projectId || !Number.isSafeInteger(prNumber) || prNumber <= 0)\n\t\tthrow new Error("A project and pull request are required");\n\tconst input = { projectId, prNumber, expectedUrl };\n\tswitch (action) {\n\t\tcase "mark-ready":\n\t\t\treturn client.pullRequests.markReady.mutate(input);\n\t\tcase "update-branch":\n\t\t\treturn client.pullRequests.updateBranch.mutate(input);\n\t\tcase "reopen":\n\t\t\treturn client.pullRequests.setState.mutate({ ...input, state: "open" });\n\t\tcase "dequeue":\n\t\t\treturn client.pullRequests.dequeue.mutate(input);\n\t}\n}\n';

if (process.env.SUPERSET_LEGACY_CLIENT_FIXTURE !== "1") {
	test("deployed callers use genuine protected legacy tRPC paths in isolation", () => {
		const directory = mkdtempSync("/tmp/superset-legacy-client-");
		try {
			writeFileSync(join(directory, "old-detail.ts"), oldDetailMapper);
			writeFileSync(join(directory, "old-action.ts"), oldActionCaller);
			const result = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd: directory,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_LEGACY_CLIENT_FIXTURE: "1",
					},
					stdout: "pipe",
					stderr: "pipe",
					timeout: 30000,
				},
			);
			process.stdout.write(result.stdout);
			process.stderr.write(result.stderr);
			expect(result.exitCode).toBe(0);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 35000);
} else {
	const deny = () => {
		throw Error("Unowned transport forbidden in legacy caller fixture");
	};
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(deny);
	spyOn(Bun, "spawn").mockImplementation(deny);
	spyOn(Bun, "spawnSync").mockImplementation(deny);
	const childProcess = await import("node:child_process");
	for (const name of [
		"spawn",
		"spawnSync",
		"exec",
		"execSync",
		"execFile",
		"execFileSync",
		"fork",
	] as const)
		spyOn(childProcess, name).mockImplementation(deny);
	mock.module("dotenv", () => ({ config: deny }));
	mock.module("@sentry/node", () => ({ captureException: deny }));
	const { Database } = await import("bun:sqlite"),
		{ drizzle } = await import("drizzle-orm/bun-sqlite"),
		{ migrate } = await import("drizzle-orm/bun-sqlite/migrator");
	const schema = await import("../../../../db/schema"),
		{ parseGitRemote } = await import("@superset/shared/git-remote");
	const sqlite = new Database(":memory:"),
		memoryDb = drizzle(sqlite, { schema });
	migrate(memoryDb, {
		migrationsFolder: resolve(import.meta.dir, "../../../../../drizzle"),
	});
	const db = memoryDb as unknown as HostDb;
	let serial = 0,
		projectId = "",
		repoUrl = "",
		provider: "github" | "gitlab" = "gitlab",
		host = "",
		owner = "",
		repo = "Widget",
		number = 7;
	let lifecycle = "opened",
		draft = true,
		responseUrl: string | undefined,
		expectedContentNumber: number | undefined;
	let failProvider = false,
		authenticated = true;
	let afterResolveRemote: (() => void) | undefined;
	const tokenHosts: string[] = [],
		requests: Array<{
			host: string;
			path: string;
			method: string;
			body: unknown;
		}> = [],
		ghCalls: string[][] = [];
	const canonicalUrl = () =>
		`https://${host}/${owner}/${repo}/${provider === "github" ? "pull" : "-/merge_requests"}/${number}`;
	mock.module("../../../../workers/host-worker-pool", () => ({
		getHostWorkerPool: () => ({
			run: async (task: { type: string }, input: { repoPath: string }) => {
				if (task.type !== "git/resolveRepository")
					throw Error("Unexpected worker task");
				const remote = parseGitRemote(repoUrl);
				if (!remote) throw Error("Bad owned remote fixture");
				afterResolveRemote?.();
				return { repoPath: input.repoPath, remotes: [["origin", remote]] };
			},
		}),
	}));
	mock.module("../../../../runtime/git/simple-git", () => ({
		createUserSimpleGit: () => ({
			revparse: async () => "/fixture/repo",
			raw: async () => `remote.origin.url ${repoUrl}`,
		}),
	}));
	mock.module("../../workspace-creation/utils/exec-gh", () => ({
		execGh: async (args: string[]) => {
			ghCalls.push(args);
			return {
				number: expectedContentNumber ?? number,
				title: "Owned PR",
				body: "Body",
				url: responseUrl ?? canonicalUrl(),
				state: lifecycle.toUpperCase(),
				headRefName: "feature",
				baseRefName: "main",
				headRepositoryOwner: { login: owner },
				isCrossRepository: false,
				isDraft: draft,
				author: { login: "author" },
				createdAt: "2026-01-01",
				updatedAt: "2026-01-02",
				statusCheckRollup: [],
			};
		},
	}));
	const nativeMr = () => ({
		id: 70,
		iid: expectedContentNumber ?? number,
		title: draft ? "Draft: Owned PR" : "Owned PR",
		description: "Body",
		web_url: responseUrl ?? canonicalUrl(),
		state: lifecycle,
		source_branch: "feature",
		target_branch: "main",
		source_project_id: 1,
		target_project_id: 1,
		sha: "sha",
		draft,
		author: { id: 9, username: "author" },
		created_at: "2026-01-01",
		updated_at: "2026-01-02",
		detailed_merge_status: "need_rebase",
		blocking_discussions_resolved: false,
		has_conflicts: false,
		user: { can_merge: true },
		rebase_in_progress: false,
	});
	const githubGraph = () => ({
		repository: {
			squashMergeAllowed: true,
			mergeCommitAllowed: true,
			rebaseMergeAllowed: false,
			pullRequest: {
				id: "PR-owned",
				number,
				title: "Owned PR",
				body: "Body",
				url: responseUrl ?? canonicalUrl(),
				baseRefName: "main",
				state: lifecycle.toUpperCase(),
				merged: lifecycle === "merged",
				mergedAt: lifecycle === "merged" ? "2026-01-03T00:00:00Z" : null,
				mergedBy: null,
				isDraft: draft,
				additions: 3,
				deletions: 1,
				changedFiles: 1,
				mergeable: "MERGEABLE",
				mergeStateStatus: "BEHIND",
				reviewDecision: "APPROVED",
				viewerCanUpdate: true,
				viewerCanMergeAsAdmin: false,
				mergeQueueEntry: { position: 2, state: "QUEUED" },
				baseRef: {
					branchProtectionRule: {
						requiredApprovingReviewCount: 1,
						requiresConversationResolution: true,
					},
				},
				latestOpinionatedReviews: {
					nodes: [
						{
							state: "APPROVED",
							author: { login: "reviewer", avatarUrl: null },
						},
					],
				},
				reviewThreads: {
					nodes: [],
					pageInfo: { hasNextPage: false, endCursor: null },
				},
				statusCheckRollup: {
					contexts: {
						nodes: [],
						pageInfo: { hasNextPage: false, endCursor: null },
					},
				},
			},
		},
	});
	const fetchProvider = Object.assign(
		async (input: string | URL | Request, init?: RequestInit) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			const method =
				init?.method ?? (input instanceof Request ? input.method : "GET");
			const body = init?.body ? JSON.parse(String(init.body)) : undefined;
			if (url.host !== host && url.host !== "api.github.com")
				throw Error("Unexpected provider host");
			requests.push({ host: url.host, path: url.pathname, method, body });
			if (failProvider)
				return Response.json({ message: "Owned forbidden" }, { status: 403 });
			if (url.host === "api.github.com") {
				if (url.pathname === "/graphql") {
					const query = body?.query ?? "";
					if (query.includes("markPullRequestReadyForReview"))
						return Response.json({
							data: {
								markPullRequestReadyForReview: {
									pullRequest: { isDraft: false },
								},
							},
						});
					if (query.includes("dequeuePullRequest"))
						return Response.json({
							data: {
								dequeuePullRequest: { mergeQueueEntry: { position: 0 } },
							},
						});
					return Response.json({
						data: query.includes("statusCheckRollup")
							? githubGraph()
							: { repository: { pullRequest: { id: "PR-owned" } } },
					});
				}
				if (url.pathname.endsWith("/requested_reviewers"))
					return Response.json({ users: [], teams: [] });
				if (url.pathname.endsWith("/update-branch"))
					return Response.json({ message: "updated" }, { status: 202 });
				if (url.pathname.endsWith("/merge"))
					return Response.json({
						sha: "merge-sha",
						merged: true,
						message: "Owned merged",
					});
				throw Error(`Unexpected GitHub path ${url.pathname}`);
			}
			if (url.pathname === "/api/v4/version")
				return Response.json({ message: "not GitLab" }, { status: 404 });
			if (url.pathname === "/api/v4/user") return Response.json({ id: 9 });
			if (url.pathname.endsWith("/approvals"))
				return Response.json({
					approvals_required: 2,
					approvals_left: 1,
					approved_by: [{ user: { username: "reviewer" } }],
				});
			if (url.pathname.endsWith("/rebase"))
				return Response.json({ rebase_in_progress: false });
			if (url.pathname.endsWith("/merge"))
				return Response.json({
					...nativeMr(),
					state: "merged",
					merge_commit_sha: "merge-sha",
					title: "Owned merged",
				});
			if (url.pathname.endsWith(`/merge_requests/${number}`))
				return Response.json(nativeMr());
			if (
				url.pathname.endsWith("/pipelines") ||
				url.pathname.endsWith("/statuses")
			)
				return Response.json([]);
			if (url.pathname.startsWith("/api/v4/projects/"))
				return Response.json({
					merge_method: "ff",
					squash_option: "always",
					permissions: { project_access: { access_level: 40 } },
				});
			throw Error(`Unexpected native path ${url.pathname}`);
		},
		{ preconnect() {} },
	);
	globalThis.fetch = fetchProvider;
	const { Octokit } = await import("@octokit/rest");
	const octokit = new Octokit({ request: { fetch: fetchProvider } });
	const { router } = await import("../../../index"),
		{ pullRequestsRouter } = await import("../pull-requests"),
		{ githubRouter } = await import("../../github/github");
	const wireRouter = router({
		pullRequests: pullRequestsRouter,
		github: githubRouter,
	});
	const { createTRPCClient, httpBatchLink } = await import("@trpc/client"),
		{ fetchRequestHandler } = await import("@trpc/server/adapters/fetch"),
		{ default: superjson } = await import("superjson");
	const { toProviderDetail } = await import(
			join(process.cwd(), "old-detail.ts")
		),
		{ runPullRequestAction } = await import(
			join(process.cwd(), "old-action.ts")
		);
	function context(): HostServiceContext {
		type OwnedContext = Pick<
			HostServiceContext,
			"db" | "isAuthenticated" | "credentials" | "github" | "organizationId"
		>;
		const unavailableServices: Omit<HostServiceContext, keyof OwnedContext> = {
			get git() {
				return deny();
			},
			get execGh() {
				return deny();
			},
			get api() {
				return deny();
			},
			get runtime() {
				return deny();
			},
			get eventBus() {
				return deny();
			},
			get terminalAgentStore() {
				return deny();
			},
		};
		const owned: OwnedContext = {
			db,
			isAuthenticated: authenticated,
			credentials: {
				getToken: async (value) => {
					tokenHosts.push(value ?? "");
					return "fake-owned-token";
				},
				getCredentials: async () => ({ env: {} }),
				credentialRemedy: () => "",
			},
			github: async () => octokit,
			organizationId: "owned-fixture-organization",
		};
		return Object.assign(Object.create(unavailableServices), owned);
	}
	const client = () =>
		createTRPCClient<typeof wireRouter>({
			links: [
				httpBatchLink({
					url: "http://owned.invalid/trpc",
					transformer: superjson,
					fetch: async (input, init) => {
						const response = await fetchRequestHandler({
							endpoint: "/trpc",
							req: new Request(input, init),
							router: wireRouter,
							createContext: context,
						});
						return {
							ok: response.ok,
							json: () => response.json(),
						};
					},
				}),
			],
		});
	function seed(
		next: "github" | "gitlab",
		state = next === "github" ? "open" : "opened",
	) {
		provider = next;
		lifecycle = state;
		host =
			next === "github" ? "github.com" : `git-${++serial}.fixture.invalid:8443`;
		owner = next === "github" ? `Acme-${++serial}` : "Acme/Team";
		projectId = `project-${serial}`;
		repoUrl = `https://${host}/${owner}/${repo}.git`;
		db.insert(schema.projects)
			.values({
				id: projectId,
				repoPath: "/fixture/repo",
				repoProvider: next,
				repoUrl,
				remoteName: "origin",
			})
			.run();
	}
	beforeEach(() => {
		db.delete(schema.projects).run();
		requests.length = 0;
		tokenHosts.length = 0;
		ghCalls.length = 0;
		authenticated = true;
		draft = true;
		responseUrl = undefined;
		expectedContentNumber = undefined;
		failProvider = false;
		afterResolveRemote = undefined;
	});
	afterAll(() => sqlite.close());
	for (const kind of ["github", "gitlab"] as const)
		for (const state of ["open", "closed", "merged"])
			test(`old mapper accepts complete ${kind} legacy detail for ${state}`, async () => {
				seed(kind, state === "open" && kind === "gitlab" ? "opened" : state);
				const raw = await client().pullRequests.getDetail.query({
					projectId,
					prNumber: number,
				});
				const mapped = toProviderDetail(raw);
				expect(raw).toMatchObject({
					provider: kind,
					host,
					pullRequest: {
						number: 7,
						body: "Body",
						branch: "feature",
						baseBranch: "main",
						state,
						headRepositoryOwner: owner,
						isCrossRepository: false,
						author: "author",
						isDraft: true,
						checks: [],
						checksStatus: "none",
					},
				});
				expect(mapped.provider).toBe(kind);
				expect(mapped.pullRequest.state).toBe(state);
				expect(mapped.pullRequest.url).toBe(canonicalUrl());
				if (kind === "github") {
					expect(raw.githubDetail).not.toBeNull();
					expect(raw.reviewState).toEqual({
						provider: "github",
						reviewDecision: "APPROVED",
					});
					expect(raw.capabilities).toMatchObject({
						close: state === "open",
						mergePolicy: {
							provider: "github",
							allowedMethods: ["squash", "merge"],
						},
					});
					expect(mapped.pullRequest.additions).toBe(3);
					expect(mapped.reviewers[0].login).toBe("reviewer");
				} else {
					expect(raw.githubDetail).toBeNull();
					expect(raw.capabilities.mergePolicy).toMatchObject({
						provider: "gitlab",
						method: "ff",
						squash: "always",
					});
					expect(raw.reviewState).toMatchObject({
						provider: "gitlab",
						approvalsRequired: 2,
						approvalsLeft: 1,
						approvedBy: ["reviewer"],
						blockingDiscussionsResolved: false,
					});
					expect(mapped.pullRequest.additions).toBeNull();
					expect(ghCalls).toEqual([]);
					expect(requests.every((value) => value.host === host)).toBe(true);
				}
			});
	for (const kind of ["github", "gitlab"] as const)
		for (const action of ["mark-ready", "update-branch", "dequeue"] as const)
			test(`old ${kind} action caller retains ${action} input and success contract`, async () => {
				seed(kind);
				const pending = runPullRequestAction(
					client(),
					projectId,
					number,
					action,
					canonicalUrl(),
				);
				if (kind === "gitlab" && action === "dequeue") {
					await expect(pending).rejects.toMatchObject({
						data: { code: "BAD_REQUEST" },
					});
					expect(requests).toEqual([]);
				} else {
					expect(await pending).toEqual({ ok: true });
					const writes = requests.filter(
						(value) =>
							value.method !== "GET" &&
							(value.host !== "api.github.com" ||
								String(
									(value.body as { query?: string })?.query ?? "",
								).includes("mutation") ||
								value.path.endsWith("/update-branch")),
					);
					expect(writes).toHaveLength(1);
					expect(writes[0]?.host).toBe(
						kind === "github" ? "api.github.com" : host,
					);
				}
			});
	for (const kind of ["github", "gitlab"] as const)
		for (const change of [
			"host",
			"port",
			"path",
			"iid",
			"query",
			"fragment",
			"credentials",
		])
			test(`legacy ${kind} action refuses changed ${change} before provider writes`, async () => {
				seed(kind);
				const url = new URL(canonicalUrl());
				if (change === "host") url.hostname = "other.fixture.invalid";
				else if (change === "port") url.port = "9443";
				else if (change === "path")
					url.pathname = url.pathname.replace("Widget", "Other");
				else if (change === "iid")
					url.pathname = url.pathname.replace(/7$/, "8");
				else if (change === "query") url.search = "?other=1";
				else if (change === "fragment") url.hash = "#other";
				else url.username = "other";
				await expect(
					runPullRequestAction(
						client(),
						projectId,
						number,
						"mark-ready",
						url.href,
					),
				).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
				expect(requests).toEqual([]);
				expect(tokenHosts).toEqual([]);
			});
	test("legacy native slug remains case sensitive", async () => {
		seed("gitlab");
		await expect(
			runPullRequestAction(
				client(),
				projectId,
				number,
				"mark-ready",
				canonicalUrl().replace("Acme", "acme"),
			),
		).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
		expect(requests).toEqual([]);
	});
	test("legacy GitHub slug remains case insensitive", async () => {
		seed("github");
		expect(
			await runPullRequestAction(
				client(),
				projectId,
				number,
				"mark-ready",
				canonicalUrl().toLowerCase(),
			),
		).toEqual({ ok: true });
	});
	for (const kind of ["github", "gitlab"] as const)
		test(`legacy ${kind} identity retains a trailing URL slash`, async () => {
			seed(kind);
			expect(
				await runPullRequestAction(
					client(),
					projectId,
					number,
					"mark-ready",
					`${canonicalUrl()}/`,
				),
			).toEqual({ ok: true });
		});
	test("legacy action rejects a retargeted live native project", async () => {
		seed("gitlab");
		const old = canonicalUrl();
		repoUrl = `https://${host}/Other/Repo.git`;
		await expect(
			runPullRequestAction(client(), projectId, number, "mark-ready", old),
		).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
		expect(requests).toEqual([]);
		expect(tokenHosts).toEqual([]);
	});
	test("legacy routes retain protected authentication", async () => {
		seed("gitlab");
		authenticated = false;
		await expect(
			client().pullRequests.getDetail.query({ projectId, prNumber: number }),
		).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
		expect(requests).toEqual([]);
	});
	test("legacy detail retains missing project refusal", async () => {
		seed("gitlab");
		await expect(
			client().pullRequests.getDetail.query({
				projectId: "missing",
				prNumber: number,
			}),
		).rejects.toMatchObject({ data: { code: "PRECONDITION_FAILED" } });
		expect(requests).toEqual([]);
	});
	test("legacy detail does not masquerade unsupported provider as GitHub", async () => {
		seed("gitlab");
		repoUrl = "https://unknown.fixture.invalid/Other/Repo.git";
		await expect(
			client().pullRequests.getDetail.query({ projectId, prNumber: number }),
		).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
		expect(ghCalls).toEqual([]);
		expect(requests.every((value) => value.host !== "api.github.com")).toBe(
			true,
		);
	});
	test("legacy detail rejects wrong returned MR number", async () => {
		seed("gitlab");
		expectedContentNumber = 8;
		await expect(
			client().pullRequests.getDetail.query({ projectId, prNumber: number }),
		).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
	});
	test("legacy detail rejects wrong returned MR identity", async () => {
		seed("gitlab");
		responseUrl = canonicalUrl().replace("Widget", "Other");
		await expect(
			client().pullRequests.getDetail.query({ projectId, prNumber: number }),
		).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
	});
	test("legacy actions retain current provider rejection classification", async () => {
		seed("gitlab");
		failProvider = true;
		await expect(
			runPullRequestAction(
				client(),
				projectId,
				number,
				"mark-ready",
				canonicalUrl(),
			),
		).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
		expect(ghCalls).toEqual([]);
	});
	test("current GitHub detail/action contracts keep their existing paths and results", async () => {
		seed("github");
		const input = {
			owner,
			repo,
			pullNumber: number,
			provider: "github" as const,
		};
		const detail = await client().github.getPullRequestDetail.query(input);
		expect(detail).not.toHaveProperty("githubDetail");
		expect(detail.pullRequest.number).toBe(7);
		expect(
			await client().github.markPullRequestReady.mutate(input),
		).toBeUndefined();
	});
	function legacyMutation(action: "reopen" | "merge", expectedUrl: string) {
		return action === "reopen"
			? runPullRequestAction(client(), projectId, number, "reopen", expectedUrl)
			: client().pullRequests.mergePR.mutate({
					projectId,
					prNumber: number,
					expectedUrl,
				});
	}
	for (const kind of ["github", "gitlab"] as const)
		for (const action of ["reopen", "merge"] as const) {
			test(`legacy ${kind} ${action} retains valid original input and result`, async () => {
				seed(kind);
				const result = await legacyMutation(action, canonicalUrl());
				expect(result).toEqual(
					action === "reopen"
						? { ok: true }
						: { sha: "merge-sha", merged: true, message: "Owned merged" },
				);
				if (kind === "gitlab") expect(ghCalls).toEqual([]);
				else if (action === "reopen")
					expect(ghCalls).toEqual([
						["pr", "reopen", "7", "--repo", `${owner}/${repo}`],
					]);
			});
			for (const change of [
				"host",
				"port",
				"subgroup",
				"provider",
				"iid",
				"query",
				"fragment",
				"credentials",
			])
				test(`legacy ${kind} ${action} denies changed ${change} before discovery or writes`, async () => {
					seed(kind);
					const url = new URL(canonicalUrl());
					if (change === "host") url.hostname = "other.fixture.invalid";
					else if (change === "port") url.port = "9443";
					else if (change === "subgroup")
						url.pathname = url.pathname.replace(owner, `${owner}/Other`);
					else if (change === "provider")
						url.pathname = url.pathname.replace(
							kind === "github" ? "/pull/" : "/-/merge_requests/",
							kind === "github" ? "/-/merge_requests/" : "/pull/",
						);
					else if (change === "iid")
						url.pathname = url.pathname.replace(/7$/, "8");
					else if (change === "query") url.search = "?other=1";
					else if (change === "fragment") url.hash = "#other";
					else url.username = "other";
					await expect(legacyMutation(action, url.href)).rejects.toMatchObject({
						data: { code: "BAD_REQUEST" },
					});
					expect(requests).toEqual([]);
					expect(ghCalls).toEqual([]);
					expect(tokenHosts).toEqual([]);
				});
			test(`legacy ${kind} ${action} revalidates a remote retargeted during resolution`, async () => {
				seed(kind);
				const expectedUrl = canonicalUrl();
				afterResolveRemote = () => {
					afterResolveRemote = undefined;
					repoUrl = `https://${host}/Other/Repo.git`;
				};
				await expect(legacyMutation(action, expectedUrl)).rejects.toMatchObject(
					{ data: { code: "BAD_REQUEST" } },
				);
				expect(requests).toEqual([]);
				expect(ghCalls).toEqual([]);
				expect(tokenHosts).toEqual([]);
			});
		}
	for (const squash of [true, false])
		test(`legacy native merge forwards optional squash ${squash}`, async () => {
			seed("gitlab");
			expect(
				await client().pullRequests.mergePR.mutate({
					projectId,
					prNumber: number,
					expectedUrl: canonicalUrl(),
					squash,
					commitMessage: "Owned commit",
				}),
			).toEqual({ sha: "merge-sha", merged: true, message: "Owned merged" });
			expect(
				requests.find((value) => value.path.endsWith("/merge"))?.body,
			).toEqual({ squash, merge_commit_message: "Owned commit" });
			expect(ghCalls).toEqual([]);
		});
	test("current omitted-URL GitHub merge keeps body defaults and result", async () => {
		seed("github");
		expect(
			await client().pullRequests.mergePR.mutate({
				projectId,
				prNumber: number,
			}),
		).toEqual({ sha: "merge-sha", merged: true, message: "Owned merged" });
		expect(
			requests.find((value) => value.path.endsWith("/merge"))?.body,
		).toEqual({ merge_method: "merge" });
	});
	for (const squash of [true, false])
		test(`GitHub merge preserves method/message and omits native squash ${squash}`, async () => {
			seed("github");
			expect(
				await client().pullRequests.mergePR.mutate({
					projectId,
					prNumber: number,
					expectedUrl: canonicalUrl(),
					squash,
					mergeMethod: "squash",
					commitMessage: "Owned commit",
				}),
			).toEqual({ sha: "merge-sha", merged: true, message: "Owned merged" });
			expect(
				requests.find((value) => value.path.endsWith("/merge"))?.body,
			).toEqual({ merge_method: "squash", commit_message: "Owned commit" });
		});
	test("current omitted-URL GitHub reopen keeps its CLI call and result", async () => {
		seed("github");
		expect(
			await client().pullRequests.setState.mutate({
				projectId,
				prNumber: number,
				state: "open",
			}),
		).toEqual({ ok: true });
		expect(ghCalls).toEqual([
			["pr", "reopen", "7", "--repo", `${owner}/${repo}`],
		]);
		expect(requests).toEqual([]);
	});
}
