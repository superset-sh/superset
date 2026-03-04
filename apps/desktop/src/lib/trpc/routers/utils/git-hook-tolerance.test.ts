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

	test("re-throws hook failures when operation did not succeed", async () => {
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

	test("re-throws non-hook failures", async () => {
		const genericError = new Error("fatal: '../worktree' already exists");

		await expect(
			runWithPostCheckoutHookTolerance({
				context: "Created worktree",
				run: async () => {
					throw genericError;
				},
				didSucceed: async () => true,
			}),
		).rejects.toThrow("already exists");
	});
});
