import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import type { SandboxRepository } from "@superset/shared/sandbox-contract";
import { eq } from "drizzle-orm";
import { projects, workspaceRepos, workspaces } from "../../src/db/schema";
import {
	readSandboxIdentity,
	runSandboxSelfSeed,
	type SandboxIdentity,
	sandboxRepositoryWorkspaceId,
} from "../../src/runtime/sandbox-self-seed/sandbox-self-seed";
import {
	findWorkspaceRepo,
	listWorkspaceRepos,
} from "../../src/workspaces/workspace-repos";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

const ROOT = "/workspace";

function identityFor(repositories: SandboxRepository[]): SandboxIdentity {
	const identity = readSandboxIdentity({
		SUPERSET_SANDBOX_WORKSPACE_ID: randomUUID(),
		SUPERSET_SANDBOX_WORKSPACE_PATH: ROOT,
		SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify(repositories),
		HOST_DB_PATH: "/var/lib/superset/host.db",
	} as NodeJS.ProcessEnv);
	if (!identity) throw new Error("test identity did not parse");
	return identity;
}

const SOLO: SandboxRepository[] = [
	{ url: "https://github.com/acme/repo.git", branch: "feature/x", path: "." },
];

const PAIR: SandboxRepository[] = [
	{
		url: "https://github.com/acme/api.git",
		branch: "feature/x",
		baseBranch: "main",
		path: "api",
		hooks: true,
	},
	{
		url: "https://github.com/acme/docs.git",
		branch: "feature/x",
		baseBranch: "trunk",
		path: "docs",
	},
];

function repoRows(host: TestHost, workspaceId: string) {
	return host.db
		.select()
		.from(workspaceRepos)
		.where(eq(workspaceRepos.workspaceId, workspaceId))
		.all()
		.sort((a, b) => a.position - b.position);
}

/** What a build before this one wrote: a project and a workspace per repository. */
function seedTheOldWay(host: TestHost, identity: SandboxIdentity): string[] {
	const now = Date.now();
	return identity.repositories.map((repo, index) => {
		const projectId = randomUUID();
		const worktreePath = `${ROOT}/${repo.path}`;
		host.db
			.insert(projects)
			.values({
				id: projectId,
				repoPath: worktreePath,
				name: index === 0 ? identity.projectName : repo.path,
				createdAt: now,
				updatedAt: now,
			})
			.run();
		host.db
			.insert(workspaces)
			.values({
				id:
					index === 0
						? identity.workspaceId
						: sandboxRepositoryWorkspaceId(identity.workspaceId, repo.path),
				projectId,
				worktreePath,
				branch: repo.branch,
				name: index === 0 ? identity.workspaceName : repo.path,
				type: "local",
				createdAt: now,
				updatedAt: now,
			})
			.run();
		return projectId;
	});
}

let host: TestHost | null = null;
let runMode: string | undefined;

// The startup sweeps never run on a box, and one of them materializes the
// very rows these tests assert the seed does or does not write.
beforeAll(() => {
	runMode = process.env.SUPERSET_HOST_RUN_MODE;
	process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
});

afterAll(() => {
	if (runMode === undefined) delete process.env.SUPERSET_HOST_RUN_MODE;
	else process.env.SUPERSET_HOST_RUN_MODE = runMode;
});

afterEach(async () => {
	await host?.dispose();
	host = null;
});

describe("sandbox self-seed", () => {
	test("a single-repository box is stored exactly as it was before", async () => {
		host = await createTestHost();
		const identity = identityFor(SOLO);

		runSandboxSelfSeed(host.db, identity);
		runSandboxSelfSeed(host.db, identity);

		const rows = host.db.select().from(workspaces).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: identity.workspaceId,
			worktreePath: ROOT,
			rootPath: null,
			branch: "feature/x",
			name: identity.workspaceName,
			type: "local",
		});
		expect(repoRows(host, identity.workspaceId)).toHaveLength(0);

		const projectRows = host.db.select().from(projects).all();
		expect(projectRows).toHaveLength(1);
		expect(projectRows[0]).toMatchObject({
			repoPath: ROOT,
			name: identity.projectName,
		});

		// The synthesized primary is what every checkout-aware surface reads.
		const repos = listWorkspaceRepos(host.db, identity.workspaceId);
		expect(repos).toHaveLength(1);
		expect(repos[0]?.worktreePath).toBe(ROOT);
	});

	test("several repositories become one workspace over one row per checkout", async () => {
		host = await createTestHost();
		const identity = identityFor(PAIR);

		runSandboxSelfSeed(host.db, identity);

		const rows = host.db.select().from(workspaces).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: identity.workspaceId,
			worktreePath: `${ROOT}/api`,
			rootPath: ROOT,
			branch: "feature/x",
			type: "local",
		});

		const repos = repoRows(host, identity.workspaceId);
		expect(
			repos.map((repo) => ({
				position: repo.position,
				folder: repo.folder,
				worktreePath: repo.worktreePath,
				branch: repo.branch,
				baseBranch: repo.baseBranch,
			})),
		).toEqual([
			{
				position: 0,
				folder: "api",
				worktreePath: `${ROOT}/api`,
				branch: "feature/x",
				baseBranch: "main",
			},
			{
				position: 1,
				folder: "docs",
				worktreePath: `${ROOT}/docs`,
				branch: "feature/x",
				baseBranch: "trunk",
			},
		]);

		// One project per repository, each pointing at its own checkout.
		const projectRows = host.db
			.select()
			.from(projects)
			.all()
			.sort((a, b) => a.repoPath.localeCompare(b.repoPath));
		expect(projectRows.map((project) => project.repoPath)).toEqual([
			`${ROOT}/api`,
			`${ROOT}/docs`,
		]);
		expect(repos[0]?.projectId).toBe(rows[0]?.projectId ?? "");
		expect(repos[1]?.projectId).not.toBe(repos[0]?.projectId ?? "");

		// The `repo` argument on git.* and the picker resolve by folder.
		expect(
			findWorkspaceRepo(host.db, identity.workspaceId, "docs")?.worktreePath,
		).toBe(`${ROOT}/docs`);
		expect(findWorkspaceRepo(host.db, identity.workspaceId, null)?.folder).toBe(
			"api",
		);

		const listed = await host.trpc.workspace.list.query();
		const workspace = listed.find((row) => row.id === identity.workspaceId);
		expect(workspace?.rootPath).toBe(ROOT);
		expect(workspace?.repos.map((repo) => repo.folder)).toEqual([
			"api",
			"docs",
		]);
		expect(workspace?.repos.map((repo) => repo.base)).toEqual([
			"main",
			"trunk",
		]);
	});

	test("a restart leaves every row it already wrote alone", async () => {
		host = await createTestHost();
		const identity = identityFor(PAIR);

		runSandboxSelfSeed(host.db, identity);
		const before = repoRows(host, identity.workspaceId);
		const projectsBefore = host.db.select().from(projects).all();

		runSandboxSelfSeed(host.db, identity);
		runSandboxSelfSeed(host.db, identity);

		expect(repoRows(host, identity.workspaceId)).toEqual(before);
		expect(host.db.select().from(projects).all()).toEqual(projectsBefore);
		expect(host.db.select().from(workspaces).all()).toHaveLength(1);
	});

	test("a box seeded one workspace per repository converges", async () => {
		host = await createTestHost();
		const identity = identityFor(PAIR);
		const [primaryProjectId, docsProjectId] = seedTheOldWay(host, identity);

		runSandboxSelfSeed(host.db, identity);

		const rows = host.db.select().from(workspaces).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe(identity.workspaceId);
		expect(rows[0]?.rootPath).toBe(ROOT);
		expect(
			host.db
				.select()
				.from(workspaces)
				.where(
					eq(
						workspaces.id,
						sandboxRepositoryWorkspaceId(identity.workspaceId, "docs"),
					),
				)
				.all(),
		).toHaveLength(0);

		// The projects the old shape created are reused, not duplicated: their
		// ids are what agent and terminal state on the box already reference.
		expect(host.db.select().from(projects).all()).toHaveLength(2);
		const repos = repoRows(host, identity.workspaceId);
		expect(repos.map((repo) => repo.projectId)).toEqual([
			primaryProjectId ?? "",
			docsProjectId ?? "",
		]);
		expect(repos.map((repo) => repo.folder)).toEqual(["api", "docs"]);
	});

	test("a repository list that changed order is rewritten, not merged", async () => {
		host = await createTestHost();
		const identity = identityFor(PAIR);
		runSandboxSelfSeed(host.db, identity);

		const reordered: SandboxIdentity = {
			...identity,
			repositories: [
				PAIR[1] as SandboxRepository,
				PAIR[0] as SandboxRepository,
			],
			worktreePath: `${ROOT}/docs`,
			hooksPath: `${ROOT}/docs`,
		};
		runSandboxSelfSeed(host.db, reordered);

		const repos = repoRows(host, identity.workspaceId);
		expect(repos.map((repo) => repo.folder)).toEqual(["docs", "api"]);
		// Position 0 is the workspace's own checkout — the column half the app
		// reads instead of the row follows it.
		const row = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, identity.workspaceId))
			.get();
		expect(row?.worktreePath).toBe(`${ROOT}/docs`);
		expect(row?.projectId).toBe(repos[0]?.projectId ?? "");
		expect(host.db.select().from(projects).all()).toHaveLength(2);
	});
});
