import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
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
import {
	__testOnlyRepairWorktreePathDeps,
	findProjectWorktreeByCurrentPath,
	getTrackedWorktreeRepairCommand,
	listProjectWorktreesWithCurrentPaths,
	resolveTrackedWorktreePath,
	resolveWorktreePathOrThrow,
	resolveWorktreePathWithRepair,
	tryRepairWorktreePath,
} from "./repair-worktree-path";

// ---------------------------------------------------------------------------
// Test helpers – real git repos on disk
// ---------------------------------------------------------------------------

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-repair-${process.pid}`,
);
const EXTERNAL_TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-external-repair-${process.pid}`,
);

function createTestRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	execSync("git init", { cwd: repoPath, stdio: "ignore" });
	execSync('git config user.email "test@test.com"', {
		cwd: repoPath,
		stdio: "ignore",
	});
	execSync('git config user.name "Test"', { cwd: repoPath, stdio: "ignore" });
	return repoPath;
}

function seedCommit(repoPath: string): void {
	writeFileSync(join(repoPath, "README.md"), "# test\n");
	execSync("git add .", { cwd: repoPath, stdio: "ignore" });
	execSync('git commit -m "init"', { cwd: repoPath, stdio: "ignore" });
}

// ---------------------------------------------------------------------------
// DB mock – thin in-memory store
// ---------------------------------------------------------------------------

interface MockWorktree {
	id: string;
	path: string;
	branch: string;
	projectId: string;
}

interface MockProject {
	id: string;
	mainRepoPath: string;
}

let mockWorktrees: Map<string, MockWorktree>;
let mockProjects: Map<string, MockProject>;

const originalDeps = {
	...__testOnlyRepairWorktreePathDeps,
};

const WORKTREES_TABLE = {
	id: Symbol("worktrees.id"),
	projectId: Symbol("worktrees.projectId"),
};
const PROJECTS_TABLE = {
	id: Symbol("projects.id"),
};

const mockLocalDb = {
	select: () => ({
		from: (table: typeof WORKTREES_TABLE | typeof PROJECTS_TABLE) => ({
			where: (value: string) => ({
				get: () => {
					if (table === WORKTREES_TABLE) return mockWorktrees.get(value);
					if (table === PROJECTS_TABLE) return mockProjects.get(value);
					return undefined;
				},
				all: () => {
					if (table === WORKTREES_TABLE) {
						return Array.from(mockWorktrees.values()).filter(
							(worktree) => worktree.projectId === value,
						);
					}
					if (table === PROJECTS_TABLE) {
						return Array.from(mockProjects.values()).filter(
							(project) => project.id === value,
						);
					}
					return [];
				},
			}),
			all: () => {
				if (table === WORKTREES_TABLE) {
					return Array.from(mockWorktrees.values());
				}
				if (table === PROJECTS_TABLE) {
					return Array.from(mockProjects.values());
				}
				return [];
			},
		}),
	}),
	update: (_table: typeof WORKTREES_TABLE) => ({
		set: (values: { path?: string }) => ({
			where: (id: string) => ({
				run: () => {
					const wt = mockWorktrees.get(id);
					if (wt && values.path) wt.path = values.path;
				},
			}),
		}),
	}),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("repair-worktree-path", () => {
	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		mockWorktrees = new Map();
		mockProjects = new Map();
		__testOnlyRepairWorktreePathDeps.eq = ((_: unknown, value: string) =>
			value) as unknown as typeof __testOnlyRepairWorktreePathDeps.eq;
		__testOnlyRepairWorktreePathDeps.localDb =
			mockLocalDb as unknown as typeof __testOnlyRepairWorktreePathDeps.localDb;
		__testOnlyRepairWorktreePathDeps.projects =
			PROJECTS_TABLE as unknown as typeof __testOnlyRepairWorktreePathDeps.projects;
		__testOnlyRepairWorktreePathDeps.worktrees =
			WORKTREES_TABLE as unknown as typeof __testOnlyRepairWorktreePathDeps.worktrees;
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		if (existsSync(EXTERNAL_TEST_DIR)) {
			rmSync(EXTERNAL_TEST_DIR, { recursive: true, force: true });
		}
	});

	afterAll(() => {
		Object.assign(__testOnlyRepairWorktreePathDeps, originalDeps);
	});

	test("returns null when worktree record is missing", async () => {
		expect(await tryRepairWorktreePath("nonexistent")).toBeNull();
	});

	test("returns existing path when it is still valid on disk", async () => {
		const mainRepo = createTestRepo("main-valid");
		seedCommit(mainRepo);

		const wtPath = join(TEST_DIR, "wt-valid");
		execSync(
			`git -C "${mainRepo}" worktree add "${wtPath}" -b feat-valid HEAD`,
			{ stdio: "ignore" },
		);

		mockWorktrees.set("wt-1", {
			id: "wt-1",
			path: wtPath,
			branch: "feat-valid",
			projectId: "proj-1",
		});
		mockProjects.set("proj-1", { id: "proj-1", mainRepoPath: mainRepo });

		const result = await tryRepairWorktreePath("wt-1");
		expect(result).toBe(wtPath);
	});

	test("resolveWorktreePathWithRepair returns existing path without repair", async () => {
		const mainRepo = createTestRepo("main-resolve-valid");
		seedCommit(mainRepo);

		const wtPath = join(TEST_DIR, "wt-resolve-valid");
		execSync(
			`git -C "${mainRepo}" worktree add "${wtPath}" -b feat-resolve-valid HEAD`,
			{ stdio: "ignore" },
		);

		mockWorktrees.set("wt-resolve-1", {
			id: "wt-resolve-1",
			path: wtPath,
			branch: "feat-resolve-valid",
			projectId: "proj-resolve-1",
		});
		mockProjects.set("proj-resolve-1", {
			id: "proj-resolve-1",
			mainRepoPath: mainRepo,
		});

		const result = await resolveWorktreePathWithRepair("wt-resolve-1");
		expect(result).toBe(wtPath);
	});

	test("repairs path after `git worktree move`", async () => {
		const mainRepo = createTestRepo("main-move");
		seedCommit(mainRepo);

		const oldPath = join(TEST_DIR, "wt-old");
		const newPath = join(TEST_DIR, "wt-new");
		execSync(
			`git -C "${mainRepo}" worktree add "${oldPath}" -b feat-move HEAD`,
			{ stdio: "ignore" },
		);
		execSync(`git -C "${mainRepo}" worktree move "${oldPath}" "${newPath}"`, {
			stdio: "ignore",
		});

		mockWorktrees.set("wt-2", {
			id: "wt-2",
			path: oldPath, // stale
			branch: "feat-move",
			projectId: "proj-2",
		});
		mockProjects.set("proj-2", { id: "proj-2", mainRepoPath: mainRepo });

		const result = await tryRepairWorktreePath("wt-2");
		expect(result).toBe(newPath);
		// DB should also be updated
		expect(mockWorktrees.get("wt-2")?.path).toBe(newPath);
	});

	test("resolveWorktreePathWithRepair returns repaired path after move", async () => {
		const mainRepo = createTestRepo("main-resolve-move");
		seedCommit(mainRepo);

		const oldPath = join(TEST_DIR, "wt-resolve-old");
		const newPath = join(TEST_DIR, "wt-resolve-new");
		execSync(
			`git -C "${mainRepo}" worktree add "${oldPath}" -b feat-resolve-move HEAD`,
			{ stdio: "ignore" },
		);
		execSync(`git -C "${mainRepo}" worktree move "${oldPath}" "${newPath}"`, {
			stdio: "ignore",
		});

		mockWorktrees.set("wt-resolve-2", {
			id: "wt-resolve-2",
			path: oldPath,
			branch: "feat-resolve-move",
			projectId: "proj-resolve-2",
		});
		mockProjects.set("proj-resolve-2", {
			id: "proj-resolve-2",
			mainRepoPath: mainRepo,
		});

		const result = await resolveWorktreePathWithRepair("wt-resolve-2");
		expect(result).toBe(newPath);
		expect(mockWorktrees.get("wt-resolve-2")?.path).toBe(newPath);
	});

	test("listProjectWorktreesWithCurrentPaths returns repaired paths for moved worktrees", async () => {
		const mainRepo = createTestRepo("main-list-project");
		seedCommit(mainRepo);

		const oldPath = join(TEST_DIR, "wt-list-old");
		const newPath = join(TEST_DIR, "wt-list-new");
		execSync(
			`git -C "${mainRepo}" worktree add "${oldPath}" -b feat-list-project HEAD`,
			{ stdio: "ignore" },
		);
		execSync(`git -C "${mainRepo}" worktree move "${oldPath}" "${newPath}"`, {
			stdio: "ignore",
		});

		mockWorktrees.set("wt-list-1", {
			id: "wt-list-1",
			path: oldPath,
			branch: "feat-list-project",
			projectId: "proj-list-1",
		});
		mockProjects.set("proj-list-1", {
			id: "proj-list-1",
			mainRepoPath: mainRepo,
		});

		const result = await listProjectWorktreesWithCurrentPaths("proj-list-1");
		expect(result).toHaveLength(1);
		expect(result[0]?.existsOnDisk).toBe(true);
		expect(result[0]?.worktree.path).toBe(newPath);
		expect(mockWorktrees.get("wt-list-1")?.path).toBe(newPath);
	});

	test("findProjectWorktreeByCurrentPath matches repaired worktree paths", async () => {
		const mainRepo = createTestRepo("main-find-project");
		seedCommit(mainRepo);

		const oldPath = join(TEST_DIR, "wt-find-old");
		const newPath = join(TEST_DIR, "wt-find-new");
		execSync(
			`git -C "${mainRepo}" worktree add "${oldPath}" -b feat-find-project HEAD`,
			{ stdio: "ignore" },
		);
		execSync(`git -C "${mainRepo}" worktree move "${oldPath}" "${newPath}"`, {
			stdio: "ignore",
		});

		mockWorktrees.set("wt-find-1", {
			id: "wt-find-1",
			path: oldPath,
			branch: "feat-find-project",
			projectId: "proj-find-1",
		});
		mockProjects.set("proj-find-1", {
			id: "proj-find-1",
			mainRepoPath: mainRepo,
		});

		const result = await findProjectWorktreeByCurrentPath(
			"proj-find-1",
			newPath,
		);
		expect(result?.id).toBe("wt-find-1");
		expect(result?.path).toBe(newPath);
		expect(mockWorktrees.get("wt-find-1")?.path).toBe(newPath);
	});

	test("rejects candidate when it equals the main repo path", async () => {
		const mainRepo = createTestRepo("main-reject");
		seedCommit(mainRepo);

		// Derive the actual default branch so the test exercises the guard
		// regardless of whether `git init` defaults to "main" or "master".
		const defaultBranch = execSync(
			`git -C "${mainRepo}" rev-parse --abbrev-ref HEAD`,
			{
				encoding: "utf-8",
			},
		).trim();

		const stalePath = join(TEST_DIR, "wt-gone");

		mockWorktrees.set("wt-3", {
			id: "wt-3",
			path: stalePath,
			branch: defaultBranch,
			projectId: "proj-3",
		});
		mockProjects.set("proj-3", { id: "proj-3", mainRepoPath: mainRepo });

		const result = await tryRepairWorktreePath("wt-3");
		expect(result).toBeNull();
		// DB should NOT have been updated
		expect(mockWorktrees.get("wt-3")?.path).toBe(stalePath);
	});

	test("returns null when project record is missing", async () => {
		mockWorktrees.set("wt-4", {
			id: "wt-4",
			path: "/nonexistent/path",
			branch: "feat-orphan",
			projectId: "proj-missing",
		});

		expect(await tryRepairWorktreePath("wt-4")).toBeNull();
	});

	test("returns null when worktree is not found by git", async () => {
		const mainRepo = createTestRepo("main-notfound");
		seedCommit(mainRepo);

		mockWorktrees.set("wt-5", {
			id: "wt-5",
			path: "/nonexistent/path",
			branch: "feat-does-not-exist",
			projectId: "proj-5",
		});
		mockProjects.set("proj-5", { id: "proj-5", mainRepoPath: mainRepo });

		const result = await tryRepairWorktreePath("wt-5");
		expect(result).toBeNull();
	});

	test("resolveWorktreePathWithRepair returns null when missing path cannot be repaired", async () => {
		const mainRepo = createTestRepo("main-resolve-missing");
		seedCommit(mainRepo);

		mockWorktrees.set("wt-resolve-3", {
			id: "wt-resolve-3",
			path: "/nonexistent/path",
			branch: "feat-missing",
			projectId: "proj-resolve-3",
		});
		mockProjects.set("proj-resolve-3", {
			id: "proj-resolve-3",
			mainRepoPath: mainRepo,
		});

		const result = await resolveWorktreePathWithRepair("wt-resolve-3");
		expect(result).toBeNull();
	});

	test("resolveTrackedWorktreePath auto-repairs a nearby manual rename", async () => {
		const mainRepo = createTestRepo("main-manual-rename");
		seedCommit(mainRepo);

		const oldPath = join(TEST_DIR, "wt-manual-old");
		const newPath = join(TEST_DIR, "wt-manual-new");
		execSync(
			`git -C "${mainRepo}" worktree add "${oldPath}" -b feat-manual-rename HEAD`,
			{ stdio: "ignore" },
		);
		execSync(`mv "${oldPath}" "${newPath}"`, { stdio: "ignore" });

		mockWorktrees.set("wt-manual-1", {
			id: "wt-manual-1",
			path: oldPath,
			branch: "feat-manual-rename",
			projectId: "proj-manual-1",
		});
		mockProjects.set("proj-manual-1", {
			id: "proj-manual-1",
			mainRepoPath: mainRepo,
		});

		const result = await resolveTrackedWorktreePath("wt-manual-1");
		expect(result).toEqual({
			status: "resolved",
			path: newPath,
		});
		expect(mockWorktrees.get("wt-manual-1")?.path).toBe(newPath);
		expect(
			execSync(`git -C "${mainRepo}" worktree list --porcelain`, {
				encoding: "utf-8",
			}),
		).toContain(newPath);
	});

	test("resolveWorktreePathOrThrow tells users to run git worktree repair when auto-repair cannot find the moved worktree", async () => {
		const mainRepo = createTestRepo("main-manual-rename-throw");
		seedCommit(mainRepo);

		const oldPath = join(TEST_DIR, "wt-manual-throw-old");
		const externalDir = join(EXTERNAL_TEST_DIR, "level-1", "level-2");
		mkdirSync(externalDir, { recursive: true });
		const newPath = join(externalDir, "wt-manual-throw-new");
		execSync(
			`git -C "${mainRepo}" worktree add "${oldPath}" -b feat-manual-throw HEAD`,
			{ stdio: "ignore" },
		);
		execSync(`mv "${oldPath}" "${newPath}"`, { stdio: "ignore" });

		mockWorktrees.set("wt-manual-2", {
			id: "wt-manual-2",
			path: oldPath,
			branch: "feat-manual-throw",
			projectId: "proj-manual-2",
		});
		mockProjects.set("proj-manual-2", {
			id: "proj-manual-2",
			mainRepoPath: mainRepo,
		});

		await expect(resolveWorktreePathOrThrow("wt-manual-2")).rejects.toThrow(
			getTrackedWorktreeRepairCommand(mainRepo),
		);
	});
});
