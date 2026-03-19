import { describe, expect, test } from "bun:test";
import {
	type ExternalWorktree,
	resolveOpenableWorktrees,
	type TrackedWorktree,
} from "./resolveOpenableWorktrees";

describe("resolveOpenableWorktrees", () => {
	test("returns empty map when no worktrees exist", () => {
		const result = resolveOpenableWorktrees([], []);
		expect(result.size).toBe(0);
	});

	test("includes tracked worktrees that exist on disk and have no active workspace", () => {
		const tracked: TrackedWorktree[] = [
			{
				id: "wt-1",
				branch: "feature/login",
				path: "/repos/project/.worktrees/feature-login",
				hasActiveWorkspace: false,
				existsOnDisk: true,
			},
		];
		const result = resolveOpenableWorktrees(tracked, []);

		expect(result.size).toBe(1);
		expect(result.get("feature/login")).toEqual({
			type: "tracked",
			worktreeId: "wt-1",
		});
	});

	test("excludes tracked worktrees with an active workspace", () => {
		const tracked: TrackedWorktree[] = [
			{
				id: "wt-1",
				branch: "feature/login",
				path: "/repos/project/.worktrees/feature-login",
				hasActiveWorkspace: true,
				existsOnDisk: true,
			},
		];
		const result = resolveOpenableWorktrees(tracked, []);

		expect(result.size).toBe(0);
	});

	test("excludes tracked worktrees that do not exist on disk", () => {
		const tracked: TrackedWorktree[] = [
			{
				id: "wt-1",
				branch: "feature/login",
				path: "/repos/project/.worktrees/feature-login",
				hasActiveWorkspace: false,
				existsOnDisk: false,
			},
		];
		const result = resolveOpenableWorktrees(tracked, []);

		expect(result.size).toBe(0);
	});

	test("includes external worktrees", () => {
		const external: ExternalWorktree[] = [
			{
				path: "/repos/project/.worktrees/hotfix-1",
				branch: "hotfix/payment-bug",
			},
		];
		const result = resolveOpenableWorktrees([], external);

		expect(result.size).toBe(1);
		expect(result.get("hotfix/payment-bug")).toEqual({
			type: "external",
			worktreePath: "/repos/project/.worktrees/hotfix-1",
			branch: "hotfix/payment-bug",
		});
	});

	test("tracked worktrees take priority over external worktrees for the same branch", () => {
		const tracked: TrackedWorktree[] = [
			{
				id: "wt-tracked",
				branch: "feature/shared",
				path: "/repos/project/.worktrees/shared-tracked",
				hasActiveWorkspace: false,
				existsOnDisk: true,
			},
		];
		const external: ExternalWorktree[] = [
			{
				path: "/repos/project/.worktrees/shared-external",
				branch: "feature/shared",
			},
		];
		const result = resolveOpenableWorktrees(tracked, external);

		expect(result.size).toBe(1);
		expect(result.get("feature/shared")).toEqual({
			type: "tracked",
			worktreeId: "wt-tracked",
		});
	});

	test("combines tracked and external worktrees for different branches", () => {
		const tracked: TrackedWorktree[] = [
			{
				id: "wt-1",
				branch: "feature/a",
				path: "/repos/project/.worktrees/a",
				hasActiveWorkspace: false,
				existsOnDisk: true,
			},
		];
		const external: ExternalWorktree[] = [
			{
				path: "/repos/project/.worktrees/b",
				branch: "feature/b",
			},
		];
		const result = resolveOpenableWorktrees(tracked, external);

		expect(result.size).toBe(2);
		expect(result.get("feature/a")).toEqual({
			type: "tracked",
			worktreeId: "wt-1",
		});
		expect(result.get("feature/b")).toEqual({
			type: "external",
			worktreePath: "/repos/project/.worktrees/b",
			branch: "feature/b",
		});
	});

	test("skips worktrees with empty branch names", () => {
		const tracked: TrackedWorktree[] = [
			{
				id: "wt-1",
				branch: "",
				path: "/some/path",
				hasActiveWorkspace: false,
				existsOnDisk: true,
			},
		];
		const external: ExternalWorktree[] = [
			{ path: "/some/other/path", branch: "" },
		];
		const result = resolveOpenableWorktrees(tracked, external);

		expect(result.size).toBe(0);
	});
});
