import { beforeEach, describe, expect, it, mock } from "bun:test";
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
				activeTabId: undefined,
				isActive: true,
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
		tabs: [],
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
const mockCreateWorktree = mock(() => Promise.resolve());
const mockGenerateBranchName = mock(() => "test-branch-123");

mock.module("./utils/git", () => ({
	createWorktree: mockCreateWorktree,
	removeWorktree: (mainRepoPath: string, worktreePath: string) =>
		mockRemoveWorktree(mainRepoPath, worktreePath),
	generateBranchName: mockGenerateBranchName,
}));

// Mock the terminal manager
mock.module("main/lib/terminal-manager", () => ({
	terminalManager: {
		kill: mock(() => {}),
	},
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
			activeTabId: undefined,
			isActive: true,
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
	mockDb.data.tabs = [];
	mockDb.data.settings = {
		lastActiveWorkspaceId: "workspace-1",
	};
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

	it("should still delete workspace from DB even if worktree removal fails", async () => {
		// Override the removeWorktree mock to fail for this test
		mockRemoveWorktree = mock((_mainRepoPath: string, _worktreePath: string) =>
			Promise.reject(new Error("Failed to remove worktree")),
		);

		const router = createWorkspacesRouter();
		const caller = router.createCaller({});

		const result = await caller.delete({ id: "workspace-1" });

		// Should succeed with a warning
		expect(result.success).toBe(true);
		expect(result.warning).toContain("couldn't remove git worktree");
		// Workspace SHOULD be removed from DB even if worktree removal fails
		expect(mockDb.data.workspaces).toHaveLength(0);
		expect(mockDb.data.worktrees).toHaveLength(0);
	});
});
