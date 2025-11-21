import { describe, expect, it, mock } from "bun:test";
import { createWorkspacesRouter } from "./workspaces";
import * as gitUtils from "./utils/git";

// Mock the git utilities
mock.module("./utils/git", () => ({
	createWorktree: mock(() => Promise.resolve()),
	removeWorktree: mock(() => Promise.resolve()),
	generateBranchName: mock(() => "test-branch-123"),
}));

// Mock the database
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

describe("workspaces router - delete", () => {
	it("should successfully delete workspace and remove worktree", async () => {
		const router = createWorkspacesRouter();

		// Mock removeWorktree to succeed
		const removeWorktreeMock = mock(() => Promise.resolve());
		mock.module("./utils/git", () => ({
			...gitUtils,
			removeWorktree: removeWorktreeMock,
		}));

		const caller = router.createCaller({ db: mockDb as any });

		const result = await caller.delete({ id: "workspace-1" });

		expect(result.success).toBe(true);
		expect(removeWorktreeMock).toHaveBeenCalledWith(
			"/path/to/repo",
			"/path/to/worktree",
		);
		expect(mockDb.data.workspaces).toHaveLength(0);
		expect(mockDb.data.worktrees).toHaveLength(0);
	});

	it("should fail deletion if worktree removal fails", async () => {
		// Reset mock data
		mockDb.data.workspaces = [
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
		];
		mockDb.data.worktrees = [
			{
				id: "worktree-1",
				projectId: "project-1",
				path: "/path/to/worktree",
				branch: "test-branch",
				createdAt: Date.now(),
			},
		];

		const router = createWorkspacesRouter();

		// Mock removeWorktree to fail
		const removeWorktreeMock = mock(() =>
			Promise.reject(new Error("Failed to remove worktree")),
		);
		mock.module("./utils/git", () => ({
			...gitUtils,
			removeWorktree: removeWorktreeMock,
		}));

		const caller = router.createCaller({ db: mockDb as any });

		const result = await caller.delete({ id: "workspace-1" });

		expect(result.success).toBe(false);
		expect(result.error).toContain("Failed to remove worktree");
		// Workspace should NOT be removed from DB if worktree removal fails
		expect(mockDb.data.workspaces).toHaveLength(1);
		expect(mockDb.data.worktrees).toHaveLength(1);
	});
});

describe("workspaces router - canDelete", () => {
	it("should return true when worktree can be deleted", async () => {
		const router = createWorkspacesRouter();

		// Mock git to return worktree list
		const mockGit = {
			raw: mock(() =>
				Promise.resolve("/path/to/worktree\n/path/to/other-worktree"),
			),
		};
		const mockSimpleGit = mock(() => mockGit);
		mock.module("simple-git", () => ({
			default: mockSimpleGit,
		}));

		const caller = router.createCaller({ db: mockDb as any });

		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.reason).toBeNull();
		expect(result.warning).toBeNull();
	});

	it("should return warning when worktree doesn't exist in git", async () => {
		const router = createWorkspacesRouter();

		// Mock git to return worktree list without our worktree
		const mockGit = {
			raw: mock(() => Promise.resolve("/path/to/other-worktree")),
		};
		const mockSimpleGit = mock(() => mockGit);
		mock.module("simple-git", () => ({
			default: mockSimpleGit,
		}));

		const caller = router.createCaller({ db: mockDb as any });

		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain("not found in git");
	});

	it("should return false when git check fails", async () => {
		const router = createWorkspacesRouter();

		// Mock git to throw error
		const mockGit = {
			raw: mock(() => Promise.reject(new Error("Git error"))),
		};
		const mockSimpleGit = mock(() => mockGit);
		mock.module("simple-git", () => ({
			default: mockSimpleGit,
		}));

		const caller = router.createCaller({ db: mockDb as any });

		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(false);
		expect(result.reason).toContain("Failed to check worktree status");
	});
});
