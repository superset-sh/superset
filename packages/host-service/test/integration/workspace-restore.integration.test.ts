import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { workspaces } from "../../src/db/schema";
import { cloudFlows } from "../helpers/cloud-fakes";
import {
	createFeatureWorktreeScenario,
	type FeatureWorktreeScenario,
} from "../helpers/scenarios";
import { seedWorkspace } from "../helpers/seed";

describe("workspaceCleanup.restore integration", () => {
	let scenario: FeatureWorktreeScenario | undefined;

	afterEach(async () => {
		await scenario?.dispose();
		scenario = undefined;
	});

	function activeScenario(): FeatureWorktreeScenario {
		if (!scenario) throw new Error("scenario not initialized");
		return scenario;
	}

	async function destroyWorkspace(deleteBranch: boolean) {
		scenario = await createFeatureWorktreeScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceDeleteOk() },
		});
		const result =
			await activeScenario().host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: activeScenario().featureWorkspaceId,
				deleteBranch,
			});
		expect(result.success).toBe(true);
	}

	function archivedRow() {
		return activeScenario()
			.host.db.select()
			.from(workspaces)
			.where(eq(workspaces.id, activeScenario().featureWorkspaceId))
			.get();
	}

	test("restore re-creates the worktree and clears the tombstone", async () => {
		await destroyWorkspace(false);
		expect(archivedRow()?.archivedAt).toBeTruthy();
		expect(existsSync(activeScenario().worktreePath)).toBe(false);

		const result =
			await activeScenario().host.trpc.workspaceCleanup.restore.mutate({
				workspaceId: activeScenario().featureWorkspaceId,
			});

		expect(result.workspaceId).toBe(activeScenario().featureWorkspaceId);
		expect(result.restoredFrom).toBe("local-branch");
		expect(existsSync(activeScenario().worktreePath)).toBe(true);
		const row = archivedRow();
		expect(row?.archivedAt).toBeNull();
		expect(row?.archiveReason).toBeNull();
	});

	test("restore fails with a typed error when the branch is gone everywhere", async () => {
		await destroyWorkspace(true);
		expect(archivedRow()?.archivedAt).toBeTruthy();

		const error = await activeScenario()
			.host.trpc.workspaceCleanup.restore.mutate({
				workspaceId: activeScenario().featureWorkspaceId,
			})
			.then(
				() => null,
				(err: unknown) => err,
			);
		expect(String((error as { message?: string })?.message ?? error)).toMatch(
			/no longer exists/,
		);
		expect(archivedRow()?.archivedAt).toBeTruthy();
	});

	test("restore refuses when a live workspace owns the branch", async () => {
		await destroyWorkspace(false);
		seedWorkspace(activeScenario().host, {
			projectId: activeScenario().projectId,
			worktreePath: join(activeScenario().repo.repoPath, ".worktrees", "rival"),
			branch: activeScenario().branch,
		});

		const error = await activeScenario()
			.host.trpc.workspaceCleanup.restore.mutate({
				workspaceId: activeScenario().featureWorkspaceId,
			})
			.then(
				() => null,
				(err: unknown) => err,
			);
		expect(String((error as { message?: string })?.message ?? error)).toMatch(
			/already owned/,
		);
		expect(archivedRow()?.archivedAt).toBeTruthy();
	});

	test("restore reports gone when only a stale remote-tracking ref remains", async () => {
		scenario = await createFeatureWorktreeScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceDeleteOk() },
		});
		// Bare remote holding the branch, then the branch deleted
		// upstream behind our back (direct ref delete, no prune on our
		// side) — the tracking ref goes stale on purpose.
		const remoteDir = realpathSync(
			mkdtempSync(join(tmpdir(), "host-service-test-remote-")),
		);
		try {
			const remote = simpleGit(remoteDir);
			await remote.init(["--bare", "--initial-branch=main"]);
			const repo = activeScenario().repo.git;
			await repo.addRemote("origin", remoteDir);
			await repo.push(["origin", activeScenario().branch]);
			await remote.raw([
				"update-ref",
				"-d",
				`refs/heads/${activeScenario().branch}`,
			]);
			const destroyed =
				await activeScenario().host.trpc.workspaceCleanup.destroy.mutate({
					workspaceId: activeScenario().featureWorkspaceId,
					deleteBranch: true,
				});
			expect(destroyed.success).toBe(true);

			// The precondition for this test: the stale remote-tracking ref
			// must still be present after destroy. If destroy ever adds a
			// prune step this assertion will catch the regression before the
			// test silently degrades into a duplicate of the "gone everywhere"
			// case.
			const trackingRef = `refs/remotes/origin/${activeScenario().branch}`;
			const trackingRefExists = await repo
				.raw(["rev-parse", "--verify", trackingRef])
				.then(() => true)
				.catch(() => false);
			expect(trackingRefExists).toBe(true);

			const error = await activeScenario()
				.host.trpc.workspaceCleanup.restore.mutate({
					workspaceId: activeScenario().featureWorkspaceId,
				})
				.then(
					() => null,
					(err: unknown) => err,
				);
			expect(String((error as { message?: string })?.message ?? error)).toMatch(
				/no longer exists/,
			);
			expect(archivedRow()?.archivedAt).toBeTruthy();
		} finally {
			rmSync(remoteDir, { recursive: true, force: true });
		}
	});
});
