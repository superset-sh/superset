import { describe, expect, test } from "bun:test";
import { runWithPostCheckoutHookTolerance } from "./git-hook-tolerance";

describe("runWithPostCheckoutHookTolerance", () => {
	test("treats post-checkout hook failures as non-fatal when operation succeeded", async () => {
		const hookError = Object.assign(
			new Error("husky - post-checkout script failed"),
			{
				stderr: "husky - command not found in PATH=...",
			},
		);

		await expect(
			runWithPostCheckoutHookTolerance({
				context: "Switched branch",
				run: async () => {
					throw hookError;
				},
				didSucceed: async () => true,
			}),
		).resolves.toBeUndefined();
	});

	test("tolerates errors without a post-checkout marker when operation succeeded (e.g. timeout kill mid-hook)", async () => {
		const timeoutError = new Error(
			"Command failed: git -C /repo worktree add --no-track -b drew/believed-armadillo /worktrees/drew/believed-armadillo origin/staging\n" +
				"Updating files: 100% (10925/10925), done.\n" +
				"Fresh worktree detected — installing dependencies...",
		);

		await expect(
			runWithPostCheckoutHookTolerance({
				context: "Created worktree",
				run: async () => {
					throw timeoutError;
				},
				didSucceed: async () => true,
			}),
		).resolves.toBeUndefined();
	});

	test("re-throws failures when operation did not succeed", async () => {
		const hookError = new Error("post-checkout hook failed");

		await expect(
			runWithPostCheckoutHookTolerance({
				context: "Switched branch",
				run: async () => {
					throw hookError;
				},
				didSucceed: async () => false,
			}),
		).rejects.toThrow("post-checkout");
	});

	test("re-throws failures when the success check itself throws", async () => {
		const addError = new Error("fatal: '../worktree' already exists");

		await expect(
			runWithPostCheckoutHookTolerance({
				context: "Created worktree",
				run: async () => {
					throw addError;
				},
				didSucceed: async () => {
					throw new Error("git worktree list failed");
				},
			}),
		).rejects.toThrow("already exists");
	});
});
