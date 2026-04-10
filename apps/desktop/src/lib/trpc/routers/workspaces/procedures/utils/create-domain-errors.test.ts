import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import {
	throwWorkspaceCreateDomainError,
	validateExistingBranchCreate,
} from "./create-domain-errors";

describe("create-domain-errors", () => {
	test("throws BRANCH_NOT_FOUND when branch is missing", () => {
		expect(() =>
			validateExistingBranchCreate({
				branchName: "feature/missing",
				existingBranches: ["main", "develop"],
				existingWorktreePath: null,
			}),
		).toThrow('BRANCH_NOT_FOUND: Branch "feature/missing" no longer exists.');
	});

	test("throws WORKTREE_ALREADY_EXISTS_FOR_BRANCH when worktree exists", () => {
		expect(() =>
			validateExistingBranchCreate({
				branchName: "feature/existing",
				existingBranches: ["main", "feature/existing"],
				existingWorktreePath: "/tmp/worktrees/feature-existing",
			}),
		).toThrow(
			'WORKTREE_ALREADY_EXISTS_FOR_BRANCH: Branch "feature/existing" is already checked out in another worktree.',
		);
	});

	test("passes when branch exists and no worktree exists", () => {
		expect(() =>
			validateExistingBranchCreate({
				branchName: "feature/new",
				existingBranches: ["main", "feature/new"],
				existingWorktreePath: null,
			}),
		).not.toThrow();
	});

	test("throws with provided tRPC code", () => {
		try {
			throwWorkspaceCreateDomainError(
				"GIT_OPERATION_FAILED",
				"Unable to list branches.",
				"INTERNAL_SERVER_ERROR",
			);
			throw new Error("Expected TRPCError");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
			expect((error as TRPCError).message).toBe(
				"GIT_OPERATION_FAILED: Unable to list branches.",
			);
		}
	});
});
