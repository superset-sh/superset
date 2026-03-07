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

// ---------------------------------------------------------------------------
// Test helpers – real git repos on disk
// ---------------------------------------------------------------------------

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-repair-${process.pid}`,
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

// Sentinel objects so the mock `from()` can distinguish tables
const WORKTREES_TABLE = Symbol("worktrees");
const PROJECTS_TABLE = Symbol("projects");

mock.module("@superset/local-db", () => ({
	worktrees: WORKTREES_TABLE,
	projects: PROJECTS_TABLE,
}));

mock.module("drizzle-orm", () => ({
	eq: (_field: unknown, value: string) => value,
}));

mock.module("main/lib/local-db", () => ({
	localDb: {
		select: () => ({
			from: (table: symbol) => ({
				where: (id: string) => ({
					get: () => {
						if (table === WORKTREES_TABLE) return mockWorktrees.get(id);
						if (table === PROJECTS_TABLE) return mockProjects.get(id);
						return undefined;
					},
				}),
			}),
		}),
		update: (_table: symbol) => ({
			set: (values: { path?: string }) => ({
				where: (id: string) => ({
					run: () => {
						const wt = mockWorktrees.get(id);
						if (wt && values.path) wt.path = values.path;
					},
				}),
			}),
		}),
	},
}));

// Import after mocks are registered
const { resolveWorktreePathWithRepair, tryRepairWorktreePath } = await import(
	"./repair-worktree-path"
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("tryRepairWorktreePath", () => {
	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		mockWorktrees = new Map();
		mockProjects = new Map();
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
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
});
