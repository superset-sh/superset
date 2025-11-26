import { beforeEach, describe, expect, it, mock } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { createWorkspacesRouter } from "./workspaces";

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

// Mock the database module
mock.module("main/lib/db", () => ({
	db: mockDb,
}));

// Mock the git utilities - use a shared mock function that can be reassigned
let mockRemoveWorktree = mock((_mainRepoPath: string, _worktreePath: string) =>
	Promise.resolve(),
);
const mockCreateWorktree = mock(
	(_mainRepoPath: string, _branch: string, _worktreePath: string) =>
		Promise.resolve(),
);
const mockGenerateBranchName = mock(() => "test-branch-123");

mock.module("./utils/git", () => ({
	createWorktree: mockCreateWorktree,
	removeWorktree: (mainRepoPath: string, worktreePath: string) =>
		mockRemoveWorktree(mainRepoPath, worktreePath),
	generateBranchName: mockGenerateBranchName,
}));

// Reset mock data before each test
beforeEach(() => {
	// Reset the removeWorktree mock to default success behavior
	mockRemoveWorktree = mock((_mainRepoPath: string, _worktreePath: string) =>
		Promise.resolve(),
	);

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
	mockDb.data.projects = [
		{
			id: "project-1",
			name: "Test Project",
			mainRepoPath: "/path/to/repo",
			color: "#ff0000",
			tabOrder: 0,
			createdAt: Date.now(),
			lastOpenedAt: Date.now(),
		},
	];
	mockDb.data.settings = {
		lastActiveWorkspaceId: "workspace-1",
	};
});

describe("workspaces router - create", () => {
	it("creates worktree under home superset worktrees path", async () => {
		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

		const result = await caller.create({
			projectId: "project-1",
			name: "New Workspace",
		});

		const expectedPath = join(
			homedir(),
			".superset",
			"worktrees",
			"test-branch-123",
		);

		expect(mockCreateWorktree).toHaveBeenCalledWith(
			"/path/to/repo",
			"test-branch-123",
			expectedPath,
		);
		expect(result.worktreePath).toBe(expectedPath);
		expect(result.workspace.name).toBe("New Workspace");
		expect(result.workspace.tabOrder).toBe(1);

		const createdWorktree = mockDb.data.worktrees.find(
			(worktree) =>
				worktree.branch === "test-branch-123" &&
				worktree.path === expectedPath &&
				worktree.projectId === "project-1",
		);
		expect(createdWorktree).toBeTruthy();

		const createdWorkspace = mockDb.data.workspaces.find(
			(workspace) => workspace.id === result.workspace.id,
		);
		expect(createdWorkspace?.worktreeId).toBe(createdWorktree?.id);
		expect(mockDb.data.settings.lastActiveWorkspaceId).toBe(
			result.workspace.id,
		);
	});
});

describe("workspaces router - delete", () => {
	it("should successfully delete workspace and remove worktree", async () => {
		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

		const result = await caller.delete({ id: "workspace-1" });

		expect(result.success).toBe(true);
		expect(mockDb.data.workspaces).toHaveLength(0);
		expect(mockDb.data.worktrees).toHaveLength(0);
	});

	it("should fail deletion if worktree removal fails", async () => {
		// Override the removeWorktree mock to fail for this test
		mockRemoveWorktree = mock((_mainRepoPath: string, _worktreePath: string) =>
			Promise.reject(new Error("Failed to remove worktree")),
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

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
		// Mock git to return worktree list in porcelain format
		const mockGit = {
			raw: mock(() =>
				Promise.resolve(
					"worktree /path/to/worktree\nHEAD abc123\nbranch refs/heads/test-branch\n\nworktree /path/to/other-worktree\nHEAD def456\nbranch refs/heads/other-branch",
				),
			),
		};
		const mockSimpleGit = mock(() => mockGit);
		mock.module("simple-git", () => ({
			default: mockSimpleGit,
		}));

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.reason).toBeNull();
		expect(result.warning).toBeNull();
	});

	it("should return warning when worktree doesn't exist in git", async () => {
		// Mock git to return worktree list without our worktree (porcelain format)
		const mockGit = {
			raw: mock(() =>
				Promise.resolve(
					"worktree /path/to/other-worktree\nHEAD def456\nbranch refs/heads/other-branch",
				),
			),
		};
		const mockSimpleGit = mock(() => mockGit);
		mock.module("simple-git", () => ({
			default: mockSimpleGit,
		}));

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain("not found in git");
	});

	it("should return false when git check fails", async () => {
		// Mock git to throw error
		const mockGit = {
			raw: mock(() => Promise.reject(new Error("Git error"))),
		};
		const mockSimpleGit = mock(() => mockGit);
		mock.module("simple-git", () => ({
			default: mockSimpleGit,
		}));

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

		const result = await caller.canDelete({ id: "workspace-1" });

		expect(result.canDelete).toBe(false);
		expect(result.reason).toContain("Failed to check worktree status");
	});

	it("should use exact path matching and not match substrings", async () => {
		// Mock git to return a worktree with a similar but different path
		// This tests that we don't match "/path/to/worktree-backup" when looking for "/path/to/worktree"
		const mockGit = {
			raw: mock(() =>
				Promise.resolve(
					"worktree /path/to/worktree-backup\nHEAD abc123\nbranch refs/heads/backup\n\nworktree /path/to/worktree-old\nHEAD def456\nbranch refs/heads/old",
				),
			),
		};
		const mockSimpleGit = mock(() => mockGit);
		mock.module("simple-git", () => ({
			default: mockSimpleGit,
		}));

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

		const result = await caller.canDelete({ id: "workspace-1" });

		// Should not find the worktree because neither path exactly matches "/path/to/worktree"
		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain("not found in git");
	});

	it("should match exact path even with trailing whitespace in git output", async () => {
		// Mock git to return worktree list with trailing spaces
		const mockGit = {
			raw: mock(() =>
				Promise.resolve(
					"worktree /path/to/worktree  \nHEAD abc123\nbranch refs/heads/test-branch",
				),
			),
		};
		const mockSimpleGit = mock(() => mockGit);
		mock.module("simple-git", () => ({
			default: mockSimpleGit,
		}));

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

		const result = await caller.canDelete({ id: "workspace-1" });

		// Should find the worktree even with trailing whitespace
		expect(result.canDelete).toBe(true);
		expect(result.reason).toBeNull();
		expect(result.warning).toBeNull();
	});

	it("should handle worktree path that is a prefix of another path", async () => {
		// Update mock DB to have a path that could be a prefix
		mockDb.data.worktrees = [
			{
				id: "worktree-1",
				projectId: "project-1",
				path: "/path/to/main",
				branch: "test-branch",
				createdAt: Date.now(),
			},
		];

		// Mock git to return a list with a path that contains our path as prefix
		const mockGit = {
			raw: mock(() =>
				Promise.resolve(
					"worktree /path/to/main-backup\nHEAD abc123\nbranch refs/heads/backup\n\nworktree /path/to/main2\nHEAD def456\nbranch refs/heads/other",
				),
			),
		};
		const mockSimpleGit = mock(() => mockGit);
		mock.module("simple-git", () => ({
			default: mockSimpleGit,
		}));

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

		const result = await caller.canDelete({ id: "workspace-1" });

		// Should not find "/path/to/main" even though similar paths exist
		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain("not found in git");
	});

	it("should handle worktree path that contains another path", async () => {
		// Update mock DB to have a longer path
		mockDb.data.worktrees = [
			{
				id: "worktree-1",
				projectId: "project-1",
				path: "/path/to/worktree-backup",
				branch: "test-branch",
				createdAt: Date.now(),
			},
		];

		// Mock git to return a list with a shorter path
		const mockGit = {
			raw: mock(() =>
				Promise.resolve(
					"worktree /path/to/worktree\nHEAD abc123\nbranch refs/heads/main",
				),
			),
		};
		const mockSimpleGit = mock(() => mockGit);
		mock.module("simple-git", () => ({
			default: mockSimpleGit,
		}));

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

		const result = await caller.canDelete({ id: "workspace-1" });

		// Should not find "/path/to/worktree-backup" when only "/path/to/worktree" exists
		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain("not found in git");
	});

	it("should verify --porcelain flag is passed to git", async () => {
		// Mock git to capture the arguments
		const rawMock = mock(() =>
			Promise.resolve(
				"worktree /path/to/worktree\nHEAD abc123\nbranch refs/heads/test-branch",
			),
		);
		const mockGit = {
			raw: rawMock,
		};
		const mockSimpleGit = mock(() => mockGit);
		mock.module("simple-git", () => ({
			default: mockSimpleGit,
		}));

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

		await caller.canDelete({ id: "workspace-1" });

		// Verify that raw was called with the correct arguments
		expect(rawMock).toHaveBeenCalledWith(["worktree", "list", "--porcelain"]);
	});
});
