import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import {
	runShelvedWorkspacePurge,
	SHELF_RETENTION_MS,
} from "../../src/runtime/shelved-workspace-purge";
import type { HostServiceContext } from "../../src/types";
import { MemoryGitCredentialProvider } from "../helpers/fakes";
import {
	createFeatureWorktreeScenario,
	type FeatureWorktreeScenario,
} from "../helpers/scenarios";

/**
 * The sweep against real worktrees: the only way to prove that the retention
 * purge reclaims disk, deletes the local branch, and refuses to throw away
 * uncommitted work (KD5).
 */
describe("shelved-workspace purge integration", () => {
	let scenario: FeatureWorktreeScenario;

	beforeEach(async () => {
		scenario = await createFeatureWorktreeScenario();
	});

	afterEach(async () => {
		await scenario.dispose();
	});

	/** The subset of the host context the destroy saga actually reads. */
	function makeCtx(): HostServiceContext {
		return {
			db: scenario.host.db,
			eventBus: scenario.host.eventBus,
			api: scenario.host.api,
			credentials: new MemoryGitCredentialProvider(),
			organizationId: "00000000-0000-0000-0000-000000000001",
			isAuthenticated: true,
		} as unknown as HostServiceContext;
	}

	function expire(workspaceId: string): void {
		scenario.host.db
			.update(workspaces)
			.set({ shelvedAt: Date.now() - SHELF_RETENTION_MS - 60_000 })
			.where(eq(workspaces.id, workspaceId))
			.run();
	}

	function readRow(workspaceId: string) {
		return scenario.host.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();
	}

	async function branchExists(): Promise<boolean> {
		const listed = await scenario.repo.git.raw([
			"branch",
			"--list",
			scenario.branch,
		]);
		return listed.trim().length > 0;
	}

	test("an expired clean worktree is destroyed along with its branch", async () => {
		expire(scenario.featureWorkspaceId);

		await runShelvedWorkspacePurge(makeCtx());

		expect(existsSync(scenario.worktreePath)).toBe(false);
		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).not.toBeNull();
		expect(await branchExists()).toBe(false);
	});

	test("an expired dirty worktree stays, marked so the user can be told why", async () => {
		writeFileSync(
			join(scenario.worktreePath, "unsaved.txt"),
			"work in progress",
		);
		expire(scenario.featureWorkspaceId);

		await runShelvedWorkspacePurge(makeCtx());

		const row = readRow(scenario.featureWorkspaceId);
		expect(row?.purgeBlockedReason).toBe("dirty");
		expect(row?.shelvedAt).not.toBeNull();
		expect(row?.archivedAt).toBeNull();
		expect(existsSync(scenario.worktreePath)).toBe(true);
		expect(await branchExists()).toBe(true);
	});

	test("a workspace still inside its retention window is left alone", async () => {
		scenario.host.db
			.update(workspaces)
			.set({ shelvedAt: Date.now() - 29 * 24 * 60 * 60 * 1000 })
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.run();

		await runShelvedWorkspacePurge(makeCtx());

		expect(existsSync(scenario.worktreePath)).toBe(true);
		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toBeNull();
	});
});
