import { describe, expect, test } from "bun:test";
import { resolveBranchRowState } from "./branchRowState";

describe("resolveBranchRowState", () => {
	test("shows Create and hides Open when branch has no worktree", () => {
		expect(
			resolveBranchRowState({
				hasActiveWorkspace: false,
				hasOpenableWorktree: false,
				hasBranchWorktree: false,
			}),
		).toEqual({
			showOpen: false,
			showCreate: true,
		});
	});

	test("shows Open and hides Create when branch already has worktree", () => {
		expect(
			resolveBranchRowState({
				hasActiveWorkspace: true,
				hasOpenableWorktree: false,
				hasBranchWorktree: true,
			}),
		).toEqual({
			showOpen: true,
			showCreate: false,
		});
	});

	test("shows Open for openable worktree even without active workspace", () => {
		expect(
			resolveBranchRowState({
				hasActiveWorkspace: false,
				hasOpenableWorktree: true,
				hasBranchWorktree: true,
			}),
		).toEqual({
			showOpen: true,
			showCreate: false,
		});
	});
});
