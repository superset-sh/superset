import { beforeEach, expect, mock, test } from "bun:test";
import { spawnSync } from "node:child_process";

if (process.env.GITLAB_CONSUMERS_PROOF_CHILD !== "1") {
	test("cloud GitLab consumers run actual callers with isolated cleared mocks", () => {
		const result = spawnSync(
			process.execPath,
			["--no-env-file", "test", import.meta.path],
			{
				env: {
					PATH: process.env.PATH ?? "",
					GITLAB_CONSUMERS_PROOF_CHILD: "1",
				},
				encoding: "utf8",
				timeout: 30_000,
			},
		);
		process.stdout.write(result.stdout);
		process.stderr.write(result.stderr);
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
	});
} else {
	globalThis.fetch = async () => {
		throw new Error("Real network forbidden in GitLab consumer fixture");
	};
	const { getTableName } = await import("drizzle-orm");
	const { PgDialect } = await import("drizzle-orm/pg-core");
	const dialect = new PgDialect();
	const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
	const user = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
	const foreign = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
	const envId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
	const connId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
	const repoId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
	const host = "git.fixture.invalid:8443";
	const clone = `https://${host}/Team/Sub/App.git`;
	const project = {
		connectionId: connId,
		projectId: "83",
		pathWithNamespace: "Team/Sub/App",
		cloneUrl: clone,
		defaultBranch: "Release/Current",
	};
	type State = {
		environments: Array<Record<string, unknown>>;
		workspaces: Array<Record<string, unknown>>;
		bindings: Map<string, typeof project>;
		checkouts: Map<string, typeof project>;
		repositories: Array<Record<string, unknown>>;
	};
	let state: State;
	let config: {
		provider: "gitlab";
		host: string;
		groupPath: string;
		scopeKind: "group";
		auth: "token";
		webhookSecret: string;
	};
	let connected: boolean;
	let connectionOrg: string;
	let feature: boolean;
	let memberships: string[];
	let githubCalls: number;
	let providerCalls: Array<{ origin: string; path: string }>;
	let external: string[];
	let statements: Array<{ sql: string; params: unknown[]; tx: boolean }>;
	let duringProvider: (() => void) | undefined;
	let duringTransaction: (() => void) | undefined;
	let failBinding: boolean;
	let committed: number;
	let duringGolden: (() => void) | undefined;
	const ghRepo = {
		id: repoId,
		fullName: "Github/Existing",
		owner: "Github",
		name: "Existing",
		defaultBranch: "github-trunk",
		installationId: "fixture-installation",
	};
	const environment = () => ({
		id: envId,
		organizationId: org,
		name: "Fixture environment",
		sourceKind: "image",
		sourceRef: "fixture:image",
		scope: "organization",
		createdByUserId: user,
		hooksRepositoryId: repoId,
		archivedAt: null,
		region: "sfo1",
		bundleSha: null,
		provider: "vercel",
	});
	function environmentRow() {
		const row = state.environments[0];
		if (!row) throw new Error("Missing fixture environment");
		return row;
	}
	function workspaceRow() {
		const row = state.workspaces[0];
		if (!row) throw new Error("Missing fixture workspace");
		return row;
	}
	const bindingRow = (p: typeof project) => ({
		connection_id: p.connectionId,
		project_id: p.projectId,
		path_with_namespace: p.pathWithNamespace,
		clone_url: p.cloneUrl,
		default_branch: p.defaultBranch,
	});
	function snapshot(s: State): State {
		return {
			environments: structuredClone(s.environments),
			workspaces: structuredClone(s.workspaces),
			bindings: new Map(s.bindings),
			checkouts: new Map(s.checkouts),
			repositories: structuredClone(s.repositories),
		};
	}
	function builder(s: State, table: unknown, kind: string) {
		const tableName = getTableName(table as Parameters<typeof getTableName>[0]);
		let values: Record<string, unknown> | Array<Record<string, unknown>> = {};
		let where: unknown;
		function run() {
			if (kind === "select") {
				if (tableName === "environments") return s.environments;
				if (tableName === "environment_repositories") {
					const params = where
						? dialect.sqlToQuery(
								where as Parameters<typeof dialect.sqlToQuery>[0],
							).params
						: [];
					return s.repositories
						.filter((r) => !params.length || params.includes(r.environmentId))
						.map((r) => ({ ...ghRepo, ...r }));
				}
				if (tableName === "cloud_workspace_repositories")
					return s.repositories
						.filter((r) => r.cloudWorkspaceId)
						.map((r) => ({
							fullName: ghRepo.fullName,
							repositoryId: repoId,
							path: ".",
							hooksRepositoryId: repoId,
							...r,
						}));
				return [];
			}
			if (kind === "insert") {
				const rows = (Array.isArray(values) ? values : [values]).map((v) => ({
					...(tableName === "environments"
						? {
								...environment(),
								id: crypto.randomUUID(),
								hooksRepositoryId: null,
							}
						: tableName === "cloud_workspaces"
							? { id: crypto.randomUUID(), visibility: "org" }
							: {}),
					...v,
				}));
				if (tableName === "cloud_workspaces") s.workspaces.push(...rows);
				if (tableName === "environments") s.environments.push(...rows);
				if (tableName === "environment_repositories")
					s.repositories.push(...rows);
				return rows;
			}
			if (kind === "delete" && tableName === "environment_repositories") {
				const params = dialect.sqlToQuery(
					where as Parameters<typeof dialect.sqlToQuery>[0],
				).params;
				s.repositories = s.repositories.filter(
					(r) => !params.includes(r.environmentId),
				);
				return [];
			}
			if (kind === "update" && tableName === "environments") {
				const params = dialect.sqlToQuery(
					where as Parameters<typeof dialect.sqlToQuery>[0],
				).params;
				const rows = s.environments.filter((r) => params.includes(r.id));
				for (const row of rows) Object.assign(row, values);
				return rows;
			}
			return [];
		}
		const chain = {
			values(v: typeof values) {
				values = v;
				return chain;
			},
			set(v: typeof values) {
				values = v;
				return chain;
			},
			where(v: unknown) {
				where = v;
				return chain;
			},
			innerJoin() {
				return chain;
			},
			leftJoin() {
				return chain;
			},
			orderBy() {
				return chain;
			},
			onConflictDoNothing() {
				return chain;
			},
			returning: async () => run(),
			// biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable before returning().
			then(
				resolve: (rows: unknown[]) => unknown,
				reject?: (error: unknown) => unknown,
			) {
				return Promise.resolve().then(run).then(resolve, reject);
			},
		};
		return chain;
	}
	function database(s: () => State, inTx = false): Record<string, unknown> {
		return {
			query: {
				cloudWorkspaces: {
					findFirst: async (options: { where: unknown }) => {
						const q = dialect.sqlToQuery(
							options.where as Parameters<typeof dialect.sqlToQuery>[0],
						);
						return structuredClone(
							s().workspaces.find((r) => q.params.includes(r.id)),
						);
					},
				},
				environments: {
					findFirst: async (options: { where: unknown }) => {
						const q = dialect.sqlToQuery(
							options.where as Parameters<typeof dialect.sqlToQuery>[0],
						);
						return structuredClone(
							s().environments.find(
								(r) =>
									q.params.includes(r.id) &&
									(!q.sql.includes('"organization_id"') ||
										q.params.includes(r.organizationId)) &&
									(!q.sql.includes('"archived_at" is null') ||
										r.archivedAt === null),
							),
						);
					},
				},
				users: {
					findFirst: async () => ({
						id: user,
						name: "Fixture",
						image: null,
						email: "fixture@example.invalid",
					}),
				},
				members: {
					findMany: async () =>
						memberships.map((organizationId) => ({ organizationId })),
				},
				environmentRepositories: {
					findFirst: async (options: { where: unknown }) => {
						const q = dialect.sqlToQuery(
							options.where as Parameters<typeof dialect.sqlToQuery>[0],
						);
						return structuredClone(
							s().repositories.find((r) => q.params.includes(r.environmentId)),
						);
					},
				},
			},
			select: () => ({
				from: (table: unknown) => builder(s(), table, "select"),
			}),
			insert: (table: unknown) => builder(s(), table, "insert"),
			delete: (table: unknown) => builder(s(), table, "delete"),
			update: (table: unknown) => builder(s(), table, "update"),
			execute: async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
				const q = dialect.sqlToQuery(query);
				statements.push({ ...q, tx: inTx });
				const authorized = connected && connectionOrg === org;
				if (q.sql.startsWith("SELECT state FROM connections"))
					return authorized ? [{ state: config }] : [];
				if (q.sql.startsWith("SELECT id FROM environments")) {
					const row = s().environments.find((r) => r.id === q.params[0]);
					return row &&
						row.organizationId === org &&
						row.archivedAt === null &&
						(row.scope !== "personal" || row.createdByUserId === user) &&
						q.params.includes(row.sourceKind) &&
						q.params.includes(row.sourceRef) &&
						q.params.includes(row.scope) &&
						q.params.includes(row.createdByUserId)
						? [{ id: row.id }]
						: [];
				}
				if (q.sql.startsWith("SELECT id FROM cloud_workspaces")) {
					const row = s().workspaces.find((r) => r.id === q.params[0]);
					return row &&
						row.organizationId === org &&
						row.status === "ready" &&
						(row.visibility === "org" || row.createdByUserId === user)
						? [{ id: row.id }]
						: [];
				}
				if (q.sql.includes("INSERT INTO gitlab_cloud_projects"))
					return authorized && !failBinding ? [{ id: "project-row" }] : [];
				if (q.sql.includes("INSERT INTO gitlab_workspace_checkouts")) {
					if (!authorized || failBinding) return [];
					const id = q.params.find((v) =>
						s().workspaces.some((r) => r.id === v),
					) as string;
					if (!id) return [];
					s().checkouts.set(id, { ...project });
					return [{ cloud_workspace_id: id }];
				}
				if (q.sql.includes("INSERT INTO gitlab_environment_projects")) {
					if (!authorized || failBinding) return [];
					const id = q.params.find((v) =>
						s().environments.some((r) => r.id === v),
					) as string;
					if (!id) return [];
					s().bindings.set(id, { ...project });
					return [{ environment_id: id }];
				}
				if (q.sql.includes("DELETE FROM gitlab_environment_projects")) {
					s().bindings.delete(q.params[0] as string);
					return [];
				}
				if (
					q.sql.startsWith(
						"SELECT environment_id FROM gitlab_environment_projects",
					)
				)
					return s().bindings.has(q.params[0] as string)
						? [{ environment_id: q.params[0] }]
						: [];
				if (q.sql.includes("FROM gitlab_environment_projects"))
					return (connectionOrg === org ? [...s().bindings] : [])
						.filter(([id]) =>
							s().environments.some(
								(e) => e.id === id && e.organizationId === org,
							),
						)
						.map(([environment_id, p]) => ({
							environment_id,
							...bindingRow(p),
						}));
				if (q.sql.includes("FROM gitlab_workspace_checkouts"))
					return [...s().checkouts]
						.filter(([id]) =>
							s().workspaces.some(
								(w) =>
									w.id === id &&
									w.organizationId === org &&
									(w.visibility === "org" || w.createdByUserId === user),
							),
						)
						.map(([cloud_workspace_id, p]) => ({
							cloud_workspace_id,
							...bindingRow(p),
						}));
				throw new Error(`Unexpected fixture SQL: ${q.sql}`);
			},
			transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
				duringTransaction?.();
				const copy = snapshot(s());
				const result = await callback(database(() => copy, true));
				state = copy;
				committed++;
				return result;
			},
		};
	}
	mock.module("dotenv", () => ({ config: () => ({ parsed: {} }) }));
	mock.module("../../env", () => ({ env: {} }));
	const fakeDb = database(() => state);
	mock.module("@superset/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
	mock.module("../../lib/analytics", () => ({
		posthog: { capture() {}, isFeatureEnabled: async () => feature },
	}));
	mock.module("../../lib/sandbox/api-credential", () => ({
		SANDBOX_ALLOWED_PROCEDURES: new Set<string>(),
	}));
	const { readGitlabConfig } = await import("../../lib/gitlab/config");
	mock.module("../../lib/gitlab/connection", () => ({
		readGitlabConfig,
		gitlabConnectionForOrg: async () =>
			connected ? { id: connId, state: config } : null,
		gitlabCredentialsFor: async (
			_id: string,
			options: {
				organizationId: string;
				expected?: { host: string; projectPath: string };
			},
		) =>
			connected && options.organizationId === connectionOrg
				? {
						connectionId: connId,
						organizationId: connectionOrg,
						token: "FIXTURE_ONLY",
						config,
					}
				: null,
	}));
	const api = await import("../../lib/gitlab/api");
	mock.module("../../lib/gitlab/api", () => ({
		...api,
		gitlabApiFetch: async (origin: string, _token: string, path: string) => {
			providerCalls.push({ origin, path });
			duringProvider?.();
			return Response.json({
				id: 83,
				path_with_namespace: "Team/Sub/App",
				http_url_to_repo: clone,
				default_branch: "Release/Current",
			});
		},
	}));
	mock.module("../../lib/github-user", () => ({
		githubUserTokenFor: async () => {
			githubCalls++;
			return "GH_FIXTURE";
		},
		githubRepositoriesOutOfReach: async () => [],
	}));
	mock.module("../../lib/attachments", () => ({
		anchorAttachments: async () => {},
	}));
	mock.module("../../lib/realtime", () => ({
		nudge: () => external.push("nudge"),
	}));
	class RepositoryError extends Error {}
	mock.module("../../lib/sandbox", () => ({
		RepositoryError,
		loadRepositories: async (args: { repositoryIds: string[] }) =>
			args.repositoryIds.map(() => ghRepo),
		primaryRepository: (rows: unknown[]) => rows[0],
		sortRepositories: (rows: unknown[]) => rows,
		environmentRepositoryRows: async () => {
			githubCalls++;
			return [ghRepo];
		},
		recordWorkspaceRepositories: async (args: { cloudWorkspaceId: string }) => {
			state.repositories.push({ cloudWorkspaceId: args.cloudWorkspaceId });
		},
		workspaceBranchName: ({ id }: { id: string }) =>
			`superset/fixture-${id.slice(0, 8)}`,
		workspaceRepositories: async () => [{ repository: ghRepo, hooks: true }],
		buildSandboxClaim: async () => ({ claim: {} }),
		promoteSandboxToEnvironment: async () => {
			external.push("golden");
			duringGolden?.();
			return { region: "sfo1" };
		},
		deleteSandbox: async () => {
			external.push("cleanup");
		},
		describeSandbox: async () => ({}),
		HOST_SERVICE_PORT: 4879,
		listRemoteBranches: async () => ({
			defaultBranch: "github-trunk",
			items: [],
		}),
		mintSandboxGateAccess: async () => ({}),
		sandboxExists: async () => true,
		stopSandbox: async () => {},
		stopAndSnapshot: async () => {
			throw new Error("Unexpected sandbox stop in GitLab consumer fixture");
		},
		SandboxNotReadyError: class extends Error {},
		SandboxUnavailableError: class extends Error {},
	}));
	mock.module("./provision", () => ({
		FALLBACK_NAME: "Workspace",
		sandboxNameFor: (id: string) => `ws-${id}`,
		nextSandboxNameFor: () => "next",
		provisionCloudWorkspace: async () => {},
	}));
	mock.module("./jobs", () => ({
		publishCloudWorkspaceJob: async () => {
			expect(committed > 0 || state.checkouts.size === 0).toBe(true);
			external.push("queue");
		},
	}));
	mock.module("./activity", () => ({
		recordCloudWorkspaceActivity: async () => external.push("activity"),
	}));
	mock.module("./record", () => ({
		linkTask: async () => {},
		cloudWorkspaceRecordRouter: {},
	}));
	mock.module("./reap", () => ({ queueReap: async () => {} }));
	mock.module("./wake", () => ({
		markSandboxUnavailable: async () => {},
		restartCloudWorkspace: async () => {},
		wakeCloudWorkspace: async () => {},
	}));
	mock.module("./transition", () => ({
		transitionCloudWorkspace: async () => {},
	}));
	mock.module("../automation/relay-client", () => ({
		hostServiceMutation: async () => {},
	}));
	mock.module("../environment/secrets", () => ({ secretsRouter: {} }));
	mock.module("../environment/secrets/utils/crypto", () => ({
		encryptSecret: (v: string) => v,
		decryptSecret: (v: string) => v,
	}));
	const { createTRPCRouter } = await import("../../trpc");
	const { startCloudWorkspace } = await import("./start");
	const { cloudWorkspaceRouter } = await import("./cloud-workspace");
	const { environmentRouter } = await import("../environment/environment");
	const router = createTRPCRouter({
		cloudWorkspace: createTRPCRouter(cloudWorkspaceRouter),
		environment: createTRPCRouter(environmentRouter),
	});
	function caller(authenticated = true) {
		return router.createCaller({
			headers: new Headers(
				authenticated ? { authorization: "Bearer FIXTURE_JWT" } : {},
			),
			session: null,
			auth: {
				api: {
					verifyJWT: async () => ({
						payload: { sub: user, organizationIds: memberships },
					}),
				},
			},
			client: null,
			agentCaller: null,
			sandboxCaller: null,
		} as unknown as Parameters<typeof router.createCaller>[0]);
	}
	beforeEach(() => {
		state = {
			environments: [environment()],
			workspaces: [],
			bindings: new Map(),
			checkouts: new Map(),
			repositories: [{ environmentId: envId, repositoryId: repoId }],
		};
		config = {
			provider: "gitlab",
			host,
			groupPath: "Team",
			scopeKind: "group",
			auth: "token",
			webhookSecret: "FIXTURE_HOOK",
		};
		connected = true;
		connectionOrg = org;
		feature = true;
		memberships = [org];
		githubCalls = 0;
		providerCalls = [];
		external = [];
		statements = [];
		duringProvider = undefined;
		duringTransaction = undefined;
		failBinding = false;
		committed = 0;
		duringGolden = undefined;
	});
	function clearGithubEnvironment() {
		state.repositories = [];
		environmentRow().hooksRepositoryId = null;
	}
	const start = (extra = {}) =>
		startCloudWorkspace({
			organizationId: org,
			userId: user,
			environmentId: envId,
			...extra,
		});
	test("bound GitLab startup uses current provider default and atomically records checkout before queue", async () => {
		clearGithubEnvironment();
		state.bindings.set(envId, { ...project, defaultBranch: "old-default" });
		const row = await start();
		expect(row.baseBranch).toBe("Release/Current");
		expect(row.branch).toStartWith("superset/");
		expect(state.checkouts.get(row.id)).toEqual(project);
		expect(githubCalls).toBe(0);
		expect(committed).toBe(1);
		expect(providerCalls).toEqual([
			{ origin: `https://${host}`, path: "/projects/Team%2FSub%2FApp" },
		]);
		expect(external).toEqual(["activity", "nudge", "queue"]);
	});
	test("optional clone override and supplied current MR branch reach actual creation caller", async () => {
		clearGithubEnvironment();
		const row = await caller().cloudWorkspace.create({
			organizationId: org,
			environmentId: envId,
			gitlabCloneUrl: clone,
			branch: "Feature/MR-current",
		});
		expect(row.baseBranch).toBe("Feature/MR-current");
		expect(state.checkouts.has(row.id)).toBe(true);
		expect(githubCalls).toBe(0);
	});
	for (const bound of [false, true]) {
		for (const githubState of ["link", "hook"] as const) {
			test(`GitLab ${bound ? "bound" : "override"} caller refuses GitHub ${githubState} before lookup or writes`, async () => {
				clearGithubEnvironment();
				if (bound) state.bindings.set(envId, project);
				if (githubState === "link")
					state.repositories.push({
						environmentId: envId,
						repositoryId: repoId,
					});
				else environmentRow().hooksRepositoryId = repoId;
				await expect(
					caller().cloudWorkspace.create({
						organizationId: org,
						environmentId: envId,
						...(bound ? {} : { gitlabCloneUrl: clone }),
					}),
				).rejects.toMatchObject({ code: "BAD_REQUEST" });
				expect(providerCalls).toHaveLength(0);
				expect(githubCalls).toBe(0);
				expect(state.workspaces).toHaveLength(0);
				expect(state.checkouts.size).toBe(0);
				expect(committed).toBe(0);
				expect(external).toEqual([]);
			});
		}
	}
	for (const phase of ["provider", "transaction"] as const) {
		for (const githubState of ["link", "hook"] as const) {
			test(`GitLab caller refuses GitHub ${githubState} added at ${phase} boundary without writes`, async () => {
				clearGithubEnvironment();
				state.bindings.set(envId, project);
				const mutate = () => {
					if (githubState === "link")
						state.repositories.push({
							environmentId: envId,
							repositoryId: repoId,
						});
					else environmentRow().hooksRepositoryId = repoId;
				};
				if (phase === "provider") duringProvider = mutate;
				else duringTransaction = mutate;
				await expect(
					caller().cloudWorkspace.create({
						organizationId: org,
						environmentId: envId,
					}),
				).rejects.toMatchObject({ code: "BAD_REQUEST" });
				expect(providerCalls).toHaveLength(1);
				expect(githubCalls).toBe(0);
				expect(
					statements.some((q) => q.tx && q.sql.includes("FOR UPDATE")),
				).toBe(true);
				expect(state.workspaces).toHaveLength(0);
				expect(state.checkouts.size).toBe(0);
				expect(committed).toBe(0);
				expect(external).toEqual([]);
			});
		}
	}
	test("GitHub absence defaults and output contract remain unchanged", async () => {
		const row = await caller().cloudWorkspace.create({
			organizationId: org,
			environmentId: envId,
		});
		expect(row.baseBranch).toBe("github-trunk");
		expect(githubCalls).toBe(2);
		expect(committed).toBe(0);
		expect(state.checkouts.size).toBe(0);
		expect(row.createdBy).toEqual({
			userId: user,
			name: "Fixture",
			image: null,
		});
		expect(row.presence).toEqual([]);
	});
	test("foreign and unauthenticated caller fail before GitLab lookup", async () => {
		await expect(
			caller(false).cloudWorkspace.create({
				organizationId: org,
				environmentId: envId,
				gitlabCloneUrl: clone,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		memberships = [foreign];
		await expect(
			caller().cloudWorkspace.create({
				organizationId: org,
				environmentId: envId,
				gitlabCloneUrl: clone,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(providerCalls).toHaveLength(0);
	});
	test("invalid GitLab host, scope or disconnected grant never falls back to GitHub", async () => {
		clearGithubEnvironment();
		for (const change of [
			() => {
				config.host = "foreign.invalid";
			},
			() => {
				config.groupPath = "Other";
			},
			() => {
				connected = false;
			},
		]) {
			change();
			await expect(start({ gitlabCloneUrl: clone })).rejects.toThrow();
			expect(state.workspaces).toHaveLength(0);
			expect(githubCalls).toBe(0);
		}
	});
	test("current parent archived, cross-tenant, personal owner or binding race rolls back creation", async () => {
		clearGithubEnvironment();
		state.bindings.set(envId, project);
		for (const mutate of [
			() => {
				environmentRow().archivedAt = new Date();
			},
			() => {
				environmentRow().organizationId = foreign;
			},
			() => {
				environmentRow().scope = "personal";
				environmentRow().createdByUserId = foreign;
			},
			() => {
				state.bindings.set(envId, { ...project, projectId: "84" });
			},
		]) {
			state.environments = [environment()];
			clearGithubEnvironment();
			state.bindings.set(envId, project);
			duringProvider = mutate;
			await expect(start()).rejects.toThrow();
			expect(state.workspaces).toHaveLength(0);
			expect(state.checkouts.size).toBe(0);
			expect(external).toHaveLength(0);
		}
	});
	test("binding record failure rolls back workspace and does not publish", async () => {
		clearGithubEnvironment();
		failBinding = true;
		await expect(start({ gitlabCloneUrl: clone })).rejects.toThrow();
		expect(state.workspaces).toHaveLength(0);
		expect(state.checkouts.size).toBe(0);
		expect(committed).toBe(0);
		expect(external).toHaveLength(0);
	});
	test("fork environment refuses a different clone override", async () => {
		clearGithubEnvironment();
		environmentRow().sourceKind = "fork";
		state.bindings.set(envId, project);
		await expect(
			start({ gitlabCloneUrl: `https://${host}/Team/Other.git` }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(providerCalls).toHaveLength(0);
	});
	test("environment GitLab create/list/get retain additive binding and empty Github repositories", async () => {
		const row = await caller().environment.create({
			organizationId: org,
			name: "GL",
			gitlabCloneUrl: clone,
		});
		expect(state.bindings.get(row.id)).toEqual(project);
		const got = await caller().environment.get({ id: row.id });
		expect(got.gitlabProject).toEqual(project);
		expect(got.repositories).toEqual([]);
		const rows = await caller().environment.list({ organizationId: org });
		expect(rows.find((r) => r.id === row.id)?.gitlabProject).toEqual(project);
	});
	test("environment refuses a mixed provider request without a row", async () => {
		await expect(
			caller().environment.create({
				organizationId: org,
				name: "mixed",
				repositoryIds: [repoId],
				gitlabCloneUrl: clone,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(state.environments).toHaveLength(1);
		expect(providerCalls).toHaveLength(0);
	});
	test("environment update atomically switches GitHub to GitLab then back", async () => {
		await caller().environment.update({ id: envId, gitlabCloneUrl: clone });
		expect(state.bindings.get(envId)).toEqual(project);
		expect(state.repositories).toEqual([]);
		expect(state.environments[0]?.hooksRepositoryId).toBeNull();
		await caller().environment.update({
			id: envId,
			repositoryIds: [repoId],
			hooksRepositoryId: repoId,
		});
		expect(state.bindings.size).toBe(0);
		expect(state.repositories).toEqual([
			{ environmentId: envId, repositoryId: repoId },
		]);
	});
	test("environment failed switch preserves GitHub rows and binding state", async () => {
		failBinding = true;
		await expect(
			caller().environment.update({ id: envId, gitlabCloneUrl: clone }),
		).rejects.toThrow();
		expect(state.repositories).toEqual([
			{ environmentId: envId, repositoryId: repoId },
		]);
		expect(state.bindings.size).toBe(0);
	});
	test("repositories append visible GitLab metadata and retain Github values", async () => {
		state.workspaces.push({
			id: envId,
			organizationId: org,
			visibility: "org",
			createdByUserId: user,
		});
		state.checkouts.set(envId, project);
		const rows = await caller().cloudWorkspace.repositories({
			organizationId: org,
		});
		expect(rows).toEqual([
			{
				cloudWorkspaceId: envId,
				repositoryId: envId,
				fullName: "Team/Sub/App",
				path: ".",
				primary: true,
			},
		]);
	});
	test("legacy GitHub environment create/update and explicit empty GitLab aliases remain compatible", async () => {
		const gh = await caller().environment.create({
			organizationId: org,
			name: "GH",
			repositoryIds: [repoId],
			hooksRepositoryId: repoId,
		});
		expect(gh.scope).toBe("organization");
		expect(committed).toBe(0);
		await caller().environment.update({
			id: gh.id,
			name: "rename",
			repositoryIds: [repoId],
		});
		expect(committed).toBe(0);
		await caller().environment.update({
			id: envId,
			gitlabCloneUrl: clone,
			repositoryIds: [],
			hooksRepositoryId: null,
		});
		expect(state.bindings.get(envId)).toEqual(project);
	});
	test("same-path bound project ID replacement and grant revocation during lookup reject atomically", async () => {
		clearGithubEnvironment();
		state.bindings.set(envId, { ...project, projectId: "84" });
		await expect(start()).rejects.toMatchObject({ code: "CONFLICT" });
		expect(state.workspaces).toHaveLength(0);
		state.bindings.set(envId, project);
		duringProvider = () => {
			connected = false;
		};
		await expect(start()).rejects.toThrow();
		expect(state.workspaces).toHaveLength(0);
		expect(external).toHaveLength(0);
	});
	test("GitLab promote preview and new golden retain checkout binding without empty GitHub insert", async () => {
		clearGithubEnvironment();
		state.bindings.set(envId, project);
		const row = await start();
		workspaceRow().status = "ready";
		const preview = await caller().environment.promotePreview({
			cloudWorkspaceId: row.id,
		});
		expect(preview.gitlabProject).toEqual(project);
		expect(preview.repositories).toEqual([]);
		const saved = await caller().environment.promote({
			cloudWorkspaceId: row.id,
			name: "GL golden",
		});
		expect(saved.sourceKind).toBe("fork");
		expect(state.bindings.get(saved.id)).toEqual(project);
		expect(saved.hooksRepositoryId).toBeNull();
	});
	test("GitLab promote current workspace visibility race cleans unused golden without binding", async () => {
		clearGithubEnvironment();
		state.bindings.set(envId, project);
		const row = await start();
		workspaceRow().status = "ready";
		external = [];
		duringGolden = () => {
			workspaceRow().visibility = "private";
			workspaceRow().createdByUserId = foreign;
		};
		await expect(
			caller().environment.promote({
				cloudWorkspaceId: row.id,
				name: "GL golden",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(state.environments).toHaveLength(1);
		expect(external).toEqual(["golden", "cleanup"]);
	});
	test("environment provider update rejects archive and scope races without changing repositories", async () => {
		duringProvider = () => {
			environmentRow().archivedAt = new Date();
		};
		await expect(
			caller().environment.update({ id: envId, gitlabCloneUrl: clone }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(state.bindings.size).toBe(0);
		expect(state.repositories).toEqual([
			{ environmentId: envId, repositoryId: repoId },
		]);
	});

	test("GitHub promote into a GitLab target rejects tenant transfer before provider switch", async () => {
		const row = await start();
		workspaceRow().status = "ready";
		state.bindings.set(envId, project);
		external = [];
		duringGolden = () => {
			environmentRow().organizationId = foreign;
		};
		await expect(
			caller().environment.promote({
				cloudWorkspaceId: row.id,
				environmentId: envId,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(state.bindings.get(envId)).toEqual(project);
		expect(external).toEqual(["golden", "cleanup"]);
	});
	test("a hidden foreign-grant binding cannot turn a GitLab environment into a GitHub start", async () => {
		state.bindings.set(envId, project);
		connectionOrg = foreign;
		await expect(start()).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(githubCalls).toBe(0);
		expect(state.workspaces).toHaveLength(0);
	});
	test("explicit same-clone fork start cannot replace the frozen project identity", async () => {
		clearGithubEnvironment();
		environmentRow().sourceKind = "fork";
		state.bindings.set(envId, { ...project, projectId: "84" });
		await expect(start({ gitlabCloneUrl: clone })).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(state.workspaces).toHaveLength(0);
	});
	test("legacy empty GitHub inputs keep Zod array errors rather than the new provider-choice error", async () => {
		await expect(
			caller().environment.create({
				organizationId: org,
				name: "empty",
				repositoryIds: [],
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			cause: { issues: [{ origin: "array", code: "too_small", minimum: 1 }] },
		});
		await expect(
			caller().environment.update({ id: envId, repositoryIds: [] }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			cause: { issues: [{ origin: "array", code: "too_small", minimum: 1 }] },
		});
	});
	test("REVIEW: hidden invalid-tenant GitLab target refuses a GitHub repository update", async () => {
		state.bindings.set(envId, project);
		connectionOrg = foreign;
		await expect(
			caller().environment.update({
				id: envId,
				repositoryIds: [repoId],
				hooksRepositoryId: repoId,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(state.bindings.get(envId)).toEqual(project);
		expect(committed).toBe(0);
	});
	test("REVIEW: GitHub promotion into hidden GitLab target refuses provider fallback", async () => {
		const row = await start();
		workspaceRow().status = "ready";
		state.bindings.set(envId, project);
		connectionOrg = foreign;
		external = [];
		await expect(
			caller().environment.promote({
				cloudWorkspaceId: row.id,
				environmentId: envId,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(state.bindings.get(envId)).toEqual(project);
	});
	test("REVIEW: source ref changes during provider lookup refuse actual startup", async () => {
		clearGithubEnvironment();
		state.bindings.set(envId, project);
		duringProvider = () => {
			environmentRow().sourceRef = "changed:image";
		};
		await expect(start()).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(state.workspaces).toHaveLength(0);
		expect(external).toEqual([]);
	});
	test("REVIEW: target binding changes during GitLab golden build refuse promotion and clean golden", async () => {
		clearGithubEnvironment();
		state.bindings.set(envId, project);
		const row = await start();
		workspaceRow().status = "ready";
		external = [];
		duringGolden = () => {
			state.bindings.set(envId, { ...project, projectId: "84" });
		};
		await expect(
			caller().environment.promote({
				cloudWorkspaceId: row.id,
				environmentId: envId,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(state.bindings.get(envId)?.projectId).toBe("84");
		expect(external).toEqual(["golden", "cleanup"]);
	});

	test("REVIEW: hidden GitLab target transferred during golden build is not updated across tenant", async () => {
		const row = await start();
		workspaceRow().status = "ready";
		state.bindings.set(envId, project);
		connectionOrg = foreign;
		external = [];
		duringGolden = () => {
			environmentRow().organizationId = foreign;
		};
		await expect(
			caller().environment.promote({
				cloudWorkspaceId: row.id,
				environmentId: envId,
			}),
		).rejects.toThrow();
		expect(environmentRow().sourceKind).toBe("image");
		expect(external).toEqual(
			external.includes("golden") ? ["golden", "cleanup"] : [],
		);
	});

	test("a hidden binding introduced during a GitHub golden build rolls back the tentative target update", async () => {
		const row = await start();
		workspaceRow().status = "ready";
		external = [];
		duringGolden = () => {
			state.bindings.set(envId, project);
			connectionOrg = foreign;
			environmentRow().organizationId = foreign;
		};
		await expect(
			caller().environment.promote({
				cloudWorkspaceId: row.id,
				environmentId: envId,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(environmentRow().sourceKind).toBe("image");
		expect(environmentRow().sourceRef).toBe("fixture:image");
		expect(state.bindings.get(envId)).toEqual(project);
		expect(committed).toBe(0);
		expect(external).toEqual(["golden", "cleanup"]);
	});
}
