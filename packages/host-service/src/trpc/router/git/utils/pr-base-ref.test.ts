import { describe, expect, mock, test } from "bun:test";
import type { SimpleGit } from "simple-git";
import type { ExecGh } from "../../workspace-creation/utils/exec-gh";
import { resolvePullRequestBaseRef } from "./pr-base-ref";

function createGit(configuredBase: string | null): SimpleGit {
	return {
		raw: mock(async () => {
			if (configuredBase === null) throw new Error("missing config");
			return configuredBase;
		}),
	} as unknown as SimpleGit;
}

describe("resolvePullRequestBaseRef", () => {
	test("uses configured branch base before calling GitHub", async () => {
		const execGh = mock(async () => "main") as ExecGh;
		const result = await resolvePullRequestBaseRef({
			git: createGit("release/2026.06\n"),
			execGh,
			worktreePath: "/repo/worktree",
			branchName: "feature-x",
			prNumber: 42,
			repoOwner: "org",
			repoName: "repo",
		});

		expect(result).toBe("release/2026.06");
		expect(execGh).not.toHaveBeenCalled();
	});

	test("falls back to gh pr view when local base is missing", async () => {
		const execGh = mock(async () => "develop\n") as ExecGh;
		const result = await resolvePullRequestBaseRef({
			git: createGit(null),
			execGh,
			worktreePath: "/repo/worktree",
			branchName: "feature-x",
			prNumber: 42,
			repoOwner: "org",
			repoName: "repo",
		});

		expect(result).toBe("develop");
		expect(execGh).toHaveBeenCalledWith(
			[
				"pr",
				"view",
				"42",
				"--repo",
				"org/repo",
				"--json",
				"baseRefName",
				"--jq",
				".baseRefName",
			],
			{ cwd: "/repo/worktree", timeout: 10_000 },
		);
	});

	test("returns null when neither source resolves a base", async () => {
		const execGh = mock(async () => "") as ExecGh;
		const result = await resolvePullRequestBaseRef({
			git: createGit(null),
			execGh,
			worktreePath: "/repo/worktree",
			branchName: null,
			prNumber: 42,
			repoOwner: "org",
			repoName: "repo",
		});

		expect(result).toBeNull();
	});
});
