import { describe, expect, mock, test } from "bun:test";
import type { SimpleGit } from "simple-git";
import { resolveEffectiveBaseBranch } from "./git-base-branch";

function createGit(raw: (args: string[]) => Promise<string>): SimpleGit {
	return {
		raw,
		branch: mock(async () => {
			throw new Error("default branch lookup should not run");
		}),
	} as unknown as SimpleGit;
}

describe("resolveEffectiveBaseBranch", () => {
	test("resolves configured branch metadata inside the Git worker path", async () => {
		const raw = mock(async (args: string[]) => {
			if (args[0] === "config") return "release\n";
			throw new Error(`unexpected command: ${args.join(" ")}`);
		});

		const result = await resolveEffectiveBaseBranch({
			git: createGit(raw),
			currentBranch: "feature",
			persistedWorktree: { branch: "feature", baseBranch: "develop" },
		});

		expect(result).toBe("release");
		expect(raw).toHaveBeenCalledTimes(1);
	});

	test("uses matching persisted metadata without probing the default branch", async () => {
		const raw = mock(async (args: string[]) => {
			if (args[0] === "config") return "";
			throw new Error(`unexpected command: ${args.join(" ")}`);
		});

		const result = await resolveEffectiveBaseBranch({
			git: createGit(raw),
			currentBranch: "feature",
			persistedWorktree: { branch: "feature", baseBranch: "develop" },
		});

		expect(result).toBe("develop");
		expect(raw).toHaveBeenCalledTimes(1);
	});

	test("falls back to the repository default for stale persisted metadata", async () => {
		const raw = mock(async (args: string[]) => {
			if (args[0] === "config") return "";
			if (args[0] === "symbolic-ref") {
				return "refs/remotes/origin/master\n";
			}
			throw new Error(`unexpected command: ${args.join(" ")}`);
		});

		const result = await resolveEffectiveBaseBranch({
			git: createGit(raw),
			currentBranch: "feature",
			persistedWorktree: { branch: "other", baseBranch: "develop" },
		});

		expect(result).toBe("master");
	});

	test("uses persisted metadata without Git config for a detached HEAD", async () => {
		const raw = mock(async (args: string[]) => {
			throw new Error(`unexpected command: ${args.join(" ")}`);
		});

		const result = await resolveEffectiveBaseBranch({
			git: createGit(raw),
			currentBranch: null,
			persistedWorktree: { branch: "feature", baseBranch: "develop" },
		});

		expect(result).toBe("develop");
		expect(raw).not.toHaveBeenCalled();
	});
});
