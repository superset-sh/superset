import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * These tests focus on the canDelete endpoint which parses git worktree output.
 * This is valuable to test because:
 * 1. Git output format is external/could change
 * 2. Path matching edge cases are tricky (prefix matching, whitespace)
 *
 * Note: create/delete tests were removed because they were mostly testing
 * mock behavior rather than real behavior. Those paths are better tested
 * via integration tests or E2E tests.
 */

// Mock the database with minimal data needed for canDelete tests
const mockDb = {
	data: {
		workspaces: [
			{
				id: "workspace-1",
				projectId: "project-1",
				worktreeId: "worktree-1",
				name: "Test Workspace",
				tabOrder: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				lastOpenedAt: Date.now(),
			},
		],
		worktrees: [
			{
				id: "worktree-1",
				projectId: "project-1",
				path: "/path/to/worktree",
				branch: "test-branch",
				createdAt: Date.now(),
			},
		],
		projects: [
			{
				id: "project-1",
				name: "Test Project",
				mainRepoPath: "/path/to/repo",
				color: "#ff0000",
				tabOrder: 0,
				createdAt: Date.now(),
				lastOpenedAt: Date.now(),
			},
		],
		settings: {
			lastActiveWorkspaceId: "workspace-1",
		},
	},
	update: mock(async (fn: (data: typeof mockDb.data) => void) => {
		fn(mockDb.data);
	}),
};

mock.module("main/lib/db", () => ({
	db: mockDb,
}));

// Mock git utilities - we don't test these here, just need them to not fail
mock.module("./utils/git", () => ({
	createWorktree: mock(() => Promise.resolve()),
	removeWorktree: mock(() => Promise.resolve()),
	generateBranchName: mock(() => "test-branch-123"),
}));

import { createWorkspacesRouter } from "./workspaces";

// Helper to mock simple-git with specific worktree list output
function mockSimpleGitWithWorktreeList(
	worktreeListOutput: string,
	options?: { isClean?: boolean; unpushedCommitCount?: number },
) {
	const isClean = options?.isClean ?? true;
	const unpushedCommitCount = options?.unpushedCommitCount ?? 0;
	const mockGit = {
		raw: mock((args: string[]) => {
			// Handle worktree list
			if (args[0] === "worktree" && args[1] === "list") {
				return Promise.resolve(worktreeListOutput);
			}
			// Handle rev-list for unpushed commits check
			if (args[0] === "rev-list" && args[1] === "--count") {
				return Promise.resolve(String(unpushedCommitCount));
			}
			return Promise.resolve("");
		}),
		status: mock(() => Promise.resolve({ isClean: () => isClean })),
	};
	mock.module("simple-git", () => ({
		default: mock(() => mockGit),
	}));
	return mockGit;
}

function mockSimpleGitWithError(error: Error) {
	const mockGit = {
		raw: mock(() => Promise.reject(error)),
		status: mock(() => Promise.resolve({ isClean: () => true })),
	};
	mock.module("simple-git", () => ({
		default: mock(() => mockGit),
	}));
	return mockGit;
}

// Reset mock data before each test
beforeEach(() => {
	mockDb.data.worktrees = [
		{
			id: "worktree-1",
			projectId: "project-1",
			path: "/path/to/worktree",
			branch: "test-branch",
			createdAt: Date.now(),
		},
	];
});

describe("workspaces router - canDelete", () => {
	it("returns true when worktree exists in git", async () => {
		mockSimpleGitWithWorktreeList(
			"worktree /path/to/worktree\nHEAD abc123\nbranch refs/heads/test-branch",
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.reason).toBeNull();
		expect(result.warning).toBeNull();
	});

	it("returns warning when worktree not found in git", async () => {
		mockSimpleGitWithWorktreeList(
			"worktree /path/to/other-worktree\nHEAD def456\nbranch refs/heads/other-branch",
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain("not found in git");
	});

	it("returns false when git check fails", async () => {
		mockSimpleGitWithError(new Error("Git error"));

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(false);
		expect(result.reason).toContain("Failed to check worktree status");
	});

	it("uses exact path matching - does not match substrings", async () => {
		// "/path/to/worktree-backup" should NOT match "/path/to/worktree"
		mockSimpleGitWithWorktreeList(
			"worktree /path/to/worktree-backup\nHEAD abc123\nbranch refs/heads/backup",
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain("not found in git");
	});

	it("handles trailing whitespace in git output", async () => {
		mockSimpleGitWithWorktreeList(
			"worktree /path/to/worktree  \nHEAD abc123\nbranch refs/heads/test-branch",
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.warning).toBeNull();
	});

	it("handles path that is prefix of another path", async () => {
		mockDb.data.worktrees = [
			{
				id: "worktree-1",
				projectId: "project-1",
				path: "/path/to/main",
				branch: "test-branch",
				createdAt: Date.now(),
			},
		];

		// Git has "/path/to/main-backup" and "/path/to/main2" but NOT "/path/to/main"
		mockSimpleGitWithWorktreeList(
			"worktree /path/to/main-backup\nHEAD abc123\nbranch refs/heads/backup\n\nworktree /path/to/main2\nHEAD def456\nbranch refs/heads/other",
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain("not found in git");
	});

	it("passes --porcelain flag to git worktree list", async () => {
		const mockGit = mockSimpleGitWithWorktreeList(
			"worktree /path/to/worktree\nHEAD abc123\nbranch refs/heads/test-branch",
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		await caller.canDelete({ id: "workspace-1" });

		expect(mockGit.raw).toHaveBeenCalledWith([
			"worktree",
			"list",
			"--porcelain",
		]);
	});

	it("returns hasChanges: false when worktree is clean", async () => {
		mockSimpleGitWithWorktreeList(
			"worktree /path/to/worktree\nHEAD abc123\nbranch refs/heads/test-branch",
			{ isClean: true },
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.hasChanges).toBe(false);
	});

	it("returns hasChanges: true when worktree has uncommitted changes", async () => {
		mockSimpleGitWithWorktreeList(
			"worktree /path/to/worktree\nHEAD abc123\nbranch refs/heads/test-branch",
			{ isClean: false },
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.hasChanges).toBe(true);
	});

	it("returns hasChanges: false when worktree not found in git", async () => {
		mockSimpleGitWithWorktreeList(
			"worktree /path/to/other-worktree\nHEAD def456\nbranch refs/heads/other-branch",
			{ isClean: false },
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain("not found in git");
		// hasChanges should be false when worktree doesn't exist
		expect(result.hasChanges).toBe(false);
	});

	it("returns hasUnpushedCommits: false when all commits are pushed", async () => {
		mockSimpleGitWithWorktreeList(
			"worktree /path/to/worktree\nHEAD abc123\nbranch refs/heads/test-branch",
			{ isClean: true, unpushedCommitCount: 0 },
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.hasUnpushedCommits).toBe(false);
	});

	it("returns hasUnpushedCommits: true when there are unpushed commits", async () => {
		mockSimpleGitWithWorktreeList(
			"worktree /path/to/worktree\nHEAD abc123\nbranch refs/heads/test-branch",
			{ isClean: true, unpushedCommitCount: 3 },
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.hasUnpushedCommits).toBe(true);
	});

	it("returns hasUnpushedCommits: false when worktree not found in git", async () => {
		mockSimpleGitWithWorktreeList(
			"worktree /path/to/other-worktree\nHEAD def456\nbranch refs/heads/other-branch",
			{ isClean: true, unpushedCommitCount: 5 },
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain("not found in git");
		// hasUnpushedCommits should be false when worktree doesn't exist
		expect(result.hasUnpushedCommits).toBe(false);
	});

	it("skips git checks when skipGitChecks is true", async () => {
		const mockGit = mockSimpleGitWithWorktreeList(
			"worktree /path/to/worktree\nHEAD abc123\nbranch refs/heads/test-branch",
			{ isClean: false, unpushedCommitCount: 5 },
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});
		const result = await caller.canDelete({
			id: "workspace-1",
			skipGitChecks: true,
		});

		expect(result.canDelete).toBe(true);
		// When skipping git checks, these should be false (defaults)
		expect(result.hasChanges).toBe(false);
		expect(result.hasUnpushedCommits).toBe(false);
		// git.status should not have been called
		expect(mockGit.status).not.toHaveBeenCalled();
	});
});
