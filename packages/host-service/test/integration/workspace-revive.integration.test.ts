import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, rmSync, symlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { __testDestroysInFlight } from "../../src/trpc/router/workspace-cleanup/workspace-cleanup";
import * as gitConfig from "../../src/trpc/router/workspace-creation/shared/git-config";
import { cloudFlows } from "../helpers/cloud-fakes";
import {
	createFeatureWorktreeScenario,
	type FeatureWorktreeScenario,
} from "../helpers/scenarios";
import { seedWorkspace } from "../helpers/seed";

describe("workspaceCleanup.revive integration", () => {
	let scenario: FeatureWorktreeScenario;

	beforeEach(async () => {
		scenario = await createFeatureWorktreeScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceDeleteOk() },
		});
	});

	afterEach(async () => {
		await scenario.dispose();
	});

	function readRow(workspaceId: string) {
		return scenario.host.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();
	}

	async function destroyFeature(deleteBranch = false): Promise<void> {
		await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch,
			archive: !deleteBranch,
		});
		expect(existsSync(scenario.worktreePath)).toBe(false);
		const row = readRow(scenario.featureWorkspaceId);
		expect(row?.archivedAt).not.toBeNull();
		expect(row?.archiveReason).toBe(deleteBranch ? "deleted" : "archived");
	}

	async function expectCode(
		promise: Promise<unknown>,
		code: string,
	): Promise<TRPCClientError<never>> {
		let caught: unknown;
		try {
			await promise;
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(TRPCClientError);
		const error = caught as TRPCClientError<never>;
		expect(error.data?.code).toBe(code);
		return error;
	}

	test("recreates the worktree at the tombstone's own path and revives the row", async () => {
		await destroyFeature();
		const events: string[] = [];
		const stop = scenario.host.eventBus.onWorkspaceChanged((event) => {
			events.push(event.eventType);
		});

		const result = await scenario.host.trpc.workspaceCleanup.revive.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		stop();

		expect(result.workspace.id).toBe(scenario.featureWorkspaceId);
		expect(existsSync(scenario.worktreePath)).toBe(true);
		const row = readRow(scenario.featureWorkspaceId);
		expect(row?.archivedAt).toBeNull();
		expect(row?.archiveReason).toBeNull();
		expect(row?.branch).toBe(scenario.branch);

		const worktrees = await scenario.repo.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		expect(worktrees).toContain(`worktree ${scenario.worktreePath}`);
		expect(worktrees).toContain(`branch refs/heads/${scenario.branch}`);
		expect(events).toContain("created");
	});

	test("rejects restore and destroy while the workspace lifecycle guard is held", async () => {
		await destroyFeature();
		__testDestroysInFlight.add(scenario.featureWorkspaceId);
		try {
			await expectCode(
				scenario.host.trpc.workspaceCleanup.revive.mutate({
					workspaceId: scenario.featureWorkspaceId,
				}),
				"CONFLICT",
			);
			await expectCode(
				scenario.host.trpc.workspaceCleanup.destroy.mutate({
					workspaceId: scenario.featureWorkspaceId,
				}),
				"CONFLICT",
			);
			expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe("archived");
			expect(existsSync(scenario.worktreePath)).toBe(false);
		} finally {
			__testDestroysInFlight.delete(scenario.featureWorkspaceId);
		}
		await scenario.host.trpc.workspaceCleanup.revive.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		expect(existsSync(scenario.worktreePath)).toBe(true);
	});

	test("rejects archiving a session before changing its row or removing its directory", async () => {
		const workspaceId = scenario.featureWorkspaceId;
		scenario.host.db
			.update(workspaces)
			.set({ type: "session", projectId: null, branch: null })
			.where(eq(workspaces.id, workspaceId))
			.run();
		await expectCode(
			scenario.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId,
				archive: true,
				force: true,
			}),
			"BAD_REQUEST",
		);
		expect(readRow(workspaceId)?.archivedAt).toBeNull();
		expect(readRow(workspaceId)?.archiveReason).toBeNull();
		expect(existsSync(scenario.worktreePath)).toBe(true);
		expect(existsSync(`${scenario.worktreePath}/.git`)).toBe(true);
	});

	test("refuses a workspace that is not archived", async () => {
		await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"NOT_FOUND",
		);
		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toBeNull();
	});

	test("refuses a deleted workspace even once its branch is back", async () => {
		await destroyFeature(true);
		const error = await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"PRECONDITION_FAILED",
		);
		expect(error.message).toContain("deleted");

		await scenario.repo.git.raw(["branch", scenario.branch, "HEAD"]);
		await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"PRECONDITION_FAILED",
		);
		expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe("deleted");
		expect(existsSync(scenario.worktreePath)).toBe(false);
	});

	test("deleting an archived workspace restamps it as deleted and can drop the branch", async () => {
		await destroyFeature();

		await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch: true,
		});

		const row = readRow(scenario.featureWorkspaceId);
		expect(row?.archiveReason).toBe("deleted");
		expect(row?.archivedAt).not.toBeNull();
		const listed = await scenario.repo.git.raw([
			"branch",
			"--list",
			scenario.branch,
		]);
		expect(listed.trim()).toBe("");
		await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"PRECONDITION_FAILED",
		);
	});

	test("refuses when the branch no longer exists", async () => {
		await destroyFeature();
		await scenario.repo.git.raw(["branch", "-D", scenario.branch]);

		const error = await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"PRECONDITION_FAILED",
		);
		expect(error.message).toContain(scenario.branch);
		expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe("archived");
		expect(existsSync(scenario.worktreePath)).toBe(false);
	});

	test("refuses when a live workspace already owns the branch", async () => {
		await destroyFeature();
		seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: `${scenario.worktreePath}-again`,
			branch: scenario.branch,
		});

		await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"CONFLICT",
		);
		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).not.toBeNull();
		expect(existsSync(scenario.worktreePath)).toBe(false);
	});

	test("refuses revival when another workspace acquires the recreated worktree during Git setup", async () => {
		await destroyFeature();
		const archivedAt = readRow(scenario.featureWorkspaceId)?.archivedAt;
		const enablePushAutoSetupRemote = gitConfig.enablePushAutoSetupRemote;
		let ownerId = "";
		const setup = spyOn(gitConfig, "enablePushAutoSetupRemote");
		setup.mockImplementation(async (...args) => {
			await enablePushAutoSetupRemote(...args);
			expect(existsSync(scenario.worktreePath)).toBe(true);
			ownerId = seedWorkspace(scenario.host, {
				projectId: scenario.projectId,
				worktreePath: scenario.worktreePath,
				branch: scenario.branch,
			}).id;
		});
		try {
			await expectCode(
				scenario.host.trpc.workspaceCleanup.revive.mutate({
					workspaceId: scenario.featureWorkspaceId,
				}),
				"CONFLICT",
			);
			expect(setup).toHaveBeenCalledTimes(1);
			expect(ownerId).not.toBe("");
			expect(readRow(ownerId)?.archivedAt).toBeNull();
			expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toEqual(
				archivedAt,
			);
			expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe(
				"archived",
			);
			expect(existsSync(join(scenario.worktreePath, ".git"))).toBe(true);
		} finally {
			setup.mockRestore();
		}
	});

	test("keeps a locked worktree archived when its directory is missing", async () => {
		const archivedAt = Date.now();
		scenario.host.db
			.update(workspaces)
			.set({ archivedAt, archiveReason: "archived" })
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.run();
		await scenario.repo.git.raw(["worktree", "lock", scenario.worktreePath]);
		rmSync(scenario.worktreePath, { recursive: true, force: true });

		await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"PRECONDITION_FAILED",
		);

		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toEqual(
			archivedAt,
		);
		expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe(
			"archived",
		);
		expect(existsSync(scenario.worktreePath)).toBe(false);
		const worktrees = await scenario.repo.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		expect(worktrees).toContain(`worktree ${scenario.worktreePath}`);
		expect(worktrees).toContain("locked");
	});

	test("restores a surviving registered worktree through a symlink alias", async () => {
		const aliasDir = join(scenario.repo.repoPath, "worktrees-alias");
		symlinkSync(dirname(scenario.worktreePath), aliasDir, "junction");
		const aliasPath = join(aliasDir, basename(scenario.worktreePath));
		scenario.host.db
			.update(workspaces)
			.set({
				worktreePath: aliasPath,
				archivedAt: Date.now(),
				archiveReason: "archived",
			})
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.run();

		const result = await scenario.host.trpc.workspaceCleanup.revive.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});

		expect(result.workspace.id).toBe(scenario.featureWorkspaceId);
		expect(readRow(scenario.featureWorkspaceId)?.worktreePath).toBe(aliasPath);
		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toBeNull();
		expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBeNull();
		expect(existsSync(join(aliasPath, ".git"))).toBe(true);
		const worktrees = await scenario.repo.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		expect(worktrees).toContain(`worktree ${scenario.worktreePath}`);
		expect(worktrees).not.toContain(`worktree ${aliasPath}`);
	});

	test("a revived workspace can be archived and revived again", async () => {
		await destroyFeature();
		await scenario.host.trpc.workspaceCleanup.revive.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		await destroyFeature();
		await scenario.host.trpc.workspaceCleanup.revive.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});

		expect(existsSync(scenario.worktreePath)).toBe(true);
		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toBeNull();
	});
});
