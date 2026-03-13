import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	SelectWorkspace,
	SelectWorktree,
} from "@superset/local-db/schema";
import {
	__testOnlyExternalWorktreeDeps,
	listImportableExternalWorktrees,
	resolveExternalWorktreeOpenTarget,
} from "./external-worktrees";
import type { ExternalWorktree } from "./git";

function makeWorktree(overrides: Partial<SelectWorktree> = {}): SelectWorktree {
	return {
		id: "wt-1",
		projectId: "proj-1",
		path: "/repo/wt-new",
		branch: "feat-move",
		baseBranch: "main",
		createdAt: 1,
		gitStatus: null,
		githubStatus: null,
		...overrides,
	};
}

function makeWorkspace(
	overrides: Partial<SelectWorkspace> = {},
): SelectWorkspace {
	return {
		id: "ws-1",
		projectId: "proj-1",
		worktreeId: "wt-1",
		type: "worktree",
		branch: "feat-move",
		name: "feat-move",
		tabOrder: 0,
		createdAt: 1,
		updatedAt: 1,
		lastOpenedAt: 1,
		isUnread: false,
		isUnnamed: false,
		deletingAt: null,
		portBase: null,
		sectionId: null,
		...overrides,
	};
}

const originalDeps = {
	...__testOnlyExternalWorktreeDeps,
};

const findProjectWorktreeByCurrentPathMock = mock<
	typeof __testOnlyExternalWorktreeDeps.findProjectWorktreeByCurrentPath
>(async () => null);
const findWorktreeWorkspaceByBranchMock = mock<
	typeof __testOnlyExternalWorktreeDeps.findWorktreeWorkspaceByBranch
>(() => null);
const findOrphanedWorktreeByBranchMock = mock<
	typeof __testOnlyExternalWorktreeDeps.findOrphanedWorktreeByBranch
>(() => null);
const listExternalWorktreesMock = mock<
	typeof __testOnlyExternalWorktreeDeps.listExternalWorktrees
>(async () => []);
const listProjectWorktreesWithCurrentPathsMock = mock<
	typeof __testOnlyExternalWorktreeDeps.listProjectWorktreesWithCurrentPaths
>(async () => []);
const resolveWorktreePathWithRepairMock = mock<
	typeof __testOnlyExternalWorktreeDeps.resolveWorktreePathWithRepair
>(async () => null);

describe("external-worktrees", () => {
	beforeEach(() => {
		findProjectWorktreeByCurrentPathMock.mockReset();
		findWorktreeWorkspaceByBranchMock.mockReset();
		findOrphanedWorktreeByBranchMock.mockReset();
		listExternalWorktreesMock.mockReset();
		listProjectWorktreesWithCurrentPathsMock.mockReset();
		resolveWorktreePathWithRepairMock.mockReset();

		findProjectWorktreeByCurrentPathMock.mockResolvedValue(null);
		findWorktreeWorkspaceByBranchMock.mockReturnValue(null);
		findOrphanedWorktreeByBranchMock.mockReturnValue(null);
		listExternalWorktreesMock.mockResolvedValue([]);
		listProjectWorktreesWithCurrentPathsMock.mockResolvedValue([]);
		resolveWorktreePathWithRepairMock.mockResolvedValue(null);

		__testOnlyExternalWorktreeDeps.findProjectWorktreeByCurrentPath = (
			...args
		) => findProjectWorktreeByCurrentPathMock(...args);
		__testOnlyExternalWorktreeDeps.findWorktreeWorkspaceByBranch = (...args) =>
			findWorktreeWorkspaceByBranchMock(...args);
		__testOnlyExternalWorktreeDeps.findOrphanedWorktreeByBranch = (...args) =>
			findOrphanedWorktreeByBranchMock(...args);
		__testOnlyExternalWorktreeDeps.listExternalWorktrees = (...args) =>
			listExternalWorktreesMock(...args);
		__testOnlyExternalWorktreeDeps.listProjectWorktreesWithCurrentPaths = (
			...args
		) => listProjectWorktreesWithCurrentPathsMock(...args);
		__testOnlyExternalWorktreeDeps.resolveWorktreePathWithRepair = (...args) =>
			resolveWorktreePathWithRepairMock(...args);
	});

	afterAll(() => {
		Object.assign(__testOnlyExternalWorktreeDeps, originalDeps);
	});

	test("reuses a tracked worktree by branch when path repair changes the current path", async () => {
		const trackedWorktree = makeWorktree({
			path: "/repo/wt-old",
		});
		resolveWorktreePathWithRepairMock.mockResolvedValue("/repo/wt-new");

		findWorktreeWorkspaceByBranchMock.mockReturnValue({
			workspace: makeWorkspace({ worktreeId: trackedWorktree.id }),
			worktree: trackedWorktree,
		});

		const result = await resolveExternalWorktreeOpenTarget({
			projectId: "proj-1",
			mainRepoPath: "/repo/main",
			worktreePath: "/repo/wt-old",
			branch: "feat-move",
		});

		expect(result).toEqual({
			kind: "tracked",
			worktree: {
				...trackedWorktree,
				path: "/repo/wt-new",
			},
		});
		expect(listExternalWorktreesMock).not.toHaveBeenCalled();
	});

	test("uses Git's current branch when importing by path from a stale request", async () => {
		listExternalWorktreesMock.mockResolvedValue([
			{
				path: "/repo/wt-new",
				branch: "feat-move",
				isDetached: false,
				isBare: false,
			},
		] satisfies ExternalWorktree[]);

		const result = await resolveExternalWorktreeOpenTarget({
			projectId: "proj-1",
			mainRepoPath: "/repo/main",
			worktreePath: "/repo/wt-new",
			branch: "feat-stale",
		});

		expect(result).toEqual({
			kind: "external",
			worktreePath: "/repo/wt-new",
			branch: "feat-move",
		});
	});

	test("repairs tracked worktrees before reading Git's external worktree list", async () => {
		const callOrder: string[] = [];
		let listedPath = "/repo/wt-old";

		listProjectWorktreesWithCurrentPathsMock.mockImplementation(async () => {
			callOrder.push("tracked");
			listedPath = "/repo/wt-new";
			return [
				{
					worktree: makeWorktree({
						path: "/repo/wt-new",
					}),
					existsOnDisk: true,
				},
			];
		});

		listExternalWorktreesMock.mockImplementation(async () => {
			callOrder.push("external");
			return [
				{
					path: listedPath,
					branch: "feat-move",
					isDetached: false,
					isBare: false,
				},
			];
		});

		const result = await listImportableExternalWorktrees({
			projectId: "proj-1",
			mainRepoPath: "/repo/main",
		});

		expect(result).toEqual([]);
		expect(callOrder).toEqual(["tracked", "external"]);
	});

	test("keeps already-tracked branches out of the external import list even when the tracked entry is currently missing on disk", async () => {
		listProjectWorktreesWithCurrentPathsMock.mockResolvedValue([
			{
				worktree: makeWorktree({
					path: "/repo/wt-stale",
					branch: "feat-move",
				}),
				existsOnDisk: false,
			},
		]);

		listExternalWorktreesMock.mockResolvedValue([
			{
				path: "/repo/wt-current",
				branch: "feat-move",
				isDetached: false,
				isBare: false,
			},
		] satisfies ExternalWorktree[]);

		const result = await listImportableExternalWorktrees({
			projectId: "proj-1",
			mainRepoPath: "/repo/main",
		});

		expect(result).toEqual([]);
	});
});
