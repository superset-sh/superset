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
	handler: (vars: {
		owner: string;
		repo: string;
		branch: string;
	}) => GraphQLPullRequestNode | null | Promise<GraphQLPullRequestNode | null>,
	callCounter?: { count: number },
): FakeOctokit {
	return {
		graphql: async <T>(
			_q: string,
			vars: Record<string, unknown>,
		): Promise<T> => {
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

function makeNode(
	overrides: Partial<GraphQLPullRequestNode> & {
		number: number;
		headRefName: string;
		headOwnerLogin: string;
		headRepoName: string;
	},
): GraphQLPullRequestNode {
	return {
		number: overrides.number,
		title: overrides.title ?? `PR ${overrides.number}`,
		url:
			overrides.url ??
			`https://github.com/base-owner/base-repo/pull/${overrides.number}`,
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

// ---------------------------------------------------------------------------
// Task 7: per-branch routing & dedup
// ---------------------------------------------------------------------------

describe("PullRequestRuntimeManager per-branch PR fetch", () => {
	test("fetches one PR per unique workspace branch and links each workspace", async () => {
		const state = makeMultiState([
			{
				id: "ws-a",
				branch: "feat/a",
				upstreamOwner: "base-owner",
				upstreamRepo: "base-repo",
				upstreamBranch: "feat/a",
			},
			{
				id: "ws-b",
				branch: "feat/b",
				upstreamOwner: "base-owner",
				upstreamRepo: "base-repo",
				upstreamBranch: "feat/b",
			},
		]);
		const counter = { count: 0 };
		const octokit = createMockOctokit(({ branch }) => {
			if (branch === "feat/a") {
				return makeNode({
					number: 1,
					headRefName: "feat/a",
					headOwnerLogin: "base-owner",
					headRepoName: "base-repo",
				});
			}
			if (branch === "feat/b") {
				return makeNode({
					number: 2,
					headRefName: "feat/b",
					headOwnerLogin: "base-owner",
					headRepoName: "base-repo",
				});
			}
			return null;
		}, counter);
		const manager = createMultiManager(state, octokit);

		await manager.refreshPullRequestsByWorkspaces(["ws-a", "ws-b"]);

		expect(counter.count).toBe(2);
		const wsA = state.workspaces.find((w) => w.id === "ws-a");
		const wsB = state.workspaces.find((w) => w.id === "ws-b");
		expect(wsA?.pullRequestId).toBeTruthy();
		expect(wsB?.pullRequestId).toBeTruthy();
		expect(wsA?.pullRequestId).not.toBe(wsB?.pullRequestId);
	});

	test("dedups when multiple workspaces share the same upstream branch", async () => {
		const state = makeMultiState([
			{
				id: "ws-a",
				branch: "shared",
				upstreamOwner: "base-owner",
				upstreamRepo: "base-repo",
				upstreamBranch: "shared",
			},
			{
				id: "ws-b",
				branch: "shared",
				upstreamOwner: "base-owner",
				upstreamRepo: "base-repo",
				upstreamBranch: "shared",
			},
		]);
		const counter = { count: 0 };
		const octokit = createMockOctokit(
			() =>
				makeNode({
					number: 7,
					headRefName: "shared",
					headOwnerLogin: "base-owner",
					headRepoName: "base-repo",
				}),
			counter,
		);
		const manager = createMultiManager(state, octokit);

		await manager.refreshPullRequestsByWorkspaces(["ws-a", "ws-b"]);

		expect(counter.count).toBe(1);
		const ids = state.workspaces.map((w) => w.pullRequestId);
		expect(ids[0]).toBeTruthy();
		expect(ids[0]).toBe(ids[1]);
	});

	// ---------------------------------------------------------------------------
	// Task 8: failure isolation
	// ---------------------------------------------------------------------------

	test("preserves existing pullRequestId when a single branch's fetch rejects", async () => {
		const state = makeMultiState([
			{
				id: "ws-a",
				branch: "feat/a",
				upstreamOwner: "base-owner",
				upstreamRepo: "base-repo",
				upstreamBranch: "feat/a",
			},
			{
				id: "ws-b",
				branch: "feat/b",
				upstreamOwner: "base-owner",
				upstreamRepo: "base-repo",
				upstreamBranch: "feat/b",
				pullRequestId: "existing-pr-id-for-b",
			},
		]);
		const octokit = createMockOctokit(({ branch }) => {
			if (branch === "feat/a") {
				return makeNode({
					number: 1,
					headRefName: "feat/a",
					headOwnerLogin: "base-owner",
					headRepoName: "base-repo",
				});
			}
			throw new Error("simulated 504");
		});
		const manager = createMultiManager(state, octokit);

		await manager.refreshPullRequestsByWorkspaces(["ws-a", "ws-b"]);

		const wsA = state.workspaces.find((w) => w.id === "ws-a");
		const wsB = state.workspaces.find((w) => w.id === "ws-b");
		// A succeeded — got a fresh row distinct from B's existing id.
		expect(wsA?.pullRequestId).not.toBeNull();
		expect(wsA?.pullRequestId).not.toBe("existing-pr-id-for-b");
		expect(state.pullRequests).toHaveLength(1);
		// B's fetch rejected — its existing link must NOT be blanked.
		expect(wsB?.pullRequestId).toBe("existing-pr-id-for-b");
	});

	// ---------------------------------------------------------------------------
	// Task 9: fork head-identity match
	// ---------------------------------------------------------------------------

	test("links a fork PR when head identity matches workspace upstream", async () => {
		const state = makeMultiState([
			{
				id: "ws-fork",
				branch: "feat/x",
				upstreamOwner: "fork-owner",
				upstreamRepo: "fork-repo",
				upstreamBranch: "feat/x",
			},
		]);
		const octokit = createMockOctokit(({ branch }) =>
			makeNode({
				number: 9,
				headRefName: branch,
				headOwnerLogin: "fork-owner",
				headRepoName: "fork-repo",
				isCrossRepository: true,
			}),
		);
		const manager = createMultiManager(state, octokit);

		await manager.refreshPullRequestsByWorkspaces(["ws-fork"]);

		expect(state.workspaces[0]?.pullRequestId).toBeTruthy();
	});

	test("does NOT link a base-repo PR sharing branch name with a fork workspace", async () => {
		const state = makeMultiState([
			{
				id: "ws-fork",
				branch: "main",
				upstreamOwner: "fork-owner",
				upstreamRepo: "fork-repo",
				upstreamBranch: "main",
				// Stale link present so toBeNull() distinguishes "cleared by mismatch"
				// from "never set".
				pullRequestId: "stale-id",
			},
		]);
		const octokit = createMockOctokit(({ branch }) =>
			// Base repo has a PR with same branch name "main" but head is base, not fork.
			makeNode({
				number: 99,
				headRefName: branch,
				headOwnerLogin: "base-owner",
				headRepoName: "base-repo",
				isCrossRepository: false,
			}),
		);
		const manager = createMultiManager(state, octokit);

		await manager.refreshPullRequestsByWorkspaces(["ws-fork"]);

		expect(state.workspaces[0]?.pullRequestId).toBeNull();
	});

	// ---------------------------------------------------------------------------
	// Task 10: no matching PR & cache TTL
	// ---------------------------------------------------------------------------

	test("sets pullRequestId to null when no PR matches the branch", async () => {
		const state = makeMultiState([
			{
				id: "ws-orphan",
				branch: "no-pr-yet",
				upstreamOwner: "base-owner",
				upstreamRepo: "base-repo",
				upstreamBranch: "no-pr-yet",
				pullRequestId: "stale-id",
			},
		]);
		const octokit = createMockOctokit(() => null);
		const manager = createMultiManager(state, octokit);

		await manager.refreshPullRequestsByWorkspaces(["ws-orphan"]);

		expect(state.workspaces[0]?.pullRequestId).toBeNull();
	});

	test("caches per-branch results within TTL, re-fetches after", async () => {
		const state = makeMultiState([
			{
				id: "ws-a",
				branch: "feat/a",
				upstreamOwner: "base-owner",
				upstreamRepo: "base-repo",
				upstreamBranch: "feat/a",
			},
		]);
		const counter = { count: 0 };
		const octokit = createMockOctokit(
			() =>
				makeNode({
					number: 1,
					headRefName: "feat/a",
					headOwnerLogin: "base-owner",
					headRepoName: "base-repo",
				}),
			counter,
		);
		const manager = createMultiManager(state, octokit);

		// First refresh: bypassCache=true → fires graphql, populates cache.
		await manager.refreshPullRequestsByWorkspaces(["ws-a"]);
		expect(counter.count).toBe(1);

		// Second refresh via the private non-bypass path. Reach in (test-only).
		// `refreshProject` is private; calling it does NOT pass bypassCache, so
		// the cached result must be reused.
		const internal = manager as unknown as {
			refreshProject: (projectId: string) => Promise<void>;
		};
		await internal.refreshProject(PROJECT_ID);
		expect(counter.count).toBe(1); // cache hit, no new graphql call

		// Force the cache entry stale, then refresh again — graphql must fire.
		const cache = (
			manager as unknown as {
				branchPullRequestCache: Map<
					string,
					{ promise: unknown; fetchedAt: number }
				>;
			}
		).branchPullRequestCache;
		for (const [k, v] of cache) {
			cache.set(k, { ...v, fetchedAt: 0 });
		}
		await internal.refreshProject(PROJECT_ID);
		expect(counter.count).toBe(2); // cache miss, re-fetched
	});

	// ---------------------------------------------------------------------------
	// Task 11: cache eviction
	// ---------------------------------------------------------------------------

	test("evicts stale cache entries for branches no longer wanted", async () => {
		const state = makeMultiState([
			{
				id: "ws-a",
				branch: "feat/a",
				upstreamOwner: "base-owner",
				upstreamRepo: "base-repo",
				upstreamBranch: "feat/a",
			},
		]);
		const counter = { count: 0 };
		const octokit = createMockOctokit(
			({ branch }) =>
				makeNode({
					number: branch === "feat/a" ? 1 : 2,
					headRefName: branch,
					headOwnerLogin: "base-owner",
					headRepoName: "base-repo",
				}),
			counter,
		);
		const manager = createMultiManager(state, octokit);

		// First refresh populates cache for feat/a.
		await manager.refreshPullRequestsByWorkspaces(["ws-a"]);
		expect(counter.count).toBe(1);

		// Workspace switches branches.
		const ws0 = state.workspaces[0];
		if (ws0) {
			ws0.upstreamBranch = "feat/b";
			ws0.branch = "feat/b";
		}

		// Force time past TTL by directly poking the cache entry (test-side knob).
		// We rely on the cache eviction logic running at the end of
		// performProjectRefresh; to make feat/a's entry stale, mutate the
		// cache's fetchedAt via a private accessor. Public API doesn't expose it,
		// so we use `as never` to reach in for test purposes only.
		const cache = (
			manager as unknown as {
				branchPullRequestCache: Map<
					string,
					{ promise: unknown; fetchedAt: number }
				>;
			}
		).branchPullRequestCache;
		for (const [k, v] of cache) {
			cache.set(k, { ...v, fetchedAt: 0 });
		}

		await manager.refreshPullRequestsByWorkspaces(["ws-a"]);

		// After eviction, feat/a's stale entry must be gone; feat/b's fresh entry remains.
		const remainingKeys = [...cache.keys()];
		expect(remainingKeys.some((k) => k.endsWith("#feat/a"))).toBe(false);
		expect(remainingKeys.some((k) => k.endsWith("#feat/b"))).toBe(true);
	});
});
