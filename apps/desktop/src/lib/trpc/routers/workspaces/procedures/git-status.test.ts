import { describe, expect, mock, test } from "bun:test";

/**
 * Tests for getGitHubStatus procedure logic.
 *
 * Reproduces #2592: branch workspaces (no worktreeId) returned null
 * from getGitHubStatus because the procedure required a worktree record.
 */

const mockGetWorkspace = mock();
const mockGetWorktree = mock();
const mockGetProject = mock();
const mockGetWorkspacePath = mock();
const mockFetchGitHubPRStatus = mock();
const mockFetchGitHubPRComments = mock();
const mockUpdateProjectDefaultBranch = mock();
const mockLocalDb = {
	update: mock(() => ({
		set: mock(() => ({
			where: mock(() => ({
				run: mock(),
			})),
		})),
	})),
	select: mock(() => ({
		from: mock(() => ({
			where: mock(() => ({
				all: mock(() => []),
				get: mock(() => undefined),
			})),
		})),
	})),
};

// Mock @superset/local-db
mock.module("@superset/local-db", () => ({
	workspaces: { id: "id" },
	worktrees: { id: "id", projectId: "project_id" },
}));

mock.module("drizzle-orm", () => ({
	eq: mock(() => "eq"),
	and: mock((...args: unknown[]) => args),
	isNull: mock(() => "isNull"),
}));

mock.module("../utils/db-helpers", () => ({
	getWorkspace: mockGetWorkspace,
	getWorktree: mockGetWorktree,
	getProject: mockGetProject,
	updateProjectDefaultBranch: mockUpdateProjectDefaultBranch,
}));

mock.module("../utils/worktree", () => ({
	getWorkspacePath: mockGetWorkspacePath,
}));

mock.module("../utils/github", () => ({
	fetchGitHubPRComments: mockFetchGitHubPRComments,
	fetchGitHubPRStatus: mockFetchGitHubPRStatus,
	clearGitHubCachesForWorktree: mock(),
	resolveReviewThread: mock(),
}));

mock.module("main/lib/local-db", () => ({
	localDb: mockLocalDb,
}));

mock.module("../../..", () => ({
	publicProcedure: {
		input: () => ({
			query: (fn: unknown) => fn,
			mutation: (fn: unknown) => fn,
		}),
	},
	router: (routes: Record<string, unknown>) => routes,
}));

mock.module("../utils/git", () => ({
	branchExistsOnRemote: mock(() => ({ status: "missing" })),
	fetchDefaultBranch: mock(),
	getAheadBehindCount: mock(() => ({ ahead: 0, behind: 0 })),
	getDefaultBranch: mock(() => "main"),
	listExternalWorktrees: mock(() => []),
	refreshDefaultBranch: mock(() => "main"),
}));

mock.module("node:fs", () => ({
	existsSync: mock(() => true),
}));

const { createGitStatusProcedures } = await import("./git-status");

const procedures = createGitStatusProcedures() as unknown as Record<
	string,
	(opts: { input: Record<string, unknown> }) => Promise<unknown>
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
			branch: "feature/branch-workspace",
			name: "Feature Branch",
		};

		mockFetchGitHubPRStatus.mockClear();
		mockGetWorktree.mockClear();
		mockGetWorkspace.mockReturnValue(branchWorkspace);
		mockGetWorkspacePath.mockReturnValue("/repos/my-project");
		mockFetchGitHubPRStatus.mockResolvedValue(fakeGitHubStatus);

		const result = await procedures.getGitHubStatus({
			input: { workspaceId: "ws-branch-1" },
		});

		expect(result).not.toBeNull();
		expect(mockGetWorkspacePath).toHaveBeenCalledWith(branchWorkspace);
		expect(mockFetchGitHubPRStatus).toHaveBeenCalledWith(
			"/repos/my-project",
			"feature/branch-workspace",
		);
		expect(mockGetWorktree).not.toHaveBeenCalled();
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

		mockFetchGitHubPRStatus.mockClear();
		mockGetWorkspace.mockReturnValue(worktreeWorkspace);
		mockGetWorktree.mockReturnValue({
			id: "wt-1",
			path: "/repos/my-project/.worktrees/feature-foo",
			branch: "feature/foo",
			githubStatus: null,
		});
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
			null,
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

	test("does not cache to worktrees table for branch workspaces", async () => {
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

		expect(mockLocalDb.update).not.toHaveBeenCalled();
	});
});

describe("getWorktreeInfo", () => {
	test("returns info for branch workspaces", async () => {
		const branchWorkspace = {
			id: "ws-branch-3",
			projectId: "proj-1",
			worktreeId: null,
			type: "branch" as const,
			branch: "feature/my-branch",
			name: "My Branch Workspace",
			createdAt: 1234567890,
		};

		mockGetWorkspace.mockReturnValue(branchWorkspace);

		const result = await procedures.getWorktreeInfo({
			input: { workspaceId: "ws-branch-3" },
		});

		expect(result).toEqual({
			worktreeName: "My Branch Workspace",
			branchName: "feature/my-branch",
			createdAt: 1234567890,
			gitStatus: null,
			githubStatus: null,
		});
	});
});
