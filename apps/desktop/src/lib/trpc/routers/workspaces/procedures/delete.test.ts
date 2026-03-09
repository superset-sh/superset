import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { TRPCError } from "@trpc/server";

import {
	__testOnlyDeleteProcedureDeps,
	createDeleteProcedures,
} from "./delete";

interface MockWorkspace {
	id: string;
	projectId: string;
	worktreeId: string | null;
	type: "worktree" | "branch";
	name: string;
	branch: string;
	deletingAt: number | null;
}

interface MockWorktree {
	id: string;
	projectId: string;
	path: string;
	branch: string;
}

interface MockProject {
	id: string;
	mainRepoPath: string;
}

type MockTrackedWorktreePathResult =
	| {
			status: "resolved";
			path: string;
	  }
	| {
			status: "git_repair_required";
			branch: string;
			mainRepoPath: string;
			registeredPath: string;
			storedPath: string;
	  }
	| {
			status: "missing";
	  };

let workspaces: Map<string, MockWorkspace>;
let worktrees: Map<string, MockWorktree>;
let projects: Map<string, MockProject>;

const originalDeps = {
	...__testOnlyDeleteProcedureDeps,
};
const originalWorkspaceInitManagerMethods = {
	acquireProjectLock:
		__testOnlyDeleteProcedureDeps.workspaceInitManager.acquireProjectLock,
	cancel: __testOnlyDeleteProcedureDeps.workspaceInitManager.cancel,
	clearJob: __testOnlyDeleteProcedureDeps.workspaceInitManager.clearJob,
	isInitializing:
		__testOnlyDeleteProcedureDeps.workspaceInitManager.isInitializing,
	releaseProjectLock:
		__testOnlyDeleteProcedureDeps.workspaceInitManager.releaseProjectLock,
	waitForInit: __testOnlyDeleteProcedureDeps.workspaceInitManager.waitForInit,
};

const hideProjectIfNoWorkspacesMock = mock(() => {});
const updateActiveWorkspaceIfRemovedMock = mock(() => {});
const killByWorkspaceIdMock = mock(async () => ({ failed: 0 }));
const getSessionCountByWorkspaceIdMock = mock(async () => 0);
const isInitializingMock = mock(() => false);
const cancelInitMock = mock(() => {});
const waitForInitMock = mock(async () => {});
const acquireProjectLockMock = mock(async () => {});
const releaseProjectLockMock = mock(() => {});
const clearJobMock = mock(() => {});
const trackMock = mock(() => {});
const hasUncommittedChangesMock = mock(async () => false);
const hasUnpushedCommitsMock = mock(async () => false);
const worktreeExistsMock = mock(async () => true);
const deleteLocalBranchMock = mock(async () => {});
const resolveTrackedWorktreePathMock =
	mock<(worktreeId: string) => Promise<MockTrackedWorktreePathResult>>();
const runTeardownMock = mock(async () => ({ success: true as const }));
const removeWorktreeFromDiskMock = mock(async () => ({
	success: true as const,
}));

function createCaller() {
	return createDeleteProcedures().createCaller({});
}

function seedTrackedWorkspace() {
	projects.set("proj-1", {
		id: "proj-1",
		mainRepoPath: "/repo/main",
	});
	worktrees.set("wt-1", {
		id: "wt-1",
		projectId: "proj-1",
		path: "/repo/wt-old",
		branch: "feat-move",
	});
	workspaces.set("ws-1", {
		id: "ws-1",
		projectId: "proj-1",
		worktreeId: "wt-1",
		type: "worktree",
		name: "feat-move",
		branch: "feat-move",
		deletingAt: null,
	});
}

function buildRepairRequiredResult(): MockTrackedWorktreePathResult {
	return {
		status: "git_repair_required",
		branch: "feat-move",
		mainRepoPath: "/repo/main",
		registeredPath: "/elsewhere/wt-new",
		storedPath: "/repo/wt-old",
	};
}

describe("delete procedures", () => {
	beforeEach(() => {
		workspaces = new Map();
		worktrees = new Map();
		projects = new Map();

		hideProjectIfNoWorkspacesMock.mockClear();
		updateActiveWorkspaceIfRemovedMock.mockClear();
		killByWorkspaceIdMock.mockClear();
		getSessionCountByWorkspaceIdMock.mockClear();
		isInitializingMock.mockClear();
		cancelInitMock.mockClear();
		waitForInitMock.mockClear();
		acquireProjectLockMock.mockClear();
		releaseProjectLockMock.mockClear();
		clearJobMock.mockClear();
		trackMock.mockClear();
		hasUncommittedChangesMock.mockClear();
		hasUnpushedCommitsMock.mockClear();
		worktreeExistsMock.mockClear();
		deleteLocalBranchMock.mockClear();
		resolveTrackedWorktreePathMock.mockClear();
		runTeardownMock.mockClear();
		removeWorktreeFromDiskMock.mockClear();

		isInitializingMock.mockReturnValue(false);
		killByWorkspaceIdMock.mockResolvedValue({ failed: 0 });
		getSessionCountByWorkspaceIdMock.mockResolvedValue(0);
		waitForInitMock.mockResolvedValue(undefined);
		acquireProjectLockMock.mockResolvedValue(undefined);
		releaseProjectLockMock.mockReturnValue(undefined);
		clearJobMock.mockReturnValue(undefined);
		hasUncommittedChangesMock.mockResolvedValue(false);
		hasUnpushedCommitsMock.mockResolvedValue(false);
		worktreeExistsMock.mockResolvedValue(true);
		deleteLocalBranchMock.mockResolvedValue(undefined);
		resolveTrackedWorktreePathMock.mockResolvedValue({
			status: "resolved",
			path: "/repo/wt-old",
		});
		runTeardownMock.mockResolvedValue({ success: true });
		removeWorktreeFromDiskMock.mockResolvedValue({ success: true });

		__testOnlyDeleteProcedureDeps.clearWorkspaceDeletingStatus = (
			workspaceId: string,
		) => {
			const workspace = workspaces.get(workspaceId);
			if (workspace) {
				workspace.deletingAt = null;
			}
		};
		__testOnlyDeleteProcedureDeps.deleteLocalBranch = (...args) =>
			deleteLocalBranchMock(...args);
		__testOnlyDeleteProcedureDeps.deleteWorkspace = (workspaceId: string) => {
			workspaces.delete(workspaceId);
		};
		__testOnlyDeleteProcedureDeps.deleteWorktreeRecord = (
			worktreeId: string,
		) => {
			worktrees.delete(worktreeId);
		};
		__testOnlyDeleteProcedureDeps.getProject = (projectId: string) =>
			projects.get(projectId);
		__testOnlyDeleteProcedureDeps.getWorkspace = (workspaceId: string) =>
			workspaces.get(workspaceId);
		__testOnlyDeleteProcedureDeps.getWorkspaceRuntimeRegistry = () => ({
			getForWorkspaceId: () => ({
				terminal: {
					killByWorkspaceId: (...args) => killByWorkspaceIdMock(...args),
					getSessionCountByWorkspaceId: (...args) =>
						getSessionCountByWorkspaceIdMock(...args),
				},
			}),
		});
		__testOnlyDeleteProcedureDeps.getWorktree = (worktreeId: string) =>
			worktrees.get(worktreeId);
		__testOnlyDeleteProcedureDeps.hasUncommittedChanges = (...args) =>
			hasUncommittedChangesMock(...args);
		__testOnlyDeleteProcedureDeps.hasUnpushedCommits = (...args) =>
			hasUnpushedCommitsMock(...args);
		__testOnlyDeleteProcedureDeps.hideProjectIfNoWorkspaces = (...args) =>
			hideProjectIfNoWorkspacesMock(...args);
		__testOnlyDeleteProcedureDeps.markWorkspaceAsDeleting = (
			workspaceId: string,
		) => {
			const workspace = workspaces.get(workspaceId);
			if (workspace) {
				workspace.deletingAt = Date.now();
			}
		};
		__testOnlyDeleteProcedureDeps.removeWorktreeFromDisk = (...args) =>
			removeWorktreeFromDiskMock(...args);
		__testOnlyDeleteProcedureDeps.resolveTrackedWorktreePath = (...args) =>
			resolveTrackedWorktreePathMock(...args);
		__testOnlyDeleteProcedureDeps.runTeardown = (...args) =>
			runTeardownMock(...args);
		__testOnlyDeleteProcedureDeps.track = (...args) => trackMock(...args);
		__testOnlyDeleteProcedureDeps.updateActiveWorkspaceIfRemoved = (...args) =>
			updateActiveWorkspaceIfRemovedMock(...args);
		__testOnlyDeleteProcedureDeps.worktreeExists = (...args) =>
			worktreeExistsMock(...args);
		__testOnlyDeleteProcedureDeps.workspaceInitManager.acquireProjectLock = (
			...args
		) => acquireProjectLockMock(...args);
		__testOnlyDeleteProcedureDeps.workspaceInitManager.cancel = (...args) =>
			cancelInitMock(...args);
		__testOnlyDeleteProcedureDeps.workspaceInitManager.clearJob = (...args) =>
			clearJobMock(...args);
		__testOnlyDeleteProcedureDeps.workspaceInitManager.isInitializing = (
			...args
		) => isInitializingMock(...args);
		__testOnlyDeleteProcedureDeps.workspaceInitManager.releaseProjectLock = (
			...args
		) => releaseProjectLockMock(...args);
		__testOnlyDeleteProcedureDeps.workspaceInitManager.waitForInit = (
			...args
		) => waitForInitMock(...args);
	});

	afterAll(() => {
		Object.assign(__testOnlyDeleteProcedureDeps, originalDeps);
		Object.assign(
			__testOnlyDeleteProcedureDeps.workspaceInitManager,
			originalWorkspaceInitManagerMethods,
		);
	});

	test("delete clears deletingAt when tracked worktree resolution throws", async () => {
		seedTrackedWorkspace();
		resolveTrackedWorktreePathMock.mockImplementationOnce(async () => {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "Run git worktree repair",
			});
		});

		await expect(createCaller().delete({ id: "ws-1" })).rejects.toThrow(
			"Run git worktree repair",
		);
		expect(workspaces.get("ws-1")?.deletingAt).toBeNull();
	});

	test("canDelete keeps moved worktree workspaces deletable when repair is required", async () => {
		seedTrackedWorkspace();
		resolveTrackedWorktreePathMock.mockResolvedValue(
			buildRepairRequiredResult(),
		);

		const result = await createCaller().canDelete({ id: "ws-1" });

		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain(
			"Delete will fall back to the stored path",
		);
		expect(worktreeExistsMock).not.toHaveBeenCalled();
	});

	test("canDeleteWorktree keeps moved tracked worktrees deletable when repair is required", async () => {
		seedTrackedWorkspace();
		resolveTrackedWorktreePathMock.mockResolvedValue(
			buildRepairRequiredResult(),
		);

		const result = await createCaller().canDeleteWorktree({
			worktreeId: "wt-1",
		});

		expect(result.canDelete).toBe(true);
		expect(result.warning).toContain(
			"Delete will fall back to the stored path",
		);
		expect(worktreeExistsMock).not.toHaveBeenCalled();
	});

	test("deleteWorktree falls back to the stored path when repair is required", async () => {
		seedTrackedWorkspace();
		resolveTrackedWorktreePathMock.mockResolvedValue(
			buildRepairRequiredResult(),
		);

		const result = await createCaller().deleteWorktree({ worktreeId: "wt-1" });

		expect(result).toEqual({ success: true });
		expect(runTeardownMock).not.toHaveBeenCalled();
		expect(removeWorktreeFromDiskMock).toHaveBeenCalledWith({
			mainRepoPath: "/repo/main",
			worktreePath: "/repo/wt-old",
		});
		expect(worktrees.has("wt-1")).toBe(false);
	});
});
