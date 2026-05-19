import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

// ──────────────────────────────────────────────────────────────────────────────
// Reproduction test for github.com/superset-sh/superset issue #4521
//
// Bug: the `delete` mutation calls `markWorkspaceAsDeleting` upfront, then
// does work that can throw (`workspaceInitManager.acquireProjectLock`,
// `listExternalWorktrees`, etc.). When such a throw propagates, the
// workspace's `deletingAt` field is left set. Every subsequent call to
// `canDelete` then short-circuits with "Deletion already in progress" —
// blocking the user from ever deleting the workspace until they fully
// restart the app or surgically edit the local sqlite.
//
// This test seeds a workspace, configures `listExternalWorktrees` to throw
// (mimicking a transient git failure mid-delete), and asserts that the
// procedure still clears the `deletingAt` flag before propagating the
// error. The fix wraps the post-mark body in a try/finally that calls
// `clearWorkspaceDeletingStatus` on any unsuccessful exit.
// ──────────────────────────────────────────────────────────────────────────────

const getWorkspaceMock = mock();
const getWorktreeMock = mock();
const getProjectMock = mock();
const markWorkspaceAsDeletingMock = mock(() => undefined);
const clearWorkspaceDeletingStatusMock = mock(() => undefined);
const updateActiveWorkspaceIfRemovedMock = mock(() => undefined);
const deleteWorkspaceMock = mock(() => undefined);
const deleteWorktreeRecordMock = mock(() => undefined);

mock.module("../utils/db-helpers", () => ({
	clearWorkspaceDeletingStatus: clearWorkspaceDeletingStatusMock,
	deleteWorkspace: deleteWorkspaceMock,
	deleteWorktreeRecord: deleteWorktreeRecordMock,
	getProject: getProjectMock,
	getWorkspace: getWorkspaceMock,
	getWorktree: getWorktreeMock,
	markWorkspaceAsDeleting: markWorkspaceAsDeletingMock,
	updateActiveWorkspaceIfRemoved: updateActiveWorkspaceIfRemovedMock,
}));

const listExternalWorktreesMock = mock(async () => [] as unknown[]);
const worktreeExistsMock = mock(async () => true);
const hasUncommittedChangesMock = mock(async () => false);
const hasUnpushedCommitsMock = mock(async () => false);
const deleteLocalBranchMock = mock(async () => undefined);

class NotGitRepoErrorStub extends Error {
	constructor(repoPath: string) {
		super(`Not a git repository: ${repoPath}`);
		this.name = "NotGitRepoError";
	}
}

mock.module("../utils/git", () => ({
	NotGitRepoError: NotGitRepoErrorStub,
	deleteLocalBranch: deleteLocalBranchMock,
	hasUncommittedChanges: hasUncommittedChangesMock,
	hasUnpushedCommits: hasUnpushedCommitsMock,
	listExternalWorktrees: listExternalWorktreesMock,
	worktreeExists: worktreeExistsMock,
}));

const removeWorktreeFromDiskMock = mock(async () => ({
	success: true as const,
}));
const runTeardownMock = mock(async () => ({ success: true as const }));

mock.module("../utils/teardown", () => ({
	removeWorktreeFromDisk: removeWorktreeFromDiskMock,
	runTeardown: runTeardownMock,
}));

mock.module("main/lib/analytics", () => ({
	track: mock(() => undefined),
}));

const localDbMock = {
	select: mock(() => ({
		from: () => ({
			where: () => ({
				all: () => [],
			}),
		}),
	})),
};

mock.module("main/lib/local-db", () => ({
	localDb: localDbMock,
}));

const workspaceInitManagerMock = {
	isInitializing: mock(() => false),
	cancel: mock(() => undefined),
	waitForInit: mock(async () => undefined),
	acquireProjectLock: mock(async () => undefined),
	releaseProjectLock: mock(() => undefined),
	clearJob: mock(() => undefined),
};

mock.module("main/lib/workspace-init-manager", () => ({
	workspaceInitManager: workspaceInitManagerMock,
}));

const killByWorkspaceIdMock = mock(async () => ({ failed: 0 }));
const getWorkspaceRuntimeRegistryMock = mock(() => ({
	getForWorkspaceId: () => ({
		terminal: {
			killByWorkspaceId: killByWorkspaceIdMock,
		},
	}),
}));

mock.module("main/lib/workspace-runtime", () => ({
	getWorkspaceRuntimeRegistry: getWorkspaceRuntimeRegistryMock,
}));

mock.module("@superset/local-db", () => ({
	worktrees: { path: "path", projectId: "projectId" },
}));

mock.module("drizzle-orm", () => ({
	eq: () => null,
}));

mock.module("node:fs", () => ({
	existsSync: () => false,
	realpathSync: (p: string) => p,
}));

const { createDeleteProcedures } = await import("./delete");

const router = createDeleteProcedures();
const caller = router.createCaller({});

const WORKSPACE = {
	id: "ws-1",
	name: "feature-x",
	type: "worktree",
	worktreeId: "wt-1",
	projectId: "proj-1",
	branch: "feature-x",
	deletingAt: null,
};

const WORKTREE = {
	id: "wt-1",
	projectId: "proj-1",
	path: "/tmp/repo/.worktrees/feature-x",
	branch: "feature-x",
};

const PROJECT = {
	id: "proj-1",
	mainRepoPath: "/tmp/repo",
};

describe("delete mutation — stuck-deletion regression (#4521)", () => {
	beforeEach(() => {
		getWorkspaceMock.mockReset();
		getWorktreeMock.mockReset();
		getProjectMock.mockReset();
		markWorkspaceAsDeletingMock.mockClear();
		clearWorkspaceDeletingStatusMock.mockClear();
		updateActiveWorkspaceIfRemovedMock.mockClear();
		deleteWorkspaceMock.mockClear();
		deleteWorktreeRecordMock.mockClear();
		listExternalWorktreesMock.mockReset();
		listExternalWorktreesMock.mockResolvedValue([]);
		removeWorktreeFromDiskMock.mockReset();
		removeWorktreeFromDiskMock.mockResolvedValue({ success: true });
		runTeardownMock.mockReset();
		runTeardownMock.mockResolvedValue({ success: true });
		killByWorkspaceIdMock.mockClear();
		workspaceInitManagerMock.isInitializing.mockReset();
		workspaceInitManagerMock.isInitializing.mockReturnValue(false);
		workspaceInitManagerMock.acquireProjectLock.mockReset();
		workspaceInitManagerMock.acquireProjectLock.mockResolvedValue(undefined);
		workspaceInitManagerMock.releaseProjectLock.mockClear();

		getWorkspaceMock.mockReturnValue(WORKSPACE);
		getWorktreeMock.mockReturnValue(WORKTREE);
		getProjectMock.mockReturnValue(PROJECT);
	});

	it("clears deletingAt when listExternalWorktrees throws mid-delete", async () => {
		listExternalWorktreesMock.mockRejectedValueOnce(
			new Error("fatal: not a git repository"),
		);

		await expect(caller.delete({ id: "ws-1" })).rejects.toThrow(
			"fatal: not a git repository",
		);

		// The bug: deletingAt was set, then the throw propagated without
		// clearing it, leaving the workspace permanently blocked.
		expect(markWorkspaceAsDeletingMock).toHaveBeenCalledWith("ws-1");
		expect(clearWorkspaceDeletingStatusMock).toHaveBeenCalledWith("ws-1");

		// Lock must always be released regardless of whether the body threw.
		expect(workspaceInitManagerMock.releaseProjectLock).toHaveBeenCalledWith(
			"proj-1",
		);
	});

	it("clears deletingAt when acquireProjectLock throws", async () => {
		workspaceInitManagerMock.acquireProjectLock.mockRejectedValueOnce(
			new Error("project locked by another operation"),
		);

		await expect(caller.delete({ id: "ws-1" })).rejects.toThrow(
			"project locked by another operation",
		);

		expect(markWorkspaceAsDeletingMock).toHaveBeenCalledWith("ws-1");
		expect(clearWorkspaceDeletingStatusMock).toHaveBeenCalledWith("ws-1");
	});

	it("does not leak deletingAt on the happy path either", async () => {
		listExternalWorktreesMock.mockResolvedValue([]);
		removeWorktreeFromDiskMock.mockResolvedValue({ success: true });

		const result = await caller.delete({ id: "ws-1" });
		expect(result.success).toBe(true);

		// Happy path deletes the row entirely, so a redundant
		// clearWorkspaceDeletingStatus call isn't required — but if the new
		// try/finally is added, it must not double-clear after deletion.
		expect(deleteWorkspaceMock).toHaveBeenCalledWith("ws-1");
		expect(deleteWorktreeRecordMock).toHaveBeenCalledWith("wt-1");
	});
});

afterAll(() => {
	mock.restore();
});
