import { Database } from "bun:sqlite";
import { describe, expect, setSystemTime, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { pullRequests, workspaces } from "../../db/schema";
import type { WorkspaceChangedMessage } from "../../events/types";
import { PullRequestRuntimeManager } from "./pull-requests";
import { GitHubAvailabilityGate } from "./utils/github-availability";
import type { WorkspaceRefsSnapshot } from "./utils/workspace-refs";

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
		worktreePath?: string;
	},
) {
	db.insert(schema.workspaces)
		.values({
			id: w.id,
			projectId: PROJECT_ID,
			worktreePath: w.worktreePath ?? `/repo/.worktrees/${w.id}`,
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
		mergedAt?: number | null;
	},
) {
	db.insert(schema.pullRequests)
		.values({
			mergedAt: pr.mergedAt ?? null,
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

// Answers only the origin/HEAD symref (default branch); every other git call
// throws, asserting the refresh path never depends on live git.
function defaultBranchGit(defaultBranch: string) {
	return (async () => ({
		raw: async (args: string[]) => {
			if (
				args[0] === "symbolic-ref" &&
				args.includes("refs/remotes/origin/HEAD")
			) {
				return `origin/${defaultBranch}\n`;
			}
			throw new Error(`unexpected git raw: ${args.join(" ")}`);
		},
	})) as never;
}

function createManager(
	db: HostDb,
	overrides: {
		execGh?: (args: string[]) => Promise<unknown>;
		github?: () => Promise<never>;
		git?: unknown;
		readWorkspaceRefs?: (
			worktreePath: string,
		) => Promise<WorkspaceRefsSnapshot>;
		worktreeExists?: (worktreePath: string) => boolean;
	} = {},
) {
	return new PullRequestRuntimeManager({
		db,
		execGh:
			(overrides.execGh as never) ??
			((async () => {
				throw new Error("gh should not be used for direct PR linking");
			}) as never),
		git:
			(overrides.git as never) ??
			((async () => {
				throw new Error("git should not be used when project metadata is set");
			}) as never),
		github:
			(overrides.github as never) ??
			((async () => {
				throw new Error("octokit should not be used");
			}) as never),
		gitWatcher: { onChanged: () => () => {} } as never,
		readWorkspaceRefs: overrides.readWorkspaceRefs,
		// Seeded worktree paths are fabricated; default the disk gate open so
		// sync-path tests exercise the git read, not the missing-dir skip.
		worktreeExists: overrides.worktreeExists ?? (() => true),
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
	state?: "open" | "closed";
	mergedAt?: string | null;
}) {
	return {
		number: pr.number,
		title: pr.title ?? `PR ${pr.number}`,
		html_url: `https://github.com/${REPO.owner}/${REPO.name}/pull/${pr.number}`,
		state: pr.state ?? "open",
		draft: false,
		merged_at: pr.mergedAt ?? null,
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

// Typed handle on the private per-repo sweep entrypoint under test; keeps
// tsc (no private dot-access) and biome (no bracket-access) both satisfied.
function openPullRequestsSweeper(manager: PullRequestRuntimeManager) {
	const accessible = manager as unknown as {
		getCachedOpenPullRequests(repo: {
			provider: "github";
			owner: string;
			name: string;
			url: string;
			remoteName: string;
			defaultBranch: string | null;
		}): Promise<unknown[]>;
	};
	return accessible.getCachedOpenPullRequests.bind(accessible);
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

describe("PullRequestRuntimeManager mergedAt attribution", () => {
	const MERGED_AT_ISO = "2026-05-01T10:00:00Z";
	const MERGED_AT = Date.parse(MERGED_AT_ISO);
	// First observed three days after the merge.
	const OBSERVED_AT = Date.parse("2026-05-04T09:00:00Z");

	function mergedPrExecGh(mergedAt: string | null, state: "open" | "closed") {
		return async (args: string[]) => {
			const path = args.find((arg) => arg.startsWith("repos/"));
			if (path === `repos/${REPO.owner}/${REPO.name}/pulls`) {
				return [
					makePrNode({
						number: 42,
						headRef: "fix/sidebar",
						headSha: "abc123",
						state,
						mergedAt,
					}),
				];
			}
			if (path?.endsWith("/reviews")) return [];
			if (path?.endsWith("/check-runs")) return { check_runs: [] };
			if (path?.endsWith("/statuses")) return [];
			throw new Error(`unexpected gh call: ${args.join(" ")}`);
		};
	}

	function seedLinkedWorkspace(db: HostDb, pullRequestId: string | null) {
		seedWorkspace(db, {
			id: "ws",
			branch: "fix/sidebar",
			headSha: "abc123",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "fix/sidebar",
			pullRequestId,
		});
	}

	test("attributes a merge first observed on D+3 to GitHub's merged_at on day D", async () => {
		setSystemTime(new Date(OBSERVED_AT));
		try {
			const db = createRealDb();
			seedProject(db);
			seedLinkedWorkspace(db, null);
			const manager = createManager(db, {
				execGh: mergedPrExecGh(MERGED_AT_ISO, "closed"),
			});

			await manager.refreshPullRequestsByWorkspaces(["ws"]);

			const pr = getPrByNumber(db, 42);
			expect(pr?.state).toBe("merged");
			expect(pr?.mergedAt).toBe(MERGED_AT);
			expect(new Date(pr?.mergedAt ?? 0).toISOString().slice(0, 10)).toBe(
				"2026-05-01",
			);
		} finally {
			setSystemTime();
		}
	});

	test("uses merged_at when an existing open row transitions to merged", async () => {
		setSystemTime(new Date(OBSERVED_AT));
		try {
			const db = createRealDb();
			seedProject(db);
			seedPullRequest(db, {
				id: "pr-existing",
				prNumber: 42,
				headBranch: "fix/sidebar",
				headSha: "abc123",
				state: "open",
			});
			seedLinkedWorkspace(db, "pr-existing");
			const manager = createManager(db, {
				execGh: mergedPrExecGh(MERGED_AT_ISO, "closed"),
			});

			await manager.refreshPullRequestsByWorkspaces(["ws"]);

			const pr = getPrById(db, "pr-existing");
			expect(pr?.state).toBe("merged");
			expect(pr?.mergedAt).toBe(MERGED_AT);
		} finally {
			setSystemTime();
		}
	});

	// A row stamped at observation time before this fix heals when that PR
	// head is fetched again, so GitHub's merged_at wins over what is stored.
	test("repairs a stamped observation time with GitHub's merged_at", async () => {
		const db = createRealDb();
		seedProject(db);
		seedPullRequest(db, {
			id: "pr-existing",
			prNumber: 42,
			headBranch: "fix/sidebar",
			headSha: "abc123",
			state: "merged",
			mergedAt: OBSERVED_AT,
		});
		seedLinkedWorkspace(db, "pr-existing");
		const manager = createManager(db, {
			execGh: mergedPrExecGh(MERGED_AT_ISO, "closed"),
		});

		await manager.refreshPullRequestsByWorkspaces(["ws"]);

		expect(getPrById(db, "pr-existing")?.mergedAt).toBe(MERGED_AT);
	});

	// The stored value is only a fallback: it survives when the source has no
	// usable timestamp of its own.
	test("keeps an existing mergedAt when the fetched merged_at is unparseable", async () => {
		const STORED = Date.parse("2026-04-20T08:00:00Z");
		const db = createRealDb();
		seedProject(db);
		seedPullRequest(db, {
			id: "pr-existing",
			prNumber: 42,
			headBranch: "fix/sidebar",
			headSha: "abc123",
			state: "merged",
			mergedAt: STORED,
		});
		seedLinkedWorkspace(db, "pr-existing");
		const manager = createManager(db, {
			execGh: mergedPrExecGh("not-a-date", "closed"),
		});

		await manager.refreshPullRequestsByWorkspaces(["ws"]);

		const pr = getPrById(db, "pr-existing");
		expect(pr?.state).toBe("merged");
		expect(pr?.mergedAt).toBe(STORED);
	});

	test("leaves mergedAt null for a PR that is not merged", async () => {
		const db = createRealDb();
		seedProject(db);
		seedLinkedWorkspace(db, null);
		const manager = createManager(db, {
			execGh: mergedPrExecGh(null, "closed"),
		});

		await manager.refreshPullRequestsByWorkspaces(["ws"]);

		const pr = getPrByNumber(db, 42);
		expect(pr?.state).toBe("closed");
		expect(pr?.mergedAt).toBeNull();
	});

	// GitHub says merged but the timestamp is unusable: keep the merged row
	// visible to "merged in the last N days" windows by stamping observation
	// time, the pre-existing contract for rows without a source timestamp.
	test("falls back to observation time when merged_at is unparseable", async () => {
		setSystemTime(new Date(OBSERVED_AT));
		try {
			const db = createRealDb();
			seedProject(db);
			seedLinkedWorkspace(db, null);
			const manager = createManager(db, {
				execGh: mergedPrExecGh("not-a-date", "closed"),
			});

			await manager.refreshPullRequestsByWorkspaces(["ws"]);

			const pr = getPrByNumber(db, 42);
			expect(pr?.state).toBe("merged");
			expect(pr?.mergedAt).toBe(OBSERVED_AT);
		} finally {
			setSystemTime();
		}
	});

	test("checkout link uses the caller's mergedAt when present", async () => {
		setSystemTime(new Date(OBSERVED_AT));
		try {
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
					title: "Merged earlier",
					state: "merged",
					mergedAt: MERGED_AT_ISO,
					headRefName: "fix/sidebar",
					headRefOid: "abc123",
					isCrossRepository: false,
				},
			});

			expect(getPrById(db, prId ?? "")?.mergedAt).toBe(MERGED_AT);
		} finally {
			setSystemTime();
		}
	});

	test("checkout link without a source timestamp stamps observation time", async () => {
		setSystemTime(new Date(OBSERVED_AT));
		try {
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
					title: "Merged, no timestamp",
					state: "merged",
					headRefName: "fix/sidebar",
					headRefOid: "abc123",
					isCrossRepository: false,
				},
			});

			expect(getPrById(db, prId ?? "")?.mergedAt).toBe(OBSERVED_AT);
		} finally {
			setSystemTime();
		}
	});

	test("checkout link without a source timestamp keeps the existing mergedAt", async () => {
		const STORED = Date.parse("2026-04-20T08:00:00Z");
		const db = createRealDb();
		seedProject(db);
		seedPullRequest(db, {
			id: "pr-existing",
			prNumber: 42,
			headBranch: "fix/sidebar",
			headSha: "abc123",
			state: "merged",
			mergedAt: STORED,
		});
		seedWorkspace(db, { id: "ws", branch: "pr/42" });
		const manager = createManager(db);

		const prId = await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: "ws",
			projectId: PROJECT_ID,
			pullRequest: {
				number: 42,
				url: "https://github.com/base-owner/base-repo/pull/42",
				title: "Merged, no timestamp",
				state: "merged",
				headRefName: "fix/sidebar",
				headRefOid: "abc123",
				isCrossRepository: false,
			},
		});

		expect(prId).toBe("pr-existing");
		expect(getPrById(db, "pr-existing")?.mergedAt).toBe(STORED);
	});
});

describe("PullRequestRuntimeManager unlink", () => {
	function seedLinkedWorkspace(db: HostDb) {
		seedPullRequest(db, {
			id: "pr-1",
			prNumber: 101,
			headBranch: "feature",
			headSha: "sha-feature",
		});
		seedWorkspace(db, {
			id: "ws",
			branch: "feature",
			headSha: "sha-feature",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "feature",
			pullRequestId: "pr-1",
		});
	}

	test("unlink clears the link and the refresh sweep does not re-link the same PR", async () => {
		const db = createRealDb();
		seedProject(db);
		seedLinkedWorkspace(db);
		const manager = createManager(db, {
			execGh: routeGh({
				feature: makePrNode({
					number: 101,
					headRef: "feature",
					headSha: "sha-feature",
				}),
			}),
		});

		manager.unlinkWorkspacePullRequest("ws");

		const unlinked = getWorkspace(db, "ws");
		expect(unlinked?.pullRequestId).toBeNull();
		expect(unlinked?.suppressedPullRequestId).toBe("pr-1");

		await manager.refreshPullRequestsByWorkspaces(["ws"]);

		expect(getWorkspace(db, "ws")?.pullRequestId).toBeNull();
	});

	test("a different PR on the same branch still links after unlink", async () => {
		const db = createRealDb();
		seedProject(db);
		seedLinkedWorkspace(db);
		const manager = createManager(db, {
			execGh: routeGh({
				feature: makePrNode({
					number: 202,
					headRef: "feature",
					headSha: "sha-feature-2",
				}),
			}),
		});

		manager.unlinkWorkspacePullRequest("ws");
		await manager.refreshPullRequestsByWorkspaces(["ws"]);

		const ws = getWorkspace(db, "ws");
		expect(ws?.pullRequestId).toBe(getPrByNumber(db, 202)?.id ?? "");
		expect(ws?.suppressedPullRequestId).toBe("pr-1");
	});

	test("deleting the suppressed PR row clears the suppression", () => {
		const db = createRealDb();
		seedProject(db);
		seedLinkedWorkspace(db);
		const manager = createManager(db);

		manager.unlinkWorkspacePullRequest("ws");
		db.delete(pullRequests).where(eq(pullRequests.id, "pr-1")).run();

		expect(getWorkspace(db, "ws")?.suppressedPullRequestId).toBeNull();
	});

	test("an explicit checkout link clears the suppression", async () => {
		const db = createRealDb();
		seedProject(db);
		seedLinkedWorkspace(db);
		const manager = createManager(db);

		manager.unlinkWorkspacePullRequest("ws");
		await manager.linkWorkspaceToCheckoutPullRequest({
			workspaceId: "ws",
			projectId: PROJECT_ID,
			pullRequest: {
				number: 101,
				url: "https://github.com/base-owner/base-repo/pull/101",
				title: "PR 101",
				state: "open",
				isDraft: false,
				headRefName: "feature",
				headRefOid: "sha-feature",
				isCrossRepository: false,
			},
		});

		const ws = getWorkspace(db, "ws");
		expect(ws?.pullRequestId).toBe("pr-1");
		expect(ws?.suppressedPullRequestId).toBeNull();
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

	// A permanently failing fetch (payload over maxBuffer, revoked auth) must
	// not respawn gh at full 60s-TTL cadence forever: consecutive failures
	// double the cached rejection's TTL, and a success resets the streak.
	test("holds every GitHub lookup after a transport failure instead of spawning gh per repo", async () => {
		const t0 = Date.now();
		setSystemTime(new Date(t0));
		try {
			const db = createRealDb();
			seedProject(db);
			let ghAttempts = 0;
			let octokitAttempts = 0;
			const manager = createManager(db, {
				execGh: async () => {
					ghAttempts += 1;
					throw Object.assign(new Error("Command failed: gh api"), {
						stderr:
							"error connecting to api.github.com\ndial tcp: lookup api.github.com: no such host",
					});
				},
				github: (async () => {
					octokitAttempts += 1;
					throw new Error("octokit should not run on a dead network");
				}) as never,
			});
			const repoOf = (name: string) => ({
				provider: "github" as const,
				owner: REPO.owner,
				name,
				url: `https://github.com/${REPO.owner}/${name}.git`,
				remoteName: "origin",
				defaultBranch: "main",
			});
			const fetchOpenPrs = openPullRequestsSweeper(manager);
			const sweep = (name: string) =>
				withSilencedWarnings(() => fetchOpenPrs(repoOf(name)).catch(() => {}));

			// The first repo pays one gh spawn. Octokit is skipped: it would hit
			// the same resolver.
			await sweep("repo-a");
			expect(ghAttempts).toBe(1);
			expect(octokitAttempts).toBe(0);

			// Every other repo is held without a spawn while the gate is closed.
			await sweep("repo-b");
			await sweep("repo-c");
			expect(ghAttempts).toBe(1);

			// The gate reopens after its first window and tries once more.
			setSystemTime(new Date(t0 + 61_000));
			await sweep("repo-d");
			expect(ghAttempts).toBe(2);
			expect(octokitAttempts).toBe(0);
		} finally {
			setSystemTime();
		}
	});

	test("concurrent failures of one outage open a single hold and log once", async () => {
		const t0 = Date.now();
		setSystemTime(new Date(t0));
		const warns: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warns.push(String(args[0]));
		};
		try {
			const db = createRealDb();
			seedProject(db);
			let ghAttempts = 0;
			const manager = createManager(db, {
				execGh: async () => {
					ghAttempts += 1;
					await new Promise((resolve) => setTimeout(resolve, 5));
					throw Object.assign(new Error("Command failed"), {
						stderr:
							"error connecting to api.github.com\ncheck your internet connection",
					});
				},
				github: (async () => {
					throw new Error("octokit must not run");
				}) as never,
			});
			const repoOf = (name: string) => ({
				provider: "github" as const,
				owner: REPO.owner,
				name,
				url: `https://github.com/${REPO.owner}/${name}.git`,
				remoteName: "origin",
				defaultBranch: "main",
			});
			const fetchOpenPrs = openPullRequestsSweeper(manager);

			// Six repos refresh at once: all pass the gate before the first fails.
			await Promise.all(
				["a", "b", "c", "d", "e", "f"].map((name) =>
					fetchOpenPrs(repoOf(name)).catch(() => {}),
				),
			);
			expect(ghAttempts).toBe(6);
			expect(
				warns.filter((w) => w.includes("GitHub unreachable")),
			).toHaveLength(1);

			// One outage, one streak: the hold is the base minute, not the cap.
			setSystemTime(new Date(t0 + 61_000));
			await fetchOpenPrs(repoOf("g")).catch(() => {});
			expect(ghAttempts).toBe(7);
		} finally {
			console.warn = originalWarn;
			setSystemTime();
		}
	});

	test("an explicit refresh probes through an active hold", async () => {
		const db = createRealDb();
		seedProject(db);
		let ghAttempts = 0;
		const manager = createManager(db, {
			execGh: async () => {
				ghAttempts += 1;
				throw Object.assign(new Error("x"), { code: "ENOTFOUND" });
			},
			github: (async () => {
				throw new Error("octokit must not run");
			}) as never,
		});
		const repoOf = (name: string) => ({
			provider: "github" as const,
			owner: REPO.owner,
			name,
			url: `https://github.com/${REPO.owner}/${name}.git`,
			remoteName: "origin",
			defaultBranch: "main",
		});
		const accessible = manager as unknown as {
			getCachedOpenPullRequests(
				repo: ReturnType<typeof repoOf>,
				options?: { bypassCache?: boolean },
			): Promise<unknown[]>;
		};
		await withSilencedWarnings(async () => {
			await accessible.getCachedOpenPullRequests(repoOf("a")).catch(() => {});
			expect(ghAttempts).toBe(1);
			// Polling is held.
			await accessible.getCachedOpenPullRequests(repoOf("b")).catch(() => {});
			expect(ghAttempts).toBe(1);
			// A user-driven refresh is not: it is the probe that can reopen the gate.
			await accessible
				.getCachedOpenPullRequests(repoOf("c"), { bypassCache: true })
				.catch(() => {});
			expect(ghAttempts).toBe(2);
		});
	});

	test("a successful probe lets a previously held repo retry immediately", async () => {
		const db = createRealDb();
		seedProject(db);
		let ghAttempts = 0;
		let online = false;
		const manager = createManager(db, {
			execGh: async () => {
				ghAttempts += 1;
				if (!online) throw Object.assign(new Error("x"), { code: "ENOTFOUND" });
				return [];
			},
			github: (async () => {
				throw new Error("octokit must not run");
			}) as never,
		});
		const repoOf = (name: string) => ({
			provider: "github" as const,
			owner: REPO.owner,
			name,
			url: `https://github.com/${REPO.owner}/${name}.git`,
			remoteName: "origin",
			defaultBranch: "main",
		});
		const accessible = manager as unknown as {
			getCachedOpenPullRequests(
				repo: ReturnType<typeof repoOf>,
				options?: { bypassCache?: boolean },
			): Promise<unknown[]>;
		};
		await withSilencedWarnings(async () => {
			await accessible.getCachedOpenPullRequests(repoOf("a")).catch(() => {});
			expect(ghAttempts).toBe(1);
			// Polling is held.
			await accessible.getCachedOpenPullRequests(repoOf("b")).catch(() => {});
			expect(ghAttempts).toBe(1);
			online = true;
			await accessible
				.getCachedOpenPullRequests(repoOf("c"), { bypassCache: true })
				.catch(() => {});
			expect(ghAttempts).toBe(2);
			await expect(
				accessible.getCachedOpenPullRequests(repoOf("b")),
			).resolves.toEqual([]);
			expect(ghAttempts).toBe(3);
		});
	});

	test("a transport failure on a detail lookup trips the gate, and polling then spawns nothing", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws",
			branch: "fix/sidebar",
			headSha: "abc123",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "fix/sidebar",
		});
		let detailsOnline = true;
		let ghAttempts = 0;
		let octokitAttempts = 0;
		const route = routeGh({
			"fix/sidebar": makePrNode({
				number: 7,
				headRef: "fix/sidebar",
				headSha: "abc123",
			}),
		});
		const manager = createManager(db, {
			git: defaultBranchGit("main"),
			execGh: async (args) => {
				ghAttempts += 1;
				const isHeadLookup = args.some((arg) => arg.startsWith("head="));
				if (!detailsOnline && !isHeadLookup) {
					throw Object.assign(new Error("Command failed"), {
						stderr: "error connecting to api.github.com",
					});
				}
				return route(args);
			},
			github: (async () => {
				octokitAttempts += 1;
				throw new Error("octokit must not run during an outage");
			}) as never,
		});
		const refreshProject = projectRefresher(manager);

		// Warm every cache while online: head lookup, reviews, checks, queue.
		await withSilencedWarnings(() => refreshProject(PROJECT_ID));
		expect(getWorkspace(db, "ws")?.pullRequestId).not.toBeNull();
		const warmAttempts = ghAttempts;

		// The network dies under the detail calls. The user's refresh re-reads
		// the head (still answering) and then the first detail call trips the
		// gate; Octokit is skipped because it would hit the same network.
		detailsOnline = false;
		await withSilencedWarnings(() =>
			manager.refreshPullRequestsByWorkspaces(["ws"]),
		);
		expect(ghAttempts).toBeGreaterThan(warmAttempts);
		expect(octokitAttempts).toBe(0);
		expect(manager.getGithubStatus()?.reason).toBe("unreachable");
		const heldAttempts = ghAttempts;

		// While held, polling spawns nothing at all.
		await withSilencedWarnings(() => refreshProject(PROJECT_ID));
		expect(ghAttempts).toBe(heldAttempts);
		expect(octokitAttempts).toBe(0);
	});

	test("a successful Octokit fallback resets the outage streak", async () => {
		const t0 = 1_700_000_000_000;
		setSystemTime(new Date(t0));
		try {
			const db = createRealDb();
			seedProject(db);
			seedWorkspace(db, {
				id: "ws",
				branch: "fix/sidebar",
				headSha: "abc123",
				upstreamOwner: REPO.owner,
				upstreamRepo: REPO.name,
				upstreamBranch: "fix/sidebar",
			});
			const node = makePrNode({
				number: 7,
				headRef: "fix/sidebar",
				headSha: "abc123",
			});
			let warming = true;
			const route = routeGh({ "fix/sidebar": node });
			const manager = createManager(db, {
				git: defaultBranchGit("main"),
				execGh: async (args) => {
					if (warming) return route(args);
					throw new Error("gh: HTTP 403");
				},
				github: (async () => ({
					rest: {
						pulls: {
							list: async () => ({ data: [node] }),
							listReviews: async () => ({ data: [] }),
						},
						checks: { listForRef: async () => ({ data: { check_runs: [] } }) },
						repos: { listCommitStatusesForRef: async () => ({ data: [] }) },
					},
					graphql: async () => ({
						repository: { pullRequest: { mergeQueueEntry: null } },
					}),
				})) as never,
			});
			let now = 0;
			const gate = new GitHubAvailabilityGate({ now: () => now });
			const accessible = manager as unknown as {
				githubGate: GitHubAvailabilityGate;
			};
			accessible.githubGate = gate;
			const refreshProject = projectRefresher(manager);
			await withSilencedWarnings(() => refreshProject(PROJECT_ID));
			expect(getWorkspace(db, "ws")?.pullRequestId).not.toBeNull();
			warming = false;
			const offline = Object.assign(new Error("offline"), {
				code: "ENOTFOUND",
			});
			gate.recordFailure(offline);
			// Past the hold and the caches: gh answers 403, Octokit answers, and
			// that success is what resets the streak to the base window.
			now = 61_000;
			setSystemTime(new Date(t0 + 61_000));
			await withSilencedWarnings(() => refreshProject(PROJECT_ID));
			expect(gate.recordFailure(offline)).toEqual({
				reason: "unreachable",
				opened: true,
				holdMs: 60_000,
			});
		} finally {
			setSystemTime();
		}
	});

	test("still falls back to Octokit when gh fails but GitHub answered", async () => {
		const db = createRealDb();
		seedProject(db);
		let octokitAttempts = 0;
		const manager = createManager(db, {
			execGh: async () => {
				throw Object.assign(new Error("gh: HTTP 403"), {
					code: 1,
					stderr: "gh: API rate limit exceeded",
				});
			},
			github: (async () => {
				octokitAttempts += 1;
				throw new Error("octokit unavailable");
			}) as never,
		});
		const repo = {
			provider: "github" as const,
			owner: REPO.owner,
			name: REPO.name,
			url: `https://github.com/${REPO.owner}/${REPO.name}.git`,
			remoteName: "origin",
			defaultBranch: "main",
		};
		const fetchOpenPrs = openPullRequestsSweeper(manager);
		await withSilencedWarnings(() => fetchOpenPrs(repo).catch(() => {}));
		expect(octokitAttempts).toBe(1);
	});

	test("backs off repeated open-PR sweep failures and resets on success", async () => {
		const t0 = Date.now();
		setSystemTime(new Date(t0));
		try {
			const db = createRealDb();
			seedProject(db);
			let attempts = 0;
			let failing = true;
			const manager = createManager(db, {
				execGh: async () => {
					attempts += 1;
					if (failing) throw new Error("sweep unavailable");
					return [];
				},
				github: (async () => {
					throw new Error("octokit unavailable");
				}) as never,
			});
			const repo = {
				provider: "github" as const,
				owner: REPO.owner,
				name: REPO.name,
				url: `https://github.com/${REPO.owner}/${REPO.name}.git`,
				remoteName: "origin",
				defaultBranch: "main",
			};
			const fetchOpenPrs = openPullRequestsSweeper(manager);
			const sweep = () =>
				withSilencedWarnings(() => fetchOpenPrs(repo).catch(() => {}));

			// Trigger every 20s for 10 minutes. Without backoff the 60s TTL
			// admits 11 fetches; doubling admits only t=0, 2min, 6min.
			for (let t = 0; t <= 10 * 60_000; t += 20_000) {
				setSystemTime(new Date(t0 + t));
				await sweep();
			}
			expect(attempts).toBe(3);

			// The t=6min failure backed off to 8min: retry fires at 14min.
			failing = false;
			setSystemTime(new Date(t0 + 14 * 60_000 + 1_000));
			await sweep();
			expect(attempts).toBe(4);

			// Success resets the streak: the base 60s TTL applies again.
			setSystemTime(new Date(t0 + 14 * 60_000 + 1_000 + 61_000));
			await sweep();
			expect(attempts).toBe(5);
		} finally {
			setSystemTime();
		}
	});

	// A fetch that out-lives its own backoff window before rejecting must
	// anchor the backoff at the rejection, not the fetch start — otherwise
	// the cached rejection is born expired and the next trigger refetches
	// immediately, so slow failures never back off.
	test("anchors failure backoff at rejection time for slow failures", async () => {
		const t0 = Date.now();
		setSystemTime(new Date(t0));
		try {
			const db = createRealDb();
			seedProject(db);
			let attempts = 0;
			let rejectInFlight: ((error: Error) => void) | undefined;
			const manager = createManager(db, {
				execGh: () => {
					attempts += 1;
					if (attempts === 1) {
						return new Promise((_, reject) => {
							rejectInFlight = reject;
						});
					}
					return Promise.reject(new Error("sweep unavailable"));
				},
				github: (async () => {
					throw new Error("octokit unavailable");
				}) as never,
			});
			const repo = {
				provider: "github" as const,
				owner: REPO.owner,
				name: REPO.name,
				url: `https://github.com/${REPO.owner}/${REPO.name}.git`,
				remoteName: "origin",
				defaultBranch: "main",
			};
			const fetchOpenPrs = openPullRequestsSweeper(manager);
			const sweep = () =>
				withSilencedWarnings(() => fetchOpenPrs(repo).catch(() => {}));

			// The fetch hangs past its own post-failure window (120s after the
			// first failure) and only then rejects.
			const slow = sweep();
			expect(attempts).toBe(1);
			setSystemTime(new Date(t0 + 130_000));
			rejectInFlight?.(new Error("slow failure"));
			await slow;

			// Anchored at fetch start the window would already be consumed and
			// this trigger would refetch; anchored at the rejection it holds.
			setSystemTime(new Date(t0 + 131_000));
			await sweep();
			expect(attempts).toBe(1);

			// The full window measured from the failure elapses: retry admitted.
			setSystemTime(new Date(t0 + 130_000 + 121_000));
			await sweep();
			expect(attempts).toBe(2);
		} finally {
			setSystemTime();
		}
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
				const ref = headArg.slice(headArg.indexOf(":") + 1);
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

// A workspace branched off `main` still tracks `origin/main`, so its upstream
// branch is `main`; without the guard it links to any head=main PR.
describe("default-branch guard", () => {
	test("does not link a workspace tracking origin/main to a head=main PR", async () => {
		const db = createRealDb();
		seedProject(db);
		// Pre-linked like the real bug: the refresh must clear it, not re-affirm it.
		seedPullRequest(db, {
			id: "pr-sync-main",
			prNumber: 1522,
			headBranch: "main",
			headSha: "main-sha",
			title: "chore: sync main into feat/signal-pages",
		});
		seedWorkspace(db, {
			id: "ws",
			branch: "roshvan/mcp-1703-mcp-surface-area",
			headSha: "workspace-sha",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "main",
			pullRequestId: "pr-sync-main",
		});
		const manager = createManager(db, {
			git: defaultBranchGit("main"),
			execGh: routeGh({
				main: makePrNode({
					number: 1522,
					headRef: "main",
					headSha: "main-sha",
					title: "chore: sync main into feat/signal-pages",
				}),
			}),
		});

		await withSilencedWarnings(() =>
			manager.refreshPullRequestsByWorkspaces(["ws"]),
		);

		expect(getWorkspace(db, "ws")?.pullRequestId).toBeNull();
	});

	test("still links the workspace whose local branch is the default branch", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws-main",
			branch: "main",
			headSha: "main-sha",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "main",
		});
		const manager = createManager(db, {
			git: defaultBranchGit("main"),
			execGh: routeGh({
				main: makePrNode({
					number: 1522,
					headRef: "main",
					headSha: "main-sha",
					title: "chore: sync main into feat/signal-pages",
				}),
			}),
		});

		await manager.refreshPullRequestsByWorkspaces(["ws-main"]);

		expect(getWorkspace(db, "ws-main")?.pullRequestId).toBe(
			getPrByNumber(db, 1522)?.id,
		);
	});

	test("still links a fork PR whose head branch is named main", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws-fork",
			branch: "quueli-main",
			headSha: "fork-sha",
			upstreamOwner: "fork-owner",
			upstreamRepo: "fork-repo",
			upstreamBranch: "main",
		});
		const manager = createManager(db, {
			git: defaultBranchGit("main"),
			execGh: routeGh({
				main: makePrNode({
					number: 88,
					headRef: "main",
					headSha: "fork-sha",
					headOwner: "fork-owner",
					headRepo: "fork-repo",
					title: "Fork feature",
				}),
			}),
		});

		await manager.refreshPullRequestsByWorkspaces(["ws-fork"]);

		expect(getWorkspace(db, "ws-fork")?.pullRequestId).toBe(
			getPrByNumber(db, 88)?.id,
		);
	});
});

type WorkspaceChangedEvent = Omit<WorkspaceChangedMessage, "type">;

// Minimal in-process stand-in for EventBus.onWorkspaceChanged.
function createFakeWorkspaceEventBus() {
	const listeners = new Set<(event: WorkspaceChangedEvent) => void>();
	return {
		listeners,
		onWorkspaceChanged(listener: (event: WorkspaceChangedEvent) => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		emit(event: WorkspaceChangedEvent) {
			for (const listener of listeners) listener(event);
		},
	};
}

// The subscription handler fires enqueueWorkspaceSync without exposing its
// promise, so tests observe completion through the DB row.
async function waitFor(
	condition: () => boolean,
	timeoutMs = 2000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition() && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

describe("workspace-created event trigger", () => {
	// The manager only consumes workspaceId (it re-reads the row from the DB),
	// so the snapshot payload can stay null.
	const createdEvent: WorkspaceChangedEvent = {
		workspaceId: "ws-new",
		eventType: "created",
		workspace: null,
		occurredAt: 1,
	};

	function createEventDrivenManager(db: HostDb) {
		let refsReads = 0;
		const manager = createManager(db, {
			execGh: routeGh({
				"feat/new-thing": makePrNode({
					number: 6123,
					headRef: "feat/new-thing",
					headSha: "sha-new",
				}),
			}),
			readWorkspaceRefs: async () => {
				refsReads += 1;
				return {
					branch: "feat/new-thing",
					headSha: "sha-new",
					upstream: {
						owner: REPO.owner,
						name: REPO.name,
						branch: "feat/new-thing",
					},
				};
			},
		});
		return { manager, refsReads: () => refsReads };
	}

	test("links the PR on a created event without timers or gitWatcher activity", async () => {
		const db = createRealDb();
		seedProject(db);
		// Fresh-insert shape: branch set, headSha/upstream all NULL.
		seedWorkspace(db, { id: "ws-new", branch: "feat/new-thing" });
		const { manager } = createEventDrivenManager(db);
		const bus = createFakeWorkspaceEventBus();
		manager.subscribeToWorkspaceEvents(bus);

		// start() is deliberately never called: no safety-net/refresh timers,
		// and the fake gitWatcher never emits. The event alone must do it.
		bus.emit(createdEvent);
		await waitFor(() => Boolean(getWorkspace(db, "ws-new")?.pullRequestId));

		const ws = getWorkspace(db, "ws-new");
		expect(ws?.headSha).toBe("sha-new");
		expect(ws?.upstreamOwner).toBe(REPO.owner);
		expect(ws?.upstreamRepo).toBe(REPO.name);
		expect(ws?.upstreamBranch).toBe("feat/new-thing");
		expect(ws?.pullRequestId).toBe(getPrByNumber(db, 6123)?.id);

		manager.stop();
		expect(bus.listeners.size).toBe(0);
	});

	test("ignores updated and deleted events", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, { id: "ws-new", branch: "feat/new-thing" });
		const { manager, refsReads } = createEventDrivenManager(db);
		const bus = createFakeWorkspaceEventBus();
		manager.subscribeToWorkspaceEvents(bus);

		bus.emit({ ...createdEvent, eventType: "updated" });
		bus.emit({ ...createdEvent, eventType: "deleted" });
		await waitFor(() => refsReads() > 0, 100);

		expect(refsReads()).toBe(0);
		expect(getWorkspace(db, "ws-new")?.pullRequestId).toBeNull();
	});
});

describe("missing-worktree degraded state", () => {
	const createdEvent: WorkspaceChangedEvent = {
		workspaceId: "ws-dead",
		eventType: "created",
		workspace: null,
		occurredAt: 1,
	};

	function createGatedManager(db: HostDb, disk: { exists: boolean }) {
		let refsReads = 0;
		const manager = createManager(db, {
			execGh: routeGh({
				"feat/dead": makePrNode({
					number: 7001,
					headRef: "feat/dead",
					headSha: "sha-dead",
				}),
			}),
			readWorkspaceRefs: async () => {
				refsReads += 1;
				return {
					branch: "feat/dead",
					headSha: "sha-dead",
					upstream: { owner: REPO.owner, name: REPO.name, branch: "feat/dead" },
				};
			},
			worktreeExists: () => disk.exists,
		});
		return { manager, refsReads: () => refsReads };
	}

	async function withCapturedWarnings<T>(
		fn: () => Promise<T>,
	): Promise<{ result: T; warnings: string[] }> {
		const original = console.warn;
		const warnings: string[] = [];
		console.warn = (...args: unknown[]) => {
			warnings.push(String(args[0]));
		};
		try {
			return { result: await fn(), warnings };
		} finally {
			console.warn = original;
		}
	}

	test("skips git reads and logs one line while the worktree is missing", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, { id: "ws-dead", branch: "feat/dead" });
		const disk = { exists: false };
		const { manager, refsReads } = createGatedManager(db, disk);
		const bus = createFakeWorkspaceEventBus();
		manager.subscribeToWorkspaceEvents(bus);

		const { warnings } = await withCapturedWarnings(async () => {
			bus.emit(createdEvent);
			await waitFor(() => refsReads() > 0, 100);
			bus.emit(createdEvent);
			await waitFor(() => refsReads() > 0, 100);
		});

		expect(refsReads()).toBe(0);
		expect(getWorkspace(db, "ws-dead")?.pullRequestId).toBeNull();
		expect(
			warnings.filter((w) => w.includes("Worktree missing on disk")),
		).toHaveLength(1);

		manager.stop();
	});

	test("resumes sync and logs degraded-exit when the worktree reappears", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, { id: "ws-dead", branch: "feat/dead" });
		const disk = { exists: false };
		const { manager, refsReads } = createGatedManager(db, disk);
		const bus = createFakeWorkspaceEventBus();
		manager.subscribeToWorkspaceEvents(bus);

		const { warnings } = await withCapturedWarnings(async () => {
			bus.emit(createdEvent);
			await waitFor(() => refsReads() > 0, 100);
			expect(refsReads()).toBe(0);

			disk.exists = true;
			bus.emit(createdEvent);
			await waitFor(() => Boolean(getWorkspace(db, "ws-dead")?.pullRequestId));
		});

		expect(refsReads()).toBeGreaterThan(0);
		const ws = getWorkspace(db, "ws-dead");
		expect(ws?.headSha).toBe("sha-dead");
		expect(ws?.pullRequestId).toBe(getPrByNumber(db, 7001)?.id);
		expect(
			warnings.filter((w) => w.includes("Worktree reappeared")),
		).toHaveLength(1);

		manager.stop();
	});

	// Constructed WITHOUT worktreeExists: pins the `?? existsSync` production
	// default against a real directory, which every other test stubs out.
	test("default disk gate uses the real filesystem when nothing is injected", async () => {
		const db = createRealDb();
		seedProject(db);
		const dir = mkdtempSync(join(tmpdir(), "prm-default-gate-"));
		seedWorkspace(db, {
			id: "ws-real",
			branch: "feat/real",
			worktreePath: dir,
		});
		let refsReads = 0;
		const manager = new PullRequestRuntimeManager({
			db,
			execGh: routeGh({
				"feat/real": makePrNode({
					number: 7002,
					headRef: "feat/real",
					headSha: "sha-real",
				}),
			}) as never,
			git: (async () => {
				throw new Error("git should not be used");
			}) as never,
			github: (async () => {
				throw new Error("octokit should not be used");
			}) as never,
			gitWatcher: { onChanged: () => () => {} } as never,
			readWorkspaceRefs: async () => {
				refsReads += 1;
				return {
					branch: "feat/real",
					headSha: "sha-real",
					upstream: { owner: REPO.owner, name: REPO.name, branch: "feat/real" },
				};
			},
		});
		const bus = createFakeWorkspaceEventBus();
		manager.subscribeToWorkspaceEvents(bus);
		const event: WorkspaceChangedEvent = {
			workspaceId: "ws-real",
			eventType: "created",
			workspace: null,
			occurredAt: 1,
		};

		try {
			bus.emit(event);
			await waitFor(() => refsReads > 0);
			expect(refsReads).toBeGreaterThan(0);

			const seen = refsReads;
			rmSync(dir, { recursive: true, force: true });
			const { warnings } = await withCapturedWarnings(async () => {
				bus.emit(event);
				await waitFor(() => refsReads > seen, 100);
			});
			expect(refsReads).toBe(seen);
			expect(
				warnings.filter((w) => w.includes("Worktree missing on disk")),
			).toHaveLength(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
			manager.stop();
		}
	});
});

describe("PullRequestRuntimeManager workspace PR history", () => {
	// Serves one open PR per branch through both the per-head query and the
	// repo-wide sweep, with empty detail endpoints.
	function historyExecGh(prsByBranch: Map<string, number>) {
		return async (args: string[]) => {
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
			const head = args.find(
				(arg) => typeof arg === "string" && arg.startsWith("head="),
			);
			if (head) {
				const branch = head.slice(`head=${REPO.owner}:`.length);
				const prNumber = prsByBranch.get(branch);
				return prNumber
					? [
							makePrNode({
								number: prNumber,
								headRef: branch,
								headSha: `sha-${branch}`,
							}),
						]
					: [];
			}
			if (path === `repos/${REPO.owner}/${REPO.name}/pulls`) {
				return [...prsByBranch.entries()].map(([branch, prNumber]) =>
					makePrNode({
						number: prNumber,
						headRef: branch,
						headSha: `sha-${branch}`,
					}),
				);
			}
			throw new Error(`unexpected gh call: ${args.join(" ")}`);
		};
	}

	test("history accumulates across branch moves; unlink hides the pointer, never the history", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws",
			branch: "branch-a",
			headSha: "sha-branch-a",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "branch-a",
		});
		const prsByBranch = new Map([["branch-a", 101]]);
		const manager = createManager(db, { execGh: historyExecGh(prsByBranch) });

		await withSilencedWarnings(() =>
			manager.refreshPullRequestsByWorkspaces(["ws"]),
		);
		const first = await manager.getPullRequestHistoryByWorkspaces(["ws"]);
		expect(first[0]?.pullRequests.map((pr) => pr.number)).toEqual([101]);
		expect(first[0]?.pullRequests[0]?.isCurrent).toBe(true);

		// The workspace moves on: new branch, new PR. The pointer follows;
		// the history keeps both.
		db.update(workspaces)
			.set({
				branch: "branch-b",
				headSha: "sha-branch-b",
				upstreamBranch: "branch-b",
			})
			.where(eq(workspaces.id, "ws"))
			.run();
		prsByBranch.set("branch-b", 102);
		await withSilencedWarnings(() =>
			manager.refreshPullRequestsByWorkspaces(["ws"]),
		);

		const both = await manager.getPullRequestHistoryByWorkspaces(["ws"]);
		expect(both[0]?.pullRequests.map((pr) => pr.number)).toEqual([102, 101]);
		expect(both[0]?.pullRequests.map((pr) => pr.isCurrent)).toEqual([
			true,
			false,
		]);
		const current = await manager.getPullRequestsByWorkspaces(["ws"]);
		expect(current[0]?.pullRequest?.number).toBe(102);

		// Remove PR Link: the sidebar loses the pointer; history keeps 102.
		manager.unlinkWorkspacePullRequest("ws");
		const afterUnlink = await manager.getPullRequestsByWorkspaces(["ws"]);
		expect(afterUnlink[0]?.pullRequest).toBeNull();
		const history = await manager.getPullRequestHistoryByWorkspaces(["ws"]);
		expect(history[0]?.pullRequests.map((pr) => pr.number)).toEqual([102, 101]);
		expect(history[0]?.pullRequests.every((pr) => pr.isCurrent === false)).toBe(
			true,
		);
	});

	test("relinking the same PR after flip-flopping branches stays deduped", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws",
			branch: "branch-a",
			headSha: "sha-branch-a",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "branch-a",
		});
		const prsByBranch = new Map([["branch-a", 101]]);
		const manager = createManager(db, { execGh: historyExecGh(prsByBranch) });

		await withSilencedWarnings(() =>
			manager.refreshPullRequestsByWorkspaces(["ws"]),
		);
		await withSilencedWarnings(() =>
			manager.refreshPullRequestsByWorkspaces(["ws"]),
		);

		const history = await manager.getPullRequestHistoryByWorkspaces(["ws"]);
		expect(history[0]?.pullRequests.map((pr) => pr.number)).toEqual([101]);
	});
});

// Typed handle on the private timer-path refresh (no bypass), so a test can
// tell a cached answer from a refetch.
function projectRefresher(manager: PullRequestRuntimeManager) {
	const accessible = manager as unknown as {
		refreshProject(projectId: string): Promise<void>;
	};
	return accessible.refreshProject.bind(accessible);
}

// gh answers for one open PR: the head lookup / open sweep return the node,
// and the four detail calls return empty but well-formed payloads.
function ghAnsweringPr(
	node: ReturnType<typeof makePrNode>,
	counts: Record<string, number>,
) {
	return async (args: string[]) => {
		const path = args.find((arg) => arg.startsWith("repos/")) ?? "";
		const kind =
			args[1] === "graphql"
				? "merge-queue"
				: path.endsWith("/reviews")
					? "reviews"
					: path.endsWith("/check-runs")
						? "check-runs"
						: path.endsWith("/statuses")
							? "statuses"
							: "head-lookup";
		counts[kind] = (counts[kind] ?? 0) + 1;
		switch (kind) {
			case "head-lookup":
				return [node];
			case "reviews":
			case "statuses":
				return [];
			case "check-runs":
				return { check_runs: [] };
			default:
				return {
					data: { repository: { pullRequest: { mergeQueueEntry: null } } },
				};
		}
	};
}

describe("PullRequestRuntimeManager GitHub traffic", () => {
	test("caches review/check/merge-queue lookups per PR head across refreshes", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws",
			branch: "feature",
			headSha: "abc123",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "feature",
		});
		const counts: Record<string, number> = {};
		const manager = createManager(db, {
			execGh: ghAnsweringPr(
				makePrNode({ number: 7, headRef: "feature", headSha: "abc123" }),
				counts,
			),
		});
		const refreshProject = projectRefresher(manager);

		await refreshProject(PROJECT_ID);
		expect(getWorkspace(db, "ws")?.pullRequestId).toBeTruthy();
		expect(counts).toEqual({
			"head-lookup": 1,
			reviews: 1,
			"check-runs": 1,
			statuses: 1,
			"merge-queue": 1,
		});

		// A second timer sweep inside the TTL costs nothing.
		await refreshProject(PROJECT_ID);
		expect(counts).toEqual({
			"head-lookup": 1,
			reviews: 1,
			"check-runs": 1,
			statuses: 1,
			"merge-queue": 1,
		});

		// The user's explicit refresh bypasses the cache and pays once more.
		await manager.refreshPullRequestsByWorkspaces(["ws"]);
		expect(counts).toEqual({
			"head-lookup": 2,
			reviews: 2,
			"check-runs": 2,
			statuses: 2,
			"merge-queue": 2,
		});
	});

	test("a new push refetches details at once and keeps one cache entry per PR", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws",
			branch: "feature",
			headSha: "sha-1",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "feature",
		});
		let headSha = "sha-1";
		const counts: Record<string, number> = {};
		const manager = createManager(db, {
			execGh: async (args) =>
				ghAnsweringPr(
					makePrNode({ number: 7, headRef: "feature", headSha }),
					counts,
				)(args),
		});
		const refreshProject = projectRefresher(manager);
		const cache = (
			manager as unknown as { pullRequestDetailsCache: Map<string, unknown> }
		).pullRequestDetailsCache;

		await refreshProject(PROJECT_ID);
		expect(counts.reviews).toBe(1);
		expect(cache.size).toBe(1);

		// Same SHA inside the TTL: the head is re-read (bypass) but the
		// details are served from cache.
		await manager.refreshPullRequestsByWorkspaces(["ws"]);
		expect(counts["head-lookup"]).toBe(2);
		expect(counts.reviews).toBe(2);

		// A push moves the head: once the head is re-read, details refetch
		// even inside the TTL, and the old version does not linger as a second
		// entry.
		headSha = "sha-2";
		await manager.refreshPullRequestsByWorkspaces(["ws"]);
		expect(counts.reviews).toBe(3);
		expect(cache.size).toBe(1);
		expect(getPrByNumber(db, 7)?.headSha).toBe("sha-2");
	});

	test("a rate limit holds every lookup until the reset, keeps old links, and is reported", async () => {
		const t0 = 1_700_000_000_000;
		setSystemTime(new Date(t0));
		try {
			const db = createRealDb();
			seedProject(db);
			seedPullRequest(db, {
				id: "pr-old",
				prNumber: 41,
				headBranch: "older",
				headSha: "old-sha",
			});
			seedWorkspace(db, {
				id: "ws-old",
				branch: "older",
				headSha: "old-sha",
				upstreamOwner: REPO.owner,
				upstreamRepo: REPO.name,
				upstreamBranch: "older",
				pullRequestId: "pr-old",
			});
			seedWorkspace(db, {
				id: "ws-new",
				branch: "newer",
				headSha: "new-sha",
				upstreamOwner: REPO.owner,
				upstreamRepo: REPO.name,
				upstreamBranch: "newer",
			});
			let ghSpawns = 0;
			let quotaSpent = true;
			const counts: Record<string, number> = {};
			const answer = ghAnsweringPr(
				makePrNode({ number: 42, headRef: "newer", headSha: "new-sha" }),
				counts,
			);
			const manager = createManager(db, {
				execGh: async (args) => {
					ghSpawns += 1;
					if (!quotaSpent) return answer(args);
					throw Object.assign(new Error("Command failed: gh api"), {
						code: 1,
						stderr:
							"gh: API rate limit exceeded for user ID 1. If you reach out to GitHub Support for help…",
					});
				},
				github: async () => {
					throw Object.assign(
						new Error("API rate limit exceeded for user ID 1."),
						{
							status: 403,
							response: {
								headers: {
									"x-ratelimit-reset": String(Math.floor(t0 / 1000) + 600),
								},
							},
						},
					);
				},
			});
			expect(manager.getGithubStatus()).toBeNull();

			await withSilencedWarnings(() =>
				manager.refreshPullRequestsByWorkspaces(["ws-old", "ws-new"]),
			);
			// The older link survives; the newer PR cannot be linked yet.
			expect(getWorkspace(db, "ws-old")?.pullRequestId).toBe("pr-old");
			expect(getWorkspace(db, "ws-new")?.pullRequestId).toBeNull();
			expect(manager.getGithubStatus()).toEqual({
				reason: "rate-limited",
				since: t0,
				until: t0 + 605_000,
			});

			// Polling spawns nothing while the hold lasts.
			const spawnsBeforeHold = ghSpawns;
			await withSilencedWarnings(() => projectRefresher(manager)(PROJECT_ID));
			expect(ghSpawns).toBe(spawnsBeforeHold);
			// An explicit refresh probes once per workspace and, still limited,
			// leaves the hold and the links exactly as they were.
			await withSilencedWarnings(() =>
				manager.refreshPullRequestsByWorkspaces(["ws-old", "ws-new"]),
			);
			expect(ghSpawns).toBe(spawnsBeforeHold + 2);
			expect(manager.getGithubStatus()?.until).toBe(t0 + 605_000);
			expect(getWorkspace(db, "ws-old")?.pullRequestId).toBe("pr-old");

			// Past the reset the sweep runs again and links the newer PR.
			setSystemTime(new Date(t0 + 606_000));
			quotaSpent = false;
			expect(manager.getGithubStatus()).toBeNull();
			await manager.refreshPullRequestsByWorkspaces(["ws-new"]);
			expect(getWorkspace(db, "ws-new")?.pullRequestId).toBeTruthy();
			expect(getPrByNumber(db, 42)?.headBranch).toBe("newer");
			expect(manager.getGithubStatus()).toBeNull();
		} finally {
			setSystemTime();
		}
	});

	test("the first sweep after a hold fetches instead of serving the held rejection", async () => {
		const t0 = 1_700_000_000_000;
		setSystemTime(new Date(t0));
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws",
			branch: "feature",
			headSha: "abc123",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "feature",
		});
		let ghSpawns = 0;
		let quotaSpent = true;
		const answer = ghAnsweringPr(
			makePrNode({ number: 9, headRef: "feature", headSha: "abc123" }),
			{},
		);
		const manager = createManager(db, {
			execGh: async (args) => {
				ghSpawns += 1;
				if (!quotaSpent) return answer(args);
				throw Object.assign(new Error("Command failed: gh api"), {
					code: 1,
					stderr: "gh: API rate limit exceeded for user ID 1.",
				});
			},
			github: async () => {
				throw Object.assign(new Error("API rate limit exceeded"), {
					status: 403,
				});
			},
		});
		try {
			const refreshProject = projectRefresher(manager);

			// Trip the gate, then let several timer sweeps hit the hold: each
			// would otherwise cache a rejection with a doubling TTL.
			await withSilencedWarnings(() => refreshProject(PROJECT_ID));
			expect(manager.getGithubStatus()?.reason).toBe("rate-limited");
			for (let i = 1; i <= 3; i++) {
				setSystemTime(new Date(t0 + i * 61_000));
				await withSilencedWarnings(() => refreshProject(PROJECT_ID));
			}
			const spawnsDuringHold = ghSpawns;

			// Just past the 5-minute hold, the timer path must ask GitHub again.
			setSystemTime(new Date(t0 + 5 * 60_000 + 1));
			quotaSpent = false;
			await refreshProject(PROJECT_ID);
			expect(ghSpawns).toBeGreaterThan(spawnsDuringHold);
			expect(getWorkspace(db, "ws")?.pullRequestId).toBeTruthy();
			expect(manager.getGithubStatus()).toBeNull();
		} finally {
			setSystemTime();
			manager.stop();
		}
	});

	test("a single workspace's refresh fetches only its own ref and leaves the others' links alone", async () => {
		const db = createRealDb();
		seedProject(db);
		seedPullRequest(db, {
			id: "pr-a",
			prNumber: 1,
			headBranch: "a",
			headSha: "sha-a",
		});
		seedPullRequest(db, {
			id: "pr-b",
			prNumber: 2,
			headBranch: "b",
			headSha: "sha-b",
		});
		for (const [id, branch, pullRequestId] of [
			["ws-a", "a", "pr-a"],
			["ws-b", "b", "pr-b"],
			["ws-c", "c", null],
		] as const) {
			seedWorkspace(db, {
				id,
				branch,
				headSha: `sha-${branch}`,
				upstreamOwner: REPO.owner,
				upstreamRepo: REPO.name,
				upstreamBranch: branch,
				pullRequestId,
			});
		}
		const headsLookedUp: string[] = [];
		const manager = createManager(db, {
			execGh: async (args) => {
				const head = args.find((arg) => arg.startsWith("head="));
				if (head) {
					headsLookedUp.push(head.slice("head=".length));
					return head.endsWith(":c")
						? [makePrNode({ number: 3, headRef: "c", headSha: "sha-c" })]
						: [];
				}
				if (args.some((arg) => arg.startsWith("state=open"))) return [];
				if (args[1] === "graphql")
					return {
						data: { repository: { pullRequest: { mergeQueueEntry: null } } },
					};
				if (args.some((arg) => arg.includes("/check-runs")))
					return { check_runs: [] };
				return [];
			},
		});

		// The user's refresh of ws-c (and a git event in it) costs one head lookup.
		await manager.refreshPullRequestsByWorkspaces(["ws-c"]);
		expect(headsLookedUp).toEqual([`${REPO.owner}:c`]);
		expect(getWorkspace(db, "ws-c")?.pullRequestId).toBeTruthy();
		// ws-a and ws-b were not fetched, so nothing could have cleared them.
		expect(getWorkspace(db, "ws-a")?.pullRequestId).toBe("pr-a");
		expect(getWorkspace(db, "ws-b")?.pullRequestId).toBe("pr-b");

		// The project-wide sweep still covers everyone (c is still cached).
		headsLookedUp.length = 0;
		await projectRefresher(manager)(PROJECT_ID);
		expect([...headsLookedUp].sort()).toEqual([
			`${REPO.owner}:a`,
			`${REPO.owner}:b`,
		]);
	});

	test("a missing or rejected credential is reported as an auth hold", async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws",
			branch: "feature",
			headSha: "abc123",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "feature",
		});
		const manager = createManager(db, {
			execGh: async () => {
				throw Object.assign(new Error("Command failed: gh api"), {
					code: 1,
					stderr:
						"To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.",
				});
			},
			github: async () => {
				throw Object.assign(new Error("No GitHub credentials found"), {
					cause: { kind: "NO_GITHUB_TOKEN" },
				});
			},
		});

		await withSilencedWarnings(() =>
			manager.refreshPullRequestsByWorkspaces(["ws"]),
		);
		expect(manager.getGithubStatus()?.reason).toBe("auth");
		expect(getWorkspace(db, "ws")?.pullRequestId).toBeNull();
	});
});

describe("PR identity is published before enrichment", () => {
	function fixture(execGh?: (args: string[]) => Promise<unknown>) {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws",
			branch: "feature",
			headSha: "abc123",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "feature",
		});
		return { db, manager: createManager(db, { execGh }) };
	}

	test("publishes a link while reviews are pending and does not restore it after unlink", async () => {
		let release!: () => void;
		let entered!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const answer = ghAnsweringPr(
			makePrNode({ number: 7, headRef: "feature", headSha: "abc123" }),
			{},
		);
		const { db, manager } = fixture(async (args) => {
			if (args.some((arg) => arg.endsWith("/reviews"))) {
				entered();
				await pending;
			}
			return answer(args);
		});
		const refresh = projectRefresher(manager)(PROJECT_ID);
		try {
			await started;
			expect(getWorkspace(db, "ws")?.pullRequestId).toBeTruthy();
			await manager.unlinkWorkspacePullRequest("ws");
			release();
			await refresh;
			expect(getWorkspace(db, "ws")?.pullRequestId).toBeNull();
		} finally {
			release();
			await refresh;
			manager.stop();
		}
	});

	test("publishes a discovered link before another branch lookup finishes", async () => {
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		const answer = ghAnsweringPr(
			makePrNode({ number: 7, headRef: "feature", headSha: "abc123" }),
			{},
		);
		const { db, manager } = fixture(async (args) => {
			if (args.some((arg) => arg.includes(":slow"))) await pending;
			return answer(args);
		});
		seedWorkspace(db, {
			id: "slow",
			branch: "slow",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "slow",
		});
		const refresh = projectRefresher(manager)(PROJECT_ID);
		try {
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(getWorkspace(db, "ws")?.pullRequestId).toBeTruthy();
		} finally {
			release();
			await refresh;
			manager.stop();
		}
	});

	test("does not link an old branch when its lookup completes after a branch change", async () => {
		let release!: () => void;
		let entered!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const answer = ghAnsweringPr(
			makePrNode({ number: 7, headRef: "feature", headSha: "abc123" }),
			{},
		);
		const { db, manager } = fixture(async (args) => {
			entered();
			await pending;
			return answer(args);
		});
		const refresh = projectRefresher(manager)(PROJECT_ID);
		try {
			await started;
			db.update(workspaces)
				.set({ branch: "other", upstreamBranch: "other" })
				.where(eq(workspaces.id, "ws"))
				.run();
			release();
			await refresh;
			expect(getWorkspace(db, "ws")?.pullRequestId).toBeNull();
		} finally {
			release();
			await refresh;
			manager.stop();
		}
	});

	for (const moved of [false, true]) {
		test(`created PR persists without GitHub requests or ref changes (workspace moved: ${moved})`, async () => {
			const { db, manager } = fixture();
			const expectedWorkspace = getWorkspace(db, "ws");
			if (!expectedWorkspace) throw new Error("Missing fixture workspace");
			if (moved)
				db.update(workspaces)
					.set({ headSha: "new-head" })
					.where(eq(workspaces.id, "ws"))
					.run();
			const before = getWorkspace(db, "ws");
			if (!before) throw new Error("Missing fixture workspace");
			try {
				const id = await manager.linkWorkspaceToCreatedPullRequest({
					workspaceId: "ws",
					projectId: PROJECT_ID,
					expectedWorkspace,
					pullRequest: {
						number: 7,
						url: "https://github.com/base-owner/base-repo/pull/7",
						title: "Known PR",
						state: "open",
						headRefName: "feature",
						headRefOid: "remote-head",
						isCrossRepository: false,
					},
				});
				expect(id === null).toBe(moved);
				expect(getPrByNumber(db, 7)?.title).toBe("Known PR");
				expect(getWorkspace(db, "ws")).toEqual({
					...before,
					pullRequestId: id,
				});
			} finally {
				manager.stop();
			}
		});
	}
});

for (const nextBranch of ["new-branch", "feature"]) {
	test(`a queued ref sync revalidates discovery before database refs catch up: ${nextBranch}`, async () => {
		const db = createRealDb();
		seedProject(db);
		seedWorkspace(db, {
			id: "ws",
			branch: "feature",
			headSha: "abc123",
			upstreamOwner: REPO.owner,
			upstreamRepo: REPO.name,
			upstreamBranch: "feature",
		});
		let branch = "feature";
		let release!: () => void;
		let entered!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const answer = ghAnsweringPr(
			makePrNode({ number: 7, headRef: "feature", headSha: "abc123" }),
			{},
		);
		const manager = createManager(db, {
			readWorkspaceRefs: async () => ({
				branch,
				headSha: "abc123",
				upstream:
					branch === "feature"
						? { owner: REPO.owner, name: REPO.name, branch }
						: null,
			}),
			execGh: async (args) => {
				entered();
				await pending;
				return answer(args);
			},
		});
		const refresh = manager.refreshPullRequestsByWorkspaces(["ws"]);
		try {
			await started;
			branch = nextBranch;
			const queued = (
				manager as unknown as {
					enqueueWorkspaceSync(id: string): Promise<void>;
				}
			).enqueueWorkspaceSync("ws");
			expect(getWorkspace(db, "ws")?.branch).toBe("feature");
			release();
			await Promise.all([refresh, queued]);
			expect(getWorkspace(db, "ws")?.branch).toBe(nextBranch);
			if (nextBranch === "new-branch") {
				expect(getWorkspace(db, "ws")?.pullRequestId).toBeNull();
				expect(
					db.select().from(schema.workspacePullRequests).all(),
				).toHaveLength(0);
			} else {
				expect(getWorkspace(db, "ws")?.pullRequestId).toBeTruthy();
			}
		} finally {
			release();
			await refresh;
			manager.stop();
		}
	});
}
