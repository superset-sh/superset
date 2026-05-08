import { describe, expect, test } from "bun:test";
import { pullRequests, workspaces } from "../../db/schema";
import { PullRequestRuntimeManager } from "./pull-requests";
import type { GraphQLPullRequestNode } from "./utils/github-query/types";

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

function createManager(state: FakeState) {
	return new PullRequestRuntimeManager({
		db: createFakeDb(state) as never,
		git: async () => {
			throw new Error("git should not be used when project metadata is set");
		},
		github: async () => {
			throw new Error("github should not be used for direct PR linking");
		},
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
});

// ---------------------------------------------------------------------------
// Multi-workspace test harness
// ---------------------------------------------------------------------------

interface MultiState {
	project: FakeProject;
	workspaces: FakeWorkspace[];
	pullRequests: FakePullRequest[];
}

function makeMultiState(
	workspaceConfigs: Array<{
		id: string;
		branch: string;
		upstreamOwner: string | null;
		upstreamRepo: string | null;
		upstreamBranch: string | null;
		pullRequestId?: string | null;
		headSha?: string | null;
	}>,
): MultiState {
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
		workspaces: workspaceConfigs.map((cfg) => ({
			id: cfg.id,
			projectId: PROJECT_ID,
			worktreePath: `/repo/.worktrees/${cfg.id}`,
			branch: cfg.branch,
			headSha: cfg.headSha ?? null,
			upstreamOwner: cfg.upstreamOwner,
			upstreamRepo: cfg.upstreamRepo,
			upstreamBranch: cfg.upstreamBranch,
			pullRequestId: cfg.pullRequestId ?? null,
		})),
		pullRequests: [],
	};
}

function extractEqRight(clause: unknown): string | null {
	// FRAGILE: couples to drizzle's internal SQL chunk shape. eq(col, val)
	// stringifies with the right-hand string value reachable as the rightmost
	// `"value": "..."`. Column references have circular parent links, so we
	// use a WeakSet replacer to break cycles. If a drizzle upgrade changes
	// the shape, inspect JSON.stringify(eq(col, val)) and update the regex,
	// or replace this helper with a real test-double for the DB layer.
	try {
		const seen = new WeakSet<object>();
		const json = JSON.stringify(clause, (_key, value) => {
			if (typeof value === "object" && value !== null) {
				if (seen.has(value)) return undefined;
				seen.add(value);
			}
			return value;
		});
		return [...json.matchAll(/"value":"([^"]+)"/g)].at(-1)?.[1] ?? null;
	} catch {
		return null;
	}
}

function createMultiFakeDb(state: MultiState) {
	return {
		query: {
			projects: {
				findFirst: () => ({ sync: () => state.project }),
			},
			pullRequests: {
				// Tests using this harness start with state.pullRequests = [] and don't
				// exercise the "update existing row" path. Returning undefined forces
				// upsertPullRequestRow into the insert branch, so each PR upserted by
				// production code lands as a distinct row keyed by its own UUID. If a
				// future test needs update-existing semantics, harden this to filter
				// state.pullRequests by the prNumber inside the where clause.
				findFirst: (_args: { where: unknown }) => ({
					sync: () => undefined,
				}),
			},
		},
		insert: (table: unknown) => ({
			values: (values: FakePullRequest) => ({
				run: () => {
					if (table === pullRequests) {
						state.pullRequests.push(values);
					}
				},
			}),
		}),
		update: (table: unknown) => ({
			set: (values: Partial<FakeWorkspace> | Partial<FakePullRequest>) => ({
				where: (clause: unknown) => ({
					run: () => {
						const id = extractEqRight(clause);
						if (!id) return;
						if (table === workspaces) {
							const idx = state.workspaces.findIndex((w) => w.id === id);
							if (idx >= 0) {
								state.workspaces[idx] = {
									...state.workspaces[idx],
									...(values as Partial<FakeWorkspace>),
								} as FakeWorkspace;
							}
						}
						if (table === pullRequests) {
							const idx = state.pullRequests.findIndex((p) => p.id === id);
							if (idx >= 0) {
								state.pullRequests[idx] = {
									...state.pullRequests[idx],
									...(values as Partial<FakePullRequest>),
								} as FakePullRequest;
							}
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
						if (shape) {
							return state.workspaces.map((w) => ({ projectId: w.projectId }));
						}
						return state.workspaces;
					},
				}),
				all: () => {
					if (table !== workspaces) return [];
					if (shape) {
						return state.workspaces.map((w) => ({ projectId: w.projectId }));
					}
					return state.workspaces;
				},
			}),
		}),
	};
}

interface FakeOctokit {
	graphql: <T>(query: string, vars: Record<string, unknown>) => Promise<T>;
}

function createMockOctokit(
	handler: (
		vars: { owner: string; repo: string; branch: string },
	) => GraphQLPullRequestNode | null | Promise<GraphQLPullRequestNode | null>,
	callCounter?: { count: number },
): FakeOctokit {
	return {
		graphql: async <T,>(_q: string, vars: Record<string, unknown>): Promise<T> => {
			if (callCounter) callCounter.count++;
			const node = await handler(
				vars as { owner: string; repo: string; branch: string },
			);
			return {
				repository: {
					pullRequests: { nodes: node ? [node] : [] },
				},
			} as T;
		},
	};
}

function makeNode(overrides: Partial<GraphQLPullRequestNode> & {
	number: number;
	headRefName: string;
	headOwnerLogin: string;
	headRepoName: string;
}): GraphQLPullRequestNode {
	return {
		number: overrides.number,
		title: overrides.title ?? `PR ${overrides.number}`,
		url: overrides.url ?? `https://github.com/base-owner/base-repo/pull/${overrides.number}`,
		state: overrides.state ?? "OPEN",
		isDraft: overrides.isDraft ?? false,
		headRefName: overrides.headRefName,
		headRefOid: overrides.headRefOid ?? `sha-${overrides.number}`,
		isCrossRepository: overrides.isCrossRepository ?? false,
		headRepositoryOwner: { login: overrides.headOwnerLogin },
		headRepository: { name: overrides.headRepoName },
		reviewDecision: overrides.reviewDecision ?? null,
		updatedAt: overrides.updatedAt ?? new Date().toISOString(),
		statusCheckRollup: overrides.statusCheckRollup ?? null,
	};
}

function createMultiManager(
	state: MultiState,
	octokit: FakeOctokit,
): PullRequestRuntimeManager {
	return new PullRequestRuntimeManager({
		db: createMultiFakeDb(state) as never,
		git: async () => {
			throw new Error("git should not be used when project metadata is set");
		},
		github: async () => octokit as never,
		gitWatcher: { onChanged: () => () => {} } as never,
	});
}
