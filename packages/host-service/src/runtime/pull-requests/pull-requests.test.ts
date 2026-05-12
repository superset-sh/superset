import { describe, expect, test } from "bun:test";
import { pullRequests, workspaces } from "../../db/schema";
import {
	PullRequestRuntimeManager,
	type PullRequestRuntimeManagerOptions,
} from "./pull-requests";

const PROJECT_ID = "project-1";
const WORKSPACE_ID = "workspace-1";

interface FakeProject {
	id: string;
	repoPath: string;
	repoProvider: "github";
	repoOwner: string;
	repoName: string;
	repoUrl: string;
	remoteName: string;
}

interface FakeWorkspace {
	id: string;
	projectId: string;
	worktreePath: string;
	branch: string;
	headSha: string | null;
	upstreamOwner: string | null;
	upstreamRepo: string | null;
	upstreamBranch: string | null;
	pullRequestId: string | null;
}

interface FakePullRequest {
	id: string;
	projectId: string;
	repoProvider: "github";
	repoOwner: string;
	repoName: string;
	prNumber: number;
	url: string;
	title: string;
	state: string;
	isDraft: boolean;
	headBranch: string;
	headSha: string;
	reviewDecision: string | null;
	checksStatus: string;
	checksJson: string;
	lastFetchedAt: number | null;
	error: string | null;
	createdAt: number;
	updatedAt: number;
}

interface FakeState {
	project: FakeProject;
	workspace: FakeWorkspace;
	pullRequest: FakePullRequest | undefined;
}

function makeState(branch: string): FakeState {
	return {
		project: {
			id: PROJECT_ID,
			repoPath: "/repo",
			repoProvider: "github",
			repoOwner: "base-owner",
			repoName: "base-repo",
			repoUrl: "https://github.com/base-owner/base-repo.git",
			remoteName: "origin",
		},
		workspace: {
			id: WORKSPACE_ID,
			projectId: PROJECT_ID,
			worktreePath: `/repo/.worktrees/${branch}`,
			branch,
			headSha: null,
			upstreamOwner: null,
			upstreamRepo: null,
			upstreamBranch: null,
			pullRequestId: null,
		},
		pullRequest: undefined,
	};
}

function createFakeDb(state: FakeState) {
	return {
		query: {
			projects: {
				findFirst: () => ({ sync: () => state.project }),
			},
			pullRequests: {
				findFirst: () => ({ sync: () => state.pullRequest }),
			},
		},
		insert: (table: unknown) => ({
			values: (values: FakePullRequest) => ({
				run: () => {
					if (table === pullRequests) {
						state.pullRequest = values;
					}
				},
			}),
		}),
		update: (table: unknown) => ({
			set: (values: Partial<FakeWorkspace> | Partial<FakePullRequest>) => ({
				where: () => ({
					run: () => {
						if (table === workspaces) {
							state.workspace = {
								...state.workspace,
								...(values as Partial<FakeWorkspace>),
							};
						}
						if (table === pullRequests && state.pullRequest) {
							state.pullRequest = {
								...state.pullRequest,
								...(values as Partial<FakePullRequest>),
							};
						}
					},
				}),
			}),
		}),
		select: (shape?: unknown) => ({
			from: (table: unknown) => ({
				where: () => ({
					all: () => {
						if (table !== workspaces) return [];
						if (shape) return [{ projectId: state.workspace.projectId }];
						return [state.workspace];
					},
				}),
				all: () => {
					if (table !== workspaces) return [];
					if (shape) return [{ projectId: state.workspace.projectId }];
					return [state.workspace];
				},
			}),
		}),
	};
}

function createManager(
	state: FakeState,
	overrides: Partial<
		Pick<PullRequestRuntimeManagerOptions, "execGh" | "github">
	> = {},
) {
	return new PullRequestRuntimeManager({
		db: createFakeDb(state) as never,
		execGh:
			overrides.execGh ??
			(async () => {
				throw new Error("gh should not be used for direct PR linking");
			}),
		git: async () => {
			throw new Error("git should not be used when project metadata is set");
		},
		github:
			overrides.github ??
			(async () => {
				throw new Error("github should not be used for direct PR linking");
			}),
		gitWatcher: { onChanged: () => () => {} } as never,
	});
}

describe("PullRequestRuntimeManager direct checkout PR linking", () => {
	test("links a fork PR workspace to the selected PR and records fork upstream", async () => {
		const state = makeState("fork-owner/fix-typo");
		const manager = createManager(state);

		const prId = await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: WORKSPACE_ID,
			projectId: PROJECT_ID,
			pullRequest: {
				number: 42,
				url: "https://github.com/base-owner/base-repo/pull/42",
				title: "Fix typo",
				state: "open",
				isDraft: false,
				headRefName: "fix-typo",
				headRefOid: "abc123",
				headRepositoryOwner: "fork-owner",
				headRepositoryName: "fork-repo",
				isCrossRepository: true,
			},
		});

		expect(state.workspace.pullRequestId).toBe(prId);
		expect(state.workspace.upstreamOwner).toBe("fork-owner");
		expect(state.workspace.upstreamRepo).toBe("fork-repo");
		expect(state.workspace.upstreamBranch).toBe("fix-typo");
		expect(state.pullRequest?.prNumber).toBe(42);
		expect(state.pullRequest?.repoOwner).toBe("base-owner");
		expect(state.pullRequest?.repoName).toBe("base-repo");
		expect(state.pullRequest?.headBranch).toBe("fix-typo");
	});

	test("keeps a deleted-fork PR link when no upstream can be recorded", async () => {
		const state = makeState("pr/42");
		const manager = createManager(state);

		const prId = await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: WORKSPACE_ID,
			projectId: PROJECT_ID,
			pullRequest: {
				number: 42,
				url: "https://github.com/base-owner/base-repo/pull/42",
				title: "Deleted fork",
				state: "merged",
				headRefName: "fix-typo",
				headRefOid: "abc123",
				headRepositoryOwner: null,
				headRepositoryName: null,
				isCrossRepository: true,
			},
		});

		expect(state.workspace.pullRequestId).toBe(prId);
		expect(state.workspace.upstreamOwner).toBeNull();
		expect(state.workspace.upstreamRepo).toBeNull();
		expect(state.workspace.upstreamBranch).toBeNull();

		await manager.refreshPullRequestsByWorkspaces([WORKSPACE_ID]);

		expect(state.workspace.pullRequestId).toBe(prId);
	});

	test("clears a no-upstream PR link when workspace HEAD no longer matches the PR", async () => {
		const state = makeState("pr/42");
		const manager = createManager(state);

		await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: WORKSPACE_ID,
			projectId: PROJECT_ID,
			pullRequest: {
				number: 42,
				url: "https://github.com/base-owner/base-repo/pull/42",
				title: "Deleted fork",
				state: "merged",
				headRefName: "fix-typo",
				headRefOid: "abc123",
				headRepositoryOwner: null,
				headRepositoryName: null,
				isCrossRepository: true,
			},
		});
		state.workspace.headSha = "def456";

		await manager.refreshPullRequestsByWorkspaces([WORKSPACE_ID]);

		expect(state.workspace.pullRequestId).toBeNull();
	});

	test("preserves last-known review and checks when detail refresh fails", async () => {
		const state = makeState("fix/sidebar");
		state.workspace = {
			...state.workspace,
			headSha: "abc123",
			upstreamOwner: "fork-owner",
			upstreamRepo: "fork-repo",
			upstreamBranch: "fix/sidebar",
			pullRequestId: "pr-existing",
		};
		state.pullRequest = {
			id: "pr-existing",
			projectId: PROJECT_ID,
			repoProvider: "github",
			repoOwner: "base-owner",
			repoName: "base-repo",
			prNumber: 42,
			url: "https://github.com/base-owner/base-repo/pull/42",
			title: "Fix sidebar",
			state: "open",
			isDraft: false,
			headBranch: "fix/sidebar",
			headSha: "old-sha",
			reviewDecision: "approved",
			checksStatus: "success",
			checksJson: JSON.stringify([
				{
					name: "Typecheck",
					status: "success",
					url: "https://github.com/base-owner/base-repo/actions/1",
				},
			]),
			lastFetchedAt: 1,
			error: null,
			createdAt: 1,
			updatedAt: 1,
		};
		const manager = createManager(state, {
			execGh: async (args) => {
				const path = args.find((arg) => arg.startsWith("repos/"));
				if (path === "repos/base-owner/base-repo/pulls") {
					return [
						{
							number: 42,
							title: "Fix sidebar updated",
							html_url: "https://github.com/base-owner/base-repo/pull/42",
							state: "open",
							draft: false,
							merged_at: null,
							updated_at: "2026-05-08T12:00:00Z",
							head: {
								ref: "fix/sidebar",
								sha: "abc123",
								repo: {
									name: "fork-repo",
									owner: { login: "fork-owner" },
								},
							},
							base: {
								repo: {
									full_name: "base-owner/base-repo",
								},
							},
						},
					];
				}

				throw new Error("detail refresh unavailable");
			},
			github: async () => {
				throw new Error("octokit unavailable");
			},
		});

		const originalWarn = console.warn;
		console.warn = () => {};
		try {
			await manager.refreshPullRequestsByWorkspaces([WORKSPACE_ID]);
		} finally {
			console.warn = originalWarn;
		}

		expect(state.workspace.pullRequestId).toBe("pr-existing");
		expect(state.pullRequest?.title).toBe("Fix sidebar updated");
		expect(state.pullRequest?.headSha).toBe("abc123");
		expect(state.pullRequest?.reviewDecision).toBe("approved");
		expect(state.pullRequest?.checksStatus).toBe("success");
		expect(JSON.parse(state.pullRequest?.checksJson ?? "[]")).toEqual([
			{
				name: "Typecheck",
				status: "success",
				url: "https://github.com/base-owner/base-repo/actions/1",
			},
		]);
	});

	test("preserves existing pullRequestId when head lookup fails", async () => {
		const state = makeState("fix/sidebar");
		state.workspace = {
			...state.workspace,
			headSha: "abc123",
			upstreamOwner: "fork-owner",
			upstreamRepo: "fork-repo",
			upstreamBranch: "fix/sidebar",
			pullRequestId: "pr-existing",
		};
		const manager = createManager(state, {
			execGh: async () => {
				throw new Error("gh unavailable");
			},
			github: async () => {
				throw new Error("octokit unavailable");
			},
		});

		const originalWarn = console.warn;
		console.warn = () => {};
		try {
			await manager.refreshPullRequestsByWorkspaces([WORKSPACE_ID]);
		} finally {
			console.warn = originalWarn;
		}

		expect(state.workspace.pullRequestId).toBe("pr-existing");
	});
});

describe("PullRequestRuntimeManager shutdown", () => {
	test("stop waits for startup background work before returning", async () => {
		const manager = createManager(makeState("main"));
		let releaseSync: () => void = () => {
			throw new Error("sync did not start");
		};
		let resolveStarted: () => void = () => {};
		const started = new Promise<void>((resolve) => {
			resolveStarted = resolve;
		});
		let completed = false;
		const internals = manager as unknown as {
			syncWorkspaceBranches: () => Promise<void>;
			refreshEligibleProjects: () => Promise<void>;
		};
		internals.syncWorkspaceBranches = async () => {
			resolveStarted();
			await new Promise<void>((resolve) => {
				releaseSync = resolve;
			});
			completed = true;
		};
		internals.refreshEligibleProjects = async () => {};

		manager.start();
		await started;

		const stopPromise = manager.stop();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(completed).toBe(false);

		releaseSync();
		await stopPromise;
		expect(completed).toBe(true);
	});
});
