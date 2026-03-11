import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { TRPCError } from "@trpc/server";

import {
	__testOnlyDeleteProcedureDeps,
	createDeleteProcedures,
} from "./delete";

type MockWorkspace = NonNullable<
	ReturnType<typeof __testOnlyDeleteProcedureDeps.getWorkspace>
>;
type MockWorktree = NonNullable<
	ReturnType<typeof __testOnlyDeleteProcedureDeps.getWorktree>
>;
type MockProject = NonNullable<
	ReturnType<typeof __testOnlyDeleteProcedureDeps.getProject>
>;
type HideProjectIfNoWorkspacesFn =
	typeof __testOnlyDeleteProcedureDeps.hideProjectIfNoWorkspaces;
type UpdateActiveWorkspaceIfRemovedFn =
	typeof __testOnlyDeleteProcedureDeps.updateActiveWorkspaceIfRemoved;
type WorkspaceRuntimeRegistry = ReturnType<
	typeof __testOnlyDeleteProcedureDeps.getWorkspaceRuntimeRegistry
>;
type WorkspaceRuntime = ReturnType<
	WorkspaceRuntimeRegistry["getForWorkspaceId"]
>;
type TerminalRuntime = WorkspaceRuntime["terminal"];
type KillByWorkspaceIdFn = TerminalRuntime["killByWorkspaceId"];
type GetSessionCountByWorkspaceIdFn =
	TerminalRuntime["getSessionCountByWorkspaceId"];
type IsInitializingFn =
	typeof __testOnlyDeleteProcedureDeps.workspaceInitManager.isInitializing;
type CancelInitFn =
	typeof __testOnlyDeleteProcedureDeps.workspaceInitManager.cancel;
type WaitForInitFn =
	typeof __testOnlyDeleteProcedureDeps.workspaceInitManager.waitForInit;
type AcquireProjectLockFn =
	typeof __testOnlyDeleteProcedureDeps.workspaceInitManager.acquireProjectLock;
type ReleaseProjectLockFn =
	typeof __testOnlyDeleteProcedureDeps.workspaceInitManager.releaseProjectLock;
type ClearJobFn =
	typeof __testOnlyDeleteProcedureDeps.workspaceInitManager.clearJob;
type TrackFn = typeof __testOnlyDeleteProcedureDeps.track;
type HasUncommittedChangesFn =
	typeof __testOnlyDeleteProcedureDeps.hasUncommittedChanges;
type HasUnpushedCommitsFn =
	typeof __testOnlyDeleteProcedureDeps.hasUnpushedCommits;
type WorktreeExistsFn = typeof __testOnlyDeleteProcedureDeps.worktreeExists;
type DeleteLocalBranchFn =
	typeof __testOnlyDeleteProcedureDeps.deleteLocalBranch;
type ResolveTrackedWorktreePathFn =
	typeof __testOnlyDeleteProcedureDeps.resolveTrackedWorktreePath;
type RunTeardownFn = typeof __testOnlyDeleteProcedureDeps.runTeardown;
type RemoveWorktreeFromDiskFn =
	typeof __testOnlyDeleteProcedureDeps.removeWorktreeFromDisk;

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

const hideProjectIfNoWorkspacesMock = mock<HideProjectIfNoWorkspacesFn>(
	() => {},
);
const updateActiveWorkspaceIfRemovedMock =
	mock<UpdateActiveWorkspaceIfRemovedFn>(() => {});
const killByWorkspaceIdMock = mock<KillByWorkspaceIdFn>(async () => ({
	killed: 0,
	failed: 0,
}));
const getSessionCountByWorkspaceIdMock = mock<GetSessionCountByWorkspaceIdFn>(
	async () => 0,
);
const isInitializingMock = mock<IsInitializingFn>(() => false);
const cancelInitMock = mock<CancelInitFn>(() => {});
const waitForInitMock = mock<WaitForInitFn>(async () => {});
const acquireProjectLockMock = mock<AcquireProjectLockFn>(async () => {});
const releaseProjectLockMock = mock<ReleaseProjectLockFn>(() => {});
const clearJobMock = mock<ClearJobFn>(() => {});
const trackMock = mock<TrackFn>(() => {});
const hasUncommittedChangesMock = mock<HasUncommittedChangesFn>(
	async () => false,
);
const hasUnpushedCommitsMock = mock<HasUnpushedCommitsFn>(async () => false);
const worktreeExistsMock = mock<WorktreeExistsFn>(async () => true);
const deleteLocalBranchMock = mock<DeleteLocalBranchFn>(async () => {});
const resolveTrackedWorktreePathMock = mock<ResolveTrackedWorktreePathFn>();
const runTeardownMock = mock<RunTeardownFn>(async () => ({ success: true }));
const removeWorktreeFromDiskMock = mock<RemoveWorktreeFromDiskFn>(async () => ({
	success: true as const,
}));

function createProject(overrides: Partial<MockProject> = {}): MockProject {
	return {
		id: "proj-1",
		mainRepoPath: "/repo/main",
		name: "Project 1",
		color: "#000000",
		tabOrder: 0,
		lastOpenedAt: 0,
		createdAt: 0,
		configToastDismissed: null,
		defaultBranch: null,
		workspaceBaseBranch: null,
		githubOwner: null,
		branchPrefixMode: null,
		branchPrefixCustom: null,
		worktreeBaseDir: null,
		hideImage: null,
		iconUrl: null,
		neonProjectId: null,
		defaultApp: null,
		...overrides,
	};
}

function createWorktree(overrides: Partial<MockWorktree> = {}): MockWorktree {
	return {
		id: "wt-1",
		projectId: "proj-1",
		path: "/repo/wt-old",
		branch: "feat-move",
		baseBranch: null,
		createdAt: 0,
		gitStatus: null,
		githubStatus: null,
		...overrides,
	};
}

function createWorkspace(
	overrides: Partial<MockWorkspace> = {},
): MockWorkspace {
	return {
		id: "ws-1",
		projectId: "proj-1",
		worktreeId: "wt-1",
		type: "worktree",
		name: "feat-move",
		branch: "feat-move",
		tabOrder: 0,
		createdAt: 0,
		updatedAt: 0,
		lastOpenedAt: 0,
		isUnread: false,
		isUnnamed: false,
		deletingAt: null,
		portBase: null,
		sectionId: null,
		...overrides,
	};
}

function createCaller() {
	return createDeleteProcedures().createCaller({});
}

function seedTrackedWorkspace() {
	projects.set("proj-1", createProject());
	worktrees.set("wt-1", createWorktree());
	workspaces.set("ws-1", createWorkspace());
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
		killByWorkspaceIdMock.mockResolvedValue({ killed: 0, failed: 0 });
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
		const terminalRuntime = {
			killByWorkspaceId: (...args: Parameters<KillByWorkspaceIdFn>) =>
				killByWorkspaceIdMock(...args),
			getSessionCountByWorkspaceId: (
				...args: Parameters<GetSessionCountByWorkspaceIdFn>
			) => getSessionCountByWorkspaceIdMock(...args),
		} as unknown as TerminalRuntime;
		const workspaceRuntime = {
			terminal: terminalRuntime,
		} as unknown as WorkspaceRuntime;
		__testOnlyDeleteProcedureDeps.getWorkspaceRuntimeRegistry = () =>
			({
				getForWorkspaceId: () => workspaceRuntime,
				getDefault: () => workspaceRuntime,
			}) as unknown as WorkspaceRuntimeRegistry;
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
