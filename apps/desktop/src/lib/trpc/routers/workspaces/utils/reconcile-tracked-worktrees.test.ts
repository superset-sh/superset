import { describe, expect, test } from "bun:test";
import type { ExternalWorktree } from "./git";
import { getStaleTrackedWorktreeIds } from "./reconcile-tracked-worktrees-model";

function live(overrides: Partial<ExternalWorktree>): ExternalWorktree {
	return {
		path: "/repos/worktree",
		branch: "feature",
		isBare: false,
		isDetached: false,
		...overrides,
	};
}

describe("getStaleTrackedWorktreeIds", () => {
	test("keeps inactive tracked worktrees when the live branch still matches", () => {
		const result = getStaleTrackedWorktreeIds({
			trackedWorktrees: [
				{
					id: "tracked",
					path: "/repos/worktree",
					branch: "feature",
					hasActiveWorkspace: false,
				},
			],
			liveWorktrees: [live({})],
			pathExists: () => true,
		});

		expect(result).toEqual([]);
	});

	test("prunes inactive tracked worktrees missing from disk", () => {
		const result = getStaleTrackedWorktreeIds({
			trackedWorktrees: [
				{
					id: "tracked",
					path: "/repos/worktree",
					branch: "feature",
					hasActiveWorkspace: false,
				},
			],
			liveWorktrees: [live({})],
			pathExists: () => false,
		});

		expect(result).toEqual(["tracked"]);
	});

	test("prunes inactive tracked worktrees recreated at the same path on another branch", () => {
		const result = getStaleTrackedWorktreeIds({
			trackedWorktrees: [
				{
					id: "tracked",
					path: "/repos/worktree",
					branch: "old-branch",
					hasActiveWorkspace: false,
				},
			],
			liveWorktrees: [live({ branch: "new-branch" })],
			pathExists: () => true,
		});

		expect(result).toEqual(["tracked"]);
	});

	test("prunes inactive tracked worktrees when the live worktree is bare", () => {
		const result = getStaleTrackedWorktreeIds({
			trackedWorktrees: [
				{
					id: "tracked",
					path: "/repos/worktree",
					branch: "feature",
					hasActiveWorkspace: false,
				},
			],
			liveWorktrees: [live({ isBare: true })],
			pathExists: () => true,
		});

		expect(result).toEqual(["tracked"]);
	});

	test("prunes inactive tracked worktrees when the live worktree is detached", () => {
		const result = getStaleTrackedWorktreeIds({
			trackedWorktrees: [
				{
					id: "tracked",
					path: "/repos/worktree",
					branch: "feature",
					hasActiveWorkspace: false,
				},
			],
			liveWorktrees: [live({ isDetached: true })],
			pathExists: () => true,
		});

		expect(result).toEqual(["tracked"]);
	});

	test("prunes inactive tracked worktrees when the live worktree has no branch", () => {
		const result = getStaleTrackedWorktreeIds({
			trackedWorktrees: [
				{
					id: "tracked",
					path: "/repos/worktree",
					branch: "feature",
					hasActiveWorkspace: false,
				},
			],
			liveWorktrees: [live({ branch: null })],
			pathExists: () => true,
		});

		expect(result).toEqual(["tracked"]);
	});

	test("keeps active worktrees even when the live branch differs", () => {
		const result = getStaleTrackedWorktreeIds({
			trackedWorktrees: [
				{
					id: "tracked",
					path: "/repos/worktree",
					branch: "old-branch",
					hasActiveWorkspace: true,
				},
			],
			liveWorktrees: [live({ branch: "new-branch" })],
			pathExists: () => true,
		});

		expect(result).toEqual([]);
	});

	test("keeps active worktrees even when the live worktree has no branch", () => {
		const result = getStaleTrackedWorktreeIds({
			trackedWorktrees: [
				{
					id: "tracked",
					path: "/repos/worktree",
					branch: "feature",
					hasActiveWorkspace: true,
				},
			],
			liveWorktrees: [live({ branch: null })],
			pathExists: () => true,
		});

		expect(result).toEqual([]);
	});

	test("prunes inactive tracked worktrees that no longer appear in git worktree list", () => {
		const result = getStaleTrackedWorktreeIds({
			trackedWorktrees: [
				{
					id: "tracked",
					path: "/repos/worktree",
					branch: "feature",
					hasActiveWorkspace: false,
				},
			],
			liveWorktrees: [],
			pathExists: () => true,
		});

		expect(result).toEqual(["tracked"]);
	});
});
