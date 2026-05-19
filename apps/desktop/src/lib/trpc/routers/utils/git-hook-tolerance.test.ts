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

	test("re-throws when operation did not succeed even on generic errors", async () => {
		const genericError = new Error("fatal: '../worktree' already exists");

		await expect(
			runWithPostCheckoutHookTolerance({
				context: "Created worktree",
				run: async () => {
					throw genericError;
				},
				didSucceed: async () => false,
			}),
		).rejects.toThrow("already exists");
	});

	test("tolerates SIGPIPE/exit 141 hook failures when worktree was created", async () => {
		const sigpipeError = Object.assign(
			new Error(
				"Command failed: git -C /repo worktree add --no-track -b feature origin/main\nPreparing worktree (new branch 'feature')",
			),
			{
				stderr: "Preparing worktree (new branch 'feature')",
				stdout: "",
				code: 141,
				signal: "SIGPIPE" as NodeJS.Signals,
			},
		);

		await expect(
			runWithPostCheckoutHookTolerance({
				context: "Worktree created at /repo/worktree",
				run: async () => {
					throw sigpipeError;
				},
				didSucceed: async () => true,
			}),
		).resolves.toBeUndefined();
	});
});
