import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── DB mock ──────────────────────────────────────────────────────────────────
// The sync service queries `projects`, `worktrees`, and `workspaces` tables.
// We keep in-memory arrays that the test can populate and the mock returns.

let mockWorktrees: Array<{
	id: string;
	projectId: string;
	path: string;
	branch: string;
	baseBranch: string;
	gitStatus: unknown;
}> = [];
let mockWorkspaces: Array<{
	id: string;
	projectId: string;
	worktreeId: string;
	type: string;
	branch: string;
	name: string;
	tabOrder: number;
}> = [];
let mockProjects: Array<{
	id: string;
	mainRepoPath: string;
	tabOrder: number | null;
	defaultBranch: string | null;
	workspaceBaseBranch: string | null;
}> = [];

let insertedWorktrees: Array<Record<string, unknown>> = [];
let insertedWorkspaces: Array<Record<string, unknown>> = [];
let deletedWorktreeIds: string[] = [];
let deletedWorkspaceIds: string[] = [];

/** Reset all in-memory mock arrays to their empty state between tests. */
function resetMockState() {
	mockWorktrees = [];
	mockWorkspaces = [];
	mockProjects = [];
	insertedWorktrees = [];
	insertedWorkspaces = [];
	deletedWorktreeIds = [];
	deletedWorkspaceIds = [];
}

// Build a mock Drizzle-like query chain.
// The sync service uses patterns like:
//   localDb.select().from(worktrees).where(...).all()
//   localDb.select({ id: ..., mainRepoPath: ... }).from(projects).where(...).all()
//   localDb.insert(worktrees).values({...}).returning().get()
//   localDb.delete(worktrees).where(...).run()
//
// NOTE: The mock ignores where() predicates and returns full arrays.
// Tests scope correctness by setting up mock data per-project.
// Real query filtering is covered by the Drizzle ORM + SQLite integration.

/** Build a mock Drizzle-like localDb that reads from/writes to the in-memory arrays. */
function buildMockLocalDb() {
	// Track which table the current chain targets
	let currentTable: string | null = null;

	const selectChain = {
		from: (table: { id?: unknown }) => {
			// Identify table by checking known marker keys
			if (table === mockTables.worktrees) currentTable = "worktrees";
			else if (table === mockTables.workspaces) currentTable = "workspaces";
			else if (table === mockTables.projects) currentTable = "projects";
			return {
				where: () => ({
					all: () => {
						if (currentTable === "worktrees") return [...mockWorktrees];
						if (currentTable === "workspaces") return [...mockWorkspaces];
						if (currentTable === "projects") return [...mockProjects];
						return [];
					},
					get: () => {
						if (currentTable === "projects") return mockProjects[0];
						if (currentTable === "worktrees") return mockWorktrees[0];
						return undefined;
					},
				}),
				all: () => {
					if (currentTable === "worktrees") return [...mockWorktrees];
					if (currentTable === "workspaces") return [...mockWorkspaces];
					if (currentTable === "projects") return [...mockProjects];
					return [];
				},
			};
		},
	};

	return {
		select: () => selectChain,
		insert: (table: unknown) => {
			if (table === mockTables.worktrees) currentTable = "worktrees";
			else if (table === mockTables.workspaces) currentTable = "workspaces";
			return {
				values: (vals: Record<string, unknown>) => ({
					returning: () => ({
						get: () => {
							const record = {
								id: `mock-${currentTable}-${Date.now()}-${Math.random()}`,
								...vals,
							};
							if (currentTable === "worktrees") insertedWorktrees.push(record);
							if (currentTable === "workspaces")
								insertedWorkspaces.push(record);
							return record;
						},
					}),
					run: () => {
						const record = {
							id: `mock-${currentTable}-${Date.now()}-${Math.random()}`,
							...vals,
						};
						if (currentTable === "worktrees") insertedWorktrees.push(record);
						if (currentTable === "workspaces") insertedWorkspaces.push(record);
					},
				}),
			};
		},
		delete: (table: unknown) => {
			if (table === mockTables.worktrees) currentTable = "worktrees";
			else if (table === mockTables.workspaces) currentTable = "workspaces";
			return {
				where: () => ({
					run: () => {
						// We track deletions through the db-helpers mock below
					},
				}),
			};
		},
		update: () => ({
			set: () => ({
				where: () => ({
					run: () => {},
				}),
			}),
		}),
	};
}

const mockTables = {
	worktrees: { id: "worktrees.id", projectId: "worktrees.projectId" },
	workspaces: { id: "workspaces.id", worktreeId: "workspaces.worktreeId" },
	projects: { id: "projects.id", tabOrder: "projects.tabOrder" },
};

mock.module("main/lib/local-db", () => ({
	localDb: buildMockLocalDb(),
}));

mock.module("@superset/local-db", () => ({
	projects: mockTables.projects,
	workspaces: mockTables.workspaces,
	worktrees: mockTables.worktrees,
}));

mock.module("drizzle-orm", () => ({
	eq: () => "eq",
	and: () => "and",
	isNotNull: () => "isNotNull",
	isNull: () => "isNull",
}));

mock.module("main/lib/analytics", () => ({
	track: () => {},
}));

// Mock db-helpers to track deletions
mock.module("lib/trpc/routers/workspaces/utils/db-helpers", () => ({
	deleteWorkspace: (id: string) => {
		deletedWorkspaceIds.push(id);
	},
	deleteWorktreeRecord: (id: string) => {
		deletedWorktreeIds.push(id);
	},
	getMaxProjectChildTabOrder: () => 0,
	activateProject: () => {},
	hideProjectIfNoWorkspaces: () => {},
	updateActiveWorkspaceIfRemoved: () => {},
}));

// base-branch is a pure function — use the real implementation.
// Do NOT mock it; bun's mock.module is global and would poison
// other test files (e.g. base-branch.test.ts) in the same run.

mock.module("lib/trpc/routers/workspaces/utils/base-branch-config", () => ({
	setBranchBaseConfig: async () => {},
}));

mock.module("lib/trpc/routers/workspaces/utils/setup", () => ({
	copySupersetConfigToWorktree: () => {},
}));

// We do NOT mock git.ts — we use real git repos for integration testing
// (listExternalWorktrees and worktreeExists shell out to `git`)

const { worktreeSyncService } = await import("./worktree-sync");
type WorktreeSyncEvent = {
	projectId: string;
	imported: number;
	removed: number;
};

// ── Test helpers ─────────────────────────────────────────────────────────────

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-worktree-sync-${process.pid}`,
);

/** Create a real git repository in the temp directory with an initial commit. */
function createTestRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	execSync("git init", { cwd: repoPath, stdio: "ignore" });
	execSync("git config user.email 'test@test.com'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	execSync("git config user.name 'Test'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	// Seed commit so branches can be created
	writeFileSync(join(repoPath, "README.md"), "# test\n");
	execSync("git add . && git commit -m 'init'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	return repoPath;
}

/** Add a git worktree for the given branch and return its path on disk. */
function addGitWorktree(mainRepoPath: string, branch: string): string {
	const worktreePath = join(TEST_DIR, `wt-${branch}`);
	execSync(`git worktree add "${worktreePath}" -b "${branch}"`, {
		cwd: mainRepoPath,
		stdio: "ignore",
	});
	return worktreePath;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("WorktreeSyncService", () => {
	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		resetMockState();
	});

	afterEach(() => {
		worktreeSyncService.stopAll();
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	describe("syncProject — import new worktrees", () => {
		test("imports an externally created worktree", async () => {
			const repoPath = createTestRepo("import-test");
			const wtPath = addGitWorktree(repoPath, "feature-external");

			// DB has no worktrees tracked yet
			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			mockWorktrees = [];
			mockWorkspaces = [];

			const result = await worktreeSyncService.syncProject("proj-1", repoPath);

			expect(result.imported).toBe(1);
			expect(result.removed).toBe(0);
			expect(insertedWorktrees.length).toBe(1);
			expect(insertedWorktrees[0].branch).toBe("feature-external");
			expect(insertedWorktrees[0].path).toBe(wtPath);
			expect(insertedWorkspaces.length).toBe(1);
			expect(insertedWorkspaces[0].branch).toBe("feature-external");
		});

		test("marks imported worktrees as createdBySuperset: false", async () => {
			const repoPath = createTestRepo("created-by-flag");
			addGitWorktree(repoPath, "external-branch");

			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			mockWorktrees = [];
			mockWorkspaces = [];

			await worktreeSyncService.syncProject("proj-1", repoPath);

			expect(insertedWorktrees.length).toBe(1);
			expect(insertedWorktrees[0].createdBySuperset).toBe(false);
		});

		test("imports multiple externally created worktrees", async () => {
			const repoPath = createTestRepo("multi-import");
			addGitWorktree(repoPath, "feat-a");
			addGitWorktree(repoPath, "feat-b");
			addGitWorktree(repoPath, "feat-c");

			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			mockWorktrees = [];
			mockWorkspaces = [];

			const result = await worktreeSyncService.syncProject("proj-1", repoPath);

			expect(result.imported).toBe(3);
			expect(insertedWorktrees.length).toBe(3);
			const branches = insertedWorktrees.map((wt) => wt.branch).sort();
			expect(branches).toEqual(["feat-a", "feat-b", "feat-c"]);
		});

		test("does not import worktrees already tracked in DB", async () => {
			const repoPath = createTestRepo("already-tracked");
			const wtPath = addGitWorktree(repoPath, "existing-branch");

			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			mockWorktrees = [
				{
					id: "wt-1",
					projectId: "proj-1",
					path: wtPath,
					branch: "existing-branch",
					baseBranch: "main",
					gitStatus: null,
				},
			];
			mockWorkspaces = [];

			const result = await worktreeSyncService.syncProject("proj-1", repoPath);

			expect(result.imported).toBe(0);
			expect(insertedWorktrees.length).toBe(0);
		});
	});

	describe("syncProject — remove stale worktrees", () => {
		test("removes a worktree that no longer exists on disk", async () => {
			const repoPath = createTestRepo("remove-stale");

			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			// DB says we have a worktree at a path that doesn't exist
			mockWorktrees = [
				{
					id: "wt-stale",
					projectId: "proj-1",
					path: join(TEST_DIR, "wt-does-not-exist"),
					branch: "deleted-branch",
					baseBranch: "main",
					gitStatus: null,
				},
			];
			mockWorkspaces = [
				{
					id: "ws-stale",
					projectId: "proj-1",
					worktreeId: "wt-stale",
					type: "worktree",
					branch: "deleted-branch",
					name: "deleted-branch",
					tabOrder: 1,
				},
			];

			const result = await worktreeSyncService.syncProject("proj-1", repoPath);

			expect(result.removed).toBe(1);
			expect(deletedWorktreeIds).toContain("wt-stale");
			expect(deletedWorkspaceIds).toContain("ws-stale");
		});

		test("does not remove worktrees that still exist on disk", async () => {
			const repoPath = createTestRepo("keep-existing");
			const wtPath = addGitWorktree(repoPath, "still-here");

			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			mockWorktrees = [
				{
					id: "wt-exists",
					projectId: "proj-1",
					path: wtPath,
					branch: "still-here",
					baseBranch: "main",
					gitStatus: null,
				},
			];
			mockWorkspaces = [];

			const result = await worktreeSyncService.syncProject("proj-1", repoPath);

			expect(result.removed).toBe(0);
			expect(deletedWorktreeIds).toHaveLength(0);
		});
	});

	describe("syncProject — combined import + remove", () => {
		test("imports new and removes stale in the same sync", async () => {
			const repoPath = createTestRepo("combined");
			addGitWorktree(repoPath, "new-feature");

			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			mockWorktrees = [
				{
					id: "wt-stale",
					projectId: "proj-1",
					path: join(TEST_DIR, "wt-gone"),
					branch: "old-feature",
					baseBranch: "main",
					gitStatus: null,
				},
			];
			mockWorkspaces = [];

			const result = await worktreeSyncService.syncProject("proj-1", repoPath);

			expect(result.imported).toBe(1);
			expect(result.removed).toBe(1);
			expect(insertedWorktrees[0].branch).toBe("new-feature");
			expect(deletedWorktreeIds).toContain("wt-stale");
		});
	});

	describe("syncProject — no-op cases", () => {
		test("returns zeros when everything is in sync", async () => {
			const repoPath = createTestRepo("in-sync");
			const wtPath = addGitWorktree(repoPath, "synced-branch");

			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			mockWorktrees = [
				{
					id: "wt-synced",
					projectId: "proj-1",
					path: wtPath,
					branch: "synced-branch",
					baseBranch: "main",
					gitStatus: null,
				},
			];
			mockWorkspaces = [];

			const result = await worktreeSyncService.syncProject("proj-1", repoPath);

			expect(result.imported).toBe(0);
			expect(result.removed).toBe(0);
		});

		test("returns zeros for a repo with no worktrees", async () => {
			const repoPath = createTestRepo("no-worktrees");

			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			mockWorktrees = [];
			mockWorkspaces = [];

			const result = await worktreeSyncService.syncProject("proj-1", repoPath);

			expect(result.imported).toBe(0);
			expect(result.removed).toBe(0);
		});
	});

	describe("syncProject — emits sync event", () => {
		test("emits sync event when changes occur", async () => {
			const repoPath = createTestRepo("emit-test");
			addGitWorktree(repoPath, "event-branch");

			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			mockWorktrees = [];
			mockWorkspaces = [];

			const events: Array<{
				projectId: string;
				imported: number;
				removed: number;
			}> = [];
			worktreeSyncService.on("sync", (e) => events.push(e));

			await worktreeSyncService.syncProject("proj-1", repoPath);

			expect(events).toHaveLength(1);
			expect(events[0].projectId).toBe("proj-1");
			expect(events[0].imported).toBe(1);

			worktreeSyncService.removeAllListeners("sync");
		});

		test("does not emit sync event when no changes", async () => {
			const repoPath = createTestRepo("no-emit-test");

			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			mockWorktrees = [];
			mockWorkspaces = [];

			const events: unknown[] = [];
			worktreeSyncService.on("sync", (e) => events.push(e));

			await worktreeSyncService.syncProject("proj-1", repoPath);

			expect(events).toHaveLength(0);

			worktreeSyncService.removeAllListeners("sync");
		});
	});

	describe("watcher lifecycle", () => {
		test("startWatching / stopWatching does not throw", () => {
			const repoPath = createTestRepo("watcher-lifecycle");
			// Create a worktree so .git/worktrees/ directory exists
			addGitWorktree(repoPath, "watcher-test");

			expect(() =>
				worktreeSyncService.startWatching("proj-wl", repoPath),
			).not.toThrow();

			expect(() => worktreeSyncService.stopWatching("proj-wl")).not.toThrow();
		});

		test("startWatching is idempotent", () => {
			const repoPath = createTestRepo("watcher-idempotent");
			addGitWorktree(repoPath, "idem-test");

			worktreeSyncService.startWatching("proj-idem", repoPath);
			// Second call should be a no-op
			expect(() =>
				worktreeSyncService.startWatching("proj-idem", repoPath),
			).not.toThrow();

			worktreeSyncService.stopWatching("proj-idem");
		});

		test("stopAll cleans up all watchers", () => {
			const repo1 = createTestRepo("watcher-all-1");
			const repo2 = createTestRepo("watcher-all-2");
			addGitWorktree(repo1, "all-test-1");
			addGitWorktree(repo2, "all-test-2");

			worktreeSyncService.startWatching("proj-all-1", repo1);
			worktreeSyncService.startWatching("proj-all-2", repo2);

			expect(() => worktreeSyncService.stopAll()).not.toThrow();
		});

		test("watches .git parent when .git/worktrees does not exist", () => {
			const repoPath = createTestRepo("no-wt-dir");
			// No worktrees created, so .git/worktrees/ doesn't exist yet

			expect(() =>
				worktreeSyncService.startWatching("proj-no-wt", repoPath),
			).not.toThrow();

			worktreeSyncService.stopWatching("proj-no-wt");
		});
	});

	describe("concurrent sync protection", () => {
		test("second concurrent call returns zeros and queued re-sync executes", async () => {
			const repoPath = createTestRepo("concurrent");
			addGitWorktree(repoPath, "concurrent-branch");

			mockProjects = [
				{
					id: "proj-1",
					mainRepoPath: repoPath,
					tabOrder: 0,
					defaultBranch: "main",
					workspaceBaseBranch: null,
				},
			];
			mockWorktrees = [];
			mockWorkspaces = [];

			// Spy on doSync to count actual sync executions (not just return values)
			let doSyncCallCount = 0;
			const originalDoSync = (worktreeSyncService as any).doSync;
			(worktreeSyncService as any).doSync = async function (
				...args: unknown[]
			) {
				doSyncCallCount++;
				return originalDoSync.apply(this, args);
			};

			// Fire two syncs simultaneously — the second should be queued, not run concurrently
			const [r1, r2] = await Promise.all([
				worktreeSyncService.syncProject("proj-1", repoPath),
				worktreeSyncService.syncProject("proj-1", repoPath),
			]);

			// The second call should have returned zeros immediately (queued a re-sync)
			expect(r2.imported).toBe(0);
			expect(r2.removed).toBe(0);

			// The first call should have done the actual import
			expect(r1.imported).toBe(1);
			expect(r1.projectId).toBe("proj-1");

			// doSync must have been called exactly twice: once for the first sync,
			// once for the queued re-sync drain. This is the only reliable way to
			// verify the drain ran — the re-sync finds nothing new so it emits no event.
			expect(doSyncCallCount).toBe(2);

			(worktreeSyncService as any).doSync = originalDoSync;
		});
	});
});
