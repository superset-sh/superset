import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

type GetCurrentBranch =
	typeof import("../../workspaces/utils/git").getCurrentBranch;
type ExecGitWithShellPath =
	typeof import("../../workspaces/utils/git-client").execGitWithShellPath;
type GetPRForBranch =
	typeof import("../../workspaces/utils/github").getPRForBranch;
type GetPullRequestRepoArgs =
	typeof import("../../workspaces/utils/github").getPullRequestRepoArgs;
type GetRepoContext =
	typeof import("../../workspaces/utils/github").getRepoContext;
type ExecWithShellEnv =
	typeof import("../../workspaces/utils/shell-env").execWithShellEnv;
type IsNoPullRequestFoundMessage =
	typeof import("../git-utils").isNoPullRequestFoundMessage;
type ClearWorktreeStatusCaches =
	typeof import("./worktree-status-caches").clearWorktreeStatusCaches;

const getCurrentBranchMock = mock(
	(async (..._args: Parameters<GetCurrentBranch>) => null) as GetCurrentBranch,
);
const execGitWithShellPathMock = mock((async (
	..._args: Parameters<ExecGitWithShellPath>
) => ({
	stdout: "",
	stderr: "",
})) as ExecGitWithShellPath);
const getRepoContextMock = mock(
	(async (..._args: Parameters<GetRepoContext>) => null) as GetRepoContext,
);
const getPRForBranchMock = mock(
	(async (..._args: Parameters<GetPRForBranch>) => null) as GetPRForBranch,
);
const getPullRequestRepoArgsMock = mock(((
	..._args: Parameters<GetPullRequestRepoArgs>
) => []) as GetPullRequestRepoArgs);
const execWithShellEnvMock = mock((async (
	..._args: Parameters<ExecWithShellEnv>
) => ({
	stdout: "",
	stderr: "",
})) as ExecWithShellEnv);
const isNoPullRequestFoundMessageMock = mock(
	((..._args: Parameters<IsNoPullRequestFoundMessage>) =>
		false) as IsNoPullRequestFoundMessage,
);
const clearWorktreeStatusCachesMock = mock(
	((..._args: Parameters<ClearWorktreeStatusCaches>) =>
		undefined) as ClearWorktreeStatusCaches,
);
const openPullRequest = {
	number: 42,
	title: "Test PR",
	url: "https://github.com/superset-sh/superset/pull/42",
	state: "open" as const,
	additions: 0,
	deletions: 0,
	reviewDecision: "pending" as const,
	checksStatus: "none" as const,
	checks: [],
};
let mergePullRequest: typeof import("./merge-pull-request").mergePullRequest;

describe("mergePullRequest", () => {
	beforeAll(async () => {
		const gitModule = await import("../../workspaces/utils/git");
		const gitClientModule = await import("../../workspaces/utils/git-client");
		const githubModule = await import("../../workspaces/utils/github");
		const shellEnvModule = await import("../../workspaces/utils/shell-env");
		const gitUtilsModule = await import("../git-utils");
		const worktreeStatusCachesModule = await import("./worktree-status-caches");

		spyOn(gitModule, "getCurrentBranch").mockImplementation(((
			...args: Parameters<typeof gitModule.getCurrentBranch>
		) => getCurrentBranchMock(...args)) as typeof gitModule.getCurrentBranch);
		spyOn(gitModule, "isUnbornHeadError").mockImplementation(
			((error: unknown) =>
				error instanceof Error &&
				error.message.includes(
					"ambiguous argument 'HEAD'",
				)) as typeof gitModule.isUnbornHeadError,
		);
		spyOn(gitClientModule, "execGitWithShellPath").mockImplementation(((
			...args: Parameters<typeof gitClientModule.execGitWithShellPath>
		) =>
			execGitWithShellPathMock(
				...args,
			)) as typeof gitClientModule.execGitWithShellPath);
		spyOn(githubModule, "getPRForBranch").mockImplementation(((
			...args: Parameters<typeof githubModule.getPRForBranch>
		) => getPRForBranchMock(...args)) as typeof githubModule.getPRForBranch);
		spyOn(githubModule, "getPullRequestRepoArgs").mockImplementation(((
			...args: Parameters<typeof githubModule.getPullRequestRepoArgs>
		) =>
			getPullRequestRepoArgsMock(
				...args,
			)) as typeof githubModule.getPullRequestRepoArgs);
		spyOn(githubModule, "getRepoContext").mockImplementation(((
			...args: Parameters<typeof githubModule.getRepoContext>
		) => getRepoContextMock(...args)) as typeof githubModule.getRepoContext);
		spyOn(shellEnvModule, "execWithShellEnv").mockImplementation(((
			...args: Parameters<typeof shellEnvModule.execWithShellEnv>
		) =>
			execWithShellEnvMock(...args)) as typeof shellEnvModule.execWithShellEnv);
		spyOn(gitUtilsModule, "isNoPullRequestFoundMessage").mockImplementation(((
			...args: Parameters<typeof gitUtilsModule.isNoPullRequestFoundMessage>
		) =>
			isNoPullRequestFoundMessageMock(
				...args,
			)) as typeof gitUtilsModule.isNoPullRequestFoundMessage);
		spyOn(
			worktreeStatusCachesModule,
			"clearWorktreeStatusCaches",
		).mockImplementation(((
			...args: Parameters<
				typeof worktreeStatusCachesModule.clearWorktreeStatusCaches
			>
		) =>
			clearWorktreeStatusCachesMock(
				...args,
			)) as typeof worktreeStatusCachesModule.clearWorktreeStatusCaches);

		({ mergePullRequest } = await import("./merge-pull-request"));
	});

	afterAll(() => {
		mock.restore();
	});

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
		execWithShellEnvMock.mockResolvedValue({
			stdout: "",
			stderr: "",
		});
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
		getPRForBranchMock.mockResolvedValue(openPullRequest);

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
