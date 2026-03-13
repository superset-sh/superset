import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Reproduction test for GitHub issue #2422:
 * "Run in workspace can create a new workspace from a stale branch base
 *  instead of the latest upstream default branch"
 *
 * Bug: When `fetchDefaultBranch` fails but `origin/<baseBranch>` already exists
 * locally (from a previous fetch), the error is silently swallowed.  The
 * workspace is created from the stale local tracking ref with **no warning**
 * shown to the user.
 */

// ---------------------------------------------------------------------------
// Mocks – we stub every external dependency of `initializeWorkspaceWorktree`
// so the unit test runs without git, a database, or Electron.
// ---------------------------------------------------------------------------

const progressUpdates: Array<{
	workspaceId: string;
	step: string;
	message: string;
	error?: string;
	warning?: string;
}> = [];

const mockManager = {
	acquireProjectLock: mock(async () => {}),
	releaseProjectLock: mock(() => {}),
	isCancellationRequested: mock(() => false),
	updateProgress: mock(
		(
			workspaceId: string,
			step: string,
			message: string,
			error?: string,
			warning?: string,
		) => {
			progressUpdates.push({ workspaceId, step, message, error, warning });
		},
	),
	markWorktreeCreated: mock(() => {}),
	wasWorktreeCreated: mock(() => false),
	finalizeJob: mock(() => {}),
	startJob: mock(() => {}),
};

mock.module("main/lib/workspace-init-manager", () => ({
	workspaceInitManager: mockManager,
}));

mock.module("main/lib/analytics", () => ({
	track: mock(() => {}),
}));

const mockLocalDb = {
	select: mock(() => mockLocalDb),
	from: mock(() => mockLocalDb),
	where: mock(() => mockLocalDb),
	get: mock(() => ({
		id: "project-1",
		mainRepoPath: "/fake/repo",
		defaultBranch: "main",
		workspaceBaseBranch: null,
	})),
	update: mock(() => mockLocalDb),
	set: mock(() => mockLocalDb),
	run: mock(() => {}),
};

mock.module("main/lib/local-db", () => ({
	localDb: mockLocalDb,
}));

mock.module("@superset/local-db", () => ({
	projects: {},
	worktrees: {},
}));

mock.module("drizzle-orm", () => ({
	eq: mock(() => {}),
}));

// Track which git functions were called and with what args
const gitMocks = {
	refreshDefaultBranch: mock(async () => "main"),
	hasOriginRemote: mock(async () => true),
	branchExistsOnRemote: mock(async () => ({ status: "exists" as const })),
	fetchDefaultBranch: mock(async () => "abc123"),
	refExistsLocally: mock(async () => true),
	createWorktree: mock(async () => {}),
	createWorktreeFromExistingBranch: mock(async () => {}),
	removeWorktree: mock(async () => {}),
	sanitizeGitError: mock((msg: string) => msg),
};

mock.module("./git", () => gitMocks);

mock.module("./base-branch", () => ({
	resolveWorkspaceBaseBranch: mock(() => "main"),
}));

mock.module("./base-branch-config", () => ({
	getBranchBaseConfig: mock(async () => ({
		baseBranch: "main",
		isExplicit: false,
	})),
	setBranchBaseConfig: mock(async () => {}),
}));

mock.module("./setup", () => ({
	copySupersetConfigToWorktree: mock(() => {}),
}));

mock.module("./ai-name", () => ({
	attemptWorkspaceAutoRenameFromPrompt: mock(async () => ({})),
}));

// Import AFTER mocks are registered
const { initializeWorkspaceWorktree } = await import("./workspace-init");

const baseParams = {
	workspaceId: "ws-1",
	projectId: "project-1",
	worktreeId: "wt-1",
	worktreePath: "/fake/repo/.worktrees/my-branch",
	branch: "my-branch",
	mainRepoPath: "/fake/repo",
};

beforeEach(() => {
	progressUpdates.length = 0;
	mockManager.updateProgress.mockClear();
	mockManager.isCancellationRequested.mockReturnValue(false);

	// Reset git mocks to defaults
	gitMocks.refreshDefaultBranch.mockImplementation(async () => "main");
	gitMocks.hasOriginRemote.mockImplementation(async () => true);
	gitMocks.branchExistsOnRemote.mockImplementation(async () => ({
		status: "exists" as const,
	}));
	gitMocks.fetchDefaultBranch.mockImplementation(async () => "abc123");
	gitMocks.refExistsLocally.mockImplementation(async () => true);
	gitMocks.createWorktree.mockImplementation(async () => {});
});

describe("initializeWorkspaceWorktree", () => {
	describe("issue #2422 – stale branch base when fetch fails silently", () => {
		test("should warn user when fetch fails but stale local ref exists", async () => {
			// Simulate: fetchDefaultBranch throws (e.g., network error),
			// but origin/main exists locally from a previous fetch
			gitMocks.fetchDefaultBranch.mockImplementation(async () => {
				throw new Error("Could not resolve host: github.com");
			});
			gitMocks.refExistsLocally.mockImplementation(async () => true);

			await initializeWorkspaceWorktree(baseParams);

			// The workspace should still be created (graceful degradation)
			expect(gitMocks.createWorktree).toHaveBeenCalled();

			// But a warning/error should have been surfaced during the "fetching" step
			const fetchingUpdates = progressUpdates.filter(
				(u) => u.step === "fetching",
			);

			// There should be at least one progress update during the fetching phase
			// that mentions the fetch failure – the user must not be left in the dark.
			const hasStaleWarning = fetchingUpdates.some(
				(u) =>
					(u.error && u.error.length > 0) ||
					(u.warning && u.warning.length > 0),
			);

			expect(hasStaleWarning).toBe(true);
		});

		test("happy path: no warning when fetch succeeds", async () => {
			// Normal case: fetch works fine
			gitMocks.fetchDefaultBranch.mockImplementation(async () => "abc123");

			await initializeWorkspaceWorktree(baseParams);

			expect(gitMocks.createWorktree).toHaveBeenCalled();

			// No error/warning should appear during fetching
			const fetchingUpdates = progressUpdates.filter(
				(u) => u.step === "fetching",
			);
			const hasWarning = fetchingUpdates.some(
				(u) =>
					(u.error && u.error.length > 0) ||
					(u.warning && u.warning.length > 0),
			);
			expect(hasWarning).toBe(false);
		});
	});
});
