import { describe, expect, test } from "bun:test";
import { resolveNewWorkspaceBranch } from "./resolve-new-branch";

describe("resolveNewWorkspaceBranch", () => {
	describe("existingBranchName (useExistingBranch flow)", () => {
		test("returns existing branch name as-is", () => {
			const branch = resolveNewWorkspaceBranch({
				existingBranchName: "feature/my-feature",
				existingBranches: ["main", "feature/my-feature"],
			});
			expect(branch).toBe("feature/my-feature");
		});

		test("takes priority over branchName and name", () => {
			const branch = resolveNewWorkspaceBranch({
				existingBranchName: "feat/existing",
				branchName: "feat/explicit",
				name: "Some Name",
				existingBranches: [],
			});
			expect(branch).toBe("feat/existing");
		});
	});

	describe("explicit branchName", () => {
		test("preserves case of explicit branch name (first segment)", () => {
			// No prefix → branchName is the first segment, so case is kept
			const branch = resolveNewWorkspaceBranch({
				branchName: "My Feature Branch",
				existingBranches: [],
			});
			expect(branch).toBe("My-Feature-Branch");
		});

		test("applies prefix (case-preserved) and lowercases the branch segment", () => {
			// The prefix is first segment (case preserved); branchName is the
			// second segment (lowercased by sanitizeSegment defaults)
			const branch = resolveNewWorkspaceBranch({
				branchName: "My-Feature",
				existingBranches: [],
				branchPrefix: "John",
			});
			expect(branch).toBe("John/my-feature");
		});

		test("applies prefix to an already-lowercase branch name", () => {
			const branch = resolveNewWorkspaceBranch({
				branchName: "my-feature",
				existingBranches: [],
				branchPrefix: "John",
			});
			expect(branch).toBe("John/my-feature");
		});
	});

	describe("name-derived branch (the bug)", () => {
		test("derives branch from workspace name when no branchName is given", () => {
			const branch = resolveNewWorkspaceBranch({
				name: "Fix login bug",
				existingBranches: [],
			});
			// Should be based on the workspace name, not random words
			expect(branch).toMatch(/^fix-login-bug-[a-z0-9]{4}$/);
		});

		test("derives branch with prefix from workspace name", () => {
			const branch = resolveNewWorkspaceBranch({
				name: "Add user auth",
				existingBranches: [],
				branchPrefix: "Alice",
			});
			expect(branch).toMatch(/^Alice\/add-user-auth-[a-z0-9]{4}$/);
		});

		test("uses name even when existingBranches contains similar names", () => {
			const branch = resolveNewWorkspaceBranch({
				name: "My Feature",
				existingBranches: ["my-feature-abcd"],
			});
			// The 4-char random suffix provides collision avoidance
			expect(branch).toMatch(/^my-feature-[a-z0-9]{4}$/);
		});

		test("name-derived branch does NOT look like random friendly words", () => {
			// The bug: without a name, branch uses random words. With a name, it should
			// use the name so the branch is meaningful and traceable to the task.
			const branch = resolveNewWorkspaceBranch({
				name: "Refactor database layer",
				existingBranches: [],
			});
			expect(branch).toMatch(/refactor/);
		});
	});

	describe("random fallback (no name or branchName)", () => {
		test("returns a non-empty branch name even without any inputs", () => {
			const branch = resolveNewWorkspaceBranch({
				existingBranches: [],
			});
			expect(branch.length).toBeGreaterThan(0);
			expect(branch).not.toContain("/");
		});

		test("applies prefix to random fallback", () => {
			const branch = resolveNewWorkspaceBranch({
				existingBranches: [],
				branchPrefix: "Bob",
			});
			expect(branch).toMatch(/^Bob\//);
		});
	});
});
