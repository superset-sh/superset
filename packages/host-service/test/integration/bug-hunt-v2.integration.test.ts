/**
 * v2-specific bug hunt. v1 (workspace.*) is sunset; ignore those surfaces.
 * Pass = defense holds. Fail / .todo = real v2 bug.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("bug-hunt-v2: progress-store leak on early errors in workspaceCreation.create", () => {
	// Both `workspaceCreation.create` and `workspaceCreation.getProgress`
	// were removed by PR #3893 (canonical workspaces.create) — the entire
	// progress store is gone. The leak these tests guarded is no longer
	// reachable. Re-author against `workspaces.create` if/when an
	// equivalent surface exists.
	test.todo(
		"PROJECT_NOT_SETUP error in create() does not leak a stale progress entry",
	);
	test.todo(
		"whitespace-only branchName error in create() does not leak progress",
	);
});

describe("bug-hunt-v2: workspaceCleanup.destroy phase ordering", () => {
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

	test("destroy of a workspace on the project checkout never runs teardown or touches the repo", async () => {
		// We can't exercise the actual `teardown.sh` script in bun:test
		// (the harness has no PTY). What we *can* verify here is that a
		// workspace whose path IS the project repo takes the record-only
		// path: no teardown, no cloud delete, and the repo stays on disk.
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
				worktreePath: repo.repoPath,
				branch: "main",
			})
			.run();
		writeFileSync(join(repo.repoPath, "dirty.txt"), "uncommitted");

		const result = await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId,
		});
		expect(result.success).toBe(true);
		expect(result.worktreeRemoved).toBe(false);
		expect(existsSync(join(repo.repoPath, ".git"))).toBe(true);
		expect(existsSync(join(repo.repoPath, "dirty.txt"))).toBe(true);

		expect(
			host.apiCalls.some((c) => c.path === "v2Workspace.delete.mutate"),
		).toBe(false);
	});
});

describe("bug-hunt-v2: workspaceCreation.adopt cross-project safety", () => {
	let host: TestHost;
	let repoA: GitFixture;
	let repoB: GitFixture;
	const projectIdA = randomUUID();
	const projectIdB = randomUUID();

	beforeEach(async () => {
		host = await createTestHost({
			apiOverrides: {
				"host.ensure.mutate": () => ({ machineId: "m1" }),
				"v2Workspace.create.mutate": (input: unknown) => {
					const i = input as { branch: string; name: string };
					return {
						id: randomUUID(),
						projectId: projectIdA,
						branch: i.branch,
						name: i.name,
					};
				},
			},
		});
		repoA = await createGitFixture();
		repoB = await createGitFixture();
		host.db
			.insert(projects)
			.values([
				{ id: projectIdA, repoPath: repoA.repoPath },
				{ id: projectIdB, repoPath: repoB.repoPath },
			])
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repoA.dispose();
		repoB.dispose();
	});

	test("adopt with worktreePath belonging to a different project is rejected", async () => {
		const { join } = await import("node:path");
		const worktreeInB = join(repoB.repoPath, ".worktrees", "feature-x");
		await repoB.git.raw(["worktree", "add", "-b", "feature/x", worktreeInB]);

		await expect(
			host.trpc.workspaceCreation.adopt.mutate({
				projectId: projectIdA,
				workspaceName: "x",
				branch: "feature/x",
				worktreePath: worktreeInB,
			}),
		).rejects.toThrow();
	});
});
