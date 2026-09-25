import { describe, expect, test } from "bun:test";
import { selectEffectiveBaseBranch } from "./select-effective-base-branch";

describe("selectEffectiveBaseBranch", () => {
	test("prefers the configured worktree branch over the repository default", () => {
		expect(
			selectEffectiveBaseBranch({
				configuredBaseBranch: "release",
				persistedWorktree: { branch: "feature", baseBranch: "develop" },
				currentBranch: "feature",
				defaultBranch: "main",
			}),
		).toBe("release");
	});

	test("uses persisted data only when it matches the checked out branch", () => {
		expect(
			selectEffectiveBaseBranch({
				configuredBaseBranch: null,
				persistedWorktree: { branch: "feature", baseBranch: "develop" },
				currentBranch: "feature",
				defaultBranch: "main",
			}),
		).toBe("develop");
		expect(
			selectEffectiveBaseBranch({
				configuredBaseBranch: null,
				persistedWorktree: { branch: "other", baseBranch: "develop" },
				currentBranch: "feature",
				defaultBranch: "main",
			}),
		).toBe("main");
	});

	test("uses persisted metadata for a detached HEAD", () => {
		expect(
			selectEffectiveBaseBranch({
				configuredBaseBranch: null,
				persistedWorktree: { branch: "feature", baseBranch: "develop" },
				currentBranch: null,
				defaultBranch: "main",
			}),
		).toBe("develop");
	});
});
