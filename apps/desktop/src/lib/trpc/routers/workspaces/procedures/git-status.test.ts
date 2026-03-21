import { describe, expect, mock, test } from "bun:test";

/**
 * Tests for getGitHubStatus procedure logic.
 *
 * Reproduces #2592: branch workspaces (no worktreeId) returned null
 * from getGitHubStatus because the procedure required a worktree record.
 */

// Mock modules before importing the procedure
const mockGetWorkspace = mock();
const mockGetWorktree = mock();
const mockGetWorkspacePath = mock();
const mockFetchGitHubPRStatus = mock();
const mockLocalDb = {
	update: mock(() => ({
		set: mock(() => ({
			where: mock(() => ({
				run: mock(),
			})),
		})),
	})),
};

mock.module("../utils/db-helpers", () => ({
	getWorkspace: mockGetWorkspace,
	getWorktree: mockGetWorktree,
	getProject: mock(),
	updateProjectDefaultBranch: mock(),
}));

mock.module("../utils/worktree", () => ({
	getWorkspacePath: mockGetWorkspacePath,
}));

mock.module("../utils/github", () => ({
	fetchGitHubPRStatus: mockFetchGitHubPRStatus,
}));

mock.module("main/lib/local-db", () => ({
	localDb: mockLocalDb,
}));

// Stub out tRPC router creation so we can test the handler logic directly
mock.module("../../..", () => ({
	publicProcedure: {
		input: () => ({
			query: (fn: unknown) => fn,
			mutation: (fn: unknown) => fn,
		}),
	},
	router: (routes: Record<string, unknown>) => routes,
}));

// Also stub the git utils used by refreshGitStatus
mock.module("../utils/git", () => ({
	fetchDefaultBranch: mock(),
	getAheadBehindCount: mock(() => ({ ahead: 0, behind: 0 })),
	getDefaultBranch: mock(() => "main"),
	listExternalWorktrees: mock(() => []),
	refreshDefaultBranch: mock(() => "main"),
}));

const { createGitStatusProcedures } = await import("./git-status");

const procedures = createGitStatusProcedures() as Record<
	string,
	(opts: { input: { workspaceId: string } }) => Promise<unknown>
>;

const fakeGitHubStatus = {
	pr: { number: 42, title: "Test PR", url: "https://github.com/test/pr/42" },
	repoUrl: "https://github.com/test/repo",
	upstreamUrl: "https://github.com/test/repo",
	isFork: false,
	branchExistsOnRemote: true,
	previewUrl: undefined,
	lastRefreshed: Date.now(),
};

describe("getGitHubStatus", () => {
	test("returns GitHub status for branch workspaces (no worktreeId)", async () => {
		const branchWorkspace = {
			id: "ws-branch-1",
			projectId: "proj-1",
			worktreeId: null,
			type: "branch" as const,
			branch: "main",
			name: "Main Branch",
		};

		mockGetWorkspace.mockReturnValue(branchWorkspace);
		mockGetWorkspacePath.mockReturnValue("/repos/my-project");
		mockFetchGitHubPRStatus.mockResolvedValue(fakeGitHubStatus);

		const result = await procedures.getGitHubStatus({
			input: { workspaceId: "ws-branch-1" },
		});

		expect(result).not.toBeNull();
		expect(mockGetWorkspacePath).toHaveBeenCalledWith(branchWorkspace);
		expect(mockFetchGitHubPRStatus).toHaveBeenCalledWith("/repos/my-project");
	});

	test("returns GitHub status for worktree workspaces", async () => {
		const worktreeWorkspace = {
			id: "ws-wt-1",
			projectId: "proj-1",
			worktreeId: "wt-1",
			type: "worktree" as const,
			branch: "feature/foo",
			name: "Feature Foo",
		};

		mockGetWorkspace.mockReturnValue(worktreeWorkspace);
		mockGetWorkspacePath.mockReturnValue(
			"/repos/my-project/.worktrees/feature-foo",
		);
		mockFetchGitHubPRStatus.mockResolvedValue(fakeGitHubStatus);

		const result = await procedures.getGitHubStatus({
			input: { workspaceId: "ws-wt-1" },
		});

		expect(result).not.toBeNull();
		expect(mockFetchGitHubPRStatus).toHaveBeenCalledWith(
			"/repos/my-project/.worktrees/feature-foo",
		);
	});

	test("returns null when workspace not found", async () => {
		mockGetWorkspace.mockReturnValue(undefined);

		const result = await procedures.getGitHubStatus({
			input: { workspaceId: "nonexistent" },
		});

		expect(result).toBeNull();
	});

	test("returns null when workspace path cannot be resolved", async () => {
		mockGetWorkspace.mockReturnValue({
			id: "ws-1",
			projectId: "proj-1",
			worktreeId: null,
			type: "branch",
		});
		mockGetWorkspacePath.mockReturnValue(null);

		const result = await procedures.getGitHubStatus({
			input: { workspaceId: "ws-1" },
		});

		expect(result).toBeNull();
	});

	test("caches status in worktree record only when worktreeId exists", async () => {
		// For branch workspace (no worktreeId), should NOT try to update worktrees table
		const branchWorkspace = {
			id: "ws-branch-2",
			projectId: "proj-1",
			worktreeId: null,
			type: "branch" as const,
			branch: "main",
		};

		mockGetWorkspace.mockReturnValue(branchWorkspace);
		mockGetWorkspacePath.mockReturnValue("/repos/my-project");
		mockFetchGitHubPRStatus.mockResolvedValue(fakeGitHubStatus);
		mockLocalDb.update.mockClear();

		await procedures.getGitHubStatus({
			input: { workspaceId: "ws-branch-2" },
		});

		// Should not attempt to update worktrees table for branch workspaces
		expect(mockLocalDb.update).not.toHaveBeenCalled();
	});
});
