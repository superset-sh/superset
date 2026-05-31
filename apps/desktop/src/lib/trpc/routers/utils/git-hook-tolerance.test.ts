import { describe, expect, test } from "bun:test";
import { runWithPostCheckoutHookTolerance } from "./git-hook-tolerance";

describe("runWithPostCheckoutHookTolerance", () => {
	test("treats post-checkout hook failures as non-fatal when operation succeeded", async () => {
		const hookError = Object.assign(
			new Error("husky - post-checkout script failed"),
			{
				stderr: "husky - command not found in PATH=...",
				code: 1,
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

	test("treats a SIGPIPE/exit-141 failure with no diagnostic output as non-fatal when the worktree was created", async () => {
		// A post-checkout hook pipeline that dies with SIGPIPE under `set -o
		// pipefail` surfaces as exit 141 (128 + SIGPIPE) with no "post-checkout"/
		// "hook" keywords at all — the case that regressed worktree creation (#4350).
		const sigpipeError = Object.assign(
			new Error("Command failed with exit code 141"),
			{ stderr: "", code: 141 },
		);

		await expect(
			runWithPostCheckoutHookTolerance({
				context: "Worktree created at /tmp/wt",
				run: async () => {
					throw sigpipeError;
				},
				didSucceed: async () => true,
			}),
		).resolves.toBeUndefined();
	});

	test("re-throws hook failures when the intended outcome is absent", async () => {
		const hookError = Object.assign(new Error("post-checkout hook failed"), {
			code: 1,
		});

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

	test("re-throws genuine git failures even when the success probe would pass", async () => {
		// A real `git worktree add` failure ("fatal: … already exists") exits 128
		// with no hook keywords. Even if a stale/pre-existing worktree at the same
		// path makes the path-based probe return true, we must NOT swallow it.
		const fatalError = Object.assign(
			new Error("fatal: '../worktree' already exists"),
			{ stderr: "fatal: '../worktree' already exists", code: 128 },
		);

		await expect(
			runWithPostCheckoutHookTolerance({
				context: "Created worktree",
				run: async () => {
					throw fatalError;
				},
				didSucceed: async () => true,
			}),
		).rejects.toThrow("already exists");
	});

	test("re-throws git usage errors (exit 129) instead of misreading them as a signal failure", async () => {
		// Git usage errors exit 129. That is numerically 128 + SIGHUP, so a naive
		// `code > 128` check would wrongly tolerate it; only SIGPIPE (141) is
		// forgiven. With the outcome probe passing, this must still rethrow.
		const usageError = Object.assign(new Error("usage: git worktree add ..."), {
			stderr: "usage: git worktree add ...",
			code: 129,
		});

		await expect(
			runWithPostCheckoutHookTolerance({
				context: "Created worktree",
				run: async () => {
					throw usageError;
				},
				didSucceed: async () => true,
			}),
		).rejects.toThrow("usage: git worktree add");
	});

	test("re-throws the original error when the success check itself throws", async () => {
		const hookError = Object.assign(new Error("post-checkout hook failed"), {
			code: 1,
		});

		await expect(
			runWithPostCheckoutHookTolerance({
				context: "Worktree created at /tmp/wt",
				run: async () => {
					throw hookError;
				},
				didSucceed: async () => {
					throw new Error("git worktree list failed");
				},
			}),
		).rejects.toThrow("post-checkout hook failed");
	});
});
