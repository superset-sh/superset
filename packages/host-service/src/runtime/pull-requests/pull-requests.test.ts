import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { pullRequests, workspaces } from "../../db/schema";
import { PullRequestRuntimeManager } from "./pull-requests";

// All tests run the real manager against a real, migrated, in-memory SQLite
// DB. An earlier hand-faked DB ignored query predicates and could only hold a
// single workspace, which made multi-workspace cross-linking bugs (e.g.
// case-variant branch collision) inexpressible — so the harness is faithful
// on purpose.
const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");
const PROJECT_ID = "project-1";
const REPO = { owner: "base-owner", name: "base-repo" };

function createRealDb(): HostDb {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON;");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function seedProject(db: HostDb) {
	db.insert(schema.projects)
		.values({
			id: PROJECT_ID,
			repoPath: "/repo",
			createdAt: Date.now(),
			repoProvider: "github",
			repoOwner: REPO.owner,
			repoName: REPO.name,
			repoUrl: `https://github.com/${REPO.owner}/${REPO.name}.git`,
			remoteName: "origin",
		})
		.run();
}

function seedWorkspace(
	db: HostDb,
	w: {
		id: string;
		branch: string;
		headSha?: string | null;
		upstreamOwner?: string | null;
		upstreamRepo?: string | null;
		upstreamBranch?: string | null;
		pullRequestId?: string | null;
	},
) {
	db.insert(schema.workspaces)
		.values({
			id: w.id,
			projectId: PROJECT_ID,
			worktreePath: `/repo/.worktrees/${w.id}`,
			branch: w.branch,
			createdAt: Date.now(),
			headSha: w.headSha ?? null,
			upstreamOwner: w.upstreamOwner ?? null,
			upstreamRepo: w.upstreamRepo ?? null,
			upstreamBranch: w.upstreamBranch ?? null,
			pullRequestId: w.pullRequestId ?? null,
		})
		.run();
}

function seedPullRequest(
	db: HostDb,
	pr: {
		id: string;
		prNumber: number;
		headBranch: string;
		headSha: string;
		title?: string;
		state?: string;
		reviewDecision?: string | null;
		checksStatus?: string;
		checksJson?: string;
	},
) {
	db.insert(schema.pullRequests)
		.values({
			id: pr.id,
			projectId: PROJECT_ID,
			repoProvider: "github",
			repoOwner: REPO.owner,
			repoName: REPO.name,
			prNumber: pr.prNumber,
			url: `https://github.com/${REPO.owner}/${REPO.name}/pull/${pr.prNumber}`,
			title: pr.title ?? `PR ${pr.prNumber}`,
			state: pr.state ?? "open",
			headBranch: pr.headBranch,
			headSha: pr.headSha,
			reviewDecision: pr.reviewDecision ?? null,
			checksStatus: pr.checksStatus ?? "none",
			checksJson: pr.checksJson ?? "[]",
			createdAt: 1,
			updatedAt: 1,
		})
		.run();
}

function getWorkspace(db: HostDb, id: string) {
	return db.select().from(workspaces).where(eq(workspaces.id, id)).get();
}

function getPrById(db: HostDb, id: string) {
	return db.select().from(pullRequests).where(eq(pullRequests.id, id)).get();
}

function getPrByNumber(db: HostDb, prNumber: number) {
	return db
		.select()
		.from(pullRequests)
		.where(eq(pullRequests.prNumber, prNumber))
		.get();
}

function createManager(
	db: HostDb,
	overrides: {
		execGh?: (args: string[]) => Promise<unknown>;
		github?: () => Promise<never>;
	} = {},
) {
	return new PullRequestRuntimeManager({
		db,
		execGh:
			(overrides.execGh as never) ??
			((async () => {
				throw new Error("gh should not be used for direct PR linking");
			}) as never),
		git: (async () => {
			throw new Error("git should not be used when project metadata is set");
		}) as never,
		github:
			(overrides.github as never) ??
			((async () => {
				throw new Error("octokit should not be used");
			}) as never),
		gitWatcher: { onChanged: () => () => {} } as never,
	});
}

// Builds a GitHub REST PR node (the shape normalizePullRequest expects).
function makePrNode(pr: {
	number: number;
	headRef: string;
	headSha: string;
	headOwner?: string;
	headRepo?: string;
	title?: string;
}) {
	return {
		number: pr.number,
		title: pr.title ?? `PR ${pr.number}`,
		html_url: `https://github.com/${REPO.owner}/${REPO.name}/pull/${pr.number}`,
		state: "open",
		draft: false,
		merged_at: null,
		updated_at: "2026-05-08T12:00:00Z",
		head: {
			ref: pr.headRef,
			sha: pr.headSha,
			repo: {
				name: pr.headRepo ?? REPO.name,
				owner: { login: pr.headOwner ?? REPO.owner },
			},
		},
		base: { repo: { full_name: `${REPO.owner}/${REPO.name}` } },
	};
}

// Silences the expected warnings the manager logs on handled failures.
async function withSilencedWarnings<T>(fn: () => Promise<T>): Promise<T> {
	const original = console.warn;
	console.warn = () => {};
	try {
		return await fn();
	} finally {
		console.warn = original;
	}
}

describe("PullRequestRuntimeManager direct checkout PR linking", () => {
	test("links a fork PR workspace to the selected PR and records fork upstream", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, { id: "ws", branch: "fork-owner/fix-typo" });
		const manager = createManager(db);

		const prId = await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: "ws",
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

		const ws = getWorkspace(db, "ws");
		expect(ws?.pullRequestId).toBe(prId);
		expect(ws?.upstreamOwner).toBe("fork-owner");
		expect(ws?.upstreamRepo).toBe("fork-repo");
		expect(ws?.upstreamBranch).toBe("fix-typo");

		const pr = getPrById(db, prId ?? "");
		expect(pr?.prNumber).toBe(42);
		expect(pr?.repoOwner).toBe("base-owner");
		expect(pr?.repoName).toBe("base-repo");
		expect(pr?.headBranch).toBe("fix-typo");
	});

	test("keeps a deleted-fork PR link when no upstream can be recorded", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, { id: "ws", branch: "pr/42" });
		const manager = createManager(db);

		const prId = await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: "ws",
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

		const linked = getWorkspace(db, "ws");
		expect(linked?.pullRequestId).toBe(prId);
		expect(linked?.upstreamOwner).toBeNull();
		expect(linked?.upstreamRepo).toBeNull();
		expect(linked?.upstreamBranch).toBeNull();

		await manager.refreshPullRequestsByWorkspaces(["ws"]);

		expect(getWorkspace(db, "ws")?.pullRequestId).toBe(prId);
	});

	test("clears a no-upstream PR link when workspace HEAD no longer matches the PR", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, { id: "ws", branch: "pr/42" });
		const manager = createManager(db);

		await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: "ws",
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
		db.update(workspaces)
			.set({ headSha: "def456" })
			.where(eq(workspaces.id, "ws"))
			.run();

		await manager.refreshPullRequestsByWorkspaces(["ws"]);

		expect(getWorkspace(db, "ws")?.pullRequestId).toBeNull();
	});
});

describe("PullRequestRuntimeManager refresh", () => {
	test("preserves last-known review and checks when detail refresh fails", async () => {
		const db = createRealDb();
		seedProject(db);
		seedPullRequest(db, {
			id: "pr-existing",
			prNumber: 42,
			headBranch: "fix/sidebar",
			headSha: "old-sha",
			title: "Fix sidebar",
			reviewDecision: "approved",
			checksStatus: "success",
			checksJson: JSON.stringify([
				{
					name: "Typecheck",
					status: "success",
					url: "https://github.com/base-owner/base-repo/actions/1",
				},
			]),
		});
		seedWorkspace(db, {
			id: "ws",
			branch: "fix/sidebar",
			headSha: "abc123",
			upstreamOwner: "fork-owner",
			upstreamRepo: "fork-repo",
			upstreamBranch: "fix/sidebar",
			pullRequestId: "pr-existing",
		});
		const manager = createManager(db, {
			execGh: async (args) => {
				const path = args.find((arg) => arg.startsWith("repos/"));
				if (path === "repos/base-owner/base-repo/pulls") {
					return [
						makePrNode({
							number: 42,
							headRef: "fix/sidebar",
							headSha: "abc123",
							headOwner: "fork-owner",
							headRepo: "fork-repo",
							title: "Fix sidebar updated",
						}),
					];
				}
				throw new Error("detail refresh unavailable");
			},
			github: async () => {
				throw new Error("octokit unavailable");
			},
		});

		await withSilencedWarnings(() =>
			manager.refreshPullRequestsByWorkspaces(["ws"]),
		);

		expect(getWorkspace(db, "ws")?.pullRequestId).toBe("pr-existing");
		const pr = getPrById(db, "pr-existing");
		expect(pr?.title).toBe("Fix sidebar updated");
		expect(pr?.headSha).toBe("abc123");
		expect(pr?.reviewDecision).toBe("approved");
		expect(pr?.checksStatus).toBe("success");
		expect(JSON.parse(pr?.checksJson ?? "[]")).toEqual([
			{
				name: "Typecheck",
				status: "success",
				url: "https://github.com/base-owner/base-repo/actions/1",
			},
		]);
	});

	test("preserves existing pullRequestId when head lookup fails", async () => {
		const db = createRealDb();
		seedProject(db);
		seedPullRequest(db, {
			id: "pr-existing",
			prNumber: 42,
			headBranch: "fix/sidebar",
			headSha: "abc123",
		});
		seedWorkspace(db, {
			id: "ws",
			branch: "fix/sidebar",
			headSha: "abc123",
			upstreamOwner: "fork-owner",
			upstreamRepo: "fork-repo",
			upstreamBranch: "fix/sidebar",
			pullRequestId: "pr-existing",
		});
		const manager = createManager(db, {
			execGh: async () => {
				throw new Error("gh unavailable");
			},
			github: async () => {
				throw new Error("octokit unavailable");
			},
		});

		await withSilencedWarnings(() =>
			manager.refreshPullRequestsByWorkspaces(["ws"]),
		);

		expect(getWorkspace(db, "ws")?.pullRequestId).toBe("pr-existing");
	});

	// Case drift: local branch `roshvan/…` vs PR head `Roshvan/…`. The
	// case-sensitive `head=` query returns nothing; the open-PR sweep must
	// still link the workspace case-insensitively.
	test("links a case-drifted branch to its PR via the open-PR sweep", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws",
			branch: "roshvan/fix-thing",
			headSha: "abc123",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "roshvan/fix-thing",
		});
		const manager = createManager(db, {
			execGh: async (args) => {
				// Case-sensitive server-side filter: the drifted casing misses.
				if (args.includes("head=base-owner:roshvan/fix-thing")) return [];
				if (args.includes("graphql")) {
					return {
						data: { repository: { pullRequest: { mergeQueueEntry: null } } },
					};
				}
				const path = args.find(
					(arg) => typeof arg === "string" && arg.startsWith("repos/"),
				);
				if (path?.endsWith("/reviews")) return [];
				if (path?.endsWith("/check-runs")) return { check_runs: [] };
				if (path?.endsWith("/statuses")) return [];
				if (
					path === "repos/base-owner/base-repo/pulls" &&
					args.includes("state=open")
				) {
					return [
						makePrNode({
							number: 77,
							headRef: "Roshvan/fix-thing",
							headSha: "abc123",
							title: "Fix thing",
						}),
					];
				}
				throw new Error("detail refresh unavailable");
			},
		});

		await withSilencedWarnings(() =>
			manager.refreshPullRequestsByWorkspaces(["ws"]),
		);

		const pr = getPrByNumber(db, 77);
		expect(pr?.headBranch).toBe("Roshvan/fix-thing");
		expect(getWorkspace(db, "ws")?.pullRequestId).toBe(pr?.id);
	});

	// A transient sweep failure must not clear an existing link for a branch
	// the per-head query can't see.
	test("keeps an existing link when the open-PR sweep fails", async () => {
		const db = createRealDb();
		seedProject(db);
		seedPullRequest(db, {
			id: "pr-existing",
			prNumber: 42,
			headBranch: "Roshvan/fix-thing",
			headSha: "abc123",
		});
		seedWorkspace(db, {
			id: "ws",
			branch: "roshvan/fix-thing",
			headSha: "abc123",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "roshvan/fix-thing",
			pullRequestId: "pr-existing",
		});
		const manager = createManager(db, {
			execGh: async (args) => {
				if (args.includes("head=base-owner:roshvan/fix-thing")) return [];
				throw new Error("sweep unavailable");
			},
		});

		await withSilencedWarnings(() =>
			manager.refreshPullRequestsByWorkspaces(["ws"]),
		);

		expect(getWorkspace(db, "ws")?.pullRequestId).toBe("pr-existing");
	});
});

// Routes gh REST/GraphQL calls to fixtures keyed by the exact head branch, so
// a wrong-case cache hit or key collision surfaces as the wrong PR number.
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

describe("case-variant branch isolation", () => {
	// P1: `feature` and `Feature` are distinct branches with distinct PRs on a
	// case-sensitive host. A branch-lowercased identity key collapses them and
	// links one workspace to the other's PR. The bypass path isolates the
	// identity key (upstreamKey) from the per-head cache.
	test("distinct case-variant branches link to their own PRs (bypass path)", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws-lower",
			branch: "feature",
			headSha: "sha-feature",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "feature",
		});
		seedWorkspace(db, {
			id: "ws-upper",
			branch: "Feature",
			headSha: "sha-Feature",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "Feature",
		});
		const manager = createManager(db, {
			execGh: routeGh({
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
			}),
		});

		await manager.refreshPullRequestsByWorkspaces(["ws-lower", "ws-upper"]);

		expect(getWorkspace(db, "ws-lower")?.pullRequestId).toBe(
			getPrByNumber(db, 101)?.id,
		);
		expect(getWorkspace(db, "ws-upper")?.pullRequestId).toBe(
			getPrByNumber(db, 102)?.id,
		);
	});

	// P2: the per-head cache is exercised by the non-bypass refresh path. A
	// branch-lowercased cache key makes `feature` and `Feature` share an entry,
	// so the second lookup returns the first's PR.
	test("per-head cache does not cross-serve case-variant branches (cache path)", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws-lower",
			branch: "feature",
			headSha: "sha-feature",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "feature",
		});
		seedWorkspace(db, {
			id: "ws-upper",
			branch: "Feature",
			headSha: "sha-Feature",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "Feature",
		});
		const manager = createManager(db, {
			execGh: routeGh({
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
			}),
		});

		// refreshProject (private) uses the cache (bypassCache defaults false).
		await (
			manager as unknown as { refreshProject: (id: string) => Promise<void> }
		).refreshProject(PROJECT_ID);

		expect(getWorkspace(db, "ws-lower")?.pullRequestId).toBe(
			getPrByNumber(db, 101)?.id,
		);
		expect(getWorkspace(db, "ws-upper")?.pullRequestId).toBe(
			getPrByNumber(db, 102)?.id,
		);
	});
});
