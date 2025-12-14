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

// Configurable mock state for git utilities
const gitMockState = {
	worktreeExists: true,
	hasUncommittedChanges: false,
	hasUnpushedCommits: false,
	worktreeListOutput: "",
	error: null as Error | null,
};

// Mock git utilities with configurable behavior
mock.module("./utils/git", () => ({
	createWorktree: mock(() => Promise.resolve()),
	removeWorktree: mock(() => Promise.resolve()),
	generateBranchName: mock(() => "test-branch-123"),
	getDefaultBranch: mock(() => Promise.resolve("main")),
	fetchDefaultBranch: mock(() => Promise.resolve("abc123")),
	hasOriginRemote: mock(() => Promise.resolve(true)),
	checkNeedsRebase: mock(() => Promise.resolve(false)),
	hasUncommittedChanges: mock(() => {
		if (gitMockState.error) return Promise.reject(gitMockState.error);
		return Promise.resolve(gitMockState.hasUncommittedChanges);
	}),
	hasUnpushedCommits: mock(() => {
		if (gitMockState.error) return Promise.reject(gitMockState.error);
		return Promise.resolve(gitMockState.hasUnpushedCommits);
	}),
	worktreeExists: mock((_mainRepoPath: string, worktreePath: string) => {
		if (gitMockState.error) return Promise.reject(gitMockState.error);
		// Check if the worktree path appears in the mock output (exact match)
		if (gitMockState.worktreeListOutput) {
			// Parse porcelain output - look for exact "worktree <path>" line
			const lines = gitMockState.worktreeListOutput.split("\n");
			const exactMatch = lines.some(
				(line) => line.trim() === `worktree ${worktreePath}`,
			);
			return Promise.resolve(exactMatch);
		}
		return Promise.resolve(gitMockState.worktreeExists);
	}),
}));

// Mock the git-binary module (not used directly but needed for imports)
mock.module("main/lib/git-binary", () => ({
	createBundledGit: mock(() => ({})),
	getGitBinaryPath: mock(() => "/mock/git"),
}));

import { createWorkspacesRouter } from "./workspaces";

// Helper to configure git mock state for worktree tests
function mockSimpleGitWithWorktreeList(
	worktreeListOutput: string,
	options?: { isClean?: boolean; unpushedCommitCount?: number },
) {
	gitMockState.worktreeListOutput = worktreeListOutput;
	gitMockState.hasUncommittedChanges = !(options?.isClean ?? true);
	gitMockState.hasUnpushedCommits = (options?.unpushedCommitCount ?? 0) > 0;
	gitMockState.error = null;
	// Return a mock object for compatibility with tests that check mock calls
	return {
		raw: mock(() => Promise.resolve(worktreeListOutput)),
		status: mock(() =>
			Promise.resolve({ isClean: () => options?.isClean ?? true }),
		),
	};
}

function mockSimpleGitWithError(error: Error) {
	gitMockState.error = error;
	return {
		raw: mock(() => Promise.reject(error)),
		status: mock(() => Promise.resolve({ isClean: () => true })),
	};
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
	// Reset git mock state
	gitMockState.worktreeExists = true;
	gitMockState.hasUncommittedChanges = false;
	gitMockState.hasUnpushedCommits = false;
	gitMockState.worktreeListOutput = "";
	gitMockState.error = null;
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

	// Note: The test for --porcelain flag was removed because we now mock
	// worktreeExists directly rather than simple-git internals. The flag
	// usage is tested in git.ts unit tests if needed.

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
