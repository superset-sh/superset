import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { pullRequests, workspaces } from "../../db/schema";
import {
	PullRequestRuntimeManager,
	type PullRequestRuntimeManagerOptions,
} from "./pull-requests";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

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

	// Case drift: local branch `roshvan/…` vs PR head `Roshvan/…`. The
	// case-sensitive `head=` query returns nothing; the open-PR sweep must
	// still link the workspace case-insensitively.
	test("links a case-drifted branch to its PR via the open-PR sweep", async () => {
		const state = makeState("roshvan/fix-thing");
		state.workspace = {
			...state.workspace,
			headSha: "abc123",
			upstreamOwner: "base-owner",
			upstreamRepo: "base-repo",
			upstreamBranch: "roshvan/fix-thing",
		};
		const manager = createManager(state, {
			execGh: async (args) => {
				// Case-sensitive server-side filter: the drifted casing misses.
				if (args.includes("head=base-owner:roshvan/fix-thing")) return [];
				const path = args.find(
					(arg) => typeof arg === "string" && arg.startsWith("repos/"),
				);
				if (
					path === "repos/base-owner/base-repo/pulls" &&
					args.includes("state=open")
				) {
					return [
						{
							number: 77,
							title: "Fix thing",
							html_url: "https://github.com/base-owner/base-repo/pull/77",
							state: "open",
							draft: false,
							merged_at: null,
							updated_at: "2026-05-08T12:00:00Z",
							head: {
								ref: "Roshvan/fix-thing",
								sha: "abc123",
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

		expect(state.pullRequest?.prNumber).toBe(77);
		expect(state.pullRequest?.headBranch).toBe("Roshvan/fix-thing");
		expect(state.workspace.pullRequestId).toBe(state.pullRequest?.id ?? "");
	});

	// A transient sweep failure must not clear an existing link for a
	// branch the per-head query can't see.
	test("keeps an existing link when the open-PR sweep fails", async () => {
		const state = makeState("roshvan/fix-thing");
		state.workspace = {
			...state.workspace,
			headSha: "abc123",
			upstreamOwner: "base-owner",
			upstreamRepo: "base-repo",
			upstreamBranch: "roshvan/fix-thing",
			pullRequestId: "pr-existing",
		};
		const manager = createManager(state, {
			execGh: async (args) => {
				if (args.includes("head=base-owner:roshvan/fix-thing")) return [];
				throw new Error("sweep unavailable");
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

// ── Multi-workspace regression suite (real in-memory DB) ──────────────────
//
// The single-workspace fake DB above cannot express two workspaces at once,
// so a whole class of cross-linking bugs was untestable — including case-
// variant branches on a case-sensitive host collapsing onto one PR identity.
// These tests run the real manager against a real (migrated, in-memory)
// SQLite DB so those scenarios are expressible and asserted.

const REPO = { owner: "base-owner", name: "base-repo" };

function makePrNode(overrides: {
	number: number;
	headRef: string;
	headSha: string;
	title?: string;
}) {
	return {
		number: overrides.number,
		title: overrides.title ?? `PR ${overrides.number}`,
		html_url: `https://github.com/${REPO.owner}/${REPO.name}/pull/${overrides.number}`,
		state: "open",
		draft: false,
		merged_at: null,
		updated_at: "2026-05-08T12:00:00Z",
		head: {
			ref: overrides.headRef,
			sha: overrides.headSha,
			repo: { name: REPO.name, owner: { login: REPO.owner } },
		},
		base: { repo: { full_name: `${REPO.owner}/${REPO.name}` } },
	};
}

// Routes gh REST/GraphQL calls to fixtures keyed by the exact head branch,
// so a wrong-case cache hit or key collision surfaces as the wrong PR number.
function routeGh(prsByHeadRef: Record<string, ReturnType<typeof makePrNode>>) {
	return async (args: string[]): Promise<unknown> => {
		if (args.includes("graphql")) {
			return {
				data: { repository: { pullRequest: { mergeQueueEntry: null } } },
			};
		}
		const path = args.find(
			(arg) => typeof arg === "string" && arg.startsWith("repos/"),
		);
		if (!path) throw new Error(`unexpected gh args: ${args.join(" ")}`);
		if (path.endsWith("/reviews")) return [];
		if (path.endsWith("/check-runs")) return { check_runs: [] };
		if (path.endsWith("/statuses")) return [];
		if (path === `repos/${REPO.owner}/${REPO.name}/pulls`) {
			const headArg = args.find((a) => a.startsWith("head="));
			if (headArg) {
				const ref = headArg.slice(`head=${REPO.owner}:`.length);
				const pr = prsByHeadRef[ref];
				return pr ? [pr] : [];
			}
			// Open-PR sweep (state=open, no head filter): return everything.
			return Object.values(prsByHeadRef);
		}
		throw new Error(`unexpected gh path: ${path}`);
	};
}

function createRealDb(): HostDb {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON;");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function seedProjectAndWorkspaces(
	db: HostDb,
	branches: { id: string; branch: string }[],
) {
	const now = Date.now();
	db.insert(schema.projects)
		.values({
			id: PROJECT_ID,
			repoPath: "/repo",
			createdAt: now,
			repoProvider: "github",
			repoOwner: REPO.owner,
			repoName: REPO.name,
			repoUrl: `https://github.com/${REPO.owner}/${REPO.name}.git`,
			remoteName: "origin",
		})
		.run();
	for (const { id, branch } of branches) {
		db.insert(schema.workspaces)
			.values({
				id,
				projectId: PROJECT_ID,
				worktreePath: `/repo/.worktrees/${id}`,
				branch,
				createdAt: now,
				headSha: `sha-${branch}`,
				upstreamOwner: REPO.owner,
				upstreamRepo: REPO.name,
				upstreamBranch: branch,
			})
			.run();
	}
}

function createRealManager(
	db: HostDb,
	execGh: (args: string[]) => Promise<unknown>,
) {
	return new PullRequestRuntimeManager({
		db,
		execGh: execGh as never,
		git: (async () => {
			throw new Error("git should not be used when project metadata is set");
		}) as never,
		github: (async () => {
			throw new Error("octokit should not be used");
		}) as never,
		gitWatcher: { onChanged: () => () => {} } as never,
	});
}

function linkedPrNumber(db: HostDb, workspaceId: string): number | null {
	const rows = db
		.select({ prNumber: pullRequests.prNumber })
		.from(workspaces)
		.leftJoin(pullRequests, eq(workspaces.pullRequestId, pullRequests.id))
		.where(eq(workspaces.id, workspaceId))
		.all();
	return rows[0]?.prNumber ?? null;
}

describe("case-variant branch isolation (real DB)", () => {
	// P1: `feature` and `Feature` are distinct branches with distinct PRs on a
	// case-sensitive host. A branch-lowercased identity key collapses them and
	// links one workspace to the other's PR. bypassCache path isolates the
	// identity key (upstreamKey) from the per-head cache.
	test("distinct case-variant branches link to their own PRs (bypass path)", async () => {
		const db = createRealDb();
		seedProjectAndWorkspaces(db, [
			{ id: "ws-lower", branch: "feature" },
			{ id: "ws-upper", branch: "Feature" },
		]);
		const execGh = routeGh({
			feature: makePrNode({
				number: 101,
				headRef: "feature",
				headSha: "sha-feature",
			}),
			Feature: makePrNode({
				number: 102,
				headRef: "Feature",
				headSha: "sha-Feature",
			}),
		});
		const manager = createRealManager(db, execGh);

		await manager.refreshPullRequestsByWorkspaces(["ws-lower", "ws-upper"]);

		expect(linkedPrNumber(db, "ws-lower")).toBe(101);
		expect(linkedPrNumber(db, "ws-upper")).toBe(102);
	});

	// P2: the per-head cache is exercised by the non-bypass refresh path. A
	// branch-lowercased cache key makes `feature` and `Feature` share an entry,
	// so the second lookup returns the first's PR.
	test("per-head cache does not cross-serve case-variant branches (cache path)", async () => {
		const db = createRealDb();
		seedProjectAndWorkspaces(db, [
			{ id: "ws-lower", branch: "feature" },
			{ id: "ws-upper", branch: "Feature" },
		]);
		const execGh = routeGh({
			feature: makePrNode({
				number: 101,
				headRef: "feature",
				headSha: "sha-feature",
			}),
			Feature: makePrNode({
				number: 102,
				headRef: "Feature",
				headSha: "sha-Feature",
			}),
		});
		const manager = createRealManager(db, execGh);

		// refreshProject (private) uses the cache (bypassCache defaults false).
		await (
			manager as unknown as {
				refreshProject: (id: string) => Promise<void>;
			}
		).refreshProject(PROJECT_ID);

		expect(linkedPrNumber(db, "ws-lower")).toBe(101);
		expect(linkedPrNumber(db, "ws-upper")).toBe(102);
	});
});
