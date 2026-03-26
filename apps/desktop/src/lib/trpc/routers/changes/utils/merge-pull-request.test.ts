import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const getCurrentBranchMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<string | null>,
);
const execGitWithShellPathMock = mock((async () => ({
	stdout: "",
	stderr: "",
})) as (...args: unknown[]) => Promise<{ stdout: string; stderr: string }>);
const getRepoContextMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<{
		isFork: boolean;
		repoUrl: string;
		upstreamUrl: string;
	} | null>,
);
const getPRForBranchMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<{
		number: number;
		state: "open" | "closed" | "merged";
	} | null>,
);
const getPullRequestRepoArgsMock = mock(() => [] as string[]);
const execWithShellEnvMock = mock(
	(async () => undefined) as (...args: unknown[]) => Promise<void>,
);
const isNoPullRequestFoundMessageMock = mock(() => false);
const clearWorktreeStatusCachesMock = mock(() => undefined);

mock.module("../../workspaces/utils/git", () => ({
	getCurrentBranch: getCurrentBranchMock,
}));

mock.module("../../workspaces/utils/git-client", () => ({
	execGitWithShellPath: execGitWithShellPathMock,
}));

mock.module("../../workspaces/utils/github", () => ({
	getPRForBranch: getPRForBranchMock,
	getPullRequestRepoArgs: getPullRequestRepoArgsMock,
	getRepoContext: getRepoContextMock,
}));

mock.module("../../workspaces/utils/shell-env", () => ({
	execWithShellEnv: execWithShellEnvMock,
}));

mock.module("../git-utils", () => ({
	isNoPullRequestFoundMessage: isNoPullRequestFoundMessageMock,
}));

mock.module("./worktree-status-caches", () => ({
	clearWorktreeStatusCaches: clearWorktreeStatusCachesMock,
}));

const { mergePullRequest } = await import("./merge-pull-request");

describe("mergePullRequest", () => {
	beforeEach(() => {
		getCurrentBranchMock.mockReset();
		getCurrentBranchMock.mockResolvedValue(null);
		execGitWithShellPathMock.mockReset();
		execGitWithShellPathMock.mockResolvedValue({
			stdout: "abc123\n",
			stderr: "",
		});
		getRepoContextMock.mockReset();
		getRepoContextMock.mockResolvedValue({
			isFork: false,
			repoUrl: "https://github.com/superset-sh/superset",
			upstreamUrl: "https://github.com/superset-sh/superset",
		});
		getPRForBranchMock.mockReset();
		getPRForBranchMock.mockResolvedValue(null);
		getPullRequestRepoArgsMock.mockReset();
		getPullRequestRepoArgsMock.mockReturnValue([]);
		execWithShellEnvMock.mockReset();
		execWithShellEnvMock.mockResolvedValue(undefined);
		isNoPullRequestFoundMessageMock.mockReset();
		isNoPullRequestFoundMessageMock.mockReturnValue(false);
		clearWorktreeStatusCachesMock.mockReset();
	});

	test("falls back to legacy gh merge when HEAD is detached", async () => {
		const result = await mergePullRequest({
			worktreePath: "/tmp/detached-worktree",
			strategy: "squash",
		});

		expect(getRepoContextMock).toHaveBeenCalledWith("/tmp/detached-worktree");
		expect(getCurrentBranchMock).toHaveBeenCalledWith("/tmp/detached-worktree");
		expect(execGitWithShellPathMock).not.toHaveBeenCalled();
		expect(getPRForBranchMock).not.toHaveBeenCalled();
		expect(execWithShellEnvMock).toHaveBeenCalledWith(
			"gh",
			["pr", "merge", "--squash"],
			{ cwd: "/tmp/detached-worktree" },
		);
		expect(clearWorktreeStatusCachesMock).toHaveBeenCalledWith(
			"/tmp/detached-worktree",
		);
		expect(result.success).toBe(true);
		expect(Number.isNaN(Date.parse(result.mergedAt))).toBe(false);
	});

	test("resolves the PR by branch when HEAD has no commit yet", async () => {
		getCurrentBranchMock.mockResolvedValue("feature/unborn");
		execGitWithShellPathMock.mockRejectedValueOnce(
			new Error("fatal: ambiguous argument 'HEAD'"),
		);
		getPRForBranchMock.mockResolvedValue({
			number: 42,
			state: "open",
		});

		const result = await mergePullRequest({
			worktreePath: "/tmp/unborn-worktree",
			strategy: "rebase",
		});

		expect(execWithShellEnvMock).toHaveBeenCalledWith(
			"gh",
			["pr", "merge", "42", "--rebase"],
			{ cwd: "/tmp/unborn-worktree" },
		);
		expect(getPRForBranchMock).toHaveBeenCalledWith(
			"/tmp/unborn-worktree",
			"feature/unborn",
			{
				isFork: false,
				repoUrl: "https://github.com/superset-sh/superset",
				upstreamUrl: "https://github.com/superset-sh/superset",
			},
			undefined,
		);
		expect(result.success).toBe(true);
	});

	test("falls back to legacy merge on unexpected HEAD lookup failures", async () => {
		getCurrentBranchMock.mockResolvedValue("feature/branch");
		execGitWithShellPathMock.mockRejectedValueOnce(
			new Error("fatal: permission denied"),
		);

		const result = await mergePullRequest({
			worktreePath: "/tmp/broken-worktree",
			strategy: "merge",
		});

		expect(getPRForBranchMock).not.toHaveBeenCalled();
		expect(execWithShellEnvMock).toHaveBeenCalledWith(
			"gh",
			["pr", "merge", "--merge"],
			{ cwd: "/tmp/broken-worktree" },
		);
		expect(result.success).toBe(true);
	});
});

afterAll(() => {
	mock.restore();
});
