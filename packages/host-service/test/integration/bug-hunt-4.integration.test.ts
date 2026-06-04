/**
 * Round 4 of bug-hunting. Cross-project leakage, double-call cloud
 * propagation, abort-signal handling.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("bug-hunt-4: cross-project leakage", () => {
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

	test("adopt with worktreePath from a different project's repo doesn't bind it to this project", async () => {
		// Create a real worktree in repoB, then ask host to adopt it
		// against projectIdA. The procedure pulls `localProject.repoPath`
		// from projectIdA; passing repoB's worktree path is a confusion
		// attack — would give projectIdA a worktree row that points at
		// repoB's filesystem.
		const worktreePathInB = join(repoB.repoPath, ".worktrees", "feature-x");
		await repoB.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/x",
			worktreePathInB,
		]);

		const result = await host.trpc.workspaceCreation.adopt
			.mutate({
				projectId: projectIdA,
				workspaceName: "x",
				branch: "feature/x",
				worktreePath: worktreePathInB,
			})
			.catch((err) => err);

		// If this SUCCEEDED, host has bound projectIdA → repoB worktree —
		// data leak. We expect it to fail (`getWorktreeBranchAtPath` runs
		// against repoA's git so it won't find the worktree from repoB).
		expect(result).toBeInstanceOf(Error);

		// Confirm no row was written.
		const rows = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.projectId, projectIdA))
			.all();
		expect(
			rows.find((r) => r.worktreePath === worktreePathInB),
		).toBeUndefined();
	});
});

describe("bug-hunt-4: double-call cloud propagation", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();
	const workspaceId = randomUUID();
	const worktreePath = "<unset>";
	let actualWorktreePath: string;

	beforeEach(async () => {
		repo = await createGitFixture();
		actualWorktreePath = join(repo.repoPath, ".worktrees", "feature-double");
		await repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/double",
			actualWorktreePath,
		]);
	});

	afterEach(async () => {
		if (host) await host.dispose();
		repo.dispose();
	});

	test("workspaceCleanup.destroy called twice: first succeeds, second propagates cloud's response", async () => {
		// Mock cloud to return success the first time, then 404 on second call.
		let callCount = 0;
		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => ({ type: "feature" }),
				"v2Workspace.delete.mutate": () => {
					callCount++;
					if (callCount === 1) return { success: true };
					throw new Error("Workspace not found in cloud (404)");
				},
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
				worktreePath: actualWorktreePath,
				branch: "feature/double",
			})
			.run();

		const first = await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId,
		});
		expect(first.success).toBe(true);

		// Second call: local row is gone, but cloud delete is still
		// attempted. The procedure currently throws on cloud failure —
		// pin that behavior so a future "swallow 404 on second-destroy"
		// fix flips this test.
		await expect(
			host.trpc.workspaceCleanup.destroy.mutate({ workspaceId }),
		).rejects.toThrow(/not found/i);
	});

	void worktreePath; // keep variable name for line-skew stability
});

describe("bug-hunt-4: abort-signal handling", () => {
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

	test("filesystem.listDirectory completes normally without an abort signal", async () => {
		const result = await host.trpc.filesystem.listDirectory.query({
			workspaceId,
			absolutePath: repo.repoPath,
		});
		expect(result.entries).toBeDefined();
	});
});
