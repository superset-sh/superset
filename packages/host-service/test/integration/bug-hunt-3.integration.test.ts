/**
 * Round 3 of bug-hunting. Targets: path-traversal in *.create where the
 * branch / name comes from the renderer.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { projects } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("bug-hunt-3: branch-name path traversal in workspace.create", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();
	let escapeDir: string;

	beforeEach(async () => {
		repo = await createGitFixture();
		// Plant a sibling we can prove a bug by creating a worktree inside.
		escapeDir = resolve(dirname(repo.repoPath), `pwn-${randomUUID()}`);
	});

	afterEach(async () => {
		if (host) await host.dispose();
		repo.dispose();
		try {
			rmSync(escapeDir, { recursive: true, force: true });
		} catch {}
	});

	test("workspace.create with a '../escape' branch name is rejected (no worktree outside project)", async () => {
		host = await createTestHost({
			apiOverrides: {
				"host.ensure.mutate": () => ({ machineId: "m1" }),
				"v2Workspace.create.mutate": (input: unknown) => {
					const i = input as { branch: string; name: string };
					return {
						id: randomUUID(),
						projectId,
						branch: i.branch,
						name: i.name,
					};
				},
			},
		});
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		// path.join('<repoPath>', '.worktrees', '../../<escape>') normalizes
		// to <parent-of-parent-of-repoPath>/<escape>. If the procedure
		// uses `join` without re-validating, it creates a worktree well
		// outside the project root.
		const evilBranch = `../../pwn-${randomUUID()}`;
		const expectedEscapePath = join(repo.repoPath, ".worktrees", evilBranch); // path.join collapses .. segments

		const result = await host.trpc.workspace.create
			.mutate({
				projectId,
				name: "x",
				branch: evilBranch,
			})
			.catch((err) => err);

		// The procedure should have rejected the input. If it didn't, a
		// worktree was placed at expectedEscapePath, outside the repo.
		// Log the error message so we can see WHY it rejected (git's branch
		// name validation? or our own?) — important for understanding the
		// defense.
		if (result instanceof Error) {
			console.error("[bug-hunt-3] rejected with:", result.message);
		}
		expect(existsSync(expectedEscapePath)).toBe(false);
		// And the call should have errored out.
		expect(result).toBeInstanceOf(Error);
	});
});

describe("bug-hunt-3: branch-name path traversal in workspaceCreation.create", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test("workspaceCreation.create rejects a '../escape' branchName (safeResolveWorktreePath guard)", async () => {
		// safeResolveWorktreePath uses `resolve` and rejects escapes. This
		// is the v2 entry point and is the one we expect to be locked down.
		await expect(
			host.trpc.workspaceCreation.create.mutate({
				pendingId: randomUUID(),
				projectId,
				names: { workspaceName: "x", branchName: "../../escape" },
				composer: {},
			}),
		).rejects.toThrow();
	});
});

describe("bug-hunt-3: workspace.delete + dirty worktree", () => {
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

	test("workspace.delete (legacy v1 API) lets a dirty workspace be deleted without warning", async () => {
		// This pins legacy behavior. The new v2 `workspaceCleanup.destroy`
		// has a phase-0 dirty check; `workspace.delete` does not. If a
		// future PR adds a dirty check to `workspace.delete`, this test
		// will flip and signal the change.
		const workspaceId = randomUUID();
		const worktreePath = join(repo.repoPath, ".worktrees", "feature-dirty");
		await repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/dirty",
			worktreePath,
		]);
		// Make it dirty.
		const { writeFileSync } = await import("node:fs");
		writeFileSync(join(worktreePath, "dirt.txt"), "uncommitted");

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
		const { workspaces } = await import("../../src/db/schema");
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath,
				branch: "feature/dirty",
			})
			.run();

		const result = await host.trpc.workspace.delete.mutate({ id: workspaceId });
		// No CONFLICT: dirty work is silently destroyed by the legacy path.
		expect(result).toEqual({ success: true });
	});
});

describe("bug-hunt-3: race + repeated config writes", () => {
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
		const { workspaces } = await import("../../src/db/schema");
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

	// Regression: two concurrent setBaseBranch calls used to race on
	// `.git/config.lock`. One would return a 500 with "error: could not
	// lock config file .git/config: File exists" on a renderer double-
	// click during a slow request. Fixed by routing config writes through
	// `gitConfigWrite`, which retries on lock contention.
	test("parallel setBaseBranch writes converge without a config-lock 500", async () => {
		await Promise.all([
			host.trpc.git.setBaseBranch.mutate({
				workspaceId,
				baseBranch: "main",
			}),
			host.trpc.git.setBaseBranch.mutate({
				workspaceId,
				baseBranch: "develop",
			}),
		]);

		const result = await host.trpc.git.getBaseBranch.query({ workspaceId });
		expect(["main", "develop"]).toContain(result.baseBranch);
	});
});

describe("bug-hunt-3: more concurrency probes", () => {
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

	test("BUG: parallel workspace.create calls for different branches can race on the same .git/config", async () => {
		host = await createTestHost({
			apiOverrides: {
				"host.ensure.mutate": () => ({ machineId: "m1" }),
				"v2Workspace.create.mutate": (input: unknown) => {
					const i = input as { branch: string; name: string };
					return {
						id: randomUUID(),
						projectId,
						branch: i.branch,
						name: i.name,
					};
				},
			},
		});
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		// Two different branches in parallel — they both call
		// `git worktree add` and `git branch.<name>.base` writes via
		// ensureMainWorkspace / inside the procedure.
		const results = await Promise.allSettled([
			host.trpc.workspaces.create.mutate({
				projectId,
				name: "a",
				branch: "feature/a",
			}),
			host.trpc.workspaces.create.mutate({
				projectId,
				name: "b",
				branch: "feature/b",
			}),
		]);

		// Document current behavior. If both succeed, great — we have no
		// bug. If one fails with a config-lock or worktree-lock error,
		// that's a real issue to file.
		const failures = results.filter((r) => r.status === "rejected");
		if (failures.length > 0) {
			console.warn(
				"[bug-hunt-3] parallel workspace.create failure(s):",
				failures.map((r) => (r.status === "rejected" ? String(r.reason) : "")),
			);
		}
		// We currently expect this to be tolerated. If it starts failing,
		// flip to a `test.todo` documenting the regression.
		expect(failures.length).toBe(0);
	});
});
