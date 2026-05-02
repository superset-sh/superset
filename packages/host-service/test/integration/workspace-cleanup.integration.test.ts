import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { cloudFlows, cloudOk } from "../helpers/cloud-fakes";
import { createTestHost } from "../helpers/createTestHost";
import { createGitFixture } from "../helpers/git-fixture";
import {
	createBasicScenario,
	createFeatureWorktreeScenario,
	type FeatureWorktreeScenario,
} from "../helpers/scenarios";
import { seedProject, seedWorkspace } from "../helpers/seed";

describe("workspaceCleanup.destroy integration", () => {
	let scenario: FeatureWorktreeScenario;

	beforeEach(async () => {
		scenario = await createFeatureWorktreeScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceDeleteOk() },
		});
	});

	afterEach(async () => {
		await scenario.dispose();
	});

	test("rejects deleting a main workspace (worktreePath === repoPath)", async () => {
		// Use the main workspace (id), not the feature one — that's the row
		// whose worktreePath equals the project's repoPath.
		await expect(
			scenario.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: scenario.workspaceId,
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("rejects deleting a workspace flagged as main by cloud", async () => {
		// Different scenario: cloud says type=main even though the path
		// doesn't match repoPath. Build a fresh host with that mock.
		await scenario.dispose();
		const host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": cloudOk.workspaceGetFromHost({
					type: "main",
				}),
			},
		});
		const repo = await createGitFixture();
		const { id: projectId } = seedProject(host, { repoPath: repo.repoPath });
		const worktreePath = join(repo.repoPath, ".worktrees", "feature-cleanup");
		await repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/cleanup",
			worktreePath,
		]);
		const { id: workspaceId } = seedWorkspace(host, {
			projectId,
			worktreePath,
			branch: "feature/cleanup",
		});

		try {
			await expect(
				host.trpc.workspaceCleanup.destroy.mutate({ workspaceId }),
			).rejects.toBeInstanceOf(TRPCClientError);
		} finally {
			await host.dispose();
			repo.dispose();
		}
	});

	test("blocks on dirty worktree with CONFLICT (no force)", async () => {
		writeFileSync(join(scenario.worktreePath, "dirty.txt"), "uncommitted");

		await expect(
			scenario.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
		).rejects.toThrow(/uncommitted changes/i);

		// Cloud delete should NOT have been called — we're past the dirty check.
		expect(
			scenario.host.apiCalls.some(
				(c) => c.path === "v2Workspace.delete.mutate",
			),
		).toBe(false);
	});

	test("force=true skips preflight and runs cloud delete + db cleanup", async () => {
		writeFileSync(join(scenario.worktreePath, "dirty.txt"), "uncommitted");

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			force: true,
		});
		expect(result.success).toBe(true);
		expect(result.cloudDeleted).toBe(true);

		const remaining = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.all();
		expect(remaining).toHaveLength(0);
		expect(
			scenario.host.apiCalls.some(
				(c) => c.path === "v2Workspace.delete.mutate",
			),
		).toBe(true);
	});

	test("clean worktree destroys without force and removes db row", async () => {
		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		expect(result.success).toBe(true);
		expect(result.cloudDeleted).toBe(true);

		const remaining = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.all();
		expect(remaining).toHaveLength(0);
	});

	test("deleteBranch=true also removes the branch after worktree teardown", async () => {
		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch: true,
		});
		expect(result.branchDeleted).toBe(true);

		const branches = await scenario.repo.git.branchLocal();
		expect(branches.all).not.toContain(scenario.branch);
	});

	test("returns success when no local workspace row exists, still calls cloud delete", async () => {
		await scenario.dispose();
		const fresh = await createBasicScenario({
			hostOptions: {
				apiOverrides: {
					"v2Workspace.getFromHost.query": () => null,
					"v2Workspace.delete.mutate": cloudOk.workspaceDelete(),
				},
			},
		});
		try {
			const result = await fresh.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: randomUUID(),
			});
			expect(result.success).toBe(true);
			expect(result.cloudDeleted).toBe(true);
		} finally {
			await fresh.dispose();
		}
	});
});
