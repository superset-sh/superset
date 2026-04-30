import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("workspaceCleanup.destroy integration", () => {
	let host: TestHost;
	let repo: GitFixture;
	let worktreePath: string;
	const projectId = randomUUID();
	const workspaceId = randomUUID();

	const seedFeatureWorkspace = () => {
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath,
				branch: "feature/cleanup",
			})
			.run();
	};

	beforeEach(async () => {
		repo = await createGitFixture();
		worktreePath = join(repo.repoPath, ".worktrees", "feature-cleanup");
		await repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/cleanup",
			worktreePath,
		]);
	});

	afterEach(async () => {
		if (host) await host.dispose();
		repo.dispose();
	});

	test("rejects deleting a main workspace (worktreePath === repoPath)", async () => {
		host = await createTestHost();
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

		await expect(
			host.trpc.workspaceCleanup.destroy.mutate({ workspaceId }),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("rejects deleting a workspace flagged as main by cloud", async () => {
		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => ({ type: "main" }),
			},
		});
		seedFeatureWorkspace();

		await expect(
			host.trpc.workspaceCleanup.destroy.mutate({ workspaceId }),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("blocks on dirty worktree with CONFLICT (no force)", async () => {
		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => ({ type: "feature" }),
				"v2Workspace.delete.mutate": () => ({ success: true }),
			},
		});
		seedFeatureWorkspace();
		writeFileSync(join(worktreePath, "dirty.txt"), "uncommitted");

		await expect(
			host.trpc.workspaceCleanup.destroy.mutate({ workspaceId }),
		).rejects.toThrow(/uncommitted changes/i);

		// Cloud delete should NOT have been called — we're past the dirty check.
		expect(
			host.apiCalls.some((c) => c.path === "v2Workspace.delete.mutate"),
		).toBe(false);
	});

	test("force=true skips preflight and runs cloud delete + db cleanup", async () => {
		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => ({ type: "feature" }),
				"v2Workspace.delete.mutate": () => ({ success: true }),
			},
		});
		seedFeatureWorkspace();
		writeFileSync(join(worktreePath, "dirty.txt"), "uncommitted");

		const result = await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId,
			force: true,
		});
		expect(result.success).toBe(true);
		expect(result.cloudDeleted).toBe(true);

		const remaining = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.all();
		expect(remaining).toHaveLength(0);

		expect(
			host.apiCalls.some((c) => c.path === "v2Workspace.delete.mutate"),
		).toBe(true);
	});

	test("clean worktree destroys without force and removes db row", async () => {
		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => ({ type: "feature" }),
				"v2Workspace.delete.mutate": () => ({ success: true }),
			},
		});
		seedFeatureWorkspace();

		const result = await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId,
		});
		expect(result.success).toBe(true);
		expect(result.cloudDeleted).toBe(true);

		const remaining = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.all();
		expect(remaining).toHaveLength(0);
	});

	test("deleteBranch=true also removes the branch after worktree teardown", async () => {
		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => ({ type: "feature" }),
				"v2Workspace.delete.mutate": () => ({ success: true }),
			},
		});
		seedFeatureWorkspace();

		const result = await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId,
			deleteBranch: true,
		});
		expect(result.branchDeleted).toBe(true);

		const branches = await repo.git.branchLocal();
		expect(branches.all).not.toContain("feature/cleanup");
	});

	test("returns success when no local workspace row exists, still calls cloud delete", async () => {
		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => null,
				"v2Workspace.delete.mutate": () => ({ success: true }),
			},
		});

		const result = await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: randomUUID(),
		});
		expect(result.success).toBe(true);
		expect(result.cloudDeleted).toBe(true);
	});
});
