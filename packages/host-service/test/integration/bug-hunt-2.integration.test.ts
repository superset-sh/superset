/**
 * Round 2 of bug-hunting. Probes more aggressive escapes and partial-failure
 * paths. Same convention: passing test = defense holds, failing test = bug.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("bug-hunt-2: symlink and additional sandbox probes", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();
	const workspaceId = randomUUID();
	let outsideDir: string;

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();
		outsideDir = join(dirname(repo.repoPath), `outside-${randomUUID()}`);
		mkdirSync(outsideDir, { recursive: true });
		writeFileSync(join(outsideDir, "secret.txt"), "PII");

		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: repo.repoPath,
				branch: "main",
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
		try {
			rmSync(outsideDir, { recursive: true, force: true });
		} catch {}
	});

	test("readFile rejects reads through a symlink that points outside the workspace", async () => {
		// Plant a symlink inside the workspace that points outside.
		const link = join(repo.repoPath, "evil-link");
		symlinkSync(outsideDir, link);

		await expect(
			host.trpc.filesystem.readFile.query({
				workspaceId,
				absolutePath: join(link, "secret.txt"),
				encoding: "utf8",
			}),
		).rejects.toThrow();
	});

	test("writeFile through a symlinked dir into outside the workspace is rejected", async () => {
		const link = join(repo.repoPath, "evil-link");
		symlinkSync(outsideDir, link);

		await expect(
			host.trpc.filesystem.writeFile.mutate({
				workspaceId,
				absolutePath: join(link, "planted.txt"),
				content: "should-not-write",
				options: { create: true, overwrite: true },
			}),
		).rejects.toThrow();
		expect(existsSync(join(outsideDir, "planted.txt"))).toBe(false);
	});

	test("createDirectory rejects '..' traversal", async () => {
		await expect(
			host.trpc.filesystem.createDirectory.mutate({
				workspaceId,
				absolutePath: join(repo.repoPath, "..", "evil-mkdir"),
				recursive: true,
			}),
		).rejects.toThrow();
		expect(existsSync(join(dirname(repo.repoPath), "evil-mkdir"))).toBe(false);
	});

	test("copyPath rejects destinations outside the workspace root", async () => {
		const src = join(repo.repoPath, "src.txt");
		writeFileSync(src, "src");
		const dst = join(outsideDir, "copied.txt");

		await expect(
			host.trpc.filesystem.copyPath.mutate({
				workspaceId,
				sourceAbsolutePath: src,
				destinationAbsolutePath: dst,
			}),
		).rejects.toThrow();
		expect(existsSync(dst)).toBe(false);
	});

	test("copyPath rejects sources outside the workspace root", async () => {
		await expect(
			host.trpc.filesystem.copyPath.mutate({
				workspaceId,
				sourceAbsolutePath: join(outsideDir, "secret.txt"),
				destinationAbsolutePath: join(repo.repoPath, "leaked.txt"),
			}),
		).rejects.toThrow();
		expect(existsSync(join(repo.repoPath, "leaked.txt"))).toBe(false);
	});

	test("statPath with absolute path returns truthy result for files anywhere on host (documented behavior)", async () => {
		// `filesystem.statPath` is intentionally unconfined for terminal
		// link-clicks. This test pins that behavior so a future tightening
		// is a deliberate, visible change.
		const result = await host.trpc.filesystem.statPath.mutate({
			workspaceId,
			path: join(outsideDir, "secret.txt"),
		});
		expect(result).not.toBeNull();
		expect(result?.resolvedPath).toBe(join(outsideDir, "secret.txt"));
	});
});

describe("bug-hunt-2: partial-failure consistency", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();

	beforeEach(async () => {
		repo = await createGitFixture();
	});

	afterEach(async () => {
		if (host) await host.dispose();
		repo.dispose();
	});

	test("workspace.create (v1) does NOT roll back the worktree when persistLocalWorkspace fails post-cloud", async () => {
		host = await createTestHost({
			apiOverrides: {
				"host.ensure.mutate": () => ({ machineId: "m1" }),
				// Return a fresh id for ensureMainWorkspace's call, then a colliding
				// id for the feature workspace's call so the local insert throws.
				"v2Workspace.create.mutate": (() => {
					let n = 0;
					return (input: unknown) => {
						n++;
						const i = input as { branch: string; name: string };
						return {
							id: n === 1 ? randomUUID() : "duplicate-id",
							projectId,
							branch: i.branch,
							name: i.name,
						};
					};
				})(),
			},
		});
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		// First create succeeds; ensureMainWorkspace consumes call #1 and
		// the feature workspace consumes call #2 ("duplicate-id"). Now
		// preload "duplicate-id" into the workspaces table so the post-
		// cloud insert hits the PK and throws.
		host.db
			.insert(workspaces)
			.values({
				id: "duplicate-id",
				projectId,
				worktreePath: "/tmp/preload-conflict",
				branch: "preload",
			})
			.run();

		// The legacy `workspace.create` (v1) doesn't roll back the worktree
		// when the local DB insert fails — that's by design (a stale local
		// row would block the retry forever). Pin that behavior: the call
		// must throw, AND the on-disk worktree must remain (so the user
		// can inspect/recover it before the next attempt). If a future
		// change adds a rollback, this test flips and signals the change.
		await expect(
			host.trpc.workspace.create.mutate({
				projectId,
				name: "ws",
				branch: "feature/post-cloud-fail",
			}),
		).rejects.toBeDefined();

		const expectedWorktree = join(
			repo.repoPath,
			".worktrees",
			"feature/post-cloud-fail",
		);
		expect(existsSync(expectedWorktree)).toBe(true);
	});

	test("workspace.delete with a worktree dir already removed manually still cleans up the row", async () => {
		const workspaceId = randomUUID();
		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => ({ type: "feature" }),
				"v2Workspace.delete.mutate": () => ({ success: true }),
			},
		});
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		// Insert a workspace row pointing at a path that doesn't exist.
		const ghostPath = join(repo.repoPath, ".worktrees", "ghost");
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: ghostPath,
				branch: "feature/ghost",
			})
			.run();

		const result = await host.trpc.workspace.delete.mutate({ id: workspaceId });
		expect(result).toEqual({ success: true });

		const remaining = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.all();
		expect(remaining).toHaveLength(0);
	});

	test("workspaceCleanup.destroy succeeds even if the worktree dir was deleted manually", async () => {
		const workspaceId = randomUUID();
		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => ({ type: "feature" }),
				"v2Workspace.delete.mutate": () => ({ success: true }),
			},
		});
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: join(repo.repoPath, ".worktrees", "vanished"),
				branch: "feature/vanished",
			})
			.run();

		const result = await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId,
		});
		expect(result.success).toBe(true);
		// The cleanup code treats "is not a working tree" / ENOENT as
		// success-equivalent, so worktreeRemoved should be true.
		expect(result.worktreeRemoved).toBe(true);
	});
});

describe("bug-hunt-2: input edges", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();
	const workspaceId = randomUUID();

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: repo.repoPath,
				branch: "main",
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test("setBaseBranch throws PRECONDITION_FAILED on detached HEAD", async () => {
		const sha = await repo.commit("for-detach", { "d.txt": "d" });
		await repo.git.checkout(sha);

		await expect(
			host.trpc.git.setBaseBranch.mutate({
				workspaceId,
				baseBranch: "main",
			}),
		).rejects.toThrow(/detached HEAD/i);
	});

	test("setBaseBranch null on a branch with no configured base is a no-op (no throw)", async () => {
		const result = await host.trpc.git.setBaseBranch.mutate({
			workspaceId,
			baseBranch: null,
		});
		expect(result.baseBranch).toBeNull();
	});

	test("workspaceCreation.adopt rejects empty/whitespace branch names", async () => {
		await expect(
			host.trpc.workspaceCreation.adopt.mutate({
				projectId,
				workspaceName: "x",
				branch: "   ",
			}),
		).rejects.toThrow(/branch name is empty/i);
	});

	test("notifications.hook with eventType only (no terminalId) returns ignored without DB lookup", async () => {
		// Even with a known event type, missing terminalId short-circuits.
		const result = await host.unauthenticatedTrpc.notifications.hook.mutate({
			eventType: "Stop",
		});
		expect(result).toEqual({ success: true, ignored: true });
	});

	test("filesystem.searchFiles with whitespace-only query returns no matches without scanning", async () => {
		// Whitespace-only query is short-circuited; should never index large repos.
		const result = await host.trpc.filesystem.searchFiles.query({
			workspaceId,
			query: "\t\n  \r",
		});
		expect(result.matches).toEqual([]);
	});

	test("filesystem.searchContent with empty query is short-circuited", async () => {
		const result = await host.trpc.filesystem.searchContent.query({
			workspaceId,
			query: "",
		});
		expect(result.matches).toEqual([]);
	});

	test("getStatus on detached HEAD doesn't crash", async () => {
		const sha = await repo.commit("detach-target", { "d.txt": "d" });
		await repo.git.checkout(sha);

		// Just shouldn't throw — `currentBranch` may be empty / HEAD.
		const status = await host.trpc.git.getStatus.query({ workspaceId });
		expect(status).toBeDefined();
		expect(status.staged).toBeDefined();
		expect(status.unstaged).toBeDefined();
	});

	test("ports.getAll with very long workspaceIds list doesn't blow up", async () => {
		const ids = Array.from({ length: 500 }, () => randomUUID());
		const result = await host.trpc.ports.getAll.query({ workspaceIds: ids });
		expect(result).toEqual([]);
	});

	test("pullRequests.getByWorkspaces with 200 ids returns one row per id (or filters cleanly)", async () => {
		const ids = Array.from({ length: 200 }, () => randomUUID());
		const result = await host.trpc.pullRequests.getByWorkspaces.query({
			workspaceIds: ids,
		});
		// None of the random ids exist, so we expect an empty workspaces array.
		expect(result.workspaces).toEqual([]);
	});
});

// Persistence-after-restart was removed — the test harness creates a
// fresh tmp dbPath per `createTestHost`, so two hosts can never share
// the same on-disk file by design. A real cross-host persistence probe
// would need a shared-dbPath option on the harness; add one if/when
// that scenario actually matters.
