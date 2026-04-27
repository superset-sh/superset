import { describe, expect, test } from "bun:test";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import type { electronTrpcClient } from "renderer/lib/trpc-client";
import type { OrgCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { migrateV1DataToV2 } from "./migrate";

type ElectronTrpcClient = typeof electronTrpcClient;

interface V1ProjectRow {
	id: string;
	name: string;
	mainRepoPath: string;
	tabOrder: number | null;
	defaultApp: string | null;
}

interface V1WorkspaceRow {
	id: string;
	projectId: string;
	worktreeId: string | null;
	type: "branch" | "worktree";
	branch: string;
	name: string;
	sectionId: string | null;
	tabOrder: number;
}

interface V1WorktreeRow {
	id: string;
	path: string;
	baseBranch?: string | null;
}

interface V1SectionRow {
	id: string;
	projectId: string;
	name: string;
	tabOrder: number;
	isCollapsed: boolean | null;
	color: string | null;
}

interface StateRow {
	v1Id: string;
	v2Id: string | null;
	organizationId: string;
	kind: "project" | "workspace";
	status: "success" | "linked" | "error" | "skipped";
	reason: string | null;
}

type PathResponse =
	| { candidates: Array<{ id: string }> }
	| { err: "path-missing" };

interface FakeEnv {
	v1Projects: V1ProjectRow[];
	v1Workspaces: V1WorkspaceRow[];
	v1Worktrees: V1WorktreeRow[];
	v1Sections: V1SectionRow[];
	state: Map<string, StateRow>;
	otherOrg: string | null;
	findByPath: Map<string, PathResponse>;
	failNextStateWriteFor: Set<string>;
	hostProjectsByPath: Map<string, string>;
	hostWorkspacesByKey: Map<string, string>;
	setupThrowsFor: Set<string>;
	createThrowsFor: Set<string>;
	adoptThrowsFor: Map<string, { code: string; message?: string }>;
	adoptThrowsForPath: Map<string, { code: string; message?: string }>;
	createCalls: Array<{ name: string; repoPath: string }>;
	createdProjectIds: string[];
	setupCalls: Array<{ projectId: string; repoPath?: string }>;
	adoptCalls: Array<{
		projectId: string;
		branch: string;
		worktreePath?: string;
		baseBranch?: string;
		existingWorkspaceId?: string;
	}>;
	createdWorkspaceIds: string[];
}

function makeFakeEnv(overrides: Partial<FakeEnv> = {}): FakeEnv {
	return {
		v1Projects: [],
		v1Workspaces: [],
		v1Worktrees: [],
		v1Sections: [],
		state: new Map(),
		otherOrg: null,
		findByPath: new Map(),
		failNextStateWriteFor: new Set(),
		hostProjectsByPath: new Map(),
		hostWorkspacesByKey: new Map(),
		setupThrowsFor: new Set(),
		createThrowsFor: new Set(),
		adoptThrowsFor: new Map(),
		adoptThrowsForPath: new Map(),
		createCalls: [],
		createdProjectIds: [],
		setupCalls: [],
		adoptCalls: [],
		createdWorkspaceIds: [],
		...overrides,
	};
}

function trpcErr(code: string, message = code) {
	return Object.assign(new Error(message), { data: { code } });
}

function makeElectronTrpc(env: FakeEnv): ElectronTrpcClient {
	const createdV2s: string[] = [];
	const hostProjects = new Set<string>();
	const hostWorkspaces = new Set<string>();
	void createdV2s;
	void hostProjects;
	void hostWorkspaces;

	const stub = {
		migration: {
			readV1Projects: { query: async () => env.v1Projects },
			readV1Workspaces: { query: async () => env.v1Workspaces },
			readV1Worktrees: { query: async () => env.v1Worktrees },
			readV1WorkspaceSections: { query: async () => env.v1Sections },
			listState: {
				query: async ({ organizationId }: { organizationId: string }) =>
					Array.from(env.state.values()).filter(
						(r) => r.organizationId === organizationId,
					),
			},
			findMigrationByOtherOrg: {
				query: async (_: { organizationId: string }) => env.otherOrg,
			},
			upsertState: {
				mutate: async (row: Omit<StateRow, "migratedAt">) => {
					const key = `${row.kind}:${row.v1Id}`;
					if (env.failNextStateWriteFor.delete(key)) {
						throw new Error(`failed to write migration state for ${key}`);
					}
					env.state.set(key, {
						v1Id: row.v1Id,
						v2Id: row.v2Id,
						organizationId: row.organizationId,
						kind: row.kind,
						status: row.status,
						reason: row.reason ?? null,
					});
				},
			},
		},
	};
	return stub as unknown as ElectronTrpcClient;
}

function makeHostService(env: FakeEnv): HostServiceClient {
	const idCounter = { n: 0 };
	const nextId = (prefix: string) => `${prefix}-${++idCounter.n}`;

	const stub = {
		project: {
			findByPath: {
				query: async ({ repoPath }: { repoPath: string }) => {
					const result = env.findByPath.get(repoPath);
					if (result) {
						if ("err" in result) {
							throw new Error(`path not a git repo: ${repoPath}`);
						}
						return result;
					}
					const existingId = env.hostProjectsByPath.get(repoPath);
					if (existingId) return { candidates: [{ id: existingId }] };
					return { candidates: [] };
				},
			},
			setup: {
				mutate: async ({
					projectId,
					mode,
				}: {
					projectId: string;
					mode: { repoPath: string; allowRelocate?: boolean };
				}) => {
					env.setupCalls.push({ projectId, repoPath: mode.repoPath });
					if (env.setupThrowsFor.has(projectId)) {
						throw trpcErr("CONFLICT", "already set up elsewhere");
					}
					env.hostProjectsByPath.set(mode.repoPath, projectId);
					return { repoPath: "/fake" };
				},
			},
			create: {
				mutate: async ({
					name,
					mode,
				}: {
					name: string;
					mode: { repoPath: string };
				}) => {
					if (env.createThrowsFor.has(name)) {
						throw new Error(`cloud create failed for ${name}`);
					}
					env.createCalls.push({ name, repoPath: mode.repoPath });
					const projectId = nextId("v2-proj");
					env.createdProjectIds.push(projectId);
					env.hostProjectsByPath.set(mode.repoPath, projectId);
					return { projectId, repoPath: mode.repoPath };
				},
			},
		},
		workspace: {
			get: {
				query: async ({ id }: { id: string }) => {
					if (![...env.hostWorkspacesByKey.values()].includes(id)) {
						throw trpcErr("NOT_FOUND", "Workspace not found");
					}
					return { id };
				},
			},
		},
		workspaceCreation: {
			adopt: {
				mutate: async ({
					projectId,
					branch,
					worktreePath,
					baseBranch,
					existingWorkspaceId,
				}: {
					projectId: string;
					branch: string;
					worktreePath?: string;
					baseBranch?: string;
					existingWorkspaceId?: string;
				}) => {
					const call = {
						projectId,
						branch,
						worktreePath,
						baseBranch,
					} as (typeof env.adoptCalls)[number];
					if (existingWorkspaceId)
						call.existingWorkspaceId = existingWorkspaceId;
					env.adoptCalls.push(call);
					const pathBehavior = worktreePath
						? env.adoptThrowsForPath.get(worktreePath)
						: undefined;
					if (pathBehavior)
						throw trpcErr(pathBehavior.code, pathBehavior.message);
					const behavior = env.adoptThrowsFor.get(branch);
					if (behavior) throw trpcErr(behavior.code, behavior.message);
					const key = `${projectId}:${worktreePath ?? branch}`;
					const existingId = env.hostWorkspacesByKey.get(key);
					if (existingId) {
						return {
							workspace: { id: existingId, branch },
							terminals: [],
							warnings: [],
						};
					}
					if (existingWorkspaceId) {
						env.hostWorkspacesByKey.set(key, existingWorkspaceId);
						return {
							workspace: { id: existingWorkspaceId, branch },
							terminals: [],
							warnings: [],
						};
					}
					const workspaceId = nextId("v2-ws");
					env.createdWorkspaceIds.push(workspaceId);
					env.hostWorkspacesByKey.set(key, workspaceId);
					return {
						workspace: { id: workspaceId, branch },
						terminals: [],
						warnings: [],
					};
				},
			},
		},
	};
	return stub as unknown as HostServiceClient;
}

function makeCollections(): OrgCollections {
	const make = <T extends Record<string, unknown>>(keyOf: (v: T) => string) => {
		const store = new Map<string, T>();
		return {
			get: (k: string) => store.get(k),
			insert: (v: T) => {
				store.set(keyOf(v), v);
			},
		};
	};
	return {
		// Only the 3 collections migrate.ts + writeSidebarState touch matter.
		v2SidebarProjects: make((v: { projectId: string }) => v.projectId),
		v2SidebarSections: make((v: { sectionId: string }) => v.sectionId),
		v2WorkspaceLocalState: make((v: { workspaceId: string }) => v.workspaceId),
	} as unknown as OrgCollections;
}

const ORG = "org-1";

function project(
	id: string,
	overrides: Partial<V1ProjectRow> = {},
): V1ProjectRow {
	return {
		id,
		name: `project-${id}`,
		mainRepoPath: `/repos/${id}`,
		tabOrder: 0,
		defaultApp: null,
		...overrides,
	};
}

function workspace(
	id: string,
	projectId: string,
	overrides: Partial<V1WorkspaceRow> = {},
): V1WorkspaceRow {
	return {
		id,
		projectId,
		worktreeId: null,
		type: "branch",
		branch: `branch-${id}`,
		name: `workspace-${id}`,
		sectionId: null,
		tabOrder: 0,
		...overrides,
	};
}

describe("migrateV1DataToV2", () => {
	test("happy path: creates projects and adopts workspaces", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1"), project("p2")],
			v1Workspaces: [
				workspace("w1", "p1", { worktreeId: "wt1", type: "worktree" }),
				workspace("w2", "p2", { worktreeId: "wt2", type: "worktree" }),
			],
			v1Worktrees: [
				{ id: "wt1", path: "/worktrees/w1" },
				{ id: "wt2", path: "/worktrees/w2" },
			],
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.projectsCreated).toBe(2);
		expect(summary.projectsLinked).toBe(0);
		expect(summary.workspacesCreated).toBe(2);
		expect(summary.workspacesSkipped).toBe(0);
		expect(summary.errors).toHaveLength(0);
		expect(env.state.size).toBe(4);
	});

	test("findByPath hit links to existing v2 project", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [],
			findByPath: new Map([
				["/repos/p1", { candidates: [{ id: "v2-existing" }] }],
			]),
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.projectsLinked).toBe(1);
		expect(summary.projectsCreated).toBe(0);
		expect(env.state.get("project:p1")?.v2Id).toBe("v2-existing");
		expect(env.state.get("project:p1")?.status).toBe("linked");
	});

	test("CONFLICT on setup after link records an error", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			findByPath: new Map([
				["/repos/p1", { candidates: [{ id: "v2-existing" }] }],
			]),
			setupThrowsFor: new Set(["v2-existing"]),
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.projectsLinked).toBe(0);
		expect(summary.projectsErrored).toBe(1);
		expect(summary.errors).toHaveLength(1);
		expect(env.state.get("project:p1")?.status).toBe("error");
	});

	test("project create failure records error and skips its workspaces", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p-bad"), project("p-good")],
			v1Workspaces: [
				workspace("w1", "p-bad", { worktreeId: "wt1", type: "worktree" }),
				workspace("w2", "p-good", { worktreeId: "wt2", type: "worktree" }),
			],
			v1Worktrees: [
				{ id: "wt1", path: "/a" },
				{ id: "wt2", path: "/b" },
			],
			createThrowsFor: new Set(["project-p-bad"]),
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.projectsErrored).toBe(1);
		expect(summary.projectsCreated).toBe(1);
		expect(summary.workspacesCreated).toBe(1); // w2 only
		expect(summary.workspacesSkipped).toBe(1); // w1 skipped (parent error)
		expect(env.state.get("workspace:w1")?.reason).toBe(
			"parent_project_unresolved",
		);
	});

	test("orphan workspace (missing worktree row) is skipped", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w-orphan", "p1", {
					type: "worktree",
					worktreeId: "missing",
				}),
			],
			v1Worktrees: [],
			adoptThrowsFor: new Map([["branch-w-orphan", { code: "NOT_FOUND" }]]),
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.workspacesSkipped).toBe(1);
		expect(summary.workspacesCreated).toBe(0);
		expect(env.state.get("workspace:w-orphan")?.reason).toBe(
			"worktree_not_registered",
		);
	});

	test("missing v1 worktree row falls back to branch adoption", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w1", "p1", {
					type: "worktree",
					worktreeId: "missing",
				}),
			],
			v1Worktrees: [],
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.workspacesCreated).toBe(1);
		expect(summary.workspacesSkipped).toBe(0);
		expect(env.adoptCalls).toContainEqual({
			projectId: "v2-proj-1",
			branch: "branch-w1",
			worktreePath: undefined,
			baseBranch: undefined,
		});
		expect(env.state.get("workspace:w1")?.status).toBe("success");
	});

	test("adopt NOT_FOUND is skipped, not errored", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w1", "p1", {
					branch: "gone",
					worktreeId: "wt1",
					type: "worktree",
				}),
			],
			v1Worktrees: [{ id: "wt1", path: "/gone" }],
			adoptThrowsFor: new Map([["gone", { code: "NOT_FOUND" }]]),
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.workspacesSkipped).toBe(1);
		expect(summary.workspacesErrored).toBe(0);
		expect(env.state.get("workspace:w1")?.reason).toBe(
			"worktree_not_registered",
		);
	});

	test("stale v1 worktree path falls back to branch adoption", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w1", "p1", {
					worktreeId: "wt1",
					type: "worktree",
				}),
			],
			v1Worktrees: [{ id: "wt1", path: "/stale-worktree" }],
			adoptThrowsForPath: new Map([["/stale-worktree", { code: "NOT_FOUND" }]]),
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.workspacesCreated).toBe(1);
		expect(summary.workspacesSkipped).toBe(0);
		expect(env.adoptCalls).toEqual([
			{
				projectId: "v2-proj-1",
				branch: "branch-w1",
				worktreePath: "/stale-worktree",
				baseBranch: undefined,
			},
			{
				projectId: "v2-proj-1",
				branch: "branch-w1",
				worktreePath: undefined,
				baseBranch: undefined,
			},
		]);
		expect(env.state.get("workspace:w1")?.status).toBe("success");
	});

	test("adopt non-NOT_FOUND error is recorded as error", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w1", "p1", {
					branch: "boom",
					worktreeId: "wt1",
					type: "worktree",
				}),
			],
			v1Worktrees: [{ id: "wt1", path: "/x" }],
			adoptThrowsFor: new Map([
				["boom", { code: "INTERNAL_SERVER_ERROR", message: "cloud down" }],
			]),
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.workspacesErrored).toBe(1);
		expect(summary.errors).toHaveLength(1);
		expect(env.state.get("workspace:w1")?.status).toBe("error");
	});

	test("other-org guard rejects migration", async () => {
		const env = makeFakeEnv({
			otherOrg: "some-other-org",
			v1Projects: [project("p1")],
		});

		await expect(
			migrateV1DataToV2({
				organizationId: ORG,
				electronTrpc: makeElectronTrpc(env),
				hostService: makeHostService(env),
				collections: makeCollections(),
			}),
		).rejects.toThrow(/already been migrated/);
	});

	test("rerun skips rows already in success/linked state, retries error rows and skipped workspaces", async () => {
		// Pre-populate state as if a prior run completed p1 but errored on p2.
		const prior = new Map<string, StateRow>([
			[
				"project:p1",
				{
					v1Id: "p1",
					v2Id: "v2-p1",
					organizationId: ORG,
					kind: "project",
					status: "success",
					reason: null,
				},
			],
			[
				"project:p2",
				{
					v1Id: "p2",
					v2Id: null,
					organizationId: ORG,
					kind: "project",
					status: "error",
					reason: "prior failure",
				},
			],
			[
				"workspace:w2",
				{
					v1Id: "w2",
					v2Id: null,
					organizationId: ORG,
					kind: "workspace",
					status: "skipped",
					reason: "parent_project_unresolved",
				},
			],
		]);
		const env = makeFakeEnv({
			v1Projects: [project("p1"), project("p2")],
			v1Workspaces: [
				workspace("w2", "p2", { worktreeId: "wt2", type: "worktree" }),
			],
			v1Worktrees: [{ id: "wt2", path: "/worktrees/w2" }],
			state: prior,
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		// p1 was success → skipped. p2 was error → retried and succeeded this run.
		expect(summary.projectsCreated).toBe(1);
		expect(summary.workspacesCreated).toBe(1);
		expect(env.state.get("project:p2")?.status).toBe("success");
		expect(env.state.get("workspace:w2")?.status).toBe("success");
		expect(env.state.get("project:p1")?.status).toBe("success"); // unchanged
		expect(env.setupCalls).toContainEqual({
			projectId: "v2-p1",
			repoPath: "/repos/p1",
		});
	});

	test("idempotent rerun reports already synced rows without counting them as changes", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w1", "p1", { worktreeId: "wt1", type: "worktree" }),
			],
			v1Worktrees: [{ id: "wt1", path: "/worktrees/w1" }],
			hostWorkspacesByKey: new Map([["v2-p1:/worktrees/w1", "v2-w1"]]),
			state: new Map([
				[
					"project:p1",
					{
						v1Id: "p1",
						v2Id: "v2-p1",
						organizationId: ORG,
						kind: "project",
						status: "success",
						reason: null,
					},
				],
				[
					"workspace:w1",
					{
						v1Id: "w1",
						v2Id: "v2-w1",
						organizationId: ORG,
						kind: "workspace",
						status: "success",
						reason: null,
					},
				],
			]),
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.projectsCreated).toBe(0);
		expect(summary.projectsLinked).toBe(0);
		expect(summary.workspacesCreated).toBe(0);
		expect(summary.workspacesSkipped).toBe(0);
		expect(summary.projects).toEqual([
			{ name: "project-p1", status: "synced", reason: "Already imported" },
		]);
		expect(summary.workspaces).toEqual([
			{
				name: "workspace-w1",
				branch: "branch-w1",
				status: "synced",
				reason: "Already imported",
			},
		]);
		expect(env.adoptCalls).toHaveLength(0);
	});

	test("project state write failure does not migrate child workspaces until rerun reconciles the project", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w1", "p1", { worktreeId: "wt1", type: "worktree" }),
			],
			v1Worktrees: [{ id: "wt1", path: "/worktrees/w1" }],
			failNextStateWriteFor: new Set(["project:p1"]),
		});
		const electronTrpc = makeElectronTrpc(env);
		const hostService = makeHostService(env);

		const first = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc,
			hostService,
			collections: makeCollections(),
		});

		expect(first.projectsErrored).toBe(1);
		expect(first.workspacesSkipped).toBe(1);
		expect(env.createCalls).toHaveLength(1);
		expect(env.createdProjectIds).toEqual(["v2-proj-1"]);
		expect(env.adoptCalls).toHaveLength(0);
		expect(env.state.get("project:p1")?.status).toBe("error");
		expect(env.state.get("workspace:w1")?.reason).toBe(
			"parent_project_unresolved",
		);

		const second = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc,
			hostService,
			collections: makeCollections(),
		});

		expect(second.projectsLinked).toBe(1);
		expect(second.workspacesCreated).toBe(1);
		expect(env.createCalls).toHaveLength(1);
		expect(env.createdProjectIds).toEqual(["v2-proj-1"]);
		expect(env.state.get("project:p1")?.v2Id).toBe("v2-proj-1");
		expect(env.state.get("project:p1")?.status).toBe("linked");
		expect(env.state.get("workspace:w1")?.status).toBe("success");
	});

	test("workspace state write failure reruns adoption without creating a duplicate workspace", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w1", "p1", { worktreeId: "wt1", type: "worktree" }),
			],
			v1Worktrees: [{ id: "wt1", path: "/worktrees/w1" }],
			failNextStateWriteFor: new Set(["workspace:w1"]),
		});
		const electronTrpc = makeElectronTrpc(env);
		const hostService = makeHostService(env);

		const first = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc,
			hostService,
			collections: makeCollections(),
		});

		expect(first.workspacesErrored).toBe(1);
		expect(env.createdWorkspaceIds).toEqual(["v2-ws-2"]);
		expect(env.state.get("workspace:w1")?.status).toBe("error");

		const second = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc,
			hostService,
			collections: makeCollections(),
		});

		expect(second.workspacesCreated).toBe(1);
		expect(env.createdWorkspaceIds).toEqual(["v2-ws-2"]);
		expect(env.state.get("workspace:w1")?.status).toBe("success");
		expect(env.state.get("workspace:w1")?.v2Id).toBe("v2-ws-2");
	});

	test("completed workspace with missing host db row is relinked to existing cloud workspace", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w1", "p1", { worktreeId: "wt1", type: "worktree" }),
			],
			v1Worktrees: [{ id: "wt1", path: "/worktrees/w1" }],
			state: new Map([
				[
					"project:p1",
					{
						v1Id: "p1",
						v2Id: "v2-p1",
						organizationId: ORG,
						kind: "project",
						status: "success",
						reason: null,
					},
				],
				[
					"workspace:w1",
					{
						v1Id: "w1",
						v2Id: "v2-ws-existing",
						organizationId: ORG,
						kind: "workspace",
						status: "success",
						reason: null,
					},
				],
			]),
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.workspacesCreated).toBe(1);
		expect(env.createdWorkspaceIds).toEqual([]);
		expect(env.adoptCalls).toContainEqual({
			projectId: "v2-p1",
			branch: "branch-w1",
			worktreePath: "/worktrees/w1",
			baseBranch: undefined,
			existingWorkspaceId: "v2-ws-existing",
		});
		expect(env.state.get("workspace:w1")?.status).toBe("success");
		expect(env.state.get("workspace:w1")?.v2Id).toBe("v2-ws-existing");
	});

	test("rerun retries previous worktree skips so old skipped state can recover", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w-orphan", "p1", {
					type: "worktree",
					worktreeId: "missing",
				}),
			],
			v1Worktrees: [],
			state: new Map([
				[
					"project:p1",
					{
						v1Id: "p1",
						v2Id: "v2-p1",
						organizationId: ORG,
						kind: "project",
						status: "success",
						reason: null,
					},
				],
				[
					"workspace:w-orphan",
					{
						v1Id: "w-orphan",
						v2Id: null,
						organizationId: ORG,
						kind: "workspace",
						status: "skipped",
						reason: "orphan_worktree",
					},
				],
			]),
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.workspacesCreated).toBe(1);
		expect(summary.workspacesSkipped).toBe(0);
		expect(env.adoptCalls).toContainEqual({
			projectId: "v2-p1",
			branch: "branch-w-orphan",
			worktreePath: undefined,
			baseBranch: undefined,
		});
		expect(env.state.get("workspace:w-orphan")?.status).toBe("success");
	});

	test("failed retry of previous missing-worktree skip does not count as new work", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w-orphan", "p1", {
					type: "worktree",
					worktreeId: "missing",
				}),
			],
			v1Worktrees: [],
			adoptThrowsFor: new Map([["branch-w-orphan", { code: "NOT_FOUND" }]]),
			state: new Map([
				[
					"project:p1",
					{
						v1Id: "p1",
						v2Id: "v2-p1",
						organizationId: ORG,
						kind: "project",
						status: "success",
						reason: null,
					},
				],
				[
					"workspace:w-orphan",
					{
						v1Id: "w-orphan",
						v2Id: null,
						organizationId: ORG,
						kind: "workspace",
						status: "skipped",
						reason: "worktree_not_registered",
					},
				],
			]),
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.workspacesCreated).toBe(0);
		expect(summary.workspacesSkipped).toBe(0);
		expect(env.adoptCalls).toHaveLength(1);
		expect(summary.workspaces).toHaveLength(1);
		expect(summary.workspaces).toContainEqual({
			name: "workspace-w-orphan",
			branch: "branch-w-orphan",
			status: "skipped",
			reason: "worktree no longer exists",
		});
		expect(env.state.get("workspace:w-orphan")?.status).toBe("skipped");
		expect(env.state.get("workspace:w-orphan")?.reason).toBe(
			"worktree_not_registered",
		);
	});

	test("passes v1 worktree base branch into adoption", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w1", "p1", { worktreeId: "wt1", type: "worktree" }),
			],
			v1Worktrees: [
				{ id: "wt1", path: "/worktrees/w1", baseBranch: "develop" },
			],
		});

		await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(env.adoptCalls).toContainEqual({
			projectId: "v2-proj-1",
			branch: "branch-w1",
			worktreePath: "/worktrees/w1",
			baseBranch: "develop",
		});
	});

	test("workspace with sectionId that lacks a v1 section record lands at top level", async () => {
		const env = makeFakeEnv({
			v1Projects: [project("p1")],
			v1Workspaces: [
				workspace("w1", "p1", {
					worktreeId: "wt1",
					type: "worktree",
					sectionId: "sec-missing",
				}),
			],
			v1Worktrees: [{ id: "wt1", path: "/a" }],
			v1Sections: [],
		});

		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.workspacesCreated).toBe(1);
		expect(env.state.get("workspace:w1")?.status).toBe("success");
	});

	test("no v1 data → no-op, no errors, empty summary", async () => {
		const env = makeFakeEnv({});
		const summary = await migrateV1DataToV2({
			organizationId: ORG,
			electronTrpc: makeElectronTrpc(env),
			hostService: makeHostService(env),
			collections: makeCollections(),
		});

		expect(summary.projectsCreated).toBe(0);
		expect(summary.projectsLinked).toBe(0);
		expect(summary.workspacesCreated).toBe(0);
		expect(summary.errors).toHaveLength(0);
	});
});
