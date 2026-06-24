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
	repoProvider: "github" | null;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl: string | null;
	remoteName: string | null;
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
	repoProvider: string;
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
	reviewStateJson: string | null;
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
		Pick<
			PullRequestRuntimeManagerOptions,
			"execGh" | "github" | "detectProvider" | "git"
		>
	> = {},
) {
	return new PullRequestRuntimeManager({
		db: createFakeDb(state) as never,
		execGh:
			overrides.execGh ??
			(async () => {
				throw new Error("gh should not be used for direct PR linking");
			}),
		git:
			overrides.git ??
			(async () => {
				throw new Error("git should not be used when project metadata is set");
			}),
		github:
			overrides.github ??
			(async () => {
				throw new Error("github should not be used for direct PR linking");
			}),
		gitWatcher: { onChanged: () => () => {} } as never,
		detectProvider: overrides.detectProvider,
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
			reviewStateJson: null,
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

	test("persists review_state_json as github-variant union and keeps review_decision after refresh", async () => {
		const state = makeState("feat/add-column");
		state.workspace = {
			...state.workspace,
			headSha: "sha-new",
			upstreamOwner: "base-owner",
			upstreamRepo: "base-repo",
			upstreamBranch: "feat/add-column",
			pullRequestId: null,
		};

		const manager = createManager(state, {
			execGh: async (args) => {
				const path = args.find((arg) => arg.startsWith("repos/"));
				// PR head lookup
				if (path === "repos/base-owner/base-repo/pulls") {
					return [
						{
							number: 99,
							title: "Add column",
							html_url: "https://github.com/base-owner/base-repo/pull/99",
							state: "open",
							draft: false,
							merged_at: null,
							updated_at: "2026-06-08T10:00:00Z",
							head: {
								ref: "feat/add-column",
								sha: "sha-new",
								repo: {
									name: "base-repo",
									owner: { login: "base-owner" },
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
				// Review decision lookup
				if (path === "repos/base-owner/base-repo/pulls/99/reviews") {
					return [
						{
							user: { login: "reviewer" },
							state: "APPROVED",
							submitted_at: "2026-06-08T09:00:00Z",
						},
					];
				}
				// Checks lookup (check-runs + statuses)
				if (
					path?.startsWith(
						"repos/base-owner/base-repo/commits/sha-new/check-runs",
					)
				) {
					return { check_runs: [] };
				}
				if (
					path?.startsWith(
						"repos/base-owner/base-repo/commits/sha-new/statuses",
					)
				) {
					return [];
				}
				throw new Error(`Unexpected gh path: ${path}`);
			},
			github: async () => {
				throw new Error("octokit should not be used");
			},
		});

		await manager.refreshPullRequestsByWorkspaces([WORKSPACE_ID]);

		// review_decision must still be written as before (normalized lowercase form)
		expect(state.pullRequest?.reviewDecision).toBe("approved");

		// review_state_json must contain the §6 github-variant union (raw uppercase form)
		const parsed = JSON.parse(state.pullRequest?.reviewStateJson ?? "null");
		expect(parsed).not.toBeNull();
		expect(parsed.provider).toBe("github");
		expect(parsed.reviewDecision).toBe("APPROVED");
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

// ---------------------------------------------------------------------------
// Self-managed GitLab provider detection
// ---------------------------------------------------------------------------

describe("PullRequestRuntimeManager self-managed GitLab detection", () => {
	/**
	 * Build a state where the project has no cached repo metadata (simulating a
	 * fresh project whose remote has never been analysed). The remote URL points
	 * at a self-managed host so parseGitRemote returns provider:"unknown".
	 */
	function makeUnparsedGitLabState(branch: string): FakeState {
		return {
			project: {
				id: PROJECT_ID,
				repoPath: "/repo",
				repoProvider: null,
				repoOwner: null,
				repoName: null,
				repoUrl: null,
				remoteName: null,
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

	const SELF_MANAGED_HOST = "gitlab.acme.dev";
	const SELF_MANAGED_REMOTE = `https://${SELF_MANAGED_HOST}/acme-group/acme-repo.git`;

	test("detectProvider returning 'gitlab' yields a NormalizedRepoIdentity with provider 'gitlab'", async () => {
		const state = makeUnparsedGitLabState("feat/self-managed");
		let detectedHost: string | undefined;

		const manager = createManager(state, {
			git: async () =>
				({
					remote: async (args: string[]) => {
						if (args[0] === "get-url" && args[1] === "origin") {
							return SELF_MANAGED_REMOTE;
						}
						throw new Error(`Unexpected git remote args: ${args.join(" ")}`);
					},
				}) as never,
			detectProvider: async (host: string) => {
				detectedHost = host;
				return "gitlab";
			},
		});

		// linkWorkspaceToCheckoutPullRequest calls getProjectRepository internally.
		// We pass a valid PR so the method proceeds; we only care that repo
		// resolution works (returns non-null) and that the project is persisted.
		const prId = await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: WORKSPACE_ID,
			projectId: PROJECT_ID,
			pullRequest: {
				number: 7,
				url: `https://${SELF_MANAGED_HOST}/acme-group/acme-repo/-/merge_requests/7`,
				title: "Self-managed MR",
				state: "open",
				isDraft: false,
				headRefName: "feat/self-managed",
				headRefOid: "deadbeef",
				headRepositoryOwner: null,
				headRepositoryName: null,
				isCrossRepository: false,
			},
		});

		// The linkage should succeed (non-null ID) — repo was resolved as gitlab.
		expect(prId).not.toBeNull();
		// detectProvider must have been called with the self-managed host.
		expect(detectedHost).toBe(SELF_MANAGED_HOST);
	});

	test("detectProvider returning 'gitlab' persists repoProvider on the project row", async () => {
		const state = makeUnparsedGitLabState("feat/persist-check");
		// Extend the fake DB to capture projects updates.
		let persistedProvider: string | undefined;
		const origDb = createFakeDb(state);
		const fakeDb = {
			...origDb,
			update: (table: unknown) => {
				const base = origDb.update(table);
				return {
					set: (values: Record<string, unknown>) => {
						// Capture project updates (projects table is a different reference).
						if (values.repoProvider !== undefined) {
							persistedProvider = values.repoProvider as string;
						}
						return base.set(values as never);
					},
				};
			},
		};

		const manager = new PullRequestRuntimeManager({
			db: fakeDb as never,
			execGh: async () => {
				throw new Error("not used");
			},
			git: async () =>
				({
					remote: async (args: string[]) => {
						if (args[0] === "get-url" && args[1] === "origin") {
							return SELF_MANAGED_REMOTE;
						}
						throw new Error(`Unexpected git remote args: ${args.join(" ")}`);
					},
				}) as never,
			github: async () => {
				throw new Error("not used");
			},
			gitWatcher: { onChanged: () => () => {} } as never,
			detectProvider: async () => "gitlab",
		});

		await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: WORKSPACE_ID,
			projectId: PROJECT_ID,
			pullRequest: {
				number: 8,
				url: `https://${SELF_MANAGED_HOST}/acme-group/acme-repo/-/merge_requests/8`,
				title: "Persist check",
				state: "open",
				isDraft: false,
				headRefName: "feat/persist-check",
				headRefOid: "cafebabe",
				headRepositoryOwner: null,
				headRepositoryName: null,
				isCrossRepository: false,
			},
		});

		expect(persistedProvider).toBe("gitlab");
	});

	test("detectProvider returning 'unknown' causes getProjectRepository to return null (skipped, no throw)", async () => {
		const state = makeUnparsedGitLabState("feat/unknown-host");

		const manager = createManager(state, {
			git: async () =>
				({
					remote: async (args: string[]) => {
						if (args[0] === "get-url" && args[1] === "origin") {
							return "https://some.bitbucket.host/team/repo.git";
						}
						throw new Error(`Unexpected git remote args: ${args.join(" ")}`);
					},
				}) as never,
			detectProvider: async () => "unknown",
		});

		// Should not throw; should return null silently (local-only project).
		const prId = await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: WORKSPACE_ID,
			projectId: PROJECT_ID,
			pullRequest: {
				number: 9,
				url: "https://some.bitbucket.host/team/repo/-/merge_requests/9",
				title: "Unknown host MR",
				state: "open",
				isDraft: false,
				headRefName: "feat/unknown-host",
				headRefOid: "0000cafe",
				headRepositoryOwner: null,
				headRepositoryName: null,
				isCrossRepository: false,
			},
		});

		// linkWorkspaceToCheckoutPullRequest returns null when repo is null.
		expect(prId).toBeNull();
	});

	test("github.com projects skip detectProvider entirely (provider resolved by parseGitRemote)", async () => {
		const state = makeState("feat/github-no-probe");
		let detectProviderCalled = false;

		const manager = createManager(state, {
			detectProvider: async () => {
				detectProviderCalled = true;
				return "github";
			},
		});

		await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: WORKSPACE_ID,
			projectId: PROJECT_ID,
			pullRequest: {
				number: 1,
				url: "https://github.com/base-owner/base-repo/pull/1",
				title: "GitHub PR",
				state: "open",
				isDraft: false,
				headRefName: "feat/github-no-probe",
				headRefOid: "aabbccdd",
				headRepositoryOwner: null,
				headRepositoryName: null,
				isCrossRepository: false,
			},
		});

		// detectProvider must NOT have been called for a github.com project.
		expect(detectProviderCalled).toBe(false);
	});
});
