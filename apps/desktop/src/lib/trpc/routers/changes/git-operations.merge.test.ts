import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import type { GitHubMergeCapabilities } from "@superset/shared/github-merge-methods";

interface MergeSettings extends GitHubMergeCapabilities {
	viewerDefaultMergeMethod: string | null;
}

const getRepoMergeSettingsMock = mock(
	async (): Promise<MergeSettings | null> => null,
);
const getRepoContextMock = mock(async () => null);
const fetchGitHubPRStatusMock = mock(async () => null);
const clearGitHubCachesForWorktreeMock = mock(
	(_worktreePath: string): void => {},
);
const mergePullRequestMock = mock(
	async (_input: unknown): Promise<{ success: boolean; mergedAt: string }> => ({
		success: true,
		mergedAt: "2026-08-07T00:00:00.000Z",
	}),
);
const assertRegisteredWorktreeMock = mock((_worktreePath: string): void => {});

mock.module("../workspaces/utils/github", () => ({
	clearGitHubCachesForWorktree: clearGitHubCachesForWorktreeMock,
	fetchGitHubPRStatus: fetchGitHubPRStatusMock,
	getRepoContext: getRepoContextMock,
	getRepoMergeSettings: getRepoMergeSettingsMock,
}));
mock.module("./security/path-validation", () => ({
	assertRegisteredWorktree: assertRegisteredWorktreeMock,
}));
mock.module("./utils/merge-pull-request", () => ({
	mergePullRequest: mergePullRequestMock,
}));

let createGitOperationsRouter: typeof import("./git-operations").createGitOperationsRouter;

type GitOperationsRouter = ReturnType<
	typeof import("./git-operations").createGitOperationsRouter
>;
type GitOperationsCaller = ReturnType<GitOperationsRouter["createCaller"]>;

describe("changes.mergePR repository settings guard", () => {
	let caller: GitOperationsCaller;

	beforeAll(async () => {
		({ createGitOperationsRouter } = await import("./git-operations"));
		caller = createGitOperationsRouter().createCaller({});
	});

	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		getRepoMergeSettingsMock.mockReset();
		getRepoMergeSettingsMock.mockResolvedValue(null);
		mergePullRequestMock.mockReset();
		mergePullRequestMock.mockResolvedValue({
			success: true,
			mergedAt: "2026-08-07T00:00:00.000Z",
		});
		assertRegisteredWorktreeMock.mockReset();
	});

	test("rejects an explicitly disabled strategy before merging", async () => {
		getRepoMergeSettingsMock.mockResolvedValue({
			allowMergeCommit: true,
			allowRebaseMerge: true,
			allowSquashMerge: false,
			viewerDefaultMergeMethod: "MERGE",
		});

		await expect(
			caller.mergePR({
				worktreePath: "/tmp/merge-settings-test",
				strategy: "squash",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(mergePullRequestMock).not.toHaveBeenCalled();
	});

	test("keeps the existing merge behavior when settings are unavailable", async () => {
		await expect(
			caller.mergePR({
				worktreePath: "/tmp/merge-settings-test",
				strategy: "rebase",
			}),
		).resolves.toEqual({
			success: true,
			mergedAt: "2026-08-07T00:00:00.000Z",
		});

		expect(mergePullRequestMock).toHaveBeenCalledWith({
			worktreePath: "/tmp/merge-settings-test",
			strategy: "rebase",
		});
	});

	test("keeps merge behavior when a capability is unknown", async () => {
		getRepoMergeSettingsMock.mockResolvedValue({
			allowRebaseMerge: null,
			viewerDefaultMergeMethod: "MERGE",
		});

		await expect(
			caller.mergePR({
				worktreePath: "/tmp/merge-settings-test",
				strategy: "rebase",
			}),
		).resolves.toEqual({
			success: true,
			mergedAt: "2026-08-07T00:00:00.000Z",
		});

		expect(mergePullRequestMock).toHaveBeenCalledWith({
			worktreePath: "/tmp/merge-settings-test",
			strategy: "rebase",
		});
	});
});
